/**
 * Anonymous perception cache (D1 `perception_cache`).
 *
 * Repeat scans of the SAME cleaned image must not re-pay the model: we key the
 * cache on a stable content hash of the image and store the validated
 * {@link PerceivedMenu} JSON. The cache holds NO user data — only image-derived
 * content (SECURITY.md §1). The hash is one-way (SHA-256), so the stored key is
 * not the image itself.
 *
 * Trust boundary: cached JSON is re-validated with `perceivedMenuSchema` on read,
 * exactly like fresh model output — a corrupted/garbage row never reaches the
 * engine (we treat it as a miss instead).
 */
import type { PerceivedMenu } from '@bocado/shared';
import { perceivedMenuSchema } from '@bocado/shared';

import type { Env } from '../env';

/**
 * Reduce a possibly-`data:`-prefixed image string to the raw payload that defines
 * its content, so two scans of identical bytes hash identically regardless of the
 * declared mime type or `;base64,` framing. Non-data strings are hashed verbatim.
 */
function imagePayload(image: string): string {
  const comma = image.startsWith('data:') ? image.indexOf(',') : -1;
  return comma >= 0 ? image.slice(comma + 1) : image;
}

/**
 * Perception-contract version. BUMP this whenever the perception OUTPUT SHAPE changes
 * so stale cached rows (keyed by image hash) miss and re-fetch under the new prompt.
 *
 * v2: introduced the cookingMethod field + the canonicalName/originalTerm/basis/
 * isAddedFat ingredient shape (the fat-fix perception contract). A pre-v2 `{name,grams}`
 * row would still PARSE via the back-compat schema shim, but it lacks cookingMethod and
 * the read/inferred basis the engine now uses — so we want a clean re-perceive rather
 * than silently estimating an old-shape entry without those signals (directive G).
 */
const PERCEPTION_CACHE_VERSION = 'v2';

/**
 * Stable, one-way hash (hex SHA-256) of the cleaned image. Used as the
 * `perception_cache` primary key. Deterministic: identical input -> identical key.
 */
export async function hashImage(image: string): Promise<string> {
  // Prefix with the contract version so a contract bump invalidates old keys cleanly
  // (the same image hashes to a new key -> miss -> re-perceive under the new prompt).
  const bytes = new TextEncoder().encode(`${PERCEPTION_CACHE_VERSION}:${imagePayload(image)}`);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  const view = new Uint8Array(digest);
  let hex = '';
  for (let i = 0; i < view.length; i += 1) {
    hex += view[i]!.toString(16).padStart(2, '0');
  }
  return hex;
}

/**
 * Look up a cached perception by image hash. Returns the validated menu on a hit,
 * or `null` on a miss OR when the stored row fails re-validation (treated as a miss
 * so a bad row can be transparently regenerated and overwritten).
 */
export async function getCachedPerception(
  env: Env,
  imageHash: string,
): Promise<PerceivedMenu | null> {
  const row = await env.DB.prepare(
    'SELECT perceived FROM perception_cache WHERE image_hash = ?',
  )
    .bind(imageHash)
    .first<{ perceived: string }>();

  if (row === null) return null;

  try {
    return perceivedMenuSchema.parse(JSON.parse(row.perceived));
  } catch {
    // Corrupt/legacy row: treat as a miss rather than trusting unvalidated JSON.
    return null;
  }
}

/**
 * Store a perception under its image hash. Idempotent: re-caching the same image
 * overwrites the row (`INSERT OR REPLACE`) so a regenerated result wins.
 */
export async function putCachedPerception(
  env: Env,
  imageHash: string,
  perceived: PerceivedMenu,
): Promise<void> {
  await env.DB.prepare(
    'INSERT OR REPLACE INTO perception_cache (image_hash, perceived, created_at) VALUES (?, ?, ?)',
  )
    .bind(imageHash, JSON.stringify(perceived), new Date().toISOString())
    .run();
}
