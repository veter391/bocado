/**
 * POST /scan — the anonymous edge over the deterministic engine.
 *
 * Flow (ARCHITECTURE.md §1):
 *   image (data URL) + locale + meal context
 *     -> perceiveMenu()  (anonymous: image + STATIC prompt + model params ONLY)
 *     -> deterministic engine per dish (nutrition range + allergen "may contain"
 *        flags + time-based suitability)
 *     -> ScannedMenu (no user identity, no profile, no "safe" claim)
 *
 * Anonymity is enforced at this boundary, in code, not by policy (SECURITY.md §1):
 *  - The request body schema accepts ONLY { image, locale?, context? }.
 *  - Any body carrying `profile`, `allergies`, or `userId` is REJECTED 400 before
 *    we do anything — those belong to the on-device personalization plane and must
 *    never reach this Worker (and therefore never the perception model).
 *  - We compute suitability with NO profile here. Allergy-aware suitability is
 *    finalized ON-DEVICE by the app, joining the user's (local) allergies to the
 *    anonymous allergen flags + nutrition this route returns.
 *
 * `new Date()` is allowed here (a route handler), only to derive the meal context
 * when the caller did not supply one — the deterministic engine itself stays clock-free.
 */
import { Hono } from 'hono';
import { z } from 'zod';

import {
  matchName,
  mealContextForHour,
  type Dish,
  type MealContext,
  type PerceivedDish,
  type ScannedMenu,
} from '@bocado/shared';
import {
  assessSuitability,
  createMemoryTable,
  DEFAULT_FOODS,
  detectAllergens,
  estimateNutrition,
  normalizeName,
  seedTable,
  type FoodRecord,
  type NutritionTable,
} from '@bocado/nutrition';

import type { Env } from '../env';
import { isLowMenuConfidence, perceiveMenu } from '../perception/client';
import { getCachedPerception, hashImage, putCachedPerception } from '../perception/cache';
import { resolveViaUsdaFdc } from '../nutrition/usdaFallback';
import { enforceRateLimit, hashKey, parseLimit } from '../rateLimit';

/**
 * Request body for POST /scan.
 *
 * `.strict()` is the load-bearing anonymity guard: any unknown key (including the
 * forbidden `profile` / `allergies` / `userId`) makes validation fail, so a body
 * that smuggles personal data is rejected with 400 rather than silently ignored.
 * The explicit `.refine` below turns those specific keys into a clear, named error.
 */
const mealContextSchema: z.ZodType<MealContext> = z.enum([
  'breakfast',
  'lunch',
  'dinner',
  'late-night',
  'snack',
]);

/** Keys that, if present, mean the caller tried to send personal data here. */
const FORBIDDEN_KEYS = ['profile', 'allergies', 'userId'] as const;

/**
 * Max pages per scan. Bounds model context + cost (the app caps the capture tray at the
 * same number); a body with more is rejected 400 rather than silently truncated.
 */
const MAX_PAGES = 5;

/**
 * Upper bound on a single cleaned data: URL's length, in characters. A cleaned page
 * (<=1280px, JPEG q0.8) base64-encodes to well under this; the cap exists so a public,
 * unauthenticated caller cannot force max-cost vision calls with multi-megabyte images
 * (cost-amplification). ~2.6MB decoded per image, generous vs. what cleanMenuImage emits.
 */
const MAX_IMAGE_CHARS = 3_500_000;

/**
 * A single CLEANED-photo data: URL guard, reused by both `image` and `images[]`.
 * Requires an IMAGE data: URL (png/jpeg/webp) — cleanMenuImage always emits JPEG — so a
 * non-image payload is rejected up front instead of being forwarded to (and billed by)
 * the perception model.
 */
const IMAGE_DATA_URL_RE = /^data:image\/(png|jpe?g|webp)[;,]/i;
const dataUrl = z
  .string()
  .min(1)
  .max(MAX_IMAGE_CHARS, { message: 'image is too large' })
  .refine((s) => IMAGE_DATA_URL_RE.test(s), {
    message: 'image must be a PNG, JPEG, or WebP data: URL',
  });

const scanRequestSchema = z
  .object({
    /**
     * A data: URL of the CLEANED menu photo (EXIF/GPS stripped, faces handled on-device).
     * Back-compat single-image field. Provide EITHER `image` or `images` (see refine).
     */
    image: dataUrl.optional(),
    /**
     * Several CLEANED page photos of the SAME menu, read in ONE perception call. 1..MAX_PAGES.
     * Multi-page capture path; `image` remains accepted for single-page back-compat.
     */
    images: z.array(dataUrl).min(1).max(MAX_PAGES).optional(),
    /** UI display locale for translatedName/explanation — NOT personal data. */
    locale: z.string().min(2).max(12).optional(),
    /** Optional meal context; when omitted we derive it from the current UTC hour. */
    context: mealContextSchema.optional(),
  })
  .strict()
  .refine((b) => b.image !== undefined || (b.images !== undefined && b.images.length > 0), {
    message: 'one of image or images is required',
    path: ['image'],
  });

type ScanRequest = z.infer<typeof scanRequestSchema>;

/** Normalize the request to the ordered list of page images perception will read. */
function pagesOf(body: ScanRequest): string[] {
  if (body.images !== undefined && body.images.length > 0) return body.images;
  return body.image !== undefined ? [body.image] : [];
}

const DEFAULT_LOCALE = 'en';

/** Friendly, non-leaky message for a perception (upstream model) failure. */
const PERCEPTION_ERROR_MESSAGE =
  "We couldn't read that menu just now. Please try again in a moment.";

/** Hint returned when the image yielded no dishes (e.g. it was not a menu). */
const EMPTY_MENU_HINT =
  "We couldn't find any dishes in that photo. Make sure the menu is in frame and well lit, then try again.";

/** Hint when the photo clearly isn't a readable menu (low menuConfidence / isMenu=false). */
const NOT_A_MENU_HINT =
  "That doesn't look like a menu. Point at the menu and make sure it's well lit, then try again.";

/**
 * Run the deterministic engine over one perceived dish and merge it with the
 * perception-plane fields to assemble a full {@link Dish}.
 *
 * No profile is passed to {@link assessSuitability}: this route is anonymous, so
 * suitability here is time-based only. The app finalizes allergy/diet-aware
 * suitability on-device from the returned `allergenFlags` + `nutrition`.
 */
function buildDish(
  perceived: PerceivedDish,
  index: number,
  context: MealContext,
  table: NutritionTable,
): Dish {
  const { ingredients } = perceived;

  // cookingMethod drives the engine's added-fat allowance + deep-fry absorption.
  const nutrition = estimateNutrition(ingredients, table, {
    cookingMethod: perceived.cookingMethod,
  });
  const allergenFlags = detectAllergens(ingredients);
  const suitability = assessSuitability({
    nutrition,
    context,
    // No `profile` — anonymity invariant (SECURITY.md §1).
    ingredients,
    // Forward the estimate's honest-uncertainty flag so a near-zero/unreliable estimate
    // surfaces as uncertainty in the verdict rather than a confident GOOD.
    uncertain: nutrition.uncertain,
  });

  return {
    // Stable, content-derived id so the app can cache/dedupe dishes per menu.
    id: `${normalizeName(perceived.originalText) || 'dish'}-${index}`,
    originalText: perceived.originalText,
    translatedName: perceived.translatedName,
    section: perceived.section,
    explanation: perceived.explanation,
    ingredients,
    nutrition,
    allergenFlags,
    suitability,
  };
}

/**
 * Build the nutrition table for THIS scan. Default = the baked-in broad dataset
 * (`seedTable`). When `env.FDC_API_KEY` is set, we first attempt to resolve any
 * ingredient canonicalName the baked-in table cannot match via the USDA-FDC runtime
 * fallback, then build a PER-REQUEST overlay table over [...DEFAULT_FOODS, ...fetched]
 * (directive L: per-request for determinism + anonymity). Key absent -> we return
 * `seedTable` unchanged and unknowns stay honestly unmatched.
 *
 * The pure engine still only sums real records; this just widens the record set the
 * Worker hands it, with db:'API' provenance that estimate.ts treats as lower-trust.
 */
async function buildScanTable(perceived: { dishes: PerceivedDish[] }, env: Env): Promise<NutritionTable> {
  if (!env.FDC_API_KEY) return seedTable; // feature-gated; degrade safely.

  // Collect the distinct canonicalNames the baked-in table cannot resolve.
  const unresolved = new Set<string>();
  for (const dish of perceived.dishes) {
    for (const ing of dish.ingredients) {
      const name = matchName(ing);
      if (name && seedTable.lookup(name) === null) unresolved.add(name);
    }
  }
  if (unresolved.size === 0) return seedTable;

  // Resolve the unknowns with BOUNDED concurrency instead of one-at-a-time: a large
  // multi-page menu can have dozens of long-tail names, and each FDC lookup is capped
  // at several seconds — serial resolution would push a single /scan into the tens of
  // seconds. Batches of CONCURRENCY keep wall-clock low while staying polite to FDC and
  // within the Worker's subrequest limits. Order is irrelevant (records merge by name),
  // and each lookup can NEVER reject the batch (degrade to null), so failures stay soft.
  const names = [...unresolved];
  const CONCURRENCY = 6;
  const fetched: FoodRecord[] = [];
  for (let i = 0; i < names.length; i += CONCURRENCY) {
    const batch = names.slice(i, i + CONCURRENCY);
    const records = await Promise.all(
      batch.map((name) => resolveViaUsdaFdc(name, env).catch(() => null)),
    );
    for (const record of records) {
      if (record) fetched.push(record);
    }
  }
  if (fetched.length === 0) return seedTable;

  // Per-request overlay: baked-in rows first (they win ties), API rows fill the gaps.
  return createMemoryTable([...DEFAULT_FOODS, ...fetched]);
}

export const scanRoute = new Hono<{ Bindings: Env }>();

scanRoute.post('/', async (c) => {
  // 1. Parse the body defensively — never trust the wire.
  let rawBody: unknown;
  try {
    rawBody = await c.req.json();
  } catch {
    return c.json({ error: 'Request body must be valid JSON.' }, 400);
  }

  // 2. Anonymity guard: reject any body carrying personal-data keys with a clear
  //    message BEFORE generic schema validation, so the error names the violation.
  if (rawBody !== null && typeof rawBody === 'object') {
    const present = FORBIDDEN_KEYS.filter((key) =>
      Object.prototype.hasOwnProperty.call(rawBody, key),
    );
    if (present.length > 0) {
      return c.json(
        {
          error:
            'This endpoint is anonymous and must not receive personal data ' +
            `(${present.join(', ')}). Allergy/diet handling is done on your device.`,
        },
        400,
      );
    }
  }

  // 3. Validate the shape. `.strict()` also rejects any other unexpected key.
  const parsed = scanRequestSchema.safeParse(rawBody);
  if (!parsed.success) {
    return c.json(
      { error: 'Invalid request.', issues: parsed.error.issues },
      400,
    );
  }
  const body: ScanRequest = parsed.data;

  // 4. Resolve meal context: caller-supplied, else derived from the current hour.
  //    Date is allowed here (route handler), not in the engine.
  const context: MealContext =
    body.context ?? mealContextForHour(new Date().getUTCHours());

  // 4b. Rate limit (cost floor) on the billed model path. Runs AFTER validation so a
  //     bad body 400s without counting, and BEFORE perception so a 429 never pays for
  //     a model call. Key: the opaque X-Device-Id when present, else the HASHED client
  //     IP (CF-Connecting-IP, GDPR personal data -> hashed, never stored/logged clear)
  //     — so a caller that simply OMITS the header is still capped (closes the trivial
  //     bypass). Only a request with neither (e.g. local `wrangler dev`) is a no-op.
  //     Fail-OPEN: any counter-store error allows the scan (SECURITY.md).
  const scanLimit = parseLimit(c.env.SCAN_RATE_LIMIT);
  const deviceId = c.req.header('X-Device-Id');
  const clientIp = c.req.header('CF-Connecting-IP');
  const rateKey = deviceId ?? (clientIp !== undefined ? `ip:${await hashKey(clientIp)}` : undefined);
  if (scanLimit !== null && rateKey !== undefined) {
    const decision = await enforceRateLimit(c.env, `scan:${rateKey}`, scanLimit, Date.now());
    if (!decision.allowed) {
      c.header('Retry-After', String(decision.retryAfter));
      return c.json({ error: 'Too many requests. Please try again later.' }, 429);
    }
  }

  // 5. PERCEPTION — anonymous. Only the image(s) + static prompt + model params are
  //    sent (enforced inside perceiveMenu); locale is a UI hint, not personal data.
  //    Multi-page: all cleaned pages of one menu are read in ONE call (amortizes the
  //    fixed prompt; M3 de-dupes across page breaks). Cache-first: hash the ordered
  //    page set and consult the anonymous D1 perception cache before paying for a model
  //    call; on a miss, call the model then cache it. Joining pages with a separator
  //    keeps the key deterministic + unique per ordered set (single-image hashes exactly
  //    as before, so existing cached rows still hit).
  const pages = pagesOf(body);
  const imageHash = await hashImage(pages.length === 1 ? pages[0]! : pages.join('\n'));

  // Timing for the perception step (cache lookup + any model call), surfaced as a
  // `Server-Timing` header so we can measure real text-model latency during testing.
  const perceptionStart = Date.now();
  let cacheHit = true;
  let perceived = await getCachedPerception(c.env, imageHash);
  if (perceived === null) {
    cacheHit = false;
    try {
      perceived = await perceiveMenu(pages, c.env, {
        locale: body.locale ?? DEFAULT_LOCALE,
      });
    } catch {
      // Don't leak upstream/model details to the client.
      return c.json({ error: PERCEPTION_ERROR_MESSAGE }, 502);
    }
    // Cache the validated perception for subsequent scans of the same image. A cache
    // write failure must not fail the scan — log-and-continue (best-effort cache).
    try {
      await putCachedPerception(c.env, imageHash, perceived);
    } catch {
      // Best-effort: a transient D1 write error degrades to "no caching", not a 500.
    }
  }
  const perceptionMs = Date.now() - perceptionStart;
  // e.g. `Server-Timing: perception;desc="miss";dur=1840` — readable in the test harness.
  c.header('Server-Timing', `perception;desc="${cacheHit ? 'hit' : 'miss'}";dur=${perceptionMs}`);

  // 6. DETERMINISTIC engine per dish + assemble the anonymous ScannedMenu. First build
  //    the per-request table (baked-in dataset, optionally widened by the key-gated
  //    USDA-FDC fallback for any ingredient the baked table cannot resolve).
  const table = await buildScanTable(perceived, c.env);
  // Cross-page DEDUP: with several pages, the same dish can appear on overlapping
  // photos. Collapse ONLY exact duplicates — same normalized printed line AND same
  // section — keeping the first occurrence. This is deliberately conservative: it
  // NEVER merges distinct dishes (different text or section), honouring "never merge
  // two priced plates into one" even when they share a head noun (two "Risotto …").
  const seenDishKeys = new Set<string>();
  const uniqueDishes = perceived.dishes.filter((d) => {
    const key = `${normalizeName(d.originalText)}|${(d.section ?? '').toLowerCase().trim()}`;
    if (seenDishKeys.has(key)) return false;
    seenDishKeys.add(key);
    return true;
  });
  const dishes: Dish[] = uniqueDishes.map((dish, index) =>
    buildDish(dish, index, context, table),
  );

  const menu: ScannedMenu = {
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
    context,
    title: perceived.title,
    dishes,
  };

  // 7. Empty menu is a valid 200 (not an error): the photo just had no readable
  //    dishes. Return the menu shape plus a friendly hint for the UI. When the model
  //    signalled the frame is NOT a menu (isMenu=false / low menuConfidence), set
  //    `notMenu: true` and a clearer hint so the app shows the "this isn't a menu —
  //    try again" state rather than a generic empty result. We NEVER fabricate dishes.
  if (dishes.length === 0) {
    const notMenu = isLowMenuConfidence(perceived);
    return c.json(
      {
        ...menu,
        notMenu,
        hint: notMenu ? NOT_A_MENU_HINT : EMPTY_MENU_HINT,
      },
      200,
    );
  }

  return c.json(menu, 200);
});
