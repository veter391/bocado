/**
 * Suitability scoring — the "good / caution / avoid" dot, computed deterministically.
 *
 * This is the second half of the TRUST CORE. It NEVER invents nutrition: it consumes
 * the {@link NutritionEstimate} range the compute layer produced and reasons over its
 * MIDPOINTS, the meal context (time-of-day class), and — when present — the user's
 * diet / allergy / goal profile. Pure and deterministic: same inputs -> same dot.
 *
 * ── THE VERDICT IS A PURE FUNCTION OF THE VISIBLE LIGHTS, THEN ESCALATE-ONLY ──
 * The overall verdict can NEVER contradict the per-nutrient traffic lights the user
 * sees. We compute the lights with the EXACT same `rateNutrients` the UI renders,
 * derive a light-only "base" level from how many run RED, and then apply
 * modifiers (time, goal, allergy, diet) that can only ESCALATE (raise) the level,
 * never relax it. So the ring is always >= what the lights imply (proven by the
 * property tests in rules.test.ts).
 *
 * RED-COUNT for the avoid escalation (corrected per critic):
 *   - Counts only the four FSA per-portion nutrients: fat, saturated fat, sugar,
 *     salt. ENERGY is NOT counted — it co-moves with fat/carb/sugar, so counting an
 *     energy-red as a second red would double-penalise one underlying fact. (Energy
 *     still ADDS caution via the time/goal modifiers and renders as a guidance light.)
 *   - FAT and SATFAT are DE-DUPLICATED: saturated fat is a subset of total fat, so
 *     both going red on the same fat mass is ONE concern. We count
 *     max(fat-red, satFat-red) as a single "fat" red. Both lights still render.
 *   => redCount in {0,1,2,3}: a "fat" red (fat OR satFat), a sugar red, a salt red.
 *
 * Base mapping (light-derived only, so it can never contradict the bullets):
 *   redCount >= 2 -> avoid    ("Several nutrients run high here.")
 *   redCount == 1 -> caution  ("One nutrient runs high here — worth a thought.")
 *   redCount == 0 -> good     (a stricter amber-only caution is applied by the
 *                              modifiers below when context/goal makes it relevant)
 *
 * WHY >=2 (not the previously-shipped >=3): each red is already the FSA >30%-RI
 * line, so two reds = the dish alone spends >60% of a day's budget on two harmful
 * nutrients. Calling that merely "caution" under-warns. With the fat/satFat de-dup
 * AND energy excluded, ordinary EU cheese/oil mains no longer trip two reds on the
 * same fat fact, so this is honest without over-flagging (verified by the
 * regression snapshots in rules.test.ts, suite G).
 *
 * SUGAR-RED LIMITATION (documented): the sugar light is TOTAL sugars and the engine
 * cannot tell free sugars from intrinsic fruit/milk sugars from a menu name. So a
 * fruit- or dairy-dominated dish could in theory reach 2 reds via sugar. In practice
 * a plain fruit bowl is sugar-red only (1 red -> caution, never avoid). This is a
 * known limitation, surfaced here rather than hidden; the regression snapshots
 * include a fruit/dairy dessert so the behaviour is reviewed intentionally.
 *
 * Honesty rules it upholds (PRODUCT.md / SECURITY.md):
 *  - It states why, in plain grandma-readable language (`reasons[]`), so the dot is
 *    explainable, never a black box.
 *  - For allergies it forces AT LEAST 'caution' and defers to staff — it never claims
 *    a dish is "safe", and never asserts danger as fact (an allergy hit is "may
 *    contain X — confirm with staff", framed as caution, not a guarantee).
 *  - For a hard diet conflict (e.g. vegan + beef) it says 'avoid' with a plain reason
 *    ("Not vegan"). That is a factual category statement about the dish, not a health
 *    claim about the eater — so an all-green-lights dish reading "avoid: Not vegan"
 *    is truthful, not a contradiction of the lights.
 *  - It uses NO health-benefit / disease language (no "healthy", "good for you") —
 *    only neutral, descriptive copy, per Reg 1924/2006 + Reg 1169/2011.
 *
 * ── PROFILE PLANE (NOT WIRED ON THE SERVER) ─────────────────────────────────
 * The diet/allergy/goal/keto/halal rules below run only when a `profile` is passed.
 * The /scan Worker route runs profile-FREE for anonymity (SECURITY.md §1), so these
 * rules are DORMANT there and the server returns time-only scoring. They are intended
 * to be re-invoked ON-DEVICE by the mobile app against the returned
 * nutrition + ingredients + allergenFlags. Until that on-device caller ships, the
 * personalization value prop is not user-visible (see rules.test.ts "profile plane").
 *
 * Determinism: no Date.now / Math.random inside; `context` is supplied by the caller
 * (resolved from the local clock OUTSIDE this pure core). Same inputs -> identical
 * Suitability.
 */
import type {
  IngredientGuess,
  MealContext,
  NutritionEstimate,
  Range,
  Suitability,
  SuitabilityLevel,
  UserProfile,
} from '@bocado/shared';
import { matchName } from '@bocado/shared';
import { detectAllergens } from '../allergens/detect';
import { rateNutrients } from '../rate/nutrients';
import { normalizeName } from '../table/memoryTable';
import {
  ALCOHOL_WORDS,
  ANIMAL_PRODUCT_WORDS,
  DAIRY_WORDS,
  FISH_AND_SEAFOOD_WORDS,
  GLUTEN_WORDS,
  MEAT_WORDS,
  PORK_AND_HARAM_WORDS,
  SHELLFISH_WORDS,
  anyWord,
} from '../diet/words';

/** Inputs to {@link assessSuitability}. */
export interface SuitabilityInput {
  nutrition: NutritionEstimate;
  context: MealContext;
  profile?: UserProfile;
  ingredients: IngredientGuess[];
  /**
   * Forwarded from {@link EstimateResult.uncertain} — true when the underlying estimate
   * is structurally untrustworthy. Optional (default false): existing callers/tests that
   * omit it behave exactly as before. A low-confidence estimate is ALSO treated as
   * uncertain even when this flag is absent (see assessSuitability), so this only adds
   * the cases the nutrition layer detected structurally (e.g. unmodeled-oil fried dish).
   */
  uncertain?: boolean;
}

/**
 * BOCADO-GUIDANCE thresholds for a SINGLE DISH (not a whole day). Only the
 * light-level cutoffs in rate/nutrients.ts trace to FSA/EU; the few raw numbers here
 * are Bocado-derived nudge points, declared as such.
 */
const THRESHOLDS = {
  /**
   * kcal midpoint above which a dish is heavy enough to caution at ANY hour.
   * BOCADO GUIDANCE (~>55% of the 2000 kcal RI). NOTE: the compute layer caps a
   * single plate at MAX_DISH_KCAL = 1500, so realistic midpoints rarely exceed
   * 1100 — this "any-hour" net therefore fires only for genuinely huge plates. The
   * primary heavy signal is the energy LIGHT (red >800), used by the time/goal
   * modifiers below; this is the documented backstop, not the main path.
   */
  veryHighEnergyKcal: 1100,
  /**
   * carbs midpoint above which a keto / low-carb plan is nudged to caution. BOCADO
   * GUIDANCE (~40 g) — NOT a cited standard and NOT a % of any RI. Bocado does not
   * compute NET carbs (no fibre subtraction), so this is total carbohydrate. Silent
   * when carbs are absent from the estimate (an optional nutrient) — we under-claim
   * rather than invent.
   */
  ketoCarbGrams: 40,
} as const;

/** Midpoint of a nutrient range — the single figure the rules reason over. */
function mid(range: Range): number {
  return (range.min + range.max) / 2;
}

/** Severity ordering so the "worst applicable level wins". */
const LEVEL_RANK: Record<SuitabilityLevel, number> = {
  good: 0,
  caution: 1,
  avoid: 2,
};

/** Raise `current` to `next` if `next` is more severe; otherwise keep `current`. */
function escalate(current: SuitabilityLevel, next: SuitabilityLevel): SuitabilityLevel {
  return LEVEL_RANK[next] > LEVEL_RANK[current] ? next : current;
}

// --- Diet-conflict inference -------------------------------------------------

interface DietConflict {
  /** The level this conflict forces (always 'avoid' for a hard category violation). */
  level: SuitabilityLevel;
  /** Short label, e.g. "Not vegan". */
  label: string;
  /** Plain reason for the user. */
  reason: string;
}

/**
 * Decide whether the dish hard-conflicts with the user's diet.
 *
 * Hard conflicts (the dish categorically isn't allowed) -> 'avoid':
 *  - vegan:        any meat, fish/seafood, OR animal product (dairy/egg/honey).
 *  - vegetarian:   any meat OR fish/seafood.
 *  - pescatarian:  any meat (fish IS allowed).
 *  - gluten-free:  any gluten-bearing ingredient (incl. seitan = pure wheat gluten).
 *  - dairy-free:   any dairy ingredient (incl. paneer/halloumi/labneh/kefir).
 *
 * halal/kosher/keto/low-carb are intentionally NOT hard-failed here: halal/kosher
 * need provenance (how the animal was slaughtered / kashrut) we can't infer from a
 * name, and keto/low-carb are best handled as goal-style nudges rather than category
 * bans — we would rather under-claim than wrongly tell someone "you can't eat this".
 * Those are handled as escalate-only neutral notes / carb nudges below.
 */
function dietConflict(diet: UserProfile['diet'], tokenized: readonly string[][]): DietConflict | null {
  const hasMeat = tokenized.some((w) => anyWord(w, MEAT_WORDS));
  const hasFish = tokenized.some((w) => anyWord(w, FISH_AND_SEAFOOD_WORDS));
  const hasAnimalProduct = tokenized.some((w) => anyWord(w, ANIMAL_PRODUCT_WORDS));
  const hasGluten = tokenized.some((w) => anyWord(w, GLUTEN_WORDS));
  const hasDairy = tokenized.some((w) => anyWord(w, DAIRY_WORDS));

  switch (diet) {
    case 'vegan':
      if (hasMeat || hasFish || hasAnimalProduct) {
        return { level: 'avoid', label: 'Not vegan', reason: 'Contains an animal product, so it is not vegan.' };
      }
      return null;
    case 'vegetarian':
      if (hasMeat || hasFish) {
        return { level: 'avoid', label: 'Not vegetarian', reason: 'Contains meat or fish, so it is not vegetarian.' };
      }
      return null;
    case 'pescatarian':
      if (hasMeat) {
        return { level: 'avoid', label: 'Not pescatarian', reason: 'Contains meat, so it does not fit a pescatarian diet.' };
      }
      return null;
    case 'gluten-free':
      if (hasGluten) {
        return { level: 'avoid', label: 'Has gluten', reason: 'Contains a gluten ingredient, so it is not gluten-free.' };
      }
      return null;
    case 'dairy-free':
      if (hasDairy) {
        return { level: 'avoid', label: 'Has dairy', reason: 'Contains dairy, so it is not dairy-free.' };
      }
      return null;
    // none / halal / kosher / keto / low-carb: no hard name-based ban (see doc).
    default:
      return null;
  }
}

/**
 * A neutral, escalate-only caveat for halal/kosher — NEVER a name-based avoid.
 *
 * We can't verify slaughter/provenance or kashrut from a menu name, so we never
 * forbid by name. But we must not pass an OBVIOUS conflict silently either, so when
 * the dish carries a relevant trigger we surface a caution-level "confirm with staff"
 * note (truthful caveat, not a fabricated ban):
 *  - halal:  pork/pork-derivatives/gelatin OR alcohol, OR any meat (slaughter method
 *            unverifiable).
 *  - kosher: pork/shellfish/molluscs (never kosher), OR meat + dairy co-occurrence,
 *            OR any meat (kashrut unverifiable).
 *
 * Returns null (no note) when nothing relevant is present — under-claim, never invent.
 */
function dietNeutralNote(
  diet: UserProfile['diet'],
  tokenized: readonly string[][],
): string | null {
  const hasMeat = tokenized.some((w) => anyWord(w, MEAT_WORDS));
  const hasFish = tokenized.some((w) => anyWord(w, FISH_AND_SEAFOOD_WORDS));
  const hasShellfish = tokenized.some((w) => anyWord(w, SHELLFISH_WORDS));
  const hasDairy = tokenized.some((w) => anyWord(w, DAIRY_WORDS));
  const hasPorkOrHaram = tokenized.some((w) => anyWord(w, PORK_AND_HARAM_WORDS));
  const hasAlcohol = tokenized.some((w) => anyWord(w, ALCOHOL_WORDS));

  if (diet === 'halal') {
    if (hasPorkOrHaram || hasAlcohol || hasMeat || hasFish) {
      return 'We cannot verify halal preparation from a menu — please confirm with the staff.';
    }
    return null;
  }
  if (diet === 'kosher') {
    if (hasPorkOrHaram || hasShellfish || (hasMeat && hasDairy) || hasMeat || hasFish) {
      return 'We cannot verify kosher preparation from a menu — please confirm with the staff.';
    }
    return null;
  }
  return null;
}

// --- Public API --------------------------------------------------------------

/**
 * Assess how suitable a dish is right now for this user.
 *
 * Composition order (the verdict is `max severity of` these; reasons accumulate):
 *  0. Base level from the per-nutrient LIGHTS (de-duplicated red count; energy not
 *     counted). >=2 red -> avoid, 1 red -> caution, 0 red -> good.
 *  1. Time-of-day (escalate-only): late-night & dinner caution a heavy/rich dish;
 *     a very large plate cautions at any hour. snack is intentionally lenient.
 *  2. Goals (escalate-only): weight-loss cautions a heavy (energy amber/red) dish;
 *     low-sodium cautions a salty (salt amber/red) dish; high-protein adds a POSITIVE
 *     note (never an upgrade, never launders a red); keto/low-carb caution a high-carb
 *     dish only when carbs are present; balanced is intentionally inert.
 *  3. Allergies (escalate-only): any flagged allergen detected -> at least 'caution'
 *     + a "may contain — confirm with staff" reason (never "safe", never asserted).
 *  4. Diet: a hard category conflict (vegan+meat, gluten-free+gluten, …) -> 'avoid'
 *     with a self-naming label; halal/kosher add a neutral caution-level note only.
 *
 * @returns a {@link Suitability} with level, a short label, and plain reasons.
 */
export function assessSuitability(input: SuitabilityInput): Suitability {
  const { nutrition, context, profile, ingredients } = input;

  const tokenized: string[][] = ingredients.map((ing) =>
    normalizeName(matchName(ing)).split(' ').filter((w) => w.length > 0),
  );

  let level: SuitabilityLevel = 'good';
  const reasons: string[] = [];
  // Candidate labels in priority order; the most decisive non-empty one is chosen.
  let dietLabel: string | null = null;
  let allergyLabel: string | null = null;
  let heavyLabel: string | null = null;

  // --- 0. Light-derived base (CONSISTENT with the per-nutrient lights) -------
  // The verdict must agree with the per-nutrient traffic lights the user sees, at
  // ANY time of day. We reuse `rateNutrients` (the exact function that drives the
  // lights) and count RED rows with the corrected counter: energy excluded, and
  // fat/satFat de-duplicated into a single "fat" red. This makes the base ring
  // time-independent and impossible to contradict the bullets.
  const lights = rateNutrients(nutrition);
  const isRed = (key: string): boolean =>
    lights.some((l) => l.key === key && l.level === 'high');
  const isAmber = (key: string): boolean =>
    lights.some((l) => l.key === key && l.level === 'caution');

  const fatRed = isRed('fat') || isRed('satFat'); // de-duplicated: one fat concern
  const sugarRed = isRed('sugar');
  const saltRed = isRed('salt');
  const redCount = (fatRed ? 1 : 0) + (sugarRed ? 1 : 0) + (saltRed ? 1 : 0);

  // "heavy"/"salty" read off the SAME visible energy/salt lights, not a parallel
  // threshold, so the time/goal nudges are explainable in terms of the bars the user
  // sees. NOTE: heaviness for the TIME nudge is ENERGY-based, never fat-based — an
  // amber fat (7–21 g) is normal for any cooked main (olive oil, lean meat), so using
  // it would wrongly flag healthy dishes like grilled chicken + salad as "heavy" at
  // dinner. Fat is already handled honestly by the red-count base above.
  const energySubstantial = isRed('calories') || isAmber('calories'); // ≥600 kcal: a full meal
  const energyVeryHeavy = isRed('calories'); // >800 kcal: a genuinely big plate
  const salty = isRed('salt') || isAmber('salt');
  const veryHeavy = mid(nutrition.kcal) > THRESHOLDS.veryHighEnergyKcal;

  // AVOID is reserved for a dish that is genuinely indulgent: all three concern axes
  // red (fat, sugar, salt), OR two of them red together with EITHER an energy-dense
  // plate (calories red, >800 kcal) OR a sugar red (free sugars are a strong stand-
  // alone concern — a fat+sugar dessert is "best avoided" even when not calorie-huge).
  // RATIONALE: a single FSA per-portion red (esp. fat or salt) is COMMON in normal
  // restaurant food (oil, seasoning), so a plain ">=2 reds -> avoid" floods "best
  // avoided" onto ordinary mains and even lean dishes whose cooking oil pushes fat red
  // — under-truthful as an OVERALL verdict. A lean-but-oily or salty savoury dish
  // (fat+salt red, no sugar, not energy-dense) therefore stays 'caution' (worth a
  // thought), never wrongly 'avoid'. Still purely light-derived, so the ring can never
  // contradict the bullets (>=2 reds => never good; energy/sugar red ARE visible lights).
  const energyRed = isRed('calories');
  const offenders = [
    fatRed ? 'fat' : null,
    sugarRed ? 'sugar' : null,
    saltRed ? 'salt' : null,
  ].filter((x): x is string => x !== null);

  if (redCount >= 3 || (redCount >= 2 && (energyRed || sugarRed))) {
    level = escalate(level, 'avoid');
    // No heavyLabel here: an avoid (red) dish wears an avoid-flavoured label below,
    // never the amber "Heavy" caution word (else it vanishes from the Heavy filter).
    reasons.push(
      energyRed
        ? `Several nutrients run high here (${offenders.join(' and ')}) and it is an energy-dense plate.`
        : `Several nutrients run high here (${offenders.join(' and ')}).`,
    );
  } else if (redCount >= 1) {
    level = escalate(level, 'caution');
    heavyLabel = 'Worth a thought';
    reasons.push(
      offenders.length > 1
        ? `Some nutrients run high here (${offenders.join(' and ')}) — worth a thought.`
        : `One nutrient runs high here (${offenders[0]}) — worth a thought.`,
    );
  }

  // --- 1. Time-of-day (escalate-only; never downgrades) --------------------
  // breakfast / lunch / snack: no evening penalty (snack intentionally lenient — a
  //   smaller between-meals portion; it earns a friendlier 'good' label, no strictness).
  // dinner: a heavy OR rich dish -> caution ("Heavy for dinner").
  // late-night (strictest): a heavy OR rich dish -> caution ("Heavy late").
  // Any hour: a very large plate -> caution (documented backstop; see THRESHOLDS).
  // Boundaries (22:00 late-night, 05:00 breakfast) are a Bocado design choice (see
  // shared/constants mealContextForHour + DESIGN.md), NOT a cited standard.
  const isDinner = context === 'dinner';
  const isLateNight = context === 'late-night';
  // late-night (strictest): a full meal (≥600 kcal) is a heavy thing to eat right
  // before sleeping. dinner: only a genuinely big plate (>800 kcal energy-red) — a
  // normal-sized dinner is not penalised. Both key off ENERGY, the honest "heaviness"
  // axis; fat/salt are bad at any hour and are handled by the base/goals, not here.
  if (isLateNight && energySubstantial) {
    level = escalate(level, 'caution');
    heavyLabel = 'Heavy late';
    reasons.push('It is a large, heavy meal for late at night.');
  } else if (isDinner && energyVeryHeavy) {
    level = escalate(level, 'caution');
    heavyLabel = heavyLabel ?? 'Heavy for dinner';
    reasons.push('It is a large, heavy dish for the evening.');
  } else if (veryHeavy) {
    level = escalate(level, 'caution');
    heavyLabel = heavyLabel ?? 'Very filling';
    reasons.push('This is a very large, filling meal.');
  }

  // --- 2. Goals (escalate-only; positive notes never upgrade) --------------
  const goals = profile?.goals ?? [];
  if (goals.includes('weight-loss') && energySubstantial) {
    level = escalate(level, 'caution');
    heavyLabel = heavyLabel ?? 'Heavy choice';
    reasons.push('It is on the heavier side if you are aiming for lighter meals.');
  }
  if (goals.includes('low-sodium') && salty) {
    level = escalate(level, 'caution');
    heavyLabel = heavyLabel ?? 'Salty';
    reasons.push('It is quite salty, which matters if you are watching salt.');
  }
  if (goals.includes('high-protein') && isProteinGood(lights)) {
    // A positive, descriptive note. Never upgrades the level past a real concern,
    // and protein can never launder a red elsewhere (a salt-red high-protein dish
    // stays >= caution).
    reasons.push('Good amount of protein if you are after a high-protein meal.');
  }

  // keto / low-carb: a CARB NUDGE only, and only when carbs are present on the
  // estimate (optional nutrient). Never a name-based ban. BOCADO-guidance cutoff.
  if ((profile?.diet === 'keto' || profile?.diet === 'low-carb') && nutrition.carbs) {
    if (mid(nutrition.carbs) > THRESHOLDS.ketoCarbGrams) {
      level = escalate(level, 'caution');
      heavyLabel = heavyLabel ?? 'High carb';
      reasons.push('High in carbs for a keto or low-carb plan.');
    }
  }

  // --- 3. Allergies (force at least caution; defer to staff) ---------------
  const allergies = profile?.allergies ?? [];
  if (allergies.length > 0) {
    const detected = detectAllergens(ingredients);
    const detectedIds = new Set(detected.map((f) => f.allergen));
    const matched = allergies.filter((a) => detectedIds.has(a));
    if (matched.length > 0) {
      level = escalate(level, 'caution');
      allergyLabel = 'Check allergens';
      const list = matched.join(', ');
      // "may contain" framing — never "contains" as fact, never "safe".
      reasons.push(
        `May contain something you flagged (${list}) — please confirm with the staff before ordering.`,
      );
    }
  }

  // --- 4. Diet conflict (hard category -> avoid) + neutral notes -----------
  if (profile && profile.diet !== 'none') {
    const conflict = dietConflict(profile.diet, tokenized);
    if (conflict) {
      level = escalate(level, conflict.level);
      dietLabel = conflict.label;
      reasons.push(conflict.reason);
    }
    const neutralNote = dietNeutralNote(profile.diet, tokenized);
    if (neutralNote) {
      // Caution-level neutral caveat only (halal/kosher) — never an avoid.
      level = escalate(level, 'caution');
      allergyLabel = allergyLabel ?? 'Confirm with staff';
      reasons.push(neutralNote);
    }
  }

  // --- Confidence-aware uncertainty (additive metadata; NEVER mutates level) ----
  // Applied AFTER the light-derived base + all escalate-only modifiers, so it cannot
  // change the verdict LEVEL — the lights<->verdict invariant (ring == what the lights
  // imply) is preserved. A dish is uncertain when the nutrition layer flagged it
  // structurally untrustworthy OR the estimate's own confidence is 'low'. We never
  // fabricate a worse verdict, never relax a red: for caution/avoid the label stays
  // exactly as the lights/modifiers dictate; only a would-be confident GOOD is re-labelled
  // so a near-zero/unreliable estimate is not presented as a confident "good".
  const uncertain = (input.uncertain ?? false) || nutrition.confidence === 'low';
  let uncertaintyReason: string | undefined;

  // --- Label + default reason ---------------------------------------------
  // Pick the label for the most decisive signal that set the level.
  let label: string;
  if (level === 'avoid') {
    // A hard diet conflict names itself ("Not vegan"); a purely nutritional avoid
    // uses an avoid-flavoured word that matches the red legend / the ring's "Best
    // avoided now" — never the amber "Heavy" caution word. dietLabel wins precedence.
    label = dietLabel ?? 'Best avoided';
  } else if (level === 'caution') {
    // Allergy / confirm-with-staff concern is the most important caution to surface.
    label = allergyLabel ?? heavyLabel ?? 'Worth a thought';
  } else {
    label = contextGoodLabel(context);
    reasons.push(goodReason(context));
  }

  // Only a would-be GOOD verdict gets the uncertainty re-label: swap the friendly label
  // for an honest "hard to read" one and add a plain reason. caution/avoid labels are
  // already honest and are left untouched — we still report `uncertain` + reason there.
  if (uncertain) {
    uncertaintyReason =
      'We could not read this dish clearly enough to be sure — treat the lights as a rough guess.';
    if (level === 'good') {
      label = 'Hard to read clearly';
    }
    reasons.push(uncertaintyReason);
  }

  const result: Suitability = { level, label, reasons, confidence: nutrition.confidence, uncertain };
  if (uncertaintyReason !== undefined) result.uncertaintyReason = uncertaintyReason;
  return result;
}

/** Whether the protein light reads 'good' (positive nutrient at/above the good line). */
function isProteinGood(lights: ReturnType<typeof rateNutrients>): boolean {
  return lights.some((l) => l.key === 'protein' && l.level === 'good');
}

/** A friendly "good" label tuned to the time of day. Neutral, no health claim. */
function contextGoodLabel(context: MealContext): string {
  switch (context) {
    case 'breakfast':
      return 'Good start';
    case 'lunch':
      return 'Good for lunch';
    case 'dinner':
      return 'Good for dinner';
    case 'late-night':
      return 'Fine for now';
    case 'snack':
      return 'Fine as a snack';
    default:
      return 'Good now';
  }
}

/** A plain one-liner explaining a 'good' verdict for the context. Neutral wording. */
function goodReason(context: MealContext): string {
  switch (context) {
    case 'breakfast':
      return 'A reasonable choice to start the day.';
    case 'late-night':
      return 'A reasonable choice for late in the evening.';
    case 'snack':
      return 'A reasonable choice between meals.';
    default:
      return 'A reasonable choice right now.';
  }
}
