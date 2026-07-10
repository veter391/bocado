/**
 * CANONICAL VOCABULARY + SHARED COARSE-CATEGORY MAP.
 *
 * Two things the perception contract and the runtime USDA-FDC mapper must agree on,
 * kept in ONE place so they can never drift (directive K3 / openQuestion #7):
 *
 *  1. `CANONICAL_VOCABULARY` — the lowercase-English head nouns the perception model
 *     should prefer for `canonicalName`, derived from the ACTUAL curated table names +
 *     aliases (so every suggested word resolves at full score). A build-time test
 *     asserts each example/corpus canonicalName exists here.
 *
 *  2. `COARSE_CATEGORIES` + `coarseCategoryFromUsdaGroup` — the single coarse-class
 *     vocabulary (matches scripts/INGEST.md §3) and the USDA food_category_id -> class
 *     map the runtime FDC fallback uses, identical to the build-time ingest mapping.
 *
 * Pure data + pure helpers. No I/O.
 */
import { CURATED_FOODS } from './foods.curated';

/** The coarse cooking-yield classes (INGEST.md §3). Part of the engine's behaviour. */
export const COARSE_CATEGORIES = [
  'meat', 'fish', 'seafood', 'egg', 'dairy', 'fat', 'oil', 'grain', 'vegetable',
  'fruit', 'legume', 'fried', 'sugar', 'sweet', 'tuber', 'other',
] as const;

export type CoarseCategory = (typeof COARSE_CATEGORIES)[number];

/**
 * USDA FoodData Central `food_category_id` -> coarse class. MUST match
 * `usdaCategory()` in scripts/ingest.mjs so the runtime fallback and the build-time
 * ingest classify identically (no drift).
 */
const USDA_GROUP_TO_COARSE: Record<string, CoarseCategory> = {
  '1': 'dairy', // Dairy and Egg Products (egg refined by name)
  '4': 'fat', // Fats and Oils
  '5': 'meat', // Poultry
  '7': 'meat', // Sausages and Luncheon Meats
  '9': 'fruit', // Fruits
  '10': 'meat', // Pork
  '11': 'vegetable', // Vegetables
  '12': 'other', // Nut and Seed
  '13': 'meat', // Beef
  '15': 'fish', // Finfish and Shellfish (seafood refined by name)
  '16': 'legume', // Legumes
  '17': 'meat', // Lamb, Veal, Game
  '18': 'grain', // Baked Products
  '19': 'sweet', // Sweets
  '20': 'grain', // Cereal Grains and Pasta
};

/**
 * Map a USDA food_category_id (+ the food's name for egg/seafood/oil refinement) to a
 * coarse class. Mirrors the build-time ingest's `usdaCategory` + `inferState` name
 * refinement so a runtime-fetched row lands in the same class a baked row would.
 */
export function coarseCategoryFromUsdaGroup(categoryId: string | undefined, name: string): CoarseCategory {
  const s = name.toLowerCase();
  // Name refinements first (same precedence the ingest uses).
  if (/\b(oil|olive oil)\b/.test(s)) return 'oil';
  if (/\b(egg|eggs)\b/.test(s)) return 'egg';
  if (/\b(prawn|shrimp|crab|lobster|mussel|clam|oyster|squid|octopus|scallop|seafood|shellfish)\b/.test(s)) {
    return 'seafood';
  }
  const mapped = categoryId ? USDA_GROUP_TO_COARSE[categoryId] : undefined;
  return mapped ?? 'other';
}

/**
 * Derive the canonical head-noun vocabulary from the curated table (names + aliases),
 * deduped + sorted for determinism. These are the words the perception model should
 * use for `canonicalName`; every one resolves against the matcher at full score.
 */
export const CANONICAL_VOCABULARY: readonly string[] = (() => {
  const set = new Set<string>();
  for (const r of CURATED_FOODS) {
    set.add(r.name.toLowerCase());
    for (const a of r.aliases ?? []) set.add(a.toLowerCase());
  }
  return [...set].sort();
})();

/** True when a canonical name exists in the vocabulary (build-time contract check). */
export function isCanonicalName(name: string): boolean {
  return CANONICAL_VOCABULARY.includes(name.toLowerCase());
}
