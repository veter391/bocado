/**
 * Bocado shared domain types — the contract between the mobile app, the API,
 * the perception layer, and the deterministic engine. See ARCHITECTURE.md.
 *
 * Invariant: the LLM produces `originalText`, `translatedName`, `explanation`,
 * and `ingredients` (guessed name + grams). Everything a user reads as a fact —
 * `nutrition` numbers, `suitability`, `allergenFlags` — is produced by
 * deterministic code, never by the model.
 */

export type SuitabilityLevel = 'good' | 'caution' | 'avoid';

export type MealContext = 'breakfast' | 'lunch' | 'dinner' | 'late-night' | 'snack';

export type DietId =
  | 'none'
  | 'vegan'
  | 'vegetarian'
  | 'pescatarian'
  | 'halal'
  | 'kosher'
  | 'keto'
  | 'low-carb'
  | 'gluten-free'
  | 'dairy-free';

export type GoalId = 'balanced' | 'weight-loss' | 'high-protein' | 'low-sodium';

/** EU Regulation 1169/2011, Annex II — the 14 mandatory allergens. */
export type AllergenId =
  | 'gluten'
  | 'crustaceans'
  | 'eggs'
  | 'fish'
  | 'peanuts'
  | 'soybeans'
  | 'milk'
  | 'nuts'
  | 'celery'
  | 'mustard'
  | 'sesame'
  | 'sulphites'
  | 'lupin'
  | 'molluscs';

export interface Range {
  min: number;
  max: number;
  unit: string;
  /**
   * Display-only upper bound, present ONLY when the estimate is uncertain and the honest
   * upper edge stretches above {@link max} ("could be considerably more"). It is NEVER
   * used by the per-nutrient lights or the verdict — those key off the [min,max] midpoint
   * so the locked lights<->verdict model is untouched. The UI may show this widened top
   * on the bar/disclaimer. Absent for a trustworthy estimate (band is exactly [min,max]).
   */
  displayMax?: number;
}

export type Confidence = 'low' | 'medium' | 'high';

/** Provenance for every nutrition value — required for honesty + attribution. */
export interface NutritionSource {
  db: 'CIQUAL' | 'USDA' | 'OFF' | 'API';
  recordId: string;
  name: string;
}

export interface NutritionEstimate {
  kcal: Range;
  protein: Range;
  fat: Range;
  satFat?: Range;
  carbs?: Range;
  sugar?: Range;
  salt: Range;
  /** Always an estimate, never a hard figure. */
  confidence: Confidence;
  sources: NutritionSource[];
}

/**
 * The nutrients surfaced by the per-nutrient traffic light. `calories` maps to the
 * estimate's `kcal` field; the rest map 1:1 to {@link NutritionEstimate} fields.
 */
export type NutrientKey = 'calories' | 'protein' | 'fat' | 'satFat' | 'sugar' | 'salt';

/**
 * Per-nutrient verdict (Yuka-style traffic light):
 *  - `good`    -> green
 *  - `caution` -> amber
 *  - `high`    -> red
 * A positive nutrient (e.g. protein) never reaches `high`.
 */
export type NutrientLevel = 'good' | 'caution' | 'high';

/**
 * One row of the per-nutrient traffic light for a single dish portion.
 *
 * Thresholds are EU-guidance-based APPROXIMATIONS for a single portion — guidance,
 * not medical advice (see the nutrition engine's `rateNutrients`).
 */
export interface NutrientLight {
  key: NutrientKey;
  /** Human label, e.g. "Saturated fat". */
  label: string;
  level: NutrientLevel;
  /** Short tag for the level, e.g. "Low" / "Mid" / "High" / "Good". */
  tag: string;
  /** The estimate's range for this nutrient (per portion). */
  range: Range;
  /** Bar fill, 5..100, derived from the range midpoint. */
  fillPct: number;
  /** True for nutrients where "more is better" (protein); they never read `high`. */
  positive: boolean;
}

/**
 * How a dish is cooked — perception's single most load-bearing structural signal.
 *
 * The deterministic engine uses this to pick the right cooking yield AND the right
 * added-fat allowance (e.g. a grilled dish gets NO phantom oil line; a deep-fried
 * dish models absorbed fat from the food mass). The model NEVER emits a fat number —
 * it only labels the method, and the engine applies a CITED, bounded allowance.
 */
export type CookingMethod =
  | 'grilled'
  | 'fried'
  | 'deep-fried'
  | 'roasted'
  | 'baked'
  | 'sauteed'
  | 'steamed'
  | 'boiled'
  | 'raw'
  | 'braised'
  | 'stewed'
  | 'cured'
  | 'unknown';

/**
 * A single perceived component of a dish.
 *
 * MIGRATION (back-compat): the legacy shape was `{ name, grams }`. The new shape adds
 * a lowercase-English `canonicalName` (what the engine matches), an optional verbatim
 * `originalTerm` (the menu word, display-only — NEVER matched), a `basis` (whether the
 * component was directly read off the menu or inferred), and `isAddedFat` (marks
 * oil/butter/dressing lines so the engine clamps them hardest). `name` is retained and
 * optional so old fixtures, cached perceptions, and tests still parse; new callers
 * should set `canonicalName`. Use the shared {@link matchName} accessor to read the
 * name the engine matches — never read `.name` directly.
 */
export interface IngredientGuess {
  /** Legacy field; kept for back-compat. New code reads {@link matchName} instead. */
  name?: string;
  /** Lowercase-English canonical food name the engine matches against the table. */
  canonicalName?: string;
  /** Verbatim menu word (e.g. "lubina"); shown in the UI, NEVER matched. */
  originalTerm?: string;
  grams: number;
  /** 'read' = printed/visible on the menu; 'inferred' = a component the model deduced. */
  basis?: 'read' | 'inferred';
  /** True for oil/butter/dressing lines — the engine clamps these hardest. */
  isAddedFat?: boolean;
}

/**
 * The name the deterministic engine matches for an ingredient: the canonical name
 * when present, else the legacy `name`, else an empty string. This is the SINGLE
 * accessor every consumer (matcher, suitability tokenizer, allergen detector) must
 * use so the back-compat shim lives in one place and `.name` is never read directly.
 */
export function matchName(ingredient: IngredientGuess): string {
  return ingredient.canonicalName ?? ingredient.name ?? '';
}

/** Never a guarantee. Always surfaced as "may contain — confirm with staff". */
export interface AllergenFlag {
  allergen: AllergenId;
  basis: 'ingredient-match' | 'name-keyword';
  note: string;
}

export interface Suitability {
  level: SuitabilityLevel;
  /** One-word human label, e.g. "Good now" / "Heavy late" / "Avoid now". */
  label: string;
  reasons: string[];
  /**
   * The nutrition estimate's confidence, echoed onto the verdict so the UI can
   * surface honest uncertainty without re-deriving it. Same scale as
   * {@link NutritionEstimate.confidence}.
   */
  confidence: Confidence;
  /**
   * True when the underlying estimate is structurally untrustworthy (low confidence,
   * mostly-unaccounted plate, or a fried dish whose oil uptake could not be modelled).
   * The LEVEL still equals what the lights imply (the lights<->verdict invariant is
   * never broken); this flag only adds an honest "treat this as rough" signal. A 'good'
   * verdict whose `uncertain` is true wears a "Hard to read clearly" label instead of
   * the usual friendly one — we never fabricate a worse verdict, only flag the doubt.
   */
  uncertain: boolean;
  /**
   * Plain-language reason the estimate is uncertain, set only when {@link uncertain}
   * is true. Grandma-readable, no health claim, never says "safe". Absent otherwise.
   */
  uncertaintyReason?: string;
}

export interface Dish {
  id: string;
  originalText: string;
  translatedName: string;
  section?: string;
  explanation?: string;
  ingredients: IngredientGuess[];
  nutrition?: NutritionEstimate;
  allergenFlags: AllergenFlag[];
  suitability: Suitability;
  /** Generated or matched image; if generated it MUST be labeled AI (see SECURITY.md). */
  imageUrl?: string;
  imageIsAi?: boolean;
}

export interface ScannedMenu {
  id: string;
  createdAt: string; // ISO
  context: MealContext;
  title?: string;
  dishes: Dish[];
}

export interface UserProfile {
  diet: DietId;
  allergies: AllergenId[];
  goals: GoalId[];
  /**
   * Free-text "anything else" the user wants Bocado to account for — e.g. a
   * special diet or condition like "low FODMAP" or "no shellfish at all". The
   * AI ranking layer parses this later; we only store and surface it here.
   *
   * Privacy: this is free text that MAY describe a health condition, so it is
   * GDPR Art. 9 health data and is gated behind the same explicit consent as
   * allergies (`consentHealthDataAt`) — never retained without it.
   */
  otherNotes?: string;
  /** ISO timestamp of explicit GDPR Art. 9 consent for storing health data. */
  consentHealthDataAt?: string;
}

/** The raw, user-agnostic output the perception model returns (pre-engine). */
export interface PerceivedDish {
  originalText: string;
  translatedName: string;
  section?: string;
  explanation?: string;
  /**
   * How the dish is cooked. Drives the engine's cooking-yield + added-fat allowance.
   * Defaults to 'unknown' (back-compat: legacy perceptions without it parse fine).
   */
  cookingMethod?: CookingMethod;
  ingredients: IngredientGuess[];
}

export interface PerceivedMenu {
  title?: string;
  dishes: PerceivedDish[];
  /**
   * The model's self-reported confidence that the image is actually a readable menu,
   * 0..1. Perception-plane signal ONLY (no health/diet content) — it lets the edge and
   * the app distinguish "this isn't a menu / unreadable" from a genuinely empty menu,
   * so we show an honest "try again" state instead of fabricating dishes. Optional +
   * back-compat: legacy perceptions / cached rows without it parse fine (treated as
   * "unknown", never as a low-confidence rejection on its own).
   */
  menuConfidence?: number;
  /**
   * The model's explicit yes/no that the photo is a menu. Same role as
   * {@link menuConfidence} but a coarse boolean the model can emit when it is sure the
   * frame is not a menu (e.g. a person, a landscape). Optional + back-compat.
   */
  isMenu?: boolean;
}
