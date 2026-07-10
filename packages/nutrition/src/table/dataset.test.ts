/**
 * Coverage tests for the PRODUCTION-DEFAULT dataset (curated + generated CIQUAL/USDA),
 * exercised through the real engine. These assert that common European restaurant
 * dishes resolve their ingredients, produce sane RANGES, and trace to real sources —
 * the honesty contract — rather than pinning brittle exact figures (the underlying
 * source numbers can shift on a dataset bump; the contract must not).
 */
import { describe, expect, it } from 'vitest';
import type { IngredientGuess } from '@bocado/shared';
import { createMemoryTable, DEFAULT_FOODS } from './memoryTable';
import { CURATED_FOODS } from './foods.curated';
import { GENERATED_FOODS } from './foods.generated';
import { estimateNutrition } from '../compute/estimate';
import { rateNutrients } from '../rate/nutrients';

const table = createMemoryTable(); // default = broad dataset

/** Every nutrient range must be well-formed: unit, non-negative, min<=max, finite. */
function expectValidEstimate(est: ReturnType<typeof estimateNutrition>): void {
  for (const r of [est.kcal, est.protein, est.fat, est.salt]) {
    expect(typeof r.unit).toBe('string');
    expect(r.unit.length).toBeGreaterThan(0);
    expect(r.min).toBeGreaterThanOrEqual(0);
    expect(r.max).toBeGreaterThanOrEqual(r.min);
    expect(Number.isFinite(r.min)).toBe(true);
    expect(Number.isFinite(r.max)).toBe(true);
  }
}

describe('default dataset — composition + integrity', () => {
  it('defaults to the broad dataset (curated + generated), not the seed fixture', () => {
    expect(table.size()).toBe(DEFAULT_FOODS.length);
    // Far broader than the ~30-row seed fixture.
    expect(table.size()).toBeGreaterThan(500);
  });

  it('ships a sizeable curated set and a sizeable generated set', () => {
    expect(CURATED_FOODS.length).toBeGreaterThanOrEqual(100);
    expect(GENERATED_FOODS.length).toBeGreaterThan(500);
  });

  it('has no duplicate record ids and every record carries a valid Per100g', () => {
    const ids = new Set<string>();
    for (const r of DEFAULT_FOODS) {
      expect(ids.has(r.id)).toBe(false);
      ids.add(r.id);
      const p = r.per100g;
      for (const k of ['kcal', 'protein', 'fat', 'salt'] as const) {
        expect(Number.isFinite(p[k])).toBe(true);
        expect(p[k]).toBeGreaterThanOrEqual(0);
      }
      // Sanity bounds (pure fat ~884 kcal; macros/salt per 100 g are bounded).
      expect(p.kcal).toBeLessThanOrEqual(950);
      expect(p.fat).toBeLessThanOrEqual(100);
      expect(p.salt).toBeLessThanOrEqual(100);
    }
  });

  it('tags every source row with an auditable db (CIQUAL/USDA)', () => {
    for (const r of DEFAULT_FOODS) {
      expect(['CIQUAL', 'USDA', 'OFF', 'API']).toContain(r.db);
    }
  });
});

/**
 * Eight common dishes, each a realistic per-portion ingredient breakdown. We assert
 * the honesty invariants + loose, forgiving kcal sanity bounds so the suite survives
 * a dataset refresh without going green-but-meaningless.
 */
interface DishCase {
  label: string;
  ingredients: IngredientGuess[];
  kcalMin: number;
  kcalMax: number;
}

const DISHES: DishCase[] = [
  {
    label: 'paella (rice, prawns, chicken, peas, tomato)',
    ingredients: [
      { name: 'rice', grams: 200 },
      { name: 'prawns', grams: 80 },
      { name: 'chicken', grams: 90 },
      { name: 'peas', grams: 40 },
      { name: 'tomato', grams: 40 },
      { name: 'olive oil', grams: 12 },
    ],
    kcalMin: 350,
    kcalMax: 1100,
  },
  {
    label: 'pizza margherita (base, tomato sauce, mozzarella)',
    ingredients: [
      { name: 'pizza base', grams: 200 },
      { name: 'tomato sauce', grams: 80 },
      { name: 'mozzarella', grams: 100 },
    ],
    kcalMin: 450,
    kcalMax: 1300,
  },
  {
    label: 'caesar salad (lettuce, chicken, parmesan, croutons, dressing)',
    ingredients: [
      { name: 'lettuce', grams: 120 },
      { name: 'chicken', grams: 100 },
      { name: 'parmesan', grams: 20 },
      { name: 'croutons', grams: 25 },
      { name: 'vinaigrette', grams: 25 },
    ],
    kcalMin: 250,
    kcalMax: 900,
  },
  {
    label: 'cheeseburger with fries (beef, cheese, bread, fries)',
    ingredients: [
      { name: 'ground beef', grams: 150 },
      { name: 'cheese', grams: 30 },
      { name: 'bread', grams: 90 },
      { name: 'french fries', grams: 150 },
    ],
    kcalMin: 700,
    kcalMax: 1900,
  },
  {
    label: 'spaghetti bolognese (pasta, beef, tomato sauce)',
    ingredients: [
      { name: 'pasta', grams: 220 },
      { name: 'ground beef', grams: 120 },
      { name: 'tomato sauce', grams: 100 },
    ],
    kcalMin: 450,
    kcalMax: 1300,
  },
  {
    label: 'grilled salmon with potato (salmon, potato, olive oil)',
    ingredients: [
      { name: 'salmon', grams: 180 },
      { name: 'potato', grams: 200 },
      { name: 'olive oil', grams: 10 },
    ],
    kcalMin: 450,
    kcalMax: 1200,
  },
  {
    label: 'spanish omelette (egg, potato, onion)',
    ingredients: [
      { name: 'egg', grams: 150 },
      { name: 'potato', grams: 150 },
      { name: 'onion', grams: 40 },
      { name: 'olive oil', grams: 15 },
    ],
    kcalMin: 300,
    kcalMax: 1000,
  },
  {
    label: 'lentil stew (lentils, carrot, onion, chorizo)',
    ingredients: [
      { name: 'lentils', grams: 250 },
      { name: 'carrot', grams: 60 },
      { name: 'onion', grams: 50 },
      { name: 'chorizo', grams: 40 },
    ],
    kcalMin: 300,
    kcalMax: 1100,
  },
];

describe('default dataset — common dish coverage', () => {
  for (const dish of DISHES) {
    describe(dish.label, () => {
      const est = estimateNutrition(dish.ingredients, table);

      it('resolves every ingredient (no unmatched)', () => {
        expect(est.unmatchedCount).toBe(0);
      });

      it('produces a well-formed widening estimate', () => {
        expectValidEstimate(est);
        expect(est.kcal.max).toBeGreaterThan(est.kcal.min);
      });

      it('lands in a sane kcal band for the portion', () => {
        expect(est.kcal.min).toBeGreaterThan(dish.kcalMin);
        expect(est.kcal.max).toBeLessThan(dish.kcalMax);
      });

      it('traces to real sources and is not low confidence', () => {
        expect(est.sources.length).toBeGreaterThan(0);
        for (const s of est.sources) {
          expect(['CIQUAL', 'USDA', 'OFF', 'API']).toContain(s.db);
          expect(s.recordId.length).toBeGreaterThan(0);
        }
        // Full coverage of well-known ingredients -> never the 'low' floor.
        expect(est.confidence).not.toBe('low');
      });

      it('emits a per-nutrient light row consistent with the estimate', () => {
        const lights = rateNutrients(est);
        // calories, protein, fat and salt are always present.
        const keys = lights.map((l) => l.key);
        expect(keys).toContain('calories');
        expect(keys).toContain('protein');
        expect(keys).toContain('fat');
        expect(keys).toContain('salt');
      });
    });
  }
});
