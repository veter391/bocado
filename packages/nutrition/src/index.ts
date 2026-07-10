/**
 * @bocado/nutrition — the deterministic TRUST CORE.
 *
 * Pure TypeScript. No React/RN, no I/O, no clock, no randomness. Runs in Node and
 * in Cloudflare Workers. Everything a user reads as a *fact* — nutrition numbers,
 * the suitability dot, allergen flags — is produced here, over a real composition
 * database (CIQUAL/USDA), and NEVER by the perception model. See ARCHITECTURE.md §3.
 *
 * This module is the public entry point (the ORCHESTRATOR). It wires the four
 * deterministic sub-modules together behind one call, `enrichDish`, and re-exports
 * their primitives so callers (the Worker) can also use them directly.
 *
 * Honesty contract (PRODUCT.md / SECURITY.md), enforced by the sub-modules and
 * preserved here:
 *  - Every nutrient is a RANGE that widens with uncertainty — never a hard number.
 *  - `confidence` reflects coverage + match quality (many unknowns -> 'low').
 *  - Allergens are "may contain — confirm with staff", never "safe"/"allergen-free".
 *  - No value is invented: each traces to a FoodRecord in `nutrition.sources[]`.
 *    Unknown ingredients widen the range / lower confidence; they are counted, not
 *    silently dropped.
 */
import type {
  AllergenFlag,
  Dish,
  IngredientGuess,
  MealContext,
  NutritionEstimate,
  PerceivedDish,
  Suitability,
  UserProfile,
} from '@bocado/shared';

import { estimateNutrition } from './compute/estimate';
import { getCookingYield } from './compute/yield';
import { assessSuitability } from './suitability/rules';
import { detectAllergens } from './allergens/detect';
import { seedTable } from './table/memoryTable';
import type { NutritionTable } from './types';

/**
 * The portion of a {@link Dish} the deterministic engine is responsible for.
 *
 * The caller (Worker) merges this with the perception-plane fields it already
 * holds (`id`, `originalText`, `translatedName`, `section`, `explanation`,
 * `imageUrl`, `imageIsAi`) to assemble a full `Dish`. We never invent those here —
 * keeping the two planes separate is what makes "AI never decides the numbers" a
 * code-enforced fact rather than a slogan.
 */
export interface EnrichedDishParts {
  /** Echoed back from the perceived dish so the caller can store the exact basis used. */
  ingredients: IngredientGuess[];
  nutrition: NutritionEstimate;
  allergenFlags: AllergenFlag[];
  suitability: Suitability;
}

/** Inputs to {@link enrichDish} beyond the perceived dish itself. */
export interface EnrichArgs {
  /** Meal context (time-of-day class) drives time-aware suitability. */
  context: MealContext;
  /**
   * The user's diet/allergy/goals profile. Optional: when absent the engine still
   * computes generic nutrition + allergen flags and a profile-agnostic suitability.
   * This object is part of the PERSONALIZATION plane and must never reach a model.
   */
  profile?: UserProfile;
  /**
   * Composition source to sum over. Defaults to {@link seedTable} (the fixture).
   * Production passes a table backed by the real CIQUAL+USDA rows — same interface,
   * different data (see scripts/INGEST.md).
   */
  table?: NutritionTable;
}

/**
 * Orchestrate the deterministic engine over one perceived dish.
 *
 * Pure and deterministic: given the same `perceived`, `context`, `profile`, and
 * `table`, it always returns the same result. It performs no I/O and reads no clock
 * — the meal context is supplied by the caller (derive it from the user's local time
 * with `mealContextForHour` upstream) so the function stays testable and edge-safe.
 *
 * Pipeline (see ARCHITECTURE.md §1 step 4):
 *  1. nutrition  = estimateNutrition(ingredients, table)  -> range + confidence + sources
 *  2. allergens  = detectAllergens(ingredients)           -> "may contain" flags
 *  3. suitability = assessSuitability({ nutrition, context, profile, ingredients })
 *
 * @returns the engine-computed parts of a Dish; the caller merges identity/text/image.
 */
export function enrichDish(perceived: PerceivedDish, args: EnrichArgs): EnrichedDishParts {
  const table = args.table ?? seedTable;
  const ingredients = perceived.ingredients;

  // cookingMethod drives the engine's added-fat allowance + deep-fry absorption.
  // (Previously dropped here — scan.ts already forwarded it; this aligns enrichDish.)
  const nutrition = estimateNutrition(ingredients, table, {
    cookingMethod: perceived.cookingMethod,
  });
  const allergenFlags = detectAllergens(ingredients);
  const suitability = assessSuitability({
    nutrition,
    context: args.context,
    profile: args.profile,
    ingredients,
    uncertain: nutrition.uncertain,
  });

  return { ingredients, nutrition, allergenFlags, suitability };
}

// --- Re-exports: deterministic primitives for direct use by the Worker / tests ---
export { estimateNutrition } from './compute/estimate';
export type { EstimateOptions, EstimateResult } from './compute/estimate';
export { getCookingYield } from './compute/yield';
export {
  PRIOR_GRAMS,
  FAT_SUBTYPE_PRIORS,
  FRY_ABSORPTION_PCT,
  priorFor,
  addedFatSubtype,
} from './compute/priors';
export { assessSuitability } from './suitability/rules';
export { detectAllergens } from './allergens/detect';
export { rateNutrients } from './rate/nutrients';
export { dishFitsDiet, dishHitsAllergies } from './diet/filter';
export {
  createMemoryTable,
  seedTable,
  seedFixtureTable,
  normalizeName,
  DEFAULT_FOODS,
} from './table/memoryTable';
export { SEED_FOODS } from './table/seed';
export {
  CANONICAL_VOCABULARY,
  COARSE_CATEGORIES,
  coarseCategoryFromUsdaGroup,
  isCanonicalName,
} from './table/vocab';
export type { CoarseCategory } from './table/vocab';
export { CURATED_FOODS } from './table/foods.curated';
export { GENERATED_FOODS, GENERATED_DATA_ATTRIBUTION } from './table/foods.generated';

// --- Re-exports: internal types (the shape of the data the engine sums over) ---
export type {
  Per100g,
  FoodState,
  FoodRecord,
  MatchResult,
  NutritionTable,
  CookingYield,
} from './types';

// Help TS see the value-position imports above are used in the signature.
export type { AllergenFlag, NutritionEstimate, Suitability, Dish } from '@bocado/shared';

// --- Re-exports: per-nutrient traffic-light types (output of rateNutrients) ---
export type { NutrientKey, NutrientLevel, NutrientLight } from '@bocado/shared';
