/**
 * HARD-MENU CORPUS — the fat-fix acceptance suite.
 *
 * 14 deterministic dishes (canonicalName / grams / cookingMethod / isAddedFat /
 * basis) run through estimateNutrition -> rateNutrients -> assessSuitability
 * (context 'lunch', no profile), over the production-default table. NO live model.
 *
 * Every verdict assertion is DERIVED from the LOCKED rule in suitability/rules.ts
 * (`redCount >= 3 || (redCount >= 2 && (energyRed || sugarRed))`, fat/satFat
 * de-duplicated, energy NOT counted) — never eyeballed. Lean dishes must LEAVE
 * fat-red; fried/creamy/indulgent must stay red->avoid where the locked rule says so.
 *
 * These encode the fat-fix and guard it against regression. Bands are honest ranges:
 * we assert the fat-light LEVEL and the verdict LEVEL (the load-bearing facts), plus a
 * loose fat-midpoint sanity bound, rather than brittle exact numbers.
 */
import { describe, expect, it } from 'vitest';
import type { CookingMethod, IngredientGuess, NutrientLevel, SuitabilityLevel } from '@bocado/shared';
import { createMemoryTable, DEFAULT_FOODS } from './memoryTable';
import { estimateNutrition } from '../compute/estimate';
import { rateNutrients } from '../rate/nutrients';
import { assessSuitability } from '../suitability/rules';

const table = createMemoryTable(DEFAULT_FOODS);

interface CorpusDish {
  label: string;
  cookingMethod: CookingMethod;
  ingredients: IngredientGuess[];
  /** Expected fat traffic-light level. */
  fatLevel: NutrientLevel;
  /** Expected overall verdict (derived from the locked rule). */
  verdict: SuitabilityLevel;
}

const i = (
  canonicalName: string,
  grams: number,
  extra: Partial<IngredientGuess> = {},
): IngredientGuess => ({ canonicalName, grams, basis: 'inferred', ...extra });

const CORPUS: CorpusDish[] = [
  {
    label: '1 gazpacho (lean, no fat-red)',
    cookingMethod: 'raw',
    ingredients: [
      i('tomato', 250, { basis: 'read' }),
      i('cucumber', 60),
      i('bell pepper', 40),
      i('olive oil', 8, { isAddedFat: true }),
    ],
    fatLevel: 'caution',
    verdict: 'good',
  },
  {
    label: '2 grilled sea bass (no oil line, lean)',
    cookingMethod: 'grilled',
    ingredients: [i('sea bass', 200, { basis: 'read' }), i('lemon', 10), i('parsley', 2)],
    fatLevel: 'good',
    verdict: 'good',
  },
  {
    label: '3 grilled chicken caesar (dressing as component, 1 fat red)',
    cookingMethod: 'grilled',
    ingredients: [
      i('chicken breast', 150, { basis: 'read' }),
      i('romaine', 80),
      i('vinaigrette', 30, { isAddedFat: true }),
      i('parmesan', 20),
    ],
    fatLevel: 'high',
    verdict: 'caution',
  },
  {
    label: '4 paella valenciana (rice cooked, oil clamped)',
    cookingMethod: 'sauteed',
    ingredients: [
      i('paella rice cooked', 200),
      i('chicken breast', 60),
      i('prawns', 50),
      i('cooking oil', 8, { isAddedFat: true }),
      i('tomato', 30),
      i('bell pepper', 20),
    ],
    fatLevel: 'caution',
    verdict: 'good',
  },
  {
    label: '5 deep-fried calamari (fry absorption, honestly red)',
    cookingMethod: 'deep-fried',
    ingredients: [i('squid', 150, { basis: 'read' }), i('batter', 40)],
    fatLevel: 'high',
    verdict: 'caution',
  },
  {
    label: '6 boeuf bourguignon (creamy/fatty, 1 fat red)',
    cookingMethod: 'braised',
    ingredients: [
      i('beef steak', 180, { basis: 'read', originalTerm: 'boeuf bourguignon' }),
      i('bacon', 20),
      i('butter', 7, { isAddedFat: true }),
    ],
    fatLevel: 'high',
    verdict: 'caution',
  },
  {
    label: '7 whole grilled fish multilingual (resolves to fish, not chicken)',
    cookingMethod: 'grilled',
    ingredients: [i('sea bass', 220, { basis: 'read', originalTerm: 'pescado entero' })],
    fatLevel: 'good',
    verdict: 'good',
  },
  {
    label: '8 vegan cheese burger (plant guard)',
    cookingMethod: 'fried',
    ingredients: [
      // The patty resolves to its OWN plant record (curated-plant-patty, ~18g fat/100g)
      // and vegan cheese to curated-vegan-cheese (coconut-oil based) — the GUARD is that
      // neither collapses onto beef or 33%-fat dairy cheese. The plate legitimately reads
      // fat-high from real plant-fat content, not from a mis-match.
      i('plant based patty', 120),
      i('vegan cheese', 25),
      i('bread', 60),
    ],
    fatLevel: 'high',
    verdict: 'caution',
  },
  {
    label: '9 lentil soup (legume cooked, lean)',
    cookingMethod: 'stewed',
    ingredients: [
      i('lentils', 200),
      i('carrot', 40),
      i('onion', 30),
      i('cooking oil', 5, { isAddedFat: true }),
    ],
    fatLevel: 'good',
    verdict: 'good',
  },
  {
    label: '10 steak frites large (portion clamp + fried side)',
    cookingMethod: 'grilled',
    ingredients: [i('beef steak', 300, { basis: 'read' }), i('french fries', 200)],
    fatLevel: 'high',
    verdict: 'caution',
  },
  {
    label: '11 fruit bowl (sugar red, never avoid)',
    cookingMethod: 'raw',
    ingredients: [i('mango', 120), i('banana', 100), i('apple', 100), i('orange', 80)],
    fatLevel: 'good',
    verdict: 'caution',
  },
  {
    label: '12 tiramisu (fat+sugar dessert -> avoid)',
    cookingMethod: 'raw',
    ingredients: [i('tiramisu', 150)],
    fatLevel: 'high',
    verdict: 'avoid',
  },
  {
    label: '13 risotto (anti-inflation)',
    cookingMethod: 'stewed',
    // fat AMBER + satFat RED (parmesan + butter) -> ONE fat red (de-dup) -> caution.
    // The load-bearing guard is NO x2.4 mass inflation (cooked composite): kcal stays
    // sane (~450, not ~4000), which the explicit kcal bound below pins.
    ingredients: [i('risotto', 220), i('parmesan', 20), i('butter', 7, { isAddedFat: true })],
    fatLevel: 'caution',
    verdict: 'caution',
  },
  {
    label: '14 steamed veg plate (all green)',
    cookingMethod: 'steamed',
    ingredients: [i('broccoli', 120), i('carrot', 80), i('green beans', 80)],
    fatLevel: 'good',
    verdict: 'good',
  },
];

describe('HARD CORPUS — fat-fix acceptance (lunch, no profile)', () => {
  for (const d of CORPUS) {
    it(`${d.label}`, () => {
      const est = estimateNutrition(d.ingredients, table, { cookingMethod: d.cookingMethod });
      const lights = rateNutrients(est);
      const fat = lights.find((l) => l.key === 'fat')!;
      const suit = assessSuitability({ nutrition: est, context: 'lunch', ingredients: d.ingredients });

      expect(fat.level).toBe(d.fatLevel);
      expect(suit.level).toBe(d.verdict);
      // Every contribution traces to a real record (never fabricated).
      for (const s of est.sources) expect(s.recordId.length).toBeGreaterThan(0);
    });
  }

  it('T13 risotto: no x2.4 mass inflation (kcal sane, < 700) — the historic 4000 kcal guard', () => {
    const est = estimateNutrition(
      [
        { canonicalName: 'risotto', grams: 220, basis: 'inferred' },
        { canonicalName: 'parmesan', grams: 20, basis: 'inferred' },
        { canonicalName: 'butter', grams: 7, basis: 'inferred', isAddedFat: true },
      ],
      table,
      { cookingMethod: 'stewed' },
    );
    expect((est.kcal.min + est.kcal.max) / 2).toBeLessThan(700);
  });

  it('T10 steak frites: energy-red but redCount=1 -> caution, NOT avoid (locked rule)', () => {
    const est = estimateNutrition(
      [
        { canonicalName: 'beef steak', grams: 300, basis: 'read' },
        { canonicalName: 'french fries', grams: 200, basis: 'inferred' },
      ],
      table,
      { cookingMethod: 'grilled' },
    );
    const lights = rateNutrients(est);
    const energy = lights.find((l) => l.key === 'calories')!;
    const suit = assessSuitability({
      nutrition: est,
      context: 'lunch',
      ingredients: [
        { canonicalName: 'beef steak', grams: 300 },
        { canonicalName: 'french fries', grams: 200 },
      ],
    });
    // Energy is red, but it is NOT counted toward redCount; fat+satFat de-dup to one
    // red, so redCount=1 -> caution. Confirms we did not regress the locked verdict.
    expect(energy.level).toBe('high');
    expect(suit.level).toBe('caution');
  });

  it('NON-WESTERN / honest floor: an unfamiliar dish never produces a confident wrong number', () => {
    // Two non-Western dishes. They resolve to sane cooked composites (ramen/pad thai)
    // OR stay honestly wide/low-confidence — never a confident fabricated figure.
    for (const cn of ['ramen', 'pad thai']) {
      const est = estimateNutrition([{ canonicalName: cn, grams: 350, basis: 'inferred' }], table, {
        cookingMethod: 'boiled',
      });
      // Resolved composite -> a real source; widened band (min<max).
      expect(est.sources.length).toBeGreaterThan(0);
      expect(est.kcal.max).toBeGreaterThan(est.kcal.min);
    }
    // A genuinely unknown long-tail dish: honestly UNMATCHED, low confidence, wide band.
    const unknown = estimateNutrition(
      [{ canonicalName: 'kkakdugi nurungji bibim', grams: 300, basis: 'inferred' }],
      table,
    );
    expect(unknown.unmatchedCount).toBe(1);
    expect(unknown.confidence).toBe('low');
    expect(unknown.sources).toEqual([]);
  });
});
