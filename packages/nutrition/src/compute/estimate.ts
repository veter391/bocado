/**
 * estimateNutrition — the deterministic heart of the COMPUTE module.
 *
 * Contract (PRODUCT.md §6, SECURITY.md §2.D): given the perception layer's
 * IngredientGuess[] (name + grams as served) and a NutritionTable, resolve each
 * name to a REAL composition record, scale its per-100g values by grams, apply
 * an approximate cooking yield where appropriate, and sum into a per-nutrient
 * RANGE with a confidence and full provenance.
 *
 * Honesty invariants enforced here:
 *  - Never a single hard number: every nutrient is a {min,max} Range.
 *  - The range WIDENS with uncertainty — lower average match score and a larger
 *    fraction of UNMATCHED grams both push min/max further apart.
 *  - We never invent numbers: every contribution traces to a matched FoodRecord,
 *    and `sources[]` lists the unique records used.
 *  - Unknown ingredients are NEVER silently dropped. Their grams stay in the
 *    denominator (lowering coverage), which widens the range and lowers
 *    confidence. We do not fabricate values for them.
 *  - Pure + deterministic: no Date.now/Math.random, no I/O. Same inputs →
 *    byte-identical output.
 */

import type {
  Confidence,
  CookingMethod,
  IngredientGuess,
  NutritionEstimate,
  NutritionSource,
  Range,
} from '@bocado/shared';
import { matchName } from '@bocado/shared';
import type { FoodRecord, NutritionTable, Per100g } from '../types';
import { getCookingYield, retentionFor } from './yield';
import {
  FRY_ABSORPTION_PCT,
  FRY_SATFAT_FRACTION,
  KCAL_PER_G_FAT,
  isPureAddedFat,
  priorFor,
} from './priors';

/** Nutrients we sum. Optional ones (satFat/carbs/sugar) are only emitted when present. */
const MACRO_KEYS = ['kcal', 'protein', 'fat', 'satFat', 'carbs', 'sugar', 'salt'] as const;
type NutrientKey = (typeof MACRO_KEYS)[number];

/** Nutrients that are always reported (the type marks them required). */
const REQUIRED_KEYS = ['kcal', 'protein', 'fat', 'salt'] as const;
/** Nutrients reported only when at least one matched record carried them. */
const OPTIONAL_KEYS = ['satFat', 'carbs', 'sugar'] as const;

const UNIT_FOR: Record<NutrientKey, string> = {
  kcal: 'kcal',
  protein: 'g',
  fat: 'g',
  satFat: 'g',
  carbs: 'g',
  sugar: 'g',
  salt: 'g',
};

/**
 * UNCERTAINTY MODEL (PRODUCT.md §6: "a range, not a hard number"). These weights set
 * how honest the stated band is; they are intentionally conservative so we never look
 * more precise than we are. Changing any of them widens/narrows what users are told —
 * treat a bump as a product decision needing written justification, not a tweak.
 *
 * Baseline relative uncertainty applied even to a PERFECTLY-matched dish: a menu dish
 * has no recipe and no measured portion, so ±10% is the floor — the range always
 * covers at least the point ±10% even for a flawless match (NUTRITION_DISCLAIMER:
 * "Estimate only, not exact.").
 */
const BASE_UNCERTAINTY = 0.1;
/**
 * Extra width per unit of match-score gap (× (1 - avgScore)). 0.45 means a mediocre
 * 0.5-score match widens the band by ~0.225 on top of the floor (≈ ±32% total),
 * honestly signalling "we are not sure this is the right food record".
 */
const SCORE_UNCERTAINTY_WEIGHT = 0.45;
/**
 * Extra width per unit of UNMATCHED grams (× (1 - coverage)). 0.6 (the largest weight)
 * makes an unresolved ingredient the biggest honesty penalty: half the plate unmatched
 * adds ~±30%, so the band visibly reflects "we could not account for this food".
 */
const UNMATCHED_UNCERTAINTY_WEIGHT = 0.6;
/** Hard ceiling so the band stays meaningful (a usable range) instead of collapsing to [0, huge]. */
const MAX_UNCERTAINTY = 0.85;
/**
 * Extra relative uncertainty added when ANY plausibility guard actually fired (an
 * input was implausible and had to be scaled down). A guard firing means the
 * perception grams/energy were not trustworthy, so the honest response is a wider
 * band and a capped confidence — see `guardFired` below.
 */
const GUARD_UNCERTAINTY_BUMP = 0.15;
/**
 * Extra UPWARD-only relative width added to the displayed band when the estimate is
 * `uncertain` (a structurally-untrustworthy fry / mostly-unaccounted / low-confidence
 * dish). It is the SAME trust class as a fired plausibility guard ("the input is not
 * trustworthy"), so we reuse GUARD_UNCERTAINTY_BUMP rather than introduce a fresh magic
 * number. It widens ONLY the stated max — the point sum is never altered, and the min
 * never moves — so the band honestly says "could be considerably more" without inventing
 * a number.
 *
 * CRITICAL INVARIANT (why this is a SEPARATE display field, not folded into the emitted
 * Range): the per-nutrient lights and the verdict reason over the range MIDPOINT
 * (rate/nutrients.ts `mid`). Folding an upward stretch into `range.max` would shift that
 * midpoint and silently flip a light's level / escalate the verdict — regressing the
 * LOCKED lights<->verdict model (e.g. an inferred-dominated risotto's amber fat would
 * jump to red). So the upward stretch is exposed as {@link Range.displayMax}: the bar/
 * disclaimer may read it, but lights + verdict keep keying off the unchanged
 * [min,max] midpoint. The point sum and the light level are therefore byte-identical to
 * before; only an additive, display-only honesty hint is added when uncertain.
 */
const UNCERTAIN_UP_WIDEN = GUARD_UNCERTAINTY_BUMP;

/**
 * Extra relative uncertainty contributed by the share of grams whose grams were
 * INFERRED by the model rather than read off the menu (basis='inferred'). A confident
 * DB match on a model-guessed gram should not look deceptively narrow, so we widen the
 * band in proportion to the inferred-gram fraction (directive I, pinned constant).
 */
const INFERRED_UNCERTAINTY_WEIGHT = 0.2;
/**
 * When inferred grams dominate (> this fraction of total grams), the dish is mostly a
 * guess: cap confidence at 'low' so the UI surfaces "rough estimate" (directive I/J).
 */
const INFERRED_DOMINATES_FRACTION = 0.6;
/**
 * Extra relative uncertainty when ANY contributing record is API-sourced (db:'API',
 * the runtime USDA-FDC fallback). API rows are lower-trust; confidence caps at 'medium'.
 */
const API_UNCERTAINTY_BUMP = 0.1;

/**
 * PHYSICAL-PLAUSIBILITY GUARDS. The perception model guesses ingredient grams; a
 * bad guess (or a raw/dry record matched for a cooked dish) must NEVER yield an
 * absurd estimate like a 4000 kcal risotto. Defence in depth, all deterministic:
 *
 *  1. Per-ingredient grams are capped — no single component of a restaurant plate
 *     realistically exceeds this served weight.
 *  2. Total dish grams are capped — if the guesses sum to an implausible mass, the
 *     WHOLE vector is scaled down (ratios preserved → macros stay coherent).
 *  3. The dish ENERGY is capped the same way — if the point kcal still exceeds a
 *     sane single-plate maximum, the whole vector is scaled to fit.
 *  4. Every emitted range is finally clamped to an absolute per-nutrient ceiling —
 *     the last backstop, so output can never exceed sane bounds whatever the input.
 */
const MAX_INGREDIENT_GRAMS = 450;
const MAX_DISH_GRAMS = 1300;
const MAX_DISH_KCAL = 1500;
/** Absolute ceilings for the emitted range (min/max are clamped into [0, ceiling]). */
const DISH_CEILING: Record<NutrientKey, number> = {
  kcal: 1900,
  protein: 160,
  fat: 160,
  satFat: 90,
  carbs: 260,
  sugar: 220,
  salt: 22,
};

/** Clamp to [lo, hi]; non-finite collapses to lo (never NaN/Infinity downstream). */
function clamp(value: number, lo: number, hi: number): number {
  if (!Number.isFinite(value)) return lo;
  return Math.min(hi, Math.max(lo, value));
}

/** Accumulator for the deterministic point estimate (before the band is applied). */
interface Totals {
  kcal: number;
  protein: number;
  fat: number;
  satFat: number;
  carbs: number;
  sugar: number;
  salt: number;
}

/** Track which optional nutrients any matched record actually contributed. */
type Seen = Record<(typeof OPTIONAL_KEYS)[number], boolean>;

function emptyTotals(): Totals {
  return { kcal: 0, protein: 0, fat: 0, satFat: 0, carbs: 0, sugar: 0, salt: 0 };
}

/** Round to a sensible precision so output is stable and not noisy. */
function round(value: number, decimals: number): number {
  const f = 10 ** decimals;
  // Math.round on a tiny float can produce -0; normalize it away.
  return (Math.round(value * f) + 0) / f;
}

/** kcal rounds to whole; grams to one decimal. */
function roundNutrient(key: NutrientKey, value: number): number {
  return key === 'kcal' ? round(value, 0) : round(value, 1);
}

/**
 * Build a Range around a non-negative point value using a relative uncertainty.
 *
 * The light-relevant band [min,max] stays SYMMETRIC about the point (min = point·(1−u),
 * max = point·(1+u)) — byte-identical to the prior behaviour, so the midpoint the lights
 * and verdict key off is unchanged. When `extraUpWiden > 0` (an uncertain estimate) we
 * additionally compute a DISPLAY-ONLY `displayMax = point·(1+u+extraUpWiden)` that the UI
 * bar/disclaimer may show to say "could be considerably more". The point is never
 * altered, the min never moves, and `displayMax` never feeds the lights/verdict, so no
 * number is fabricated and the locked model is untouched.
 */
function toRange(key: NutrientKey, point: number, uncertainty: number, extraUpWiden = 0): Range {
  const ceiling = DISH_CEILING[key];
  // Guard 4 (final backstop): clamp both ends into [0, ceiling]. Even if every
  // upstream guard were bypassed, an emitted value can never exceed sane bounds.
  const lo = clamp(point * (1 - uncertainty), 0, ceiling);
  const hi = clamp(point * (1 + uncertainty), 0, ceiling);
  const max = roundNutrient(key, Math.max(lo, hi));
  const range: Range = {
    min: roundNutrient(key, lo),
    max,
    unit: UNIT_FOR[key],
  };
  if (extraUpWiden > 0) {
    const widenedTop = roundNutrient(key, clamp(point * (1 + uncertainty + extraUpWiden), 0, ceiling));
    // Only attach displayMax when it is honestly ABOVE the band's max (e.g. a 0-point
    // nutrient stays [0,0] with no widened top — we never invent a positive figure).
    if (widenedTop > max) range.displayMax = widenedTop;
  }
  return range;
}

/**
 * Map coverage (matched grams / total grams) + average match score to a
 * confidence band. Thresholds are deliberately conservative: anything with
 * meaningful unknowns or weak matches degrades to 'low'.
 */
function confidenceFrom(coverage: number, avgScore: number): Confidence {
  if (coverage >= 0.85 && avgScore >= 0.85) return 'high';
  if (coverage >= 0.6 && avgScore >= 0.6) return 'medium';
  return 'low';
}

/** Options that let the engine model cooking-method-driven added fat (deep-fry). */
export interface EstimateOptions {
  /** Dish-level cooking method (perception). Drives deep-fry absorbed-fat modelling. */
  cookingMethod?: CookingMethod;
}

/** Categories whose served mass counts as the "fried mass" for absorption (directive D2). */
const FRIED_MASS_CATEGORIES = new Set(['fried', 'meat', 'fish', 'seafood', 'grain', 'vegetable']);

/** True when a matched record is a battered/breaded/fried item by name or category. */
function isBatterOrFried(record: FoodRecord): boolean {
  if (record.category === 'fried') return true;
  return /\b(batter|breaded|breading|panko|tempura|crumbed)\b/.test(record.name.toLowerCase());
}

/** A result that also exposes how many ingredients went unmatched (never hidden). */
export interface EstimateResult extends NutritionEstimate {
  /**
   * Count of ingredients that could not be resolved to any record. Their grams
   * are still reflected in the (widened) range and (lowered) confidence — this
   * count makes the omission explicit for callers/QA rather than silent.
   */
  unmatchedCount: number;
  /**
   * True when this estimate is structurally untrustworthy and should NOT be presented
   * as a confident figure (see the triggers in {@link estimateNutrition}): low
   * confidence, a mostly-unaccounted plate, or a fried dish whose absorbed oil could
   * not be modelled. When true the band's UPPER edge is widened upward to say "could
   * be considerably more" — the point sum is never inflated. Callers forward this to
   * the verdict so a near-zero estimate never reads as a confident GOOD.
   */
  uncertain: boolean;
  /**
   * Deterministic plain-language reason this estimate is uncertain, set only when
   * {@link uncertain} is true. Absent otherwise. Never fabricates a number.
   */
  uncertaintyReason?: string;
}

/**
 * Estimate a dish's nutrition from guessed ingredients.
 *
 * @param ingredients Perception-layer guesses (name + grams as served). Negative
 *   or non-finite grams are treated as 0 (defensive; perception should not emit
 *   them, but the trust core must not produce garbage if it does).
 * @param table       Any NutritionTable (seed fixture in tests; real CIQUAL+USDA
 *   in production — same interface, only the data changes).
 * @returns A NutritionEstimate (range per nutrient + confidence + sources),
 *   plus `unmatchedCount`. Always returns a well-formed object, even for empty
 *   input (all-zero ranges, 'low' confidence, no sources).
 */
export function estimateNutrition(
  ingredients: IngredientGuess[],
  table: NutritionTable,
  options: EstimateOptions = {},
): EstimateResult {
  const totals = emptyTotals();
  const seen: Seen = { satFat: false, carbs: false, sugar: false };

  // Unique sources by recordId, preserving first-seen order for determinism.
  const sourcesById = new Map<string, NutritionSource>();

  let totalGrams = 0;
  let matchedGrams = 0;
  // Score weighted by matched grams, so a tiny mismatched garnish doesn't sink
  // the confidence of a well-matched main component.
  let weightedScore = 0;
  let unmatchedCount = 0;
  // True once ANY plausibility guard scaled a value down (the per-category grams
  // clamp fires in-loop and is NOT captured by sanityScale<1, so we track it here).
  let guardFired = false;
  // Grams whose value the model INFERRED (basis !== 'read'); feeds the band width
  // and the confidence cap (directive I).
  let inferredGrams = 0;
  // True once any matched record is API-sourced (db:'API') — caps confidence (directive).
  let sawApiRecord = false;

  const dishMethod: CookingMethod = options.cookingMethod ?? 'unknown';
  const isFryingDish = dishMethod === 'fried' || dishMethod === 'deep-fried';
  // Running sum of post-clamp "fried mass" (protein + batter) for absorption modelling.
  let friedMass = 0;
  // True once a fried/battered component is present, so absorption fires (directive D2).
  let sawFriedComponent = false;

  for (const ingredient of ingredients) {
    const matchKey = matchName(ingredient);
    const match = matchKey ? table.lookup(matchKey) : null;

    // Per-category clamp REPLACES the blunt global cap for KNOWN categories. The
    // record's category is only known after the lookup, so the clamp lives here.
    // For UNMATCHED ingredients and 'other'/unknown categories we retain the global
    // 450 g cap so a mystery line can never dominate (directive F).
    const rawGrams = ingredient.grams;
    const isAddedFat = ingredient.isAddedFat ?? false;

    let prior = MAX_INGREDIENT_GRAMS;
    if (match) {
      const p = priorFor(match.record, isAddedFat);
      // 'other' category resolves to PRIOR_GRAMS.other (max 300) which is tighter
      // than 450; keep whichever the prior dictates. Pure 'other'/unknown handled
      // by the fallback below when priorFor returns the 'other' row.
      prior = p.max;
    }

    if (Number.isFinite(rawGrams) && rawGrams > prior) {
      guardFired = true;
    }
    // MISSING grams (the field is absent entirely): the model named a real component
    // but failed to size it, so substitute the typical prior rather than drop it
    // (directive F). A PRESENT-but-degenerate value (NaN / Infinity / 0 / negative) is
    // left to clamp to zero mass — that is the long-standing defensive contract
    // (garbage in -> no contribution, never fabricated mass). Only matched components
    // get a typical fallback (an unknown line has no category to anchor a portion).
    let resolvedRaw = rawGrams;
    if (rawGrams === undefined && match) {
      resolvedRaw = priorFor(match.record, isAddedFat).typical;
      guardFired = true; // a substituted gram is itself an uncertainty signal.
    }
    const grams = clamp(resolvedRaw, 0, prior);
    totalGrams += grams;
    // Only an EXPLICIT basis='inferred' widens the band / caps confidence. A missing
    // basis (legacy `{name,grams}` fixtures, pre-migration cached perceptions) is
    // neutral — back-compat must not silently degrade those to 'low' (directive G/I).
    if (ingredient.basis === 'inferred') inferredGrams += grams;

    if (!match) {
      // Unknown ingredient: counted, its grams remain in totalGrams (lowering
      // coverage). We do NOT fabricate any nutrient value for it.
      unmatchedCount += 1;
      continue;
    }

    const { record, score } = match;
    matchedGrams += grams;
    weightedScore += score * grams;
    if (record.db === 'API') sawApiRecord = true;

    // Record provenance once per unique record.
    if (!sourcesById.has(record.id)) {
      sourcesById.set(record.id, { db: record.db, recordId: record.id, name: record.name });
    }

    if (grams === 0) continue; // matched but zero mass contributes nothing.

    // DEEP-FRY: when the dish is fried/deep-fried AND a fried/battered component is
    // present, we model absorbed fat from the fried-food mass instead of trusting an
    // oil line. A pure added-fat (oil) line in a frying dish is DROPPED so we never
    // stack absorbed + oil fat (directive D2).
    const friedHere = isBatterOrFried(record);
    if (friedHere) sawFriedComponent = true;
    if (isFryingDish && isPureAddedFat(record, isAddedFat)) {
      // Skip this oil line entirely; absorption (below the loop) carries fried fat.
      continue;
    }
    if (isFryingDish && FRIED_MASS_CATEGORIES.has(record.category ?? '')) {
      friedMass += grams;
    }

    // Cooking adjustment: identity for already-cooked records (no double-apply)
    // and for categories we don't model. The yieldFactor turns the served grams
    // into the equivalent raw grams the per-100g values are expressed against,
    // so cooked mass / yieldFactor = raw-equivalent mass.
    const cooking = getCookingYield(record.category, record.state);
    const rawEquivalentGrams = grams / cooking.yieldFactor;
    const portions = rawEquivalentGrams / 100; // per-100g basis

    const per100g: Per100g = record.per100g;
    for (const key of MACRO_KEYS) {
      const raw = per100g[key];
      if (raw === undefined) continue;
      const contribution = raw * portions * retentionFor(cooking, key);
      totals[key] += contribution;
      if (key === 'satFat' || key === 'carbs' || key === 'sugar') {
        seen[key] = true;
      }
    }
  }

  // DEEP-FRY ABSORBED FAT (directive D2 / priors.ts FRY_ABSORPTION_PCT). When the dish
  // is fried and a fried/battered component was seen, add absorbed fat = typical% of the
  // fried mass to fat/satFat/kcal. The band upper edge widens via FRY guard below.
  let fryAbsorbedFat = 0;
  // The single REAL condition for "this fried dish's oil uptake was modelled": the dish
  // is fried, a qualifying fried/battered component was seen, AND it carried mass. When
  // this is FALSE for a frying dish, no absorbed-fat branch ran, so the fat is
  // structurally too low — the honest signal is `uncertain`, never a fabricated number.
  const absorbedFatFired = isFryingDish && sawFriedComponent && friedMass > 0;
  if (absorbedFatFired) {
    fryAbsorbedFat = FRY_ABSORPTION_PCT.typical * friedMass;
    totals.fat += fryAbsorbedFat;
    totals.satFat += fryAbsorbedFat * FRY_SATFAT_FRACTION;
    seen.satFat = true;
    totals.kcal += fryAbsorbedFat * KCAL_PER_G_FAT;
    guardFired = true; // absorbed fat is a modelled estimate -> wider band, capped confidence.
  }

  // Guards 2 & 3: scale the WHOLE totals vector down if the dish mass or its energy
  // is physically implausible — preserving macro ratios so kcal and macros stay
  // mutually consistent (and the per-nutrient lights with them). Scaling is
  // coverage-invariant (ratios unchanged), so confidence below is unaffected.
  const massScale = totalGrams > MAX_DISH_GRAMS ? MAX_DISH_GRAMS / totalGrams : 1;
  const energyScale =
    totals.kcal * massScale > MAX_DISH_KCAL && totals.kcal > 0
      ? MAX_DISH_KCAL / (totals.kcal * massScale)
      : 1;
  const sanityScale = massScale * energyScale;
  if (sanityScale < 1) {
    guardFired = true; // dish-mass and/or dish-energy guard scaled the whole vector.
    for (const key of MACRO_KEYS) totals[key] *= sanityScale;
  }

  const coverage = totalGrams > 0 ? matchedGrams / totalGrams : 0;
  const avgScore = matchedGrams > 0 ? weightedScore / matchedGrams : 0;
  const inferredFraction = totalGrams > 0 ? inferredGrams / totalGrams : 0;

  // Uncertainty grows with the score gap (1 - avgScore) and the unmatched-grams
  // fraction (1 - coverage), on top of the irreducible baseline band, PLUS bumps when
  // a plausibility guard fired, when grams were inferred (model guess), or when an
  // API-sourced (lower-trust) record contributed. Capped so it stays a usable range.
  const uncertainty = Math.min(
    MAX_UNCERTAINTY,
    BASE_UNCERTAINTY +
      SCORE_UNCERTAINTY_WEIGHT * (1 - avgScore) +
      UNMATCHED_UNCERTAINTY_WEIGHT * (1 - coverage) +
      INFERRED_UNCERTAINTY_WEIGHT * inferredFraction +
      (guardFired ? GUARD_UNCERTAINTY_BUMP : 0) +
      (sawApiRecord ? API_UNCERTAINTY_BUMP : 0),
  );

  // Confidence from coverage + match quality, then CAPPED progressively:
  //  - a fired guard or an API-sourced record -> never 'high' (cap at 'medium');
  //  - inferred grams dominating (> 60% of total) -> cap at 'low' (mostly a guess).
  let confidence: Confidence = matchedGrams > 0 ? confidenceFrom(coverage, avgScore) : 'low';
  if ((guardFired || sawApiRecord) && confidence === 'high') confidence = 'medium';
  if (inferredFraction > INFERRED_DOMINATES_FRACTION) confidence = 'low';

  // ── HONEST-UNCERTAINTY DETECTION (never invent a number) ──────────────────────
  // An estimate is `uncertain` when the matched macros structurally fail to describe
  // the dish, so a near-zero/low total must NOT be presented as a confident figure.
  // Three triggers, all off variables already in scope and reusing existing floors —
  // ZERO new thresholds:
  //  (1) confidence === 'low' — already means "mostly a guess" (coverage/score/inferred).
  //  (2) mostlyUnaccounted — at least one named component resolved to nothing AND under
  //      60% of plate mass matched (the EXISTING medium-coverage floor, line ~202), so
  //      the macros describe only a minority of the plate.
  //  (3) friedButNoFriedMass — the dish was TOLD it is fried but no qualifying fried mass
  //      was found, so the absorbed-fat branch never ran and fat is structurally too low
  //      (the deep-fried-croquettes case). Defined off the REAL condition (`absorbedFatFired`)
  //      so it is honest, not a proxy.
  const mostlyUnaccounted = unmatchedCount > 0 && coverage < 0.6;
  const friedButNoFriedMass = isFryingDish && !absorbedFatFired;
  const uncertain = confidence === 'low' || mostlyUnaccounted || friedButNoFriedMass;

  // Deterministic per-branch reason (priority: fried -> unaccounted -> low-confidence).
  let uncertaintyReason: string | undefined;
  if (uncertain) {
    if (friedButNoFriedMass) {
      uncertaintyReason =
        'We could not confirm how much oil this fried dish soaked up, so the numbers may read low.';
    } else if (mostlyUnaccounted) {
      uncertaintyReason = 'We could not account for most of this plate, so this estimate is rough.';
    } else {
      uncertaintyReason = 'We could not read this dish clearly enough to be sure.';
    }
  }

  // Display-only upward widen: 0 for a trustworthy estimate (band is exactly [min,max],
  // byte-identical to before); UNCERTAIN_UP_WIDEN when uncertain, surfaced via Range.displayMax
  // (NOT min/max), so the lights/verdict midpoint and the point sum are untouched.
  const extraUpWiden = uncertain ? UNCERTAIN_UP_WIDEN : 0;

  const estimate: EstimateResult = {
    kcal: toRange('kcal', totals.kcal, uncertainty, extraUpWiden),
    protein: toRange('protein', totals.protein, uncertainty, extraUpWiden),
    fat: toRange('fat', totals.fat, uncertainty, extraUpWiden),
    salt: toRange('salt', totals.salt, uncertainty, extraUpWiden),
    confidence,
    sources: [...sourcesById.values()],
    unmatchedCount,
    uncertain,
  };
  if (uncertaintyReason !== undefined) estimate.uncertaintyReason = uncertaintyReason;

  // Emit optional nutrients only when at least one matched record carried them,
  // so we never report a fabricated "0 carbs" for foods whose records omit carbs.
  if (seen.satFat) estimate.satFat = toRange('satFat', totals.satFat, uncertainty, extraUpWiden);
  if (seen.carbs) estimate.carbs = toRange('carbs', totals.carbs, uncertainty, extraUpWiden);
  if (seen.sugar) estimate.sugar = toRange('sugar', totals.sugar, uncertainty, extraUpWiden);

  return estimate;
}
