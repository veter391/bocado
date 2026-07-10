import { describe, expect, it } from 'vitest';
import type { Dish, IngredientGuess, PerceivedDish, UserProfile } from '@bocado/shared';
import {
  detectAllergens, dishFitsDiet, dishHitsAllergies,
  enrichDish, estimateNutrition, rateNutrients, seedFixtureTable,
} from './index';

function pd(name: string, ...ingredients: Array<[string, number]>): PerceivedDish {
  return { originalText: name, translatedName: name,
    ingredients: ingredients.map(([n, g]) => ({ name: n, grams: g })) };
}
function dishFrom(ingredients: IngredientGuess[]): Pick<Dish, 'ingredients'> {
  return { ingredients };
}

const SALAD_DISH = pd('Garden salad', ['lettuce', 80], ['tomato', 80], ['olive oil', 15]);
const HEAVY_BURGER = pd('Double cheeseburger with fries',
  ['beef', 220], ['cheese', 80], ['bread', 100], ['french fries', 200], ['butter', 20]);
const VEGAN_CONFLICT = pd('Beef stir-fry with rice', ['beef', 150], ['white rice', 180], ['olive oil', 10]);
const ALLERGEN_DISH = pd('Prawn and cheese pasta', ['prawns', 120], ['cheese', 60], ['pasta', 180], ['cream', 50]);
const VEGAN_DISH = pd('Chickpea and lentil bowl', ['chickpeas', 150], ['lentils', 150], ['tomato', 80], ['olive oil', 15]);
const GLUTEN_DISH = pd('Pasta carbonara', ['pasta', 200], ['egg', 60], ['cheese', 50], ['olive oil', 15]);
const ALL_DISHES = [SALAD_DISH, HEAVY_BURGER, VEGAN_CONFLICT, ALLERGEN_DISH, VEGAN_DISH, GLUTEN_DISH];

describe('Pipeline invariant: verdict level agrees with per-nutrient lights', () => {
  it('a dish with 3+ high nutrient lights must NOT read good', () => {
    const result = enrichDish(HEAVY_BURGER, { context: 'lunch', table: seedFixtureTable });
    const lights = rateNutrients(result.nutrition);
    const highCount = lights.filter((l) => l.level === 'high').length;
    expect(highCount).toBeGreaterThanOrEqual(3);
    expect(result.suitability.level).not.toBe('good');
  });

  it('a dish with 3+ high lights must read avoid (nutrition-driven, no profile)', () => {
    const result = enrichDish(HEAVY_BURGER, { context: 'lunch', table: seedFixtureTable });
    const lights = rateNutrients(result.nutrition);
    const highCount = lights.filter((l) => l.level === 'high').length;
    expect(highCount).toBeGreaterThanOrEqual(3);
    expect(result.suitability.level).toBe('avoid');
  });

  it('a dish with 0 high lights and no profile conflict must NOT read avoid', () => {
    const result = enrichDish(SALAD_DISH, { context: 'lunch', table: seedFixtureTable });
    const lights = rateNutrients(result.nutrition);
    const highCount = lights.filter((l) => l.level === 'high').length;
    expect(highCount).toBe(0);
    expect(result.suitability.level).not.toBe('avoid');
  });

  it('all 6 fixture dishes: good verdict implies 0 high lights', () => {
    for (const dish of ALL_DISHES) {
      const result = enrichDish(dish, { context: 'lunch', table: seedFixtureTable });
      const lights = rateNutrients(result.nutrition);
      const highCount = lights.filter((l) => l.level === 'high').length;
      const level = result.suitability.level;
      if (level === 'good') expect(highCount).toBe(0);
      if (highCount >= 3) expect(level).not.toBe('good');
    }
  });
});

describe('Pipeline invariant: filter predicates agree with the verdict', () => {
  it('vegan-conflict dish: verdict avoid + label Not vegan; vegan filter drops it', () => {
    const prof: UserProfile = { diet: 'vegan', allergies: [], goals: [] };
    const result = enrichDish(VEGAN_CONFLICT, { context: 'dinner', profile: prof, table: seedFixtureTable });
    expect(result.suitability.level).toBe('avoid');
    expect(result.suitability.label).toBe('Not vegan');
    expect(dishFitsDiet(dishFrom(VEGAN_CONFLICT.ingredients), 'vegan')).toBe(false);
  });

  it('vegan-safe dish is NOT dropped by the vegan filter and is not diet-avoid', () => {
    const prof: UserProfile = { diet: 'vegan', allergies: [], goals: [] };
    const result = enrichDish(VEGAN_DISH, { context: 'lunch', profile: prof, table: seedFixtureTable });
    expect(result.suitability.level).not.toBe('avoid');
    expect(dishFitsDiet(dishFrom(VEGAN_DISH.ingredients), 'vegan')).toBe(true);
  });

  it('gluten-free conflict: verdict avoid + Has gluten; filter drops it', () => {
    const prof: UserProfile = { diet: 'gluten-free', allergies: [], goals: [] };
    const result = enrichDish(GLUTEN_DISH, { context: 'lunch', profile: prof, table: seedFixtureTable });
    expect(result.suitability.level).toBe('avoid');
    expect(result.suitability.label).toBe('Has gluten');
    expect(dishFitsDiet(dishFrom(GLUTEN_DISH.ingredients), 'gluten-free')).toBe(false);
  });

  it('allergen filter agrees with detectAllergens for each flagged allergen', () => {
    const flags = detectAllergens(ALLERGEN_DISH.ingredients);
    expect(flags.length).toBeGreaterThan(0);
    for (const flag of flags) {
      const hits = dishHitsAllergies(dishFrom(ALLERGEN_DISH.ingredients), [flag.allergen]);
      expect(hits).toBe(true);
    }
  });

  it('milk allergy + cheese+prawn dish: verdict at least caution; filter hits', () => {
    const prof: UserProfile = { diet: 'none', allergies: ['milk'], goals: [] };
    const result = enrichDish(ALLERGEN_DISH, { context: 'lunch', profile: prof, table: seedFixtureTable });
    expect(['caution', 'avoid']).toContain(result.suitability.level);
    expect(dishHitsAllergies(dishFrom(ALLERGEN_DISH.ingredients), ['milk'])).toBe(true);
  });
});

describe('Pipeline invariant: allergen language is may-contain, never safe', () => {
  it('no allergen flag note ever contains safe', () => {
    for (const dish of ALL_DISHES)
      for (const flag of detectAllergens(dish.ingredients))
        expect(flag.note.toLowerCase()).not.toContain('safe');
  });

  it('no allergen flag note ever contains allergen-free', () => {
    for (const dish of ALL_DISHES)
      for (const flag of detectAllergens(dish.ingredients))
        expect(flag.note.toLowerCase()).not.toContain('allergen-free');
  });

  it('every allergen flag note contains confirm (defers to staff)', () => {
    const flags = detectAllergens(ALLERGEN_DISH.ingredients);
    expect(flags.length).toBeGreaterThan(0);
    for (const flag of flags) expect(flag.note.toLowerCase()).toContain('confirm');
  });

  it('allergen basis is always ingredient-match for ingredient-derived flags', () => {
    for (const dish of ALL_DISHES)
      for (const flag of detectAllergens(dish.ingredients))
        expect(flag.basis).toBe('ingredient-match');
  });
});

describe('Pipeline invariant: suitability reasons contain no health-benefit language', () => {
  const FORBIDDEN = ['healthy', 'good for you', 'nutritious', 'wholesome', 'beneficial'];
  const CTXS = ['breakfast', 'lunch', 'dinner', 'late-night', 'snack'] as const;

  it('no reason across all contexts and dishes uses health-benefit language', () => {
    for (const dish of ALL_DISHES) {
      for (const ctx of CTXS) {
        const result = enrichDish(dish, { context: ctx, table: seedFixtureTable });
        for (const reason of result.suitability.reasons)
          for (const word of FORBIDDEN)
            expect(reason.toLowerCase()).not.toContain(word);
      }
    }
  });
});

describe('Pipeline: honest uncertainty surfaces end-to-end (enrichDish)', () => {
  // Controls: well-matched dishes stay confident + NOT uncertain through enrichDish.
  it('SALAD stays a confident good with uncertain=false end-to-end', () => {
    const result = enrichDish(SALAD_DISH, { context: 'lunch', table: seedFixtureTable });
    expect(result.suitability.level).toBe('good');
    expect(result.suitability.uncertain).toBe(false);
    expect(result.suitability.confidence).not.toBe('low');
    expect(result.suitability.label).not.toBe('Hard to read clearly');
  });

  // A deep-fried dish whose matched components carry NO fried mass (plain potato +
  // bechamel croquette filling) must surface uncertain through the full pipeline.
  const FRIED_SPARSE: PerceivedDish = {
    originalText: 'Croquetas', translatedName: 'Croquettes', cookingMethod: 'deep-fried',
    ingredients: [{ name: 'potato', grams: 120 }, { name: 'cheese', grams: 40 }],
  };

  it('a deep-fried dish with no fried mass surfaces uncertain (flag + reason + label) via enrichDish', () => {
    const result = enrichDish(FRIED_SPARSE, { context: 'lunch', table: seedFixtureTable });
    expect(result.suitability.uncertain).toBe(true);
    expect(result.suitability.uncertaintyReason).toBeDefined();
    // Level still equals what the lights imply (never fabricated worse); if 0-red good,
    // the label is the honest "Hard to read clearly".
    if (result.suitability.level === 'good') {
      expect(result.suitability.label).toBe('Hard to read clearly');
    }
  });

  // The enrichDish cookingMethod-forwarding fix (index.ts): enrichDish must forward
  // perceived.cookingMethod to estimateNutrition. Proven by comparing enrichDish's
  // nutrition to a direct estimateNutrition call WITH the same cookingMethod option.
  it('enrichDish forwards cookingMethod to the engine (dropped-options regression)', () => {
    const direct = estimateNutrition(FRIED_SPARSE.ingredients, seedFixtureTable, {
      cookingMethod: 'deep-fried',
    });
    const viaEnrich = enrichDish(FRIED_SPARSE, { context: 'lunch', table: seedFixtureTable });
    expect(viaEnrich.nutrition).toEqual(direct);
    // And specifically: the method-aware uncertain flag must surface on the verdict
    // (would be false if cookingMethod had been dropped to 'unknown' before the fix).
    expect(direct.uncertain).toBe(true);
    expect(viaEnrich.suitability.uncertain).toBe(true);
  });
});

describe('Pipeline: nutrition honesty across all fixture dishes', () => {
  it('every dish produces valid non-negative ranges with min <= max', () => {
    for (const dish of ALL_DISHES) {
      const est = estimateNutrition(dish.ingredients, seedFixtureTable);
      const ranges = [est.kcal, est.protein, est.fat, est.salt];
      if (est.satFat) ranges.push(est.satFat);
      if (est.sugar) ranges.push(est.sugar);
      if (est.carbs) ranges.push(est.carbs);
      for (const range of ranges) {
        expect(range.min).toBeGreaterThanOrEqual(0);
        expect(range.max).toBeGreaterThanOrEqual(range.min);
        expect(Number.isFinite(range.min)).toBe(true);
        expect(Number.isFinite(range.max)).toBe(true);
        expect(range.unit.length).toBeGreaterThan(0);
      }
    }
  });

  it('every dish with known seed ingredients traces to at least one source', () => {
    for (const dish of ALL_DISHES) {
      const est = estimateNutrition(dish.ingredients, seedFixtureTable);
      expect(est.sources.length).toBeGreaterThan(0);
    }
  });

  it('heavy burger kcal and fat midpoints exceed per-nutrient high thresholds', () => {
    const est = estimateNutrition(HEAVY_BURGER.ingredients, seedFixtureTable);
    const kcalMid = (est.kcal.min + est.kcal.max) / 2;
    const fatMid = (est.fat.min + est.fat.max) / 2;
    expect(kcalMid).toBeGreaterThan(700);
    expect(fatMid).toBeGreaterThan(32);
  });
});
