import { describe, it, expect } from 'vitest';
import type {
  IngredientGuess,
  MealContext,
  NutritionEstimate,
  Range,
  SuitabilityLevel,
  UserProfile,
} from '@bocado/shared';
import { assessSuitability } from './rules';
import { rateNutrients } from '../rate/nutrients';

/** A nutrient range helper. Width does not affect the rules (they use the midpoint). */
function r(min: number, max: number, unit: string): Range {
  return { min, max, unit };
}

/**
 * Build a NutritionEstimate whose midpoints equal the given values, so tests can
 * target thresholds precisely. Defaults are a light, unremarkable dish.
 */
function nutri(opts: {
  kcal?: number;
  protein?: number;
  fat?: number;
  salt?: number;
} = {}): NutritionEstimate {
  const kcal = opts.kcal ?? 300;
  const protein = opts.protein ?? 10;
  const fat = opts.fat ?? 8;
  const salt = opts.salt ?? 0.5;
  return {
    kcal: r(kcal, kcal, 'kcal'),
    protein: r(protein, protein, 'g'),
    fat: r(fat, fat, 'g'),
    salt: r(salt, salt, 'g'),
    confidence: 'medium',
    sources: [],
  };
}

function ings(...names: string[]): IngredientGuess[] {
  return names.map((name) => ({ name, grams: 120 }));
}

describe('assessSuitability — time of day & energy', () => {
  it('light breakfast dish -> good', () => {
    const out = assessSuitability({
      nutrition: nutri({ kcal: 300, fat: 8 }),
      context: 'breakfast',
      ingredients: ings('egg', 'tomato'),
    });
    expect(out.level).toBe('good');
    expect(out.reasons.length).toBeGreaterThan(0);
  });

  it('heavy dish late at night -> caution with a "heavy late" reason', () => {
    const out = assessSuitability({
      nutrition: nutri({ kcal: 950, fat: 40 }),
      context: 'late-night',
      ingredients: ings('beef steak', 'french fries'),
    });
    expect(out.level).toBe('caution');
    expect(out.label).toBe('Heavy late');
    expect(out.reasons.join(' ').toLowerCase()).toContain('heavy');
  });

  it('the SAME heavy dish is STILL caution at lunch — nutrient severity is time-independent', () => {
    // A dish with high nutrients (high calories + high fat) must never read "good"
    // just because it is lunch: the verdict has to agree with the per-nutrient
    // lights at any time of day. Time only makes the evening stricter.
    const out = assessSuitability({
      nutrition: nutri({ kcal: 950, fat: 40 }),
      context: 'lunch',
      ingredients: ings('beef steak', 'french fries'),
    });
    expect(out.level).toBe('caution');
  });

  it('a very heavy dish cautions even at lunch', () => {
    const out = assessSuitability({
      nutrition: nutri({ kcal: 1300, fat: 50 }),
      context: 'lunch',
      ingredients: ings('beef steak', 'french fries', 'cheese'),
    });
    expect(out.level).toBe('caution');
  });

  it('a nutritional avoid is labelled "Best avoided", never the caution word "Heavy"', () => {
    // 3+ HIGH nutrients -> avoid (red). The pill label must match the RED legend /
    // the ring aria ("Best avoided now"), NOT "Heavy" — "Heavy" is the AMBER/caution
    // word in the legend + filter chips, so a red dish wearing it would read "Heavy"
    // yet be absent from the "Heavy" (caution) filter. Regression guard.
    const out = assessSuitability({
      nutrition: nutri({ kcal: 950, fat: 45, salt: 4 }),
      context: 'lunch',
      ingredients: ings('bacon', 'cream', 'cheese'),
    });
    expect(out.level).toBe('avoid');
    expect(out.label).toBe('Best avoided');
    expect(out.label).not.toBe('Heavy');
  });
});

describe('assessSuitability — diet conflicts', () => {
  it('vegan profile + beef -> avoid, label "Not vegan"', () => {
    const profile: UserProfile = { diet: 'vegan', allergies: [], goals: [] };
    const out = assessSuitability({
      nutrition: nutri({ kcal: 600 }),
      context: 'dinner',
      profile,
      ingredients: ings('beef steak', 'onion'),
    });
    expect(out.level).toBe('avoid');
    expect(out.label).toBe('Not vegan');
    expect(out.reasons.join(' ').toLowerCase()).toContain('vegan');
  });

  it('vegan profile + cheese (dairy) -> avoid "Not vegan"', () => {
    const profile: UserProfile = { diet: 'vegan', allergies: [], goals: [] };
    const out = assessSuitability({
      nutrition: nutri(),
      context: 'lunch',
      profile,
      ingredients: ings('cheese', 'pasta'),
    });
    expect(out.level).toBe('avoid');
    expect(out.label).toBe('Not vegan');
  });

  it('vegetarian profile + cheese pasta (no meat/fish) -> NOT a diet avoid', () => {
    const profile: UserProfile = { diet: 'vegetarian', allergies: [], goals: [] };
    const out = assessSuitability({
      nutrition: nutri(),
      context: 'lunch',
      profile,
      ingredients: ings('cheese', 'pasta', 'tomato'),
    });
    expect(out.level).not.toBe('avoid');
  });

  it('pescatarian profile + salmon -> allowed (not avoid)', () => {
    const profile: UserProfile = { diet: 'pescatarian', allergies: [], goals: [] };
    const out = assessSuitability({
      nutrition: nutri({ kcal: 400 }),
      context: 'dinner',
      profile,
      ingredients: ings('salmon', 'rice'),
    });
    expect(out.level).not.toBe('avoid');
  });

  it('pescatarian profile + pork -> avoid "Not pescatarian"', () => {
    const profile: UserProfile = { diet: 'pescatarian', allergies: [], goals: [] };
    const out = assessSuitability({
      nutrition: nutri(),
      context: 'dinner',
      profile,
      ingredients: ings('pork', 'potato'),
    });
    expect(out.level).toBe('avoid');
    expect(out.label).toBe('Not pescatarian');
  });

  it('gluten-free profile + pasta -> avoid "Has gluten"', () => {
    const profile: UserProfile = { diet: 'gluten-free', allergies: [], goals: [] };
    const out = assessSuitability({
      nutrition: nutri(),
      context: 'lunch',
      profile,
      ingredients: ings('pasta', 'tomato'),
    });
    expect(out.level).toBe('avoid');
    expect(out.label).toBe('Has gluten');
  });
});

describe('assessSuitability — allergies (force caution, defer to staff, never "safe")', () => {
  it('milk allergy + cheese dish -> at least caution with a confirm-with-staff reason', () => {
    const profile: UserProfile = { diet: 'none', allergies: ['milk'], goals: [] };
    const out = assessSuitability({
      nutrition: nutri({ kcal: 400 }),
      context: 'lunch',
      profile,
      ingredients: ings('cheese', 'pasta'),
    });
    expect(['caution', 'avoid']).toContain(out.level);
    const text = out.reasons.join(' ').toLowerCase();
    expect(text).toContain('confirm');
    expect(text).toContain('staff');
  });

  it('milk allergy + cheese dish: label flags allergens, never claims "safe"', () => {
    const profile: UserProfile = { diet: 'none', allergies: ['milk'], goals: [] };
    const out = assessSuitability({
      nutrition: nutri(),
      context: 'lunch',
      profile,
      ingredients: ings('cheese'),
    });
    expect(out.level).toBe('caution');
    expect(out.label).toBe('Check allergens');
    expect(out.reasons.join(' ').toLowerCase()).not.toContain('safe');
  });

  it('allergy that does NOT match the dish does not force caution', () => {
    const profile: UserProfile = { diet: 'none', allergies: ['peanuts'], goals: [] };
    const out = assessSuitability({
      nutrition: nutri({ kcal: 300 }),
      context: 'lunch',
      profile,
      ingredients: ings('chicken breast', 'rice'),
    });
    expect(out.level).toBe('good');
  });

  it('diet avoid takes precedence over an allergy caution in the level', () => {
    // Vegan + cheese: cheese also triggers a milk allergy -> still avoid (worst wins).
    const profile: UserProfile = { diet: 'vegan', allergies: ['milk'], goals: [] };
    const out = assessSuitability({
      nutrition: nutri(),
      context: 'lunch',
      profile,
      ingredients: ings('cheese'),
    });
    expect(out.level).toBe('avoid');
    expect(out.label).toBe('Not vegan');
  });
});

describe('assessSuitability — goals', () => {
  it('weight-loss goal + heavy lunch -> caution (otherwise lenient lunch is good)', () => {
    const profile: UserProfile = { diet: 'none', allergies: [], goals: ['weight-loss'] };
    const out = assessSuitability({
      nutrition: nutri({ kcal: 900, fat: 30 }),
      context: 'lunch',
      profile,
      ingredients: ings('beef steak', 'french fries'),
    });
    expect(out.level).toBe('caution');
    expect(out.reasons.join(' ').toLowerCase()).toContain('light');
  });

  it('low-sodium goal + salty dish -> caution', () => {
    const profile: UserProfile = { diet: 'none', allergies: [], goals: ['low-sodium'] };
    const out = assessSuitability({
      nutrition: nutri({ kcal: 400, salt: 4 }),
      context: 'lunch',
      profile,
      ingredients: ings('bread', 'cheese'),
    });
    expect(out.level).toBe('caution');
    expect(out.reasons.join(' ').toLowerCase()).toContain('salt');
  });

  it('high-protein goal + protein-rich dish -> good, with a positive protein note', () => {
    const profile: UserProfile = { diet: 'none', allergies: [], goals: ['high-protein'] };
    const out = assessSuitability({
      nutrition: nutri({ kcal: 400, protein: 40 }),
      context: 'lunch',
      profile,
      ingredients: ings('chicken breast', 'rice'),
    });
    expect(out.level).toBe('good');
    expect(out.reasons.join(' ').toLowerCase()).toContain('protein');
  });
});

describe('assessSuitability — honesty & determinism', () => {
  it('NEVER produces a reason or label containing "safe"', () => {
    const profile: UserProfile = { diet: 'none', allergies: ['milk', 'fish'], goals: ['weight-loss'] };
    const contexts: MealContext[] = ['breakfast', 'lunch', 'dinner', 'late-night', 'snack'];
    for (const context of contexts) {
      const out = assessSuitability({
        nutrition: nutri({ kcal: 950, fat: 40, salt: 4, protein: 30 }),
        context,
        profile,
        ingredients: ings('cheese', 'salmon', 'pasta'),
      });
      expect(out.label.toLowerCase()).not.toContain('safe');
      for (const reason of out.reasons) {
        expect(reason.toLowerCase()).not.toContain('safe');
      }
    }
  });

  it('uses no health-benefit language ("healthy") in any reason', () => {
    const out = assessSuitability({
      nutrition: nutri({ kcal: 250, protein: 35 }),
      context: 'breakfast',
      profile: { diet: 'none', allergies: [], goals: ['high-protein'] },
      ingredients: ings('egg', 'tomato'),
    });
    for (const reason of out.reasons) {
      expect(reason.toLowerCase()).not.toContain('healthy');
    }
  });

  it('is deterministic (same inputs -> identical output)', () => {
    const args = {
      nutrition: nutri({ kcal: 950, fat: 40 }),
      context: 'late-night' as MealContext,
      profile: { diet: 'none', allergies: [], goals: [] } as UserProfile,
      ingredients: ings('beef steak', 'french fries'),
    };
    expect(assessSuitability(args)).toEqual(assessSuitability(args));
  });

  it('always returns a non-empty reasons array', () => {
    const out = assessSuitability({
      nutrition: nutri(),
      context: 'snack',
      ingredients: ings('avocado'),
    });
    expect(out.reasons.length).toBeGreaterThan(0);
  });
});

// ── EXTENDED helper: lets a test set every nutrient midpoint, incl. optionals. ──
function full(opts: {
  kcal?: number;
  protein?: number;
  fat?: number;
  satFat?: number;
  sugar?: number;
  carbs?: number;
  salt?: number;
}): NutritionEstimate {
  const pt = (v: number, unit: string): Range => ({ min: v, max: v, unit });
  return {
    kcal: pt(opts.kcal ?? 300, 'kcal'),
    protein: pt(opts.protein ?? 10, 'g'),
    fat: pt(opts.fat ?? 5, 'g'),
    salt: pt(opts.salt ?? 0.3, 'g'),
    ...(opts.satFat !== undefined ? { satFat: pt(opts.satFat, 'g') } : {}),
    ...(opts.sugar !== undefined ? { sugar: pt(opts.sugar, 'g') } : {}),
    ...(opts.carbs !== undefined ? { carbs: pt(opts.carbs, 'g') } : {}),
    confidence: 'medium',
    sources: [],
  };
}

/** Recompute the corrected red counter the way assessSuitability does. */
function correctedRedCount(est: NutritionEstimate): number {
  const lights = rateNutrients(est);
  const red = (k: string) => lights.some((l) => l.key === k && l.level === 'high');
  const fatRed = red('fat') || red('satFat'); // de-duplicated
  return (fatRed ? 1 : 0) + (red('sugar') ? 1 : 0) + (red('salt') ? 1 : 0);
}

describe('INVARIANT — verdict can never contradict the per-nutrient lights', () => {
  // A spread of estimates covering all corners of the band space.
  const SAMPLE: NutritionEstimate[] = [];
  for (const fat of [5, 25]) {
    for (const satFat of [1, 8]) {
      for (const sugar of [5, 35]) {
        for (const salt of [0.3, 2.5]) {
          for (const kcal of [300, 900]) {
            SAMPLE.push(full({ kcal, fat, satFat, sugar, salt, protein: 20 }));
          }
        }
      }
    }
  }

  it('redCount (deduped fat/satFat + sugar + salt, energy excluded) >= 2 => not good', () => {
    for (const est of SAMPLE) {
      if (correctedRedCount(est) >= 2) {
        const out = assessSuitability({ nutrition: est, context: 'lunch', ingredients: ings('mixed') });
        expect(out.level).not.toBe<SuitabilityLevel>('good');
      }
    }
  });

  it('energy-red ALONE (no other red) never forces avoid — energy is not counted', () => {
    // kcal 900 (red) but fat/satFat/sugar/salt all green -> 0 corrected reds.
    const est = full({ kcal: 900, fat: 5, satFat: 1, sugar: 5, salt: 0.3, protein: 20 });
    expect(correctedRedCount(est)).toBe(0);
    const out = assessSuitability({ nutrition: est, context: 'lunch', ingredients: ings('mixed') });
    expect(out.level).not.toBe<SuitabilityLevel>('avoid');
  });

  it('fat-red + satFat-red on the SAME fat mass is ONE red (caution, not avoid)', () => {
    const est = full({ kcal: 500, fat: 25, satFat: 8, sugar: 5, salt: 0.3, protein: 20 });
    expect(correctedRedCount(est)).toBe(1);
    const out = assessSuitability({ nutrition: est, context: 'lunch', ingredients: ings('cheese') });
    expect(out.level).toBe<SuitabilityLevel>('caution');
  });

  it('0 reds + no diet/allergy conflict => never avoid (nutrition cannot force avoid)', () => {
    for (const est of SAMPLE) {
      if (correctedRedCount(est) === 0) {
        const out = assessSuitability({ nutrition: est, context: 'late-night', ingredients: ings('mixed') });
        expect(out.level).not.toBe<SuitabilityLevel>('avoid');
      }
    }
  });

  it('0 reds CAN be avoid ONLY via a hard diet conflict, carrying a diet label (not "Heavy")', () => {
    const est = full({ kcal: 300, fat: 5, satFat: 1, sugar: 5, salt: 0.3, protein: 20 });
    expect(correctedRedCount(est)).toBe(0);
    const out = assessSuitability({
      nutrition: est,
      context: 'lunch',
      profile: { diet: 'vegan', allergies: [], goals: [] },
      ingredients: ings('beef steak'),
    });
    expect(out.level).toBe<SuitabilityLevel>('avoid');
    expect(out.label).toBe('Not vegan'); // category label, never "Heavy"/"Best avoided"
  });

  it('a >=2-red avoid reason references a RED nutrient', () => {
    const est = full({ kcal: 500, fat: 25, satFat: 8, sugar: 5, salt: 2.5, protein: 20 });
    expect(correctedRedCount(est)).toBeGreaterThanOrEqual(2);
    const out = assessSuitability({ nutrition: est, context: 'lunch', ingredients: ings('mixed') });
    const text = out.reasons.join(' ').toLowerCase();
    expect(text.includes('fat') || text.includes('sugar') || text.includes('salt')).toBe(true);
  });

  it('monotonic: adding a modifier (time/goal/allergy/diet) never lowers the level', () => {
    const RANK: Record<SuitabilityLevel, number> = { good: 0, caution: 1, avoid: 2 };
    const est = full({ kcal: 900, fat: 25, satFat: 8, sugar: 5, salt: 0.3, protein: 20 });
    const baseOut = assessSuitability({ nutrition: est, context: 'lunch', ingredients: ings('cheese') });
    const withDinner = assessSuitability({ nutrition: est, context: 'dinner', ingredients: ings('cheese') });
    const withGoal = assessSuitability({
      nutrition: est, context: 'lunch',
      profile: { diet: 'none', allergies: [], goals: ['weight-loss'] }, ingredients: ings('cheese'),
    });
    const withAllergy = assessSuitability({
      nutrition: est, context: 'lunch',
      profile: { diet: 'none', allergies: ['milk'], goals: [] }, ingredients: ings('cheese'),
    });
    for (const out of [withDinner, withGoal, withAllergy]) {
      expect(RANK[out.level]).toBeGreaterThanOrEqual(RANK[baseOut.level]);
    }
  });

  it('high-protein cannot launder a salt-red dish (stays caution)', () => {
    const est = full({ kcal: 400, fat: 5, satFat: 1, sugar: 5, salt: 2.5, protein: 40 });
    expect(correctedRedCount(est)).toBe(1); // salt red only
    const out = assessSuitability({
      nutrition: est, context: 'lunch',
      profile: { diet: 'none', allergies: [], goals: ['high-protein'] }, ingredients: ings('ham'),
    });
    expect(out.level).toBe<SuitabilityLevel>('caution');
    expect(out.reasons.join(' ').toLowerCase()).toContain('protein'); // positive note still shown
  });

  it('all-green + high-protein goal stays good (note added, no upgrade)', () => {
    const est = full({ kcal: 400, fat: 5, satFat: 1, sugar: 5, salt: 0.3, protein: 30 });
    const out = assessSuitability({
      nutrition: est, context: 'lunch',
      profile: { diet: 'none', allergies: [], goals: ['high-protein'] }, ingredients: ings('chicken'),
    });
    expect(out.level).toBe<SuitabilityLevel>('good');
    expect(out.reasons.join(' ').toLowerCase()).toContain('protein');
  });

  it('the uncertain flag NEVER flips a >=2-red dish to good and never relaxes a red', () => {
    for (const est of SAMPLE) {
      if (correctedRedCount(est) >= 2) {
        // Force both uncertainty signals on: the explicit flag AND low confidence.
        const lowConf: NutritionEstimate = { ...est, confidence: 'low' };
        const out = assessSuitability({
          nutrition: lowConf, context: 'lunch', ingredients: ings('mixed'), uncertain: true,
        });
        // Level must remain non-good (the flag never relaxes the red-derived level).
        expect(out.level).not.toBe<SuitabilityLevel>('good');
        // The label is the honest avoid/caution one, never the "good"-copy swap.
        expect(out.label).not.toBe('Hard to read clearly');
        // Uncertainty is still reported (truth), it just never launders a red.
        expect(out.uncertain).toBe(true);
      }
    }
  });

  it('a low-confidence 0-red dish stays good (level), only the label/flag change', () => {
    for (const est of SAMPLE) {
      if (correctedRedCount(est) === 0) {
        const lowConf: NutritionEstimate = { ...est, confidence: 'low' };
        const out = assessSuitability({
          nutrition: lowConf, context: 'lunch', ingredients: ings('mixed'), uncertain: true,
        });
        // 0-red, no profile -> base level good; uncertainty never escalates the level.
        // (time/energy modifiers may still caution a >1100 kcal plate — exclude those.)
        if (out.level === 'good') {
          expect(out.label).toBe('Hard to read clearly');
          expect(out.uncertain).toBe(true);
        }
      }
    }
  });

  it('FRUIT/DAIRY sugar limitation: a fruit bowl that is sugar-red alone reads caution, not avoid', () => {
    // Documented limitation: sugar is TOTAL sugars, so a fruit bowl can be sugar-red.
    // It must stay 1 red -> caution, never "Best avoided".
    const est = full({ kcal: 300, fat: 2, satFat: 1, sugar: 35, salt: 0.1, protein: 4 });
    expect(correctedRedCount(est)).toBe(1);
    const out = assessSuitability({ nutrition: est, context: 'lunch', ingredients: ings('mango', 'banana') });
    expect(out.level).toBe<SuitabilityLevel>('caution');
    expect(out.label).not.toBe('Best avoided');
  });
});

// ── confidence-aware uncertainty helper: full() with an explicit confidence. ──
function withConfidence(est: NutritionEstimate, confidence: 'low' | 'medium' | 'high'): NutritionEstimate {
  return { ...est, confidence };
}

describe('assessSuitability — confidence-aware uncertainty (honest, invariant-preserving)', () => {
  // 9) HIGH-CONFIDENCE 0-RED control — well matched, no reds, not flagged: normal green
  //    label, uncertain false. Proves no over-fire on a trustworthy good dish.
  it('control: high-confidence 0-red good dish keeps its normal green label, uncertain false', () => {
    const est = withConfidence(full({ kcal: 300, fat: 6, satFat: 1, sugar: 4, salt: 0.3, protein: 12 }), 'high');
    const out = assessSuitability({ nutrition: est, context: 'lunch', ingredients: ings('chicken', 'rice') });
    expect(out.level).toBe<SuitabilityLevel>('good');
    expect(out.label).toBe('Good for lunch');
    expect(out.uncertain).toBe(false);
    expect(out.confidence).toBe('high');
    expect(out.uncertaintyReason).toBeUndefined();
  });

  // 3) Would-be GOOD + uncertain flag forwarded -> level stays good, label swapped.
  it('a 0-red good dish flagged uncertain via the flag -> level good, label "Hard to read clearly"', () => {
    const est = withConfidence(full({ kcal: 300, fat: 6, satFat: 1, sugar: 4, salt: 0.3, protein: 12 }), 'medium');
    const out = assessSuitability({
      nutrition: est, context: 'lunch', ingredients: ings('croquette'), uncertain: true,
    });
    expect(out.level).toBe<SuitabilityLevel>('good'); // level NEVER mutated
    expect(out.label).toBe('Hard to read clearly');
    expect(out.uncertain).toBe(true);
    expect(out.uncertaintyReason).toContain('rough guess');
  });

  // 5/6) Would-be GOOD + low confidence (no flag needed) -> uncertain true, label swapped.
  it('a 0-red good dish with low confidence -> uncertain true even without the flag', () => {
    const est = withConfidence(full({ kcal: 200, fat: 2, satFat: 0, sugar: 2, salt: 0.1, protein: 2 }), 'low');
    const out = assessSuitability({ nutrition: est, context: 'lunch', ingredients: ings('mystery') });
    expect(out.level).toBe<SuitabilityLevel>('good');
    expect(out.label).toBe('Hard to read clearly');
    expect(out.uncertain).toBe(true);
    expect(out.confidence).toBe('low');
    expect(out.uncertaintyReason).toBeDefined();
  });

  // 8) LOW-CONFIDENCE 2-RED -> level stays caution/avoid per the lights; label NOT
  //    swapped to good copy (the flag never relaxes a red). uncertain still reported.
  it('a >=2-red low-confidence dish stays avoid; the uncertain flag never relaxes a red', () => {
    // fat red + salt red + (energy red via 950 kcal) -> avoid per the locked rule.
    const est = withConfidence(full({ kcal: 950, fat: 30, satFat: 12, sugar: 4, salt: 2.5, protein: 20 }), 'low');
    expect(correctedRedCount(est)).toBeGreaterThanOrEqual(2);
    const out = assessSuitability({ nutrition: est, context: 'lunch', ingredients: ings('fried platter'), uncertain: true });
    expect(out.level).toBe<SuitabilityLevel>('avoid'); // level unchanged by uncertainty
    expect(out.label).toBe('Best avoided'); // NOT swapped to good copy
    expect(out.uncertain).toBe(true);
    expect(out.uncertaintyReason).toBeDefined();
  });

  it('a 1-red caution low-confidence dish keeps its caution label, still reports uncertain', () => {
    const est = withConfidence(full({ kcal: 400, fat: 25, satFat: 8, sugar: 4, salt: 0.3, protein: 12 }), 'low');
    expect(correctedRedCount(est)).toBe(1);
    const out = assessSuitability({ nutrition: est, context: 'lunch', ingredients: ings('cheese') });
    expect(out.level).toBe<SuitabilityLevel>('caution');
    expect(out.label).toBe('Worth a thought'); // caution label not swapped
    expect(out.uncertain).toBe(true);
  });

  it('always populates confidence + uncertain on the returned verdict (medium control)', () => {
    const out = assessSuitability({ nutrition: nutri(), context: 'lunch', ingredients: ings('avocado') });
    expect(out.confidence).toBe('medium');
    expect(out.uncertain).toBe(false);
  });

  it('uncertainty copy never says "safe" and carries no health claim', () => {
    const est = withConfidence(full({ kcal: 200, fat: 2, satFat: 0, sugar: 2, salt: 0.1, protein: 2 }), 'low');
    const out = assessSuitability({ nutrition: est, context: 'lunch', ingredients: ings('mystery') });
    const text = [out.label, out.uncertaintyReason ?? '', ...out.reasons].join(' ').toLowerCase();
    expect(text).not.toContain('safe');
    expect(text).not.toContain('healthy');
  });
});

describe('keto / low-carb carb nudge (Bocado guidance, silent when carbs absent)', () => {
  it('keto + high-carb dish (carbs present) -> caution "High in carbs"', () => {
    const est = full({ kcal: 400, carbs: 60, protein: 8 });
    const out = assessSuitability({
      nutrition: est, context: 'lunch',
      profile: { diet: 'keto', allergies: [], goals: [] }, ingredients: ings('rice'),
    });
    expect(out.level).toBe<SuitabilityLevel>('caution');
    expect(out.reasons.join(' ').toLowerCase()).toContain('carb');
  });

  it('keto + low-carb dish (carbs present, below cutoff) -> not a carb caution', () => {
    const est = full({ kcal: 400, carbs: 10, protein: 25 });
    const out = assessSuitability({
      nutrition: est, context: 'lunch',
      profile: { diet: 'keto', allergies: [], goals: [] }, ingredients: ings('salmon'),
    });
    expect(out.reasons.join(' ').toLowerCase()).not.toContain('carb');
  });

  it('keto + carbs ABSENT from estimate -> silent (no carb caution, under-claim)', () => {
    const est = full({ kcal: 400, protein: 25 }); // no carbs key
    const out = assessSuitability({
      nutrition: est, context: 'lunch',
      profile: { diet: 'low-carb', allergies: [], goals: [] }, ingredients: ings('salmon'),
    });
    expect(out.reasons.join(' ').toLowerCase()).not.toContain('carb');
  });

  it('keto / low-carb NEVER force a name-based avoid', () => {
    const est = full({ kcal: 400, carbs: 60 });
    for (const diet of ['keto', 'low-carb'] as const) {
      const out = assessSuitability({
        nutrition: est, context: 'lunch',
        profile: { diet, allergies: [], goals: [] }, ingredients: ings('rice', 'beef steak'),
      });
      expect(out.level).not.toBe<SuitabilityLevel>('avoid');
    }
  });
});

describe('halal / kosher neutral notes (confirm-with-staff, never a name-based avoid)', () => {
  it('halal + pork -> caution with a confirm-with-staff note, never avoid', () => {
    const out = assessSuitability({
      nutrition: full({ kcal: 400 }), context: 'lunch',
      profile: { diet: 'halal', allergies: [], goals: [] }, ingredients: ings('pork loin', 'rice'),
    });
    expect(out.level).toBe<SuitabilityLevel>('caution');
    expect(out.level).not.toBe<SuitabilityLevel>('avoid');
    const text = out.reasons.join(' ').toLowerCase();
    expect(text).toContain('confirm');
    expect(text).toContain('halal');
  });

  it('halal + alcohol (wine) -> caution confirm-with-staff', () => {
    const out = assessSuitability({
      nutrition: full({ kcal: 400 }), context: 'lunch',
      profile: { diet: 'halal', allergies: [], goals: [] }, ingredients: ings('chicken breast', 'wine sauce'),
    });
    expect(out.level).toBe<SuitabilityLevel>('caution');
    expect(out.reasons.join(' ').toLowerCase()).toContain('confirm');
  });

  it('kosher + shellfish (prawns) -> caution confirm-with-staff, never avoid', () => {
    const out = assessSuitability({
      nutrition: full({ kcal: 400 }), context: 'lunch',
      profile: { diet: 'kosher', allergies: [], goals: [] }, ingredients: ings('prawns', 'rice'),
    });
    expect(out.level).toBe<SuitabilityLevel>('caution');
    expect(out.reasons.join(' ').toLowerCase()).toContain('kosher');
  });

  it('kosher + meat & dairy together -> caution confirm-with-staff', () => {
    const out = assessSuitability({
      nutrition: full({ kcal: 400 }), context: 'lunch',
      profile: { diet: 'kosher', allergies: [], goals: [] }, ingredients: ings('beef steak', 'cheese'),
    });
    expect(out.level).toBe<SuitabilityLevel>('caution');
    expect(out.reasons.join(' ').toLowerCase()).toContain('confirm');
  });

  it('halal + a plain vegetable dish -> no note (under-claim, stays good)', () => {
    const out = assessSuitability({
      nutrition: full({ kcal: 200 }), context: 'lunch',
      profile: { diet: 'halal', allergies: [], goals: [] }, ingredients: ings('lettuce', 'tomato'),
    });
    expect(out.level).toBe<SuitabilityLevel>('good');
  });
});

describe('time-of-day strictness (escalate-only)', () => {
  // A heavy/rich-but-not-2-red dish: energy red (heavy) only.
  const heavy = full({ kcal: 900, fat: 5, satFat: 1, sugar: 5, salt: 0.3, protein: 20 });

  it('dinner escalates a heavy dish to caution', () => {
    const out = assessSuitability({ nutrition: heavy, context: 'dinner', ingredients: ings('rice', 'oil') });
    expect(out.level).toBe<SuitabilityLevel>('caution');
    expect(out.label).toBe('Heavy for dinner');
  });

  it('late-night escalates a heavy dish to caution ("Heavy late")', () => {
    const out = assessSuitability({ nutrition: heavy, context: 'late-night', ingredients: ings('rice', 'oil') });
    expect(out.level).toBe<SuitabilityLevel>('caution');
    expect(out.label).toBe('Heavy late');
  });

  it('breakfast / lunch / snack do NOT apply the evening penalty to a heavy dish', () => {
    for (const context of ['breakfast', 'lunch', 'snack'] as const) {
      const out = assessSuitability({ nutrition: heavy, context, ingredients: ings('rice', 'oil') });
      // energy amber/red is NOT a nutritional red (energy excluded), and no diet/goal:
      // the dish stays good at these contexts (time adds nothing).
      expect(out.level).toBe<SuitabilityLevel>('good');
    }
  });

  it('very large plate (>1100 kcal) cautions at any hour (documented backstop)', () => {
    const veryHeavy = full({ kcal: 1150, fat: 5, satFat: 1, sugar: 5, salt: 0.3, protein: 20 });
    const out = assessSuitability({ nutrition: veryHeavy, context: 'breakfast', ingredients: ings('mixed') });
    expect(out.level).toBe<SuitabilityLevel>('caution');
  });

  it('snack gets a friendlier label and no time strictness', () => {
    const out = assessSuitability({ nutrition: heavy, context: 'snack', ingredients: ings('rice') });
    expect(out.level).toBe<SuitabilityLevel>('good');
    expect(out.label).toBe('Fine as a snack');
  });
});

describe('COPY LINT — no health-benefit / disease wording, allergen copy is may-contain', () => {
  // Reg 1924/2006 + Reg 1169/2011 denylist over EVERY user-facing string we emit.
  const DENY = [
    'healthy', 'healthful', 'boosts', 'immunity', 'cholesterol', 'detox',
    'weight loss', 'slimming', 'sano', 'saludable', 'adelgaza',
    'safe', 'seguro', 'sin alergenos', 'allergen-free', 'contiene',
    'light enough', // replaced with neutral copy
  ];
  const CTXS: MealContext[] = ['breakfast', 'lunch', 'dinner', 'late-night', 'snack'];
  const DIETS = ['none', 'vegan', 'vegetarian', 'halal', 'kosher', 'keto', 'low-carb', 'gluten-free', 'dairy-free'] as const;

  it('no emitted label/reason contains a denylisted phrase across the matrix', () => {
    for (const ctx of CTXS) {
      for (const diet of DIETS) {
        const out = assessSuitability({
          nutrition: full({ kcal: 950, fat: 25, satFat: 8, sugar: 35, salt: 2.5, carbs: 60, protein: 30 }),
          context: ctx,
          profile: { diet, allergies: ['milk', 'fish'], goals: ['weight-loss', 'high-protein', 'low-sodium'] },
          ingredients: ings('cheese', 'salmon', 'pasta', 'wine sauce', 'pork loin'),
        });
        const corpus = [out.label, ...out.reasons].join(' ').toLowerCase();
        for (const phrase of DENY) {
          expect(corpus, `"${phrase}" leaked at ${ctx}/${diet}: ${corpus}`).not.toContain(phrase);
        }
      }
    }
  });

  it('an allergy match keeps the may-contain + confirm-with-staff framing', () => {
    const out = assessSuitability({
      nutrition: full({ kcal: 400 }), context: 'lunch',
      profile: { diet: 'none', allergies: ['milk'], goals: [] }, ingredients: ings('cheese'),
    });
    const text = out.reasons.join(' ').toLowerCase();
    expect(text).toContain('may contain');
    expect(text).toContain('confirm');
    expect(text).not.toContain('contains '); // never assert "contains X" as fact
  });

  it('a good label never overrides an active allergy caveat', () => {
    const out = assessSuitability({
      nutrition: full({ kcal: 200 }), context: 'breakfast',
      profile: { diet: 'none', allergies: ['milk'], goals: [] }, ingredients: ings('cheese'),
    });
    // Allergy forces at least caution; the friendly "good" label must not win.
    expect(out.level).toBe<SuitabilityLevel>('caution');
    expect(out.label).toBe('Check allergens');
  });
});

describe('REGRESSION SNAPSHOTS — realistic dishes (review re-anchoring intentionally)', () => {
  // Midpoint-pinned realistic dishes; assert the {level,label} pair so any future
  // threshold change surfaces as a reviewed diff.
  interface Case { name: string; est: NutritionEstimate; level: SuitabilityLevel; label: string }
  const CASES: Case[] = [
    { name: 'green salad', est: full({ kcal: 200, fat: 6, satFat: 1, sugar: 4, salt: 0.4, protein: 8 }), level: 'good', label: 'Good for lunch' },
    { name: 'grilled fish + veg', est: full({ kcal: 450, fat: 18, satFat: 4, sugar: 6, salt: 0.6, protein: 35 }), level: 'good', label: 'Good for lunch' },
    { name: 'caprese (cheese+oil, 1 fat red)', est: full({ kcal: 520, fat: 30, satFat: 12, sugar: 4, salt: 1.0, protein: 18 }), level: 'caution', label: 'Worth a thought' },
    { name: 'risotto (rich, energy+fat amber)', est: full({ kcal: 650, fat: 18, satFat: 7, sugar: 3, salt: 1.5, protein: 12 }), level: 'caution', label: 'Worth a thought' },
    { name: 'fried platter (fat+salt red)', est: full({ kcal: 950, fat: 45, satFat: 15, sugar: 3, salt: 2.5, protein: 25 }), level: 'avoid', label: 'Best avoided' },
    { name: 'sugary dessert (fat+sugar red)', est: full({ kcal: 600, fat: 25, satFat: 14, sugar: 40, salt: 0.3, protein: 5 }), level: 'avoid', label: 'Best avoided' },
    { name: 'fruit bowl (sugar red only)', est: full({ kcal: 300, fat: 2, satFat: 1, sugar: 35, salt: 0.1, protein: 4 }), level: 'caution', label: 'Worth a thought' },
  ];

  for (const c of CASES) {
    it(`${c.name} -> ${c.level} / "${c.label}"`, () => {
      const out = assessSuitability({ nutrition: c.est, context: 'lunch', ingredients: ings('mixed') });
      expect({ level: out.level, label: out.label }).toEqual({ level: c.level, label: c.label });
    });
  }
});
