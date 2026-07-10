/**
 * Internal types for the deterministic nutrition engine.
 *
 * Contract with the rest of the app: the LLM/perception step provides
 * IngredientGuess[] (name + grams as served). This engine resolves each name to
 * a real composition record, sums per-100g values x grams (with cooking
 * yield/retention factors), and returns a NutritionEstimate RANGE — never a
 * single hard number. All public outputs (NutritionEstimate, Suitability,
 * AllergenFlag) come from `@bocado/shared`.
 */

/** Per-100g composition. kcal in kcal; macros + salt in grams. */
export interface Per100g {
  kcal: number;
  protein: number;
  fat: number;
  satFat?: number;
  carbs?: number;
  sugar?: number;
  salt: number;
}

export type FoodState = 'raw' | 'cooked';

/** A row from a composition database (CIQUAL/USDA), or a seed fixture. */
export interface FoodRecord {
  id: string;
  /**
   * Provenance of the value. Baked-in rows are 'CIQUAL' or 'USDA'; 'OFF' is reserved
   * for Open Food Facts; 'API' marks a row resolved at RUNTIME via the USDA FoodData
   * Central fallback (lower-trust — the engine widens its uncertainty + caps confidence
   * at 'medium'). Mirrors {@link NutritionSource.db} so provenance flows through.
   */
  db: 'CIQUAL' | 'USDA' | 'OFF' | 'API';
  name: string;
  aliases?: string[];
  per100g: Per100g;
  state?: FoodState;
  /** Coarse category to pick a default cooking-yield class (e.g. 'meat', 'vegetable', 'grain', 'oil'). */
  category?: string;
}

/** Result of resolving an ingredient name to a record, with match confidence 0..1. */
export interface MatchResult {
  record: FoodRecord;
  /** 1 = exact/alias hit, lower = fuzzy/substring. Drives overall estimate confidence. */
  score: number;
}

/**
 * The data source the engine sums over. The seed fixture (table/seed.ts) implements
 * this for tests/demo; the real CIQUAL+USDA tables are ingested into the same shape
 * (see scripts ingestion doc) so production swaps the data, not the engine.
 */
export interface NutritionTable {
  /** Normalized fuzzy lookup of an ingredient name -> best record, or null if unknown. */
  lookup(name: string): MatchResult | null;
  size(): number;
}

/**
 * EuroFIR-style cooking adjustment. yieldFactor = cooked mass / raw mass
 * (e.g. boiled pasta ~2.5, grilled meat ~0.75). retention = fraction of a nutrient
 * kept after cooking (water-soluble vitamins drop; energy/macros mostly retained).
 */
export interface CookingYield {
  method: string;
  yieldFactor: number;
  retention: Partial<Record<keyof Per100g, number>>;
}
