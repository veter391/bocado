/**
 * Cooking yield + nutrient retention factors (COMPUTE module).
 *
 * APPROXIMATE, EuroFIR-style coarse-category factors. These are deliberately
 * rounded, conservative approximations keyed by the coarse `category` on a
 * FoodRecord (see types.ts). They are NOT authoritative recipe science — the
 * product surfaces a RANGE + confidence precisely because numbers like these
 * are estimates (see PRODUCT.md §6, SECURITY.md §2.D). Treat every value here
 * as "good enough to widen a range honestly", not as a measured constant.
 *
 * Two factors per class:
 *  - yieldFactor = cooked mass / raw mass. <1 = water/fat lost (grilled meat,
 *    roasted veg); >1 = water absorbed (boiled rice, pasta, legumes).
 *  - retention  = fraction of a nutrient kept after cooking, per nutrient
 *    (0..1). Energy and macronutrients are largely retained on a per-portion
 *    basis; we keep them ~1.0 here because the seed table has no micronutrients
 *    and per-portion macro loss is small relative to the estimate's own range.
 *    Retention < 1 is reserved for cases (e.g. fat rendering off grilled meat)
 *    where a macro genuinely leaves the food.
 *
 * IMPORTANT (no double-counting): most seed records are already `state:'cooked'`,
 * meaning their per-100g values describe the cooked food. Applying a raw→cooked
 * yield to them would double-adjust. So `getCookingYield` returns an IDENTITY
 * yield (factor 1, full retention) whenever the record is already cooked, and
 * `estimate.ts` only applies a non-identity yield to `raw` records.
 */

import type { CookingYield, FoodState, Per100g } from '../types';

/** A no-op cooking adjustment: mass unchanged, every nutrient fully retained. */
export const IDENTITY_YIELD: CookingYield = {
  method: 'none',
  yieldFactor: 1,
  retention: {},
};

/**
 * Per-class raw→cooked factors. Keys are the coarse `category` values used in
 * the seed table. `method` is a human label for provenance/debugging only.
 *
 * Retention maps are intentionally sparse: an omitted nutrient means "fully
 * retained" (treated as 1.0 by the consumer). We only list a nutrient when the
 * approximation says it measurably leaves the food during cooking.
 *
 * CITATIONS / PROVENANCE (re-verify before a production data run):
 *  - Yield factors (cooked mass / raw mass) track the EuroFIR / FAO "Food Yield"
 *    convention and the USDA "Table of Cooking Yields for Meat and Poultry"
 *    (USDA AH-102, yields for moist/dry heat) and USDA grain/legume cooking yields.
 *    Values here are rounded class averages, not a single measured constant — the
 *    estimate is published as a RANGE precisely because these are approximations.
 *  - Retention fractions track the EuroFIR "Standardised Food Yield and Nutrient
 *    Retention Factors" table (energy/macros largely retained per portion; only
 *    rendered fat is listed as a measurable macro loss).
 *  - The grain (2.4) and legume (2.3) ABSORPTION factors are a RAW-INPUT SAFETY NET
 *    only: curated grain/legume rows are stored `state:'cooked'`, so
 *    getCookingYield() returns IDENTITY for them and these factors RARELY fire. They
 *    exist for a genuinely raw input (e.g. flour). A cooked grain mistakenly tagged
 *    `state:'raw'` would wrongly get ×2.4 mass — that is exactly the "risotto"
 *    inflation failure, so generated-row `state` tagging must be verified at ingest
 *    (see scripts/INGEST.md): tag a cooked composition row as 'cooked', never 'raw'.
 */
const YIELD_TABLE: Record<string, CookingYield> = {
  // Muscle meat loses water + some rendered fat on dry heat. ~25% mass loss.
  meat: {
    method: 'grilled/roasted',
    yieldFactor: 0.75,
    retention: { fat: 0.9, satFat: 0.9 },
  },
  // Fish is delicate; less mass loss than red meat.
  fish: {
    method: 'baked/pan',
    yieldFactor: 0.85,
    retention: { fat: 0.95, satFat: 0.95 },
  },
  // Prawns/squid etc. shrink noticeably when cooked.
  seafood: {
    method: 'boiled/grilled',
    yieldFactor: 0.8,
    retention: {},
  },
  // Eggs set with minimal mass change.
  egg: {
    method: 'boiled/fried',
    yieldFactor: 0.95,
    retention: {},
  },
  // Grains/pasta absorb water and gain mass substantially.
  // (Seed grains are already 'cooked', so this only fires for raw grains
  //  such as flour-as-an-ingredient, where it is a coarse approximation.)
  grain: {
    method: 'boiled/absorbed',
    yieldFactor: 2.4,
    retention: {},
  },
  // Dried legumes roughly double-plus in mass when cooked.
  legume: {
    method: 'boiled',
    yieldFactor: 2.3,
    retention: {},
  },
  // Vegetables lose water; moderate shrink for roast/sauté, less for steam.
  vegetable: {
    method: 'sautéed/roasted',
    yieldFactor: 0.85,
    retention: {},
  },
  // Starchy tuber: modest loss.
  tuber: {
    method: 'boiled/roasted',
    yieldFactor: 0.9,
    retention: {},
  },
  // Fruit (often raw in restaurant use); minimal change when used cooked.
  fruit: {
    method: 'raw/light',
    yieldFactor: 1,
    retention: {},
  },
  // Pure fats/oils/dairy fat: no raw→cooked mass change worth modelling here.
  oil: { method: 'as-served', yieldFactor: 1, retention: {} },
  fat: { method: 'as-served', yieldFactor: 1, retention: {} },
  dairy: { method: 'as-served', yieldFactor: 1, retention: {} },
  // Sugars/sweets: as-served, no adjustment.
  sugar: { method: 'as-served', yieldFactor: 1, retention: {} },
  sweet: { method: 'as-served', yieldFactor: 1, retention: {} },
  // Already-fried items (e.g. french fries) are stored as the finished food.
  fried: { method: 'as-served', yieldFactor: 1, retention: {} },
};

/**
 * Resolve the cooking-yield class for a record.
 *
 * @param category Coarse FoodRecord.category (e.g. 'meat', 'grain'). Unknown or
 *   undefined categories fall back to IDENTITY_YIELD (no adjustment) — we never
 *   invent a factor for a class we don't model.
 * @param state   The record's FoodState. If 'cooked', the per-100g values
 *   already describe the cooked food, so we MUST NOT re-apply a yield: returns
 *   IDENTITY_YIELD regardless of category.
 *
 * Deterministic and pure: same inputs → same output, no I/O, no clock/random.
 */
export function getCookingYield(category?: string, state?: FoodState): CookingYield {
  // Already-cooked records carry cooked values — applying a raw→cooked factor
  // would double-count. Return a no-op adjustment.
  if (state === 'cooked') return IDENTITY_YIELD;

  if (!category) return IDENTITY_YIELD;
  const found = YIELD_TABLE[category];
  return found ?? IDENTITY_YIELD;
}

/**
 * Retention fraction (0..1) for a single nutrient under a given yield.
 * An unlisted nutrient is fully retained (1.0). Helper kept here so the factor
 * model and its interpretation live together.
 */
export function retentionFor(cooking: CookingYield, nutrient: keyof Per100g): number {
  const r = cooking.retention[nutrient];
  return r ?? 1;
}
