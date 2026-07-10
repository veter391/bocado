/**
 * USDA FoodData Central (FDC) RUNTIME FALLBACK — the documented, typed SEAM that fills
 * the long tail when the baked-in table (curated + generated CIQUAL/USDA) cannot resolve
 * an ingredient's canonicalName.
 *
 * WHY FDC (replaces the FatSecret plan in INGEST.md §6): CC0 1.0 public domain (no
 * share-alike, no attribution obligation, EU-safe), generic-food coverage that maps
 * cleanly onto FoodRecord, free key at 1000 req/hr/IP. Endpoint
 * https://api.nal.usda.gov/fdc/v1/ (api-guide: fdc.nal.usda.gov/api-guide).
 *
 * INVARIANTS (SECURITY.md / ARCHITECTURE.md):
 *  - This is NOT inside the pure engine — the engine stays deterministic + I/O-free.
 *    The Worker resolves the missing name HERE, maps the FDC food to a FoodRecord
 *    (db:'API'), and injects it into a PER-REQUEST overlay table passed to
 *    estimateNutrition. The engine still just sums real records.
 *  - KEY-GATED: only runs when env.FDC_API_KEY is present. Absent -> the caller skips
 *    the fallback and the unknown ingredient stays honestly UNMATCHED (wider band,
 *    lower confidence). CI/tests never depend on the network.
 *  - ANONYMITY (two planes): the lookup query is a generic FOOD NAME only — never user
 *    identity/allergy/location. The call originates in the Worker, not the device.
 *  - CACHE: EU D1, keyed by normalizeName(canonicalName) (mirrors the perception
 *    cache). Negative results cached too (short TTL) so repeated unknowns don't hammer
 *    the API. A cache-write failure must NEVER fail the scan (best-effort).
 *  - HONESTY: db:'API' rows are lower-trust; estimate.ts already widens their
 *    uncertainty + caps confidence at 'medium' (see estimate.ts), and sources[] carries
 *    db:'API' so the UI attributes correctly. An unresolved name stays unmatched.
 *
 * Tested with an INJECTED fake fetch returning canned FDC JSON (like client.ts
 * FetchImpl) — no live network, BOCADO_LIVE never set.
 */
import type { FoodRecord, Per100g } from '@bocado/nutrition';
import { coarseCategoryFromUsdaGroup, normalizeName } from '@bocado/nutrition';

import type { Env } from '../env';

/** Subset of `fetch` this seam relies on (injectable for tests; see client.ts). */
export type FetchImpl = (
  input: string,
  init: { method: string; headers: Record<string, string>; signal?: AbortSignal },
) => Promise<{ readonly ok: boolean; readonly status: number; text(): Promise<string> }>;

export interface UsdaFallbackOptions {
  fetchImpl?: FetchImpl;
  timeoutMs?: number;
}

/** Default per-attempt timeout for the FDC call. */
const DEFAULT_TIMEOUT_MS = 8_000;
/** Conversion: USDA reports sodium in mg; EU 1169/2011 salt = sodium × 2.5. */
const SODIUM_MG_TO_SALT_G = 2.5 / 1000;
/** Short negative-cache TTL (ms) so repeated unknowns don't hammer the API. */
const NEGATIVE_TTL_MS = 24 * 60 * 60 * 1000;

/** USDA FDC nutrient ids we read (api-guide / INGEST.md §2.2). */
const N = {
  kcal: 1008,
  protein: 1003,
  fat: 1004,
  satFat: 1258,
  carbs: 1005,
  sugarTotal: 2000,
  sugarAlt: 1063,
  sodium: 1093,
} as const;

/** The slice of an FDC `/foods/search` response we depend on (parsed defensively). */
interface FdcSearchResponse {
  foods?: Array<{
    fdcId?: number;
    description?: string;
    dataType?: string;
    foodCategoryId?: number;
    foodCategory?: string;
    foodNutrients?: Array<{ nutrientId?: number; value?: number }>;
  }>;
}

/** Map FDC nutrient rows into our Per100g (required fields must exist, else null). */
function toPer100g(nutrients: Map<number, number>): Per100g | null {
  const kcal = nutrients.get(N.kcal);
  const protein = nutrients.get(N.protein);
  const fat = nutrients.get(N.fat);
  const sodiumMg = nutrients.get(N.sodium);
  const salt = sodiumMg === undefined ? undefined : sodiumMg * SODIUM_MG_TO_SALT_G;
  if (
    kcal === undefined || protein === undefined || fat === undefined || salt === undefined ||
    ![kcal, protein, fat, salt].every((v) => Number.isFinite(v) && v >= 0)
  ) {
    return null; // honesty: no required field -> no fabricated row.
  }
  const per100g: Per100g = { kcal, protein, fat, salt };
  const satFat = nutrients.get(N.satFat);
  const carbs = nutrients.get(N.carbs);
  const sugar = nutrients.get(N.sugarTotal) ?? nutrients.get(N.sugarAlt);
  if (satFat !== undefined && Number.isFinite(satFat)) per100g.satFat = satFat;
  if (carbs !== undefined && Number.isFinite(carbs)) per100g.carbs = carbs;
  if (sugar !== undefined && Number.isFinite(sugar)) per100g.sugar = sugar;
  return per100g;
}

/** Parse the best FDC search hit into a FoodRecord (db:'API'), or null. */
function bestRecordFromSearch(json: FdcSearchResponse, canonicalName: string): FoodRecord | null {
  const foods = json.foods ?? [];
  // Prefer Foundation/SR Legacy generic rows over Branded noise.
  const ranked = [...foods].sort((a, b) => rank(a.dataType) - rank(b.dataType));
  for (const f of ranked) {
    if (f.fdcId === undefined) continue;
    const nutrients = new Map<number, number>();
    for (const fn of f.foodNutrients ?? []) {
      if (typeof fn.nutrientId === 'number' && typeof fn.value === 'number') {
        nutrients.set(fn.nutrientId, fn.value);
      }
    }
    const per100g = toPer100g(nutrients);
    if (!per100g) continue;
    const name = (f.description ?? canonicalName).trim();
    const category = coarseCategoryFromUsdaGroup(
      f.foodCategoryId === undefined ? undefined : String(f.foodCategoryId),
      name,
    );
    return {
      id: `usda-fdc-${f.fdcId}`,
      db: 'API',
      name,
      aliases: [canonicalName],
      category,
      // FDC search rows do not reliably state raw/cooked; leave undefined so the engine
      // applies IDENTITY yield (never a fabricated x2.4) for an unknown state.
      per100g,
    };
  }
  return null;
}

/** Data-type preference: lower = better (Foundation > SR Legacy > Survey > Branded). */
function rank(dataType: string | undefined): number {
  switch (dataType) {
    case 'Foundation':
    case 'foundation_food':
      return 0;
    case 'SR Legacy':
    case 'sr_legacy_food':
      return 1;
    case 'Survey (FNDDS)':
    case 'survey_fndds_food':
      return 2;
    default:
      return 3; // Branded / unknown
  }
}

// --- D1 cache (best-effort; never fails the scan) ----------------------------

interface CacheRow {
  food_key: string;
  record: string | null; // JSON FoodRecord, or null for a cached negative
  created_at: string;
}

/** Read a cached FDC resolution (positive or negative). null = cache miss. */
async function readCache(
  env: Env,
  key: string,
): Promise<{ hit: true; record: FoodRecord | null } | { hit: false }> {
  try {
    const row = await env.DB.prepare(
      'SELECT food_key, record, created_at FROM usda_food_cache WHERE food_key = ?',
    )
      .bind(key)
      .first<CacheRow>();
    if (!row) return { hit: false };
    if (row.record === null) {
      // Negative cache: respect the short TTL so a transient miss can be retried later.
      const age = Date.now() - Date.parse(row.created_at);
      if (Number.isFinite(age) && age > NEGATIVE_TTL_MS) return { hit: false };
      return { hit: true, record: null };
    }
    const parsed = JSON.parse(row.record) as FoodRecord;
    return { hit: true, record: parsed };
  } catch {
    // A cache read failure must not break resolution — treat as a miss.
    return { hit: false };
  }
}

/** Write a resolution (positive or negative) to the cache. Best-effort. */
async function writeCache(env: Env, key: string, record: FoodRecord | null): Promise<void> {
  try {
    await env.DB.prepare(
      'INSERT OR REPLACE INTO usda_food_cache (food_key, record, created_at) VALUES (?, ?, ?)',
    )
      .bind(key, record === null ? null : JSON.stringify(record), new Date().toISOString())
      .run();
  } catch {
    // Best-effort: a transient D1 write error degrades to "no caching", not a failure.
  }
}

// --- Public seam -------------------------------------------------------------

/**
 * Resolve a single ingredient name via the FDC fallback, cached. Returns a FoodRecord
 * (db:'API') or null (unresolved -> caller leaves it unmatched). KEY-GATED: returns
 * null immediately when env.FDC_API_KEY is absent.
 *
 * @param canonicalName a GENERIC food name only — never user data (anonymity invariant).
 */
export async function resolveViaUsdaFdc(
  canonicalName: string,
  env: Env,
  opts: UsdaFallbackOptions = {},
): Promise<FoodRecord | null> {
  if (!env.FDC_API_KEY) return null; // feature flag: no key -> skip, degrade safely.

  const key = normalizeName(canonicalName);
  if (!key) return null;

  const cached = await readCache(env, key);
  if (cached.hit) return cached.record;

  const fetchImpl = opts.fetchImpl ?? (globalThis.fetch as unknown as FetchImpl);
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  let record: FoodRecord | null = null;
  try {
    const params = new URLSearchParams({
      query: canonicalName,
      // Foundation/SR Legacy/Survey are the generic-food planes; exclude Branded noise.
      dataType: 'Foundation,SR Legacy,Survey (FNDDS)',
      pageSize: '5',
      // FDC mandates the key as an `api_key` query param (no header form exists; see
      // fdc.nal.usda.gov/api-guide). It will appear in Worker/proxy access logs — that
      // is accepted: the key is FREE + rate-limited, grants only read access to public
      // food data, and the query carries a GENERIC food name only (no user data).
      api_key: env.FDC_API_KEY,
    });
    const res = await fetchImpl(`https://api.nal.usda.gov/fdc/v1/foods/search?${params.toString()}`, {
      method: 'GET',
      headers: { Accept: 'application/json' },
      signal: controller.signal,
    });
    if (res.ok) {
      const json = JSON.parse(await res.text()) as FdcSearchResponse;
      record = bestRecordFromSearch(json, canonicalName);
    }
  } catch {
    // Network/timeout/parse failure -> treat as unresolved (honest unmatched).
    record = null;
  } finally {
    clearTimeout(timer);
  }

  // Cache positive AND negative results (best-effort). A null write is a negative cache.
  await writeCache(env, key, record);
  return record;
}
