/**
 * /menus — anonymous save + recall of scanned menus (D1 `saved_menus`).
 *
 * No accounts, no PII (SECURITY.md §1). A menu is stored under a CLIENT-PROVIDED
 * opaque `deviceId` (a random installation id) so the same device can list and
 * re-open what it saved — `deviceId` is NOT identity and is never joined to one.
 *
 * The stored payload is the anonymous {@link ScannedMenu} the engine already
 * produced (nutrition ranges, "may contain" allergen flags, time-based suitability).
 * The body is validated with zod; allergy/diet/profile/location data is rejected at
 * the boundary, same as /scan — those belong to the on-device personalization plane.
 *
 * Device scoping: every route reads the opaque device id from the `X-Device-Id`
 * HEADER (never the body or query), matching the mobile client's single transport
 * (apps/mobile/src/api/client.ts). This keeps the device id out of URLs/logs and is
 * the one contract both sides agree on. `/:id` is scoped to the requesting device
 * (`WHERE id = ? AND device_id = ?`) so one device can never read another's menu;
 * a non-owned id is indistinguishable from a missing one (both 404).
 *
 * Routes (mounted at /menus by index.ts), all requiring the `X-Device-Id` header:
 *   POST   /     save a ScannedMenu for this device
 *   GET    /     list recent menus for this device (newest first)
 *   GET    /:id  fetch one of THIS device's saved menus by id
 */
import { Hono } from 'hono';
import { z } from 'zod';

import type { Dish, MealContext, ScannedMenu } from '@bocado/shared';
import { ingredientGuessSchema } from '@bocado/shared';

import type { Env } from '../env';
import { enforceRateLimit, parseLimit } from '../rateLimit';

/** Opaque client installation id. Bounded; not identity, never personal data. */
const deviceIdSchema = z.string().min(8).max(128);

const mealContextSchema: z.ZodType<MealContext> = z.enum([
  'breakfast',
  'lunch',
  'dinner',
  'late-night',
  'snack',
]);

/**
 * Minimal structural validation of a stored dish. We deliberately do NOT re-derive
 * the engine's full output here (the menu was already computed by /scan); we only
 * assert the persisted shape is well-formed JSON of the expected kind and reject
 * any extra keys so personal data cannot be smuggled into the blob.
 */
const rangeSchema = z
  .object({
    min: z.number(),
    max: z.number(),
    unit: z.string(),
    // Display-only upper bound, present only on an uncertain estimate's ranges.
    displayMax: z.number().optional(),
  })
  .strict();

const nutritionSchema = z
  .object({
    kcal: rangeSchema,
    protein: rangeSchema,
    fat: rangeSchema,
    satFat: rangeSchema.optional(),
    carbs: rangeSchema.optional(),
    sugar: rangeSchema.optional(),
    salt: rangeSchema,
    confidence: z.enum(['low', 'medium', 'high']),
    sources: z.array(
      z
        .object({
          db: z.enum(['CIQUAL', 'USDA', 'OFF', 'API']),
          recordId: z.string(),
          name: z.string(),
        })
        .strict(),
    ),
    // The engine's EstimateResult (what /scan actually stores) extends the base estimate
    // with these honesty fields — accepted (optional, so a minimal/legacy stored menu
    // without them still round-trips) so a real scan can be saved.
    unmatchedCount: z.number().optional(),
    uncertain: z.boolean().optional(),
    uncertaintyReason: z.string().optional(),
  })
  .strict();

const allergenFlagSchema = z
  .object({
    allergen: z.enum([
      'gluten', 'crustaceans', 'eggs', 'fish', 'peanuts', 'soybeans', 'milk',
      'nuts', 'celery', 'mustard', 'sesame', 'sulphites', 'lupin', 'molluscs',
    ]),
    basis: z.enum(['ingredient-match', 'name-keyword']),
    note: z.string(),
  })
  .strict();

const suitabilitySchema = z
  .object({
    level: z.enum(['good', 'caution', 'avoid']),
    label: z.string(),
    reasons: z.array(z.string()),
    // Confidence echoed from the estimate + the verdict's honest-uncertainty surface.
    // Required (every menu our /scan produces carries them); uncertaintyReason is set
    // only when uncertain, so it stays optional.
    confidence: z.enum(['low', 'medium', 'high']),
    uncertain: z.boolean(),
    uncertaintyReason: z.string().optional(),
  })
  .strict();

const dishSchema: z.ZodType<Dish> = z
  .object({
    id: z.string().min(1),
    originalText: z.string(),
    translatedName: z.string(),
    section: z.string().optional(),
    explanation: z.string().optional(),
    // Must accept the REAL persisted shape: a stored ScannedMenu's dish ingredients
    // are `IngredientGuess` (canonicalName + basis + isAddedFat, name often absent),
    // not the legacy `{name, grams}`. Reuse the shared schema so /menus can round-trip
    // exactly what /scan produced instead of rejecting it 400.
    ingredients: z.array(ingredientGuessSchema),
    nutrition: nutritionSchema.optional(),
    allergenFlags: z.array(allergenFlagSchema),
    suitability: suitabilitySchema,
    imageUrl: z.string().optional(),
    imageIsAi: z.boolean().optional(),
  })
  .strict();

/** The ScannedMenu the client asks us to persist (device id comes from the header). */
const saveMenuSchema = z
  .object({
    menu: z
      .object({
        id: z.string().min(1),
        createdAt: z.string().datetime(),
        context: mealContextSchema,
        title: z.string().optional(),
        dishes: z.array(dishSchema).max(200),
      })
      .strict(),
  })
  .strict();

/** Header carrying the opaque device id on every /menus call. */
const DEVICE_ID_HEADER = 'X-Device-Id';

/**
 * Read + validate the opaque device id from the `X-Device-Id` header. Returns the
 * id, or a 400 Response when it is absent/malformed (the single failure shape every
 * route shares). The device id is NOT identity and is never joined to one.
 */
function deviceIdFromHeader(c: { req: { header: (name: string) => string | undefined } }):
  | { ok: true; deviceId: string }
  | { ok: false; response: Response } {
  const parsed = deviceIdSchema.safeParse(c.req.header(DEVICE_ID_HEADER));
  if (!parsed.success) {
    return { ok: false, response: Response.json({ error: 'Missing or invalid device id.' }, { status: 400 }) };
  }
  return { ok: true, deviceId: parsed.data };
}

/** Cap on the recent-menus list returned by GET /menus. */
const LIST_LIMIT = 50;

/** A persisted row, reassembled into a ScannedMenu. */
interface SavedMenuRow {
  id: string;
  created_at: string;
  context: string;
  title: string | null;
  dishes: string;
}

/** Rehydrate a D1 row into the wire-shape ScannedMenu. */
function rowToMenu(row: SavedMenuRow): ScannedMenu {
  return {
    id: row.id,
    createdAt: row.created_at,
    context: row.context as MealContext,
    ...(row.title !== null ? { title: row.title } : {}),
    dishes: JSON.parse(row.dishes) as Dish[],
  };
}

export const menusRoute = new Hono<{ Bindings: Env }>();

// --- POST /menus — save a ScannedMenu for the requesting device. ---
menusRoute.post('/', async (c) => {
  const device = deviceIdFromHeader(c);
  if (!device.ok) return device.response;

  // Cost/abuse floor: bound how many menus one device can persist per hour — the
  // /menus plane is otherwise unbounded anonymous D1 writes. The device id is
  // mandatory here so it is always the key. Fail-open on counter errors (same
  // contract as /scan and /image).
  const menusLimit = parseLimit(c.env.MENUS_RATE_LIMIT);
  if (menusLimit !== null) {
    const decision = await enforceRateLimit(
      c.env,
      `menus:${device.deviceId}`,
      menusLimit,
      Date.now(),
    );
    if (!decision.allowed) {
      c.header('Retry-After', String(decision.retryAfter));
      return c.json({ error: 'Too many requests. Please try again later.' }, 429);
    }
  }

  let rawBody: unknown;
  try {
    rawBody = await c.req.json();
  } catch {
    return c.json({ error: 'Request body must be valid JSON.' }, 400);
  }

  const parsed = saveMenuSchema.safeParse(rawBody);
  if (!parsed.success) {
    return c.json({ error: 'Invalid request.', issues: parsed.error.issues }, 400);
  }
  const { menu } = parsed.data;

  // `INSERT OR REPLACE` so re-saving the same menu id is idempotent (no duplicates).
  await c.env.DB.prepare(
    'INSERT OR REPLACE INTO saved_menus (id, device_id, created_at, context, title, dishes) VALUES (?, ?, ?, ?, ?, ?)',
  )
    .bind(
      menu.id,
      device.deviceId,
      menu.createdAt,
      menu.context,
      menu.title ?? null,
      JSON.stringify(menu.dishes),
    )
    .run();

  return c.json({ id: menu.id }, 201);
});

// --- GET /menus — recent menus for the requesting device, newest first. ---
menusRoute.get('/', async (c) => {
  const device = deviceIdFromHeader(c);
  if (!device.ok) return device.response;

  const { results } = await c.env.DB.prepare(
    'SELECT id, created_at, context, title, dishes FROM saved_menus WHERE device_id = ? ORDER BY created_at DESC LIMIT ?',
  )
    .bind(device.deviceId, LIST_LIMIT)
    .all<SavedMenuRow>();

  return c.json({ menus: results.map(rowToMenu) }, 200);
});

// --- GET /menus/:id — one of THIS device's saved menus by id. ---
// Scoped to the requesting device: a menu owned by another device is treated as
// absent (404), never returned — so an id alone is not enough to read a menu (no IDOR).
menusRoute.get('/:id', async (c) => {
  const device = deviceIdFromHeader(c);
  if (!device.ok) return device.response;

  const id = c.req.param('id');
  if (id.length === 0) {
    return c.json({ error: 'Missing menu id.' }, 400);
  }

  const row = await c.env.DB.prepare(
    'SELECT id, created_at, context, title, dishes FROM saved_menus WHERE id = ? AND device_id = ?',
  )
    .bind(id, device.deviceId)
    .first<SavedMenuRow>();

  if (row === null) {
    return c.json({ error: 'Menu not found.' }, 404);
  }

  return c.json(rowToMenu(row), 200);
});

// --- DELETE /menus — erase ALL of THIS device's saved menus (GDPR Art. 17). ---
// Registered before DELETE /:id so the bare-collection delete is unambiguous. Scoped
// to the requesting device: only rows whose device_id matches the header are removed,
// so a device can never wipe another's data. Idempotent — zero menus is still 200.
menusRoute.delete('/', async (c) => {
  const device = deviceIdFromHeader(c);
  if (!device.ok) return device.response;

  await c.env.DB.prepare('DELETE FROM saved_menus WHERE device_id = ?')
    .bind(device.deviceId)
    .run();

  return c.json({ ok: true }, 200);
});

// --- DELETE /menus/:id — erase one of THIS device's saved menus (GDPR Art. 17). ---
// Device-scoped (`WHERE id = ? AND device_id = ?`) so a device can never delete
// another's menu (no cross-device erase / IDOR). Deliberately IDEMPOTENT and free of
// any existence oracle: the response is identical — 200 { ok: true } — for an owned-
// and-deleted id, an id owned by another device, and an id that never existed. We
// never branch the observable status/body on rows-affected, so an attacker cannot
// learn which ids exist or who owns them (mirrors the uniform 404 of GET /:id).
menusRoute.delete('/:id', async (c) => {
  const device = deviceIdFromHeader(c);
  if (!device.ok) return device.response;

  const id = c.req.param('id');
  if (id.length === 0) {
    return c.json({ error: 'Missing menu id.' }, 400);
  }

  await c.env.DB.prepare('DELETE FROM saved_menus WHERE id = ? AND device_id = ?')
    .bind(id, device.deviceId)
    .run();

  return c.json({ ok: true }, 200);
});
