/**
 * PORTION PRIORS — the truthful fix for "fat reads RED on every savoury dish".
 *
 * The perception model guesses ingredient grams; a small gram error on a high
 * energy-density component (oil, butter, cheese) swings fat dramatically. This module
 * holds per-category served-gram bounds, each traced to a PUBLIC source, that the
 * engine applies AFTER the table lookup (so the record's real category is known). It
 * replaces the blunt single global cap (MAX_INGREDIENT_GRAMS = 450) with a per-category
 * clamp that bounds fat-bearing components hardest, while the 450 cap stays as the
 * last-resort fallback for unknown/'other' categories (see estimate.ts).
 *
 * Pure data + pure helpers. No I/O, no clock, no randomness — same input, same output.
 *
 * ── DIRECTIVE B / C (cited mechanisms only; NO uncitable 0.5 retention) ──────────
 *  - Added oil/butter is bounded by a TIGHT prior (oil typical 8 g / max 20 g; butter
 *    7 g / 20 g), NOT halved by an uncitable retention factor. yield.ts keeps oil/fat
 *    retention at IDENTITY (1.0). The tight prior + the perception "no oil line for
 *    grilled/steamed/boiled/raw" rule carry the fat fix truthfully.
 *  - Named condiments (vinaigrette/mayo/aioli/pesto/sauce) are SAUCE records: they are
 *    clamped to their realistic SERVED-gram priors (dressing 30/60, mayo 15/40, sauce
 *    30/90) but their fat passes through at 1:1 — never the tight oil prior. The
 *    distinction is made by record id/name in {@link addedFatSubtype}.
 */
import type { FoodRecord } from '../types';

/** Lower (typical) and upper (max plausible) served-gram bounds for a class. */
export interface PortionPrior {
  /** Typical single restaurant-portion served grams; used as the missing-grams fallback. */
  typical: number;
  /** Max plausible served grams; the clamp ceiling. A guess above this fires the guard. */
  max: number;
}

/**
 * Per-category served-gram priors keyed on FoodRecord.category.
 *
 * CITATIONS (re-verify before a production data run):
 *  - Fats/oils RACC 1 tbsp; 1 US tbsp oil = 13.5-14 g — 21 CFR 101.12 Table 2 (Fats and
 *    Oils); USDA FDC olive oil (FDC 171413). Butter: 1 tsp = 5 g, 1 tbsp ~= 14 g — BDA
 *    Food Fact Sheet "Portion Sizes" + 21 CFR 101.12 Table 2.
 *  - Salad dressing RACC 30 g (2 tbsp); mayonnaise RACC 15 g (1 tbsp); sauces/gravies/
 *    dips topping RACC ~30 g (2 tbsp) — 21 CFR 101.12 Table 2.
 *  - Hard cheese eating portion 30 g / as-ingredient ~55 g; pizza mozzarella ~21 g per
 *    slice — BDA Food Fact Sheet + BNF + 21 CFR 101.12.
 *  - Meat: cooked "deck of cards" ~90 g; chicken breast ~120 g; restaurant steak runs
 *    far over a standard serving (~300 g) — BDA + BNF + Young & Nestle (PMC1447051).
 *  - Fish 140 g (palm) — BDA Food Fact Sheet. Egg ~2 eggs typical, 3-4 max.
 *  - Pasta ~150 g home / ~140 g per cup, restaurant servings far larger (~480 g);
 *    rice ~150 g home, 158-200 g/cup — BDA + USDA FNDDS + Young & Nestle.
 *  - Vegetables 80 g/portion x veg-forward plate — BDA + NHS 5-a-day.
 *  - Bread RACC 50 g — 21 CFR 101.12 Table 2.
 * Everything not pinned to a CFR/USDA figure is a BDA-analog approximation, declared as
 * such; the estimate is published as a RANGE precisely because these are estimates.
 */
export const PRIOR_GRAMS: Record<string, PortionPrior> = {
  // FAT-BEARING — clamp tight (a small gram error swings fat the most).
  oil: { typical: 8, max: 20 }, // 1 US tbsp oil ~= 13.5-14 g; 21 CFR 101.12 Table 2.
  fat: { typical: 7, max: 20 }, // butter 1 tsp = 5 g / 1 tbsp ~= 14 g; BDA + 21 CFR 101.12.
  // PROTEINS
  meat: { typical: 120, max: 300 },
  fish: { typical: 140, max: 300 },
  seafood: { typical: 120, max: 280 },
  egg: { typical: 100, max: 200 },
  // STAPLES
  grain: { typical: 200, max: 480 }, // covers pasta (~480 max) and rice; the larger bound is safe.
  legume: { typical: 150, max: 350 },
  tuber: { typical: 180, max: 400 },
  vegetable: { typical: 120, max: 350 },
  fruit: { typical: 120, max: 350 },
  fried: { typical: 150, max: 400 },
  dairy: { typical: 60, max: 150 }, // cheese/cream as a plate component (eating portion).
  sugar: { typical: 80, max: 250 },
  sweet: { typical: 100, max: 300 },
  other: { typical: 100, max: 300 },
};

/**
 * Fat-bearing SUBTYPE priors. Pure added fats (oil/butter) and named condiments need
 * DIFFERENT served-gram bounds even though several condiments are stored as category
 * 'fat'/'oil'. Directive C: a vinaigrette is a 30 g dressing, not a 20 g splash of oil.
 *
 * CITATIONS: see PRIOR_GRAMS (21 CFR 101.12 Table 2 for dressing/mayo/sauce RACCs;
 * BDA + BNF for cheese eating/ingredient portions).
 */
export const FAT_SUBTYPE_PRIORS = {
  oil: { typical: 8, max: 20 }, // pure cooking/finishing oil
  butter: { typical: 7, max: 20 }, // pure butter
  dressing: { typical: 30, max: 60 }, // vinaigrette / salad dressing (2 tbsp RACC)
  mayo: { typical: 15, max: 40 }, // mayonnaise / aioli (1 tbsp RACC)
  sauce: { typical: 30, max: 90 }, // pesto / gravy / cream sauce topping (2 tbsp RACC, cream to ~90 g)
  cheese_topping: { typical: 40, max: 120 }, // grated/melted cheese as an ingredient
} as const;

export type FatSubtype = keyof typeof FAT_SUBTYPE_PRIORS;

/**
 * Curated record ids that are CONDIMENTS (not pure added fat), so they get their own
 * served-gram prior and pass their fat through at 1:1. Keyed by id for stability; the
 * name fallback below covers generated rows that happen to be category 'fat'/'oil'.
 */
const CONDIMENT_SUBTYPE_BY_ID: Record<string, FatSubtype> = {
  'curated-vinaigrette': 'dressing',
  'curated-mayonnaise': 'mayo',
  'curated-aioli': 'mayo',
  'curated-pesto': 'sauce',
  'curated-tahini': 'sauce',
};

/**
 * Classify a matched fat-bearing record into a fat subtype, or null if it is not a
 * fat-bearing record at all. Pure oil -> 'oil'; butter -> 'butter'; named condiments
 * (by id, then by name keyword) -> dressing/mayo/sauce/cheese_topping.
 *
 * @param record    the matched FoodRecord.
 * @param isAddedFat the perception flag; it only ADDS clamping (forces an oil subtype
 *   for an oil-category line), never removes it (directive D).
 */
export function addedFatSubtype(record: FoodRecord, isAddedFat: boolean): FatSubtype | null {
  const byId = CONDIMENT_SUBTYPE_BY_ID[record.id];
  if (byId) return byId;

  const name = record.name.toLowerCase();
  const cat = record.category;

  // Named condiments by keyword (covers generated rows tagged fat/oil).
  if (/\b(vinaigrette|dressing|vinagreta)\b/.test(name)) return 'dressing';
  if (/\b(mayonnaise|mayo|mayonesa|aioli|alioli)\b/.test(name)) return 'mayo';
  if (/\b(pesto|gravy|cream sauce|bechamel)\b/.test(name)) return 'sauce';

  // Pure butter.
  if (/\b(butter|mantequilla|beurre|ghee)\b/.test(name)) return 'butter';
  if (cat === 'fat') {
    // A 'fat'-category row that is not a named condiment and not butter: treat as a
    // generic added fat with the butter-tight prior (defence-in-depth).
    return 'butter';
  }

  // Pure oil.
  if (cat === 'oil') return 'oil';

  // An explicitly added-fat flag on a non-fat-category line: treat as oil (tightest).
  if (isAddedFat) return 'oil';

  return null;
}

/**
 * Resolve the served-gram prior for a matched record + perception flag.
 *
 * Fat-bearing records use their fat subtype prior (oil/butter/dressing/...); everything
 * else uses the per-category PRIOR_GRAMS, falling back to 'other' when the category is
 * unknown (the caller keeps the global 450 cap for truly unknown/'other').
 */
export function priorFor(record: FoodRecord, isAddedFat: boolean): PortionPrior {
  const subtype = addedFatSubtype(record, isAddedFat);
  if (subtype) return FAT_SUBTYPE_PRIORS[subtype];
  const cat = record.category;
  return (cat && PRIOR_GRAMS[cat]) || PRIOR_GRAMS.other!;
}

/**
 * True when a matched record is a PURE added fat (oil or butter) whose grams must be
 * clamped to the tight oil/fat prior REGARDLESS of the isAddedFat flag (directive D1).
 * Condiments are excluded — they pass their fat at 1:1 and use their own prior.
 */
export function isPureAddedFat(record: FoodRecord, isAddedFat: boolean): boolean {
  const subtype = addedFatSubtype(record, isAddedFat);
  return subtype === 'oil' || subtype === 'butter';
}

/**
 * DEEP-FRY OIL ABSORPTION. Frying adds fat to the finished food in proportion to its
 * mass, so we model absorbed fat from the fried-food mass rather than trusting a
 * separate oil line. Typical uptake for food-service frying is ~8-25% of food weight
 * (fries 10-15%, doughnuts ~28%).
 *
 * CITATION: Oklahoma State University Extension "Deep Fat Frying Basics" + Frontiers in
 * Sustainable Food Systems 2022 (10.3389/fsufs.2022.997097).
 */
export const FRY_ABSORPTION_PCT = { typical: 0.15, max: 0.25 } as const;

/** kcal per gram of fat (Atwater) — used to convert absorbed-fat grams to energy. */
export const KCAL_PER_G_FAT = 9;

/**
 * Fraction of absorbed frying fat that is saturated. Frying oils are predominantly
 * unsaturated, so only a small share is saturated. 0.12 is a conservative midpoint of
 * the two common frying oils, used only to widen the satFat input for fried dishes;
 * the estimate is a RANGE regardless.
 *
 * CITATION: USDA FoodData Central — sunflower oil (FDC 172336) ~10.1 g satFat/100g;
 * olive oil (FDC 171413) ~14.4 g satFat/100g. 0.12 sits between the two.
 */
export const FRY_SATFAT_FRACTION = 0.12;
