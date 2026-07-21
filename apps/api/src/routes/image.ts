/**
 * GET /image — lazy dish ILLUSTRATION, generated once and cached globally in R2.
 *
 * Flow (ARCHITECTURE.md §1 step 6, §5):
 *   1. Validate the dish `name` query (non-empty, length-capped) -> 400 if bad.
 *   2. key = `dishes/<promptVersion>/<normalizeName(name)>.png`. The version prefix
 *      pins the prompt template, so bumping the prompt invalidates the cache without
 *      a wipe. `normalizeName` reduces the name to `[a-z0-9 ]` only — no slashes,
 *      no dots, no `..` — so it cannot escape the keyspace (R2 path-traversal safe).
 *   3. R2 HIT  -> stream the cached PNG.
 *   4. R2 MISS -> generate ONCE with FLUX.1 [schnell] on Workers AI, store under the
 *      key with `aiGenerated` provenance metadata, then serve it.
 *
 * COMPLIANCE — EU AI Act Art. 50 (SECURITY.md §2.C): every response that carries a
 * generated image is marked AI-generated, both in R2 `customMetadata.aiGenerated`
 * and on the wire via the `X-AI-Generated: true` header. The visible "AI illustration"
 * label is rendered on-device by the app (see mobile AIBadge); this header is the
 * machine-readable counterpart.
 *
 * ANONYMITY (SECURITY.md §1): the only input is a dish `name` (a menu string) plus an
 * optional UI `locale`. No user id, allergies, location, or free-text profile is
 * accepted or forwarded — the image plane is as anonymous as perception.
 */
import { Hono } from 'hono';
import { normalizeName } from '@bocado/nutrition';
import type { Env } from '../env';
import { generateWithFallback } from '../image/providers';
import { enforceRateLimit, hashKey, parseLimit } from '../rateLimit';

/** Bumps with the image prompt template; part of the R2 key so old art is not reused. */
const PROMPT_VERSION = 'v1';

/** Guards the R2 keyspace and the model prompt against absurd inputs. */
const MAX_NAME_LENGTH = 120;

/** Long-lived: a dish illustration for a given name never changes. Immutable + 1y. */
const IMMUTABLE_CACHE = 'public, max-age=31536000, immutable';

/**
 * Build the (static, user-agnostic) image prompt for a dish name. It explicitly asks
 * for an ILLUSTRATION, not a photograph: the output is decorative, never presented as
 * a real photo of the actual plate (honesty + AI Act framing).
 */
export function foodImagePrompt(name: string): string {
  return [
    `A single appetizing plated dish of ${name},`,
    'top-down overhead view, centered on a plain neutral background,',
    'soft natural studio lighting, fresh and clean presentation.',
    'A tasteful food illustration in a warm, modern editorial style —',
    'not a real photograph.',
  ].join(' ');
}

/** Headers every served generated image carries. `extra` adds the R2-derived ETag. */
function imageHeaders(extra?: Record<string, string>): Record<string, string> {
  return {
    'Content-Type': 'image/png',
    'Cache-Control': IMMUTABLE_CACHE,
    // EU AI Act Art. 50 — machine-readable "this is AI-generated" marker.
    'X-AI-Generated': 'true',
    ...extra,
  };
}

export const imageRoute = new Hono<{ Bindings: Env }>();

imageRoute.get('/', async (c) => {
  const rawName = c.req.query('name');

  // --- Validate the name: present, non-empty after trim, length-capped. ---
  if (typeof rawName !== 'string') {
    return c.json({ error: 'Missing required query parameter: name' }, 400);
  }
  const trimmed = rawName.trim();
  if (trimmed.length === 0) {
    return c.json({ error: 'Query parameter "name" must not be empty' }, 400);
  }
  if (trimmed.length > MAX_NAME_LENGTH) {
    return c.json(
      { error: `Query parameter "name" must be at most ${MAX_NAME_LENGTH} characters` },
      400,
    );
  }

  // `normalizeName` lowercases, strips diacritics, and keeps only [a-z0-9 ] — a name
  // of pure punctuation normalizes to "" and yields no usable cache key.
  const normalized = normalizeName(trimmed);
  if (normalized.length === 0) {
    return c.json({ error: 'Query parameter "name" must contain letters or digits' }, 400);
  }

  // --- Rate limit (cost floor) AFTER name validation so a bad name 400s without
  //     counting. The image plane is keyless, so the only key candidate is the client
  //     IP (CF-Connecting-IP) — GDPR personal data, so it is HASHED before use and
  //     never stored/logged in clear. Fail-OPEN: any counter-store error serves the
  //     request. No limit configured / no IP -> no-op. ---
  const imageLimit = parseLimit(c.env.IMAGE_RATE_LIMIT);
  const ip = c.req.header('CF-Connecting-IP');
  if (imageLimit !== null && ip !== undefined) {
    const decision = await enforceRateLimit(c.env, `image:${await hashKey(ip)}`, imageLimit, Date.now());
    if (!decision.allowed) {
      c.header('Retry-After', String(decision.retryAfter));
      return c.json({ error: 'Too many requests. Please try again later.' }, 429);
    }
  }

  const key = `dishes/${PROMPT_VERSION}/${normalized}.png`;

  // --- R2 cache HIT: serve the stored bytes, no model call. ---
  const cached = await c.env.IMAGES.get(key);
  if (cached !== null) {
    return c.body(cached.body, 200, imageHeaders({ ETag: cached.httpEtag }));
  }

  // --- R2 cache MISS: generate ONCE via the provider chain (WaveSpeed by default,
  //     FLUX fallback), persist with provenance, then serve. ---
  //
  // Feed the NORMALIZED name (not the raw `trimmed`) into the prompt: normalizeName has
  // already reduced it to [a-z0-9 ] — no punctuation, quotes, or newlines — which strips
  // the structure a caller would need to prompt-inject the image model into rendering
  // something off-menu. (This matches the name that keys the cache, so prompt and key
  // stay in lock-step.)
  //
  // NOTE (must close before enabling R2 / the images feature — SECURITY re-audit): this
  // is injection-hardening only, NOT content moderation. The endpoint still generates a
  // paid, permanently-cached illustration for ANY food-like phrase. Before images ship,
  // gate generation on a real food-vocabulary hit (or restrict to names the app itself
  // produced from a /scan response) so it can't be used as a free image-generation oracle.
  const genStart = Date.now();
  const { bytes, modelLabel } = await generateWithFallback(foodImagePrompt(normalized), c.env);
  const genMs = Date.now() - genStart;

  await c.env.IMAGES.put(key, bytes, {
    httpMetadata: { contentType: 'image/png' },
    customMetadata: {
      // Provenance for audit + the AI Act marker, stored next to the object itself.
      aiGenerated: 'true',
      model: modelLabel,
      name: trimmed,
    },
  });

  // `bytes` is a Uint8Array view over exactly the PNG; Hono streams it as the body.
  // `Server-Timing` exposes the real generation latency for the test harness.
  return c.body(bytes, 200, imageHeaders({ 'Server-Timing': `imagegen;desc="${modelLabel}";dur=${genMs}` }));
});
