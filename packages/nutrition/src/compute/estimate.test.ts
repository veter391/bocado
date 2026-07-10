import { describe, expect, it } from 'vitest';
import type { IngredientGuess } from '@bocado/shared';
import type { FoodRecord } from '../types';
import { createMemoryTable, seedFixtureTable as seedTable } from '../table/memoryTable';
import { estimateNutrition } from './estimate';

// These tests pin behaviour to the SEED FIXTURE (specific `seed-*` record ids and
// counts), so they run against `seedFixtureTable` rather than the broad default
// dataset. New coverage against the production default lives in dataset.test.ts.

/** A nutrient point estimate should sit inside its reported range. */
function contains(range: { min: number; max: number }, point: number): boolean {
  return point >= range.min && point <= range.max;
}

/** Width of a range relative to its midpoint (0 when the range is a point at 0). */
function relativeWidth(range: { min: number; max: number }): number {
  const mid = (range.min + range.max) / 2;
  return mid === 0 ? 0 : (range.max - range.min) / mid;
}

describe('estimateNutrition — fully matched simple dish', () => {
  // chicken 150g + white rice 120g + olive oil 10g, all exact seed matches.
  const dish: IngredientGuess[] = [
    { name: 'chicken', grams: 150 },
    { name: 'rice', grams: 120 },
    { name: 'olive oil', grams: 10 },
  ];

  it('produces a sane kcal range that brackets the deterministic point sum', () => {
    // Point sum: chicken 165*1.5 + rice 130*1.2 + oil 884*0.1 = 491.9 kcal.
    const est = estimateNutrition(dish, seedTable);
    expect(est.kcal.unit).toBe('kcal');
    expect(contains(est.kcal, 491.9)).toBe(true);
    // A realistic plate of this size lands a few hundred kcal — sanity bounds.
    expect(est.kcal.min).toBeGreaterThan(300);
    expect(est.kcal.max).toBeLessThan(700);
    // It is a RANGE, never a hard number.
    expect(est.kcal.max).toBeGreaterThan(est.kcal.min);
  });

  it('reports high confidence when coverage and match scores are perfect', () => {
    const est = estimateNutrition(dish, seedTable);
    expect(est.confidence).toBe('high');
    expect(est.unmatchedCount).toBe(0);
  });

  it('lists unique matched records as sources with db + recordId + name', () => {
    const est = estimateNutrition(dish, seedTable);
    expect(est.sources).toHaveLength(3);
    const ids = est.sources.map((s) => s.recordId).sort();
    expect(ids).toEqual(['seed-chicken', 'seed-olive-oil', 'seed-rice']);
    for (const s of est.sources) {
      expect(s.db).toMatch(/CIQUAL|USDA/);
      expect(typeof s.name).toBe('string');
    }
  });

  it('emits grams for macros and salt with correct units', () => {
    const est = estimateNutrition(dish, seedTable);
    expect(est.protein.unit).toBe('g');
    expect(est.fat.unit).toBe('g');
    expect(est.salt.unit).toBe('g');
    // protein point: chicken 31*1.5 + rice 2.7*1.2 + oil 0 = 49.74 g.
    expect(contains(est.protein, 49.74)).toBe(true);
  });
});

describe('estimateNutrition — salt summation', () => {
  it('sums salt across ingredients, not just the first', () => {
    // bread (salt 1.2/100g) 100g + cheese (salt 1.8/100g) 50g.
    // salt point = 1.2*1.0 + 1.8*0.5 = 2.1 g.
    const est = estimateNutrition(
      [
        { name: 'bread', grams: 100 },
        { name: 'cheese', grams: 50 },
      ],
      seedTable,
    );
    expect(est.salt.unit).toBe('g');
    expect(contains(est.salt, 2.1)).toBe(true);
    expect(est.salt.min).toBeGreaterThan(0);
  });
});

describe('estimateNutrition — unknown ingredient', () => {
  const matchedOnly: IngredientGuess[] = [{ name: 'chicken', grams: 150 }];
  const withUnknown: IngredientGuess[] = [
    { name: 'chicken', grams: 150 },
    // ~unresolvable in the seed table, and a large share of the mass.
    { name: 'zorblax mystery sauce', grams: 150 },
  ];

  it('widens the kcal range and lowers confidence vs the fully-matched version', () => {
    const clean = estimateNutrition(matchedOnly, seedTable);
    const dirty = estimateNutrition(withUnknown, seedTable);

    // The unknown is half the grams -> coverage 0.5 -> range must widen.
    expect(relativeWidth(dirty.kcal)).toBeGreaterThan(relativeWidth(clean.kcal));
    // Confidence degrades when half the mass is unaccounted for.
    expect(clean.confidence).toBe('high');
    expect(dirty.confidence).not.toBe('high');
  });

  it('counts the unknown and never fabricates a value for it', () => {
    const dirty = estimateNutrition(withUnknown, seedTable);
    expect(dirty.unmatchedCount).toBe(1);
    // Only the chicken contributes a source — nothing invented for the unknown.
    expect(dirty.sources).toHaveLength(1);
    expect(dirty.sources[0]?.recordId).toBe('seed-chicken');
  });

  it('does not drop the unknown grams from the coverage denominator', () => {
    // If unknown grams were silently dropped, coverage would be 1.0 and the
    // range would match the clean estimate. It must not.
    const clean = estimateNutrition(matchedOnly, seedTable);
    const dirty = estimateNutrition(withUnknown, seedTable);
    expect(dirty.kcal.max - dirty.kcal.min).toBeGreaterThan(clean.kcal.max - clean.kcal.min);
  });
});

describe('estimateNutrition — empty / degenerate input', () => {
  it('returns all-zero ranges, low confidence, and no sources for empty input', () => {
    const est = estimateNutrition([], seedTable);
    expect(est.confidence).toBe('low');
    expect(est.sources).toEqual([]);
    expect(est.unmatchedCount).toBe(0);
    for (const r of [est.kcal, est.protein, est.fat, est.salt]) {
      expect(r.min).toBe(0);
      expect(r.max).toBe(0);
    }
    // Optional nutrients are omitted entirely when nothing contributed them.
    expect(est.carbs).toBeUndefined();
    expect(est.sugar).toBeUndefined();
    expect(est.satFat).toBeUndefined();
  });

  it('treats non-positive / non-finite grams as zero mass without crashing', () => {
    const est = estimateNutrition(
      [
        { name: 'chicken', grams: 0 },
        { name: 'rice', grams: -50 },
        { name: 'olive oil', grams: Number.NaN },
      ],
      seedTable,
    );
    // Matched records (so sources/coverage exist) but zero contributed mass.
    expect(est.kcal.min).toBe(0);
    expect(est.kcal.max).toBe(0);
    expect(est.unmatchedCount).toBe(0);
  });

  it('handles an all-unknown dish: zero values, zero sources, low confidence', () => {
    const est = estimateNutrition([{ name: 'totally unknown thing', grams: 200 }], seedTable);
    expect(est.confidence).toBe('low');
    expect(est.sources).toEqual([]);
    expect(est.unmatchedCount).toBe(1);
    expect(est.kcal.max).toBe(0);
  });
});

describe('estimateNutrition — cooking yield is not double-applied', () => {
  it('does not re-apply a raw->cooked yield to an already-cooked record', () => {
    // seed-chicken is state:'cooked'. 100g must equal exactly per-100g values,
    // with no shrink factor inflating the density.
    const est = estimateNutrition([{ name: 'chicken', grams: 100 }], seedTable);
    // point = 165 kcal; with base uncertainty 0.1 -> [148.5, 181.5].
    expect(contains(est.kcal, 165)).toBe(true);
    // If a 0.75 meat yield had been wrongly applied, density would rise ~33%
    // and the point would be ~220 kcal, pushing min above 165.
    expect(est.kcal.min).toBeLessThan(165);
  });

  it('applies yield to a RAW-categorized record so served grams scale correctly', () => {
    // Build a raw meat record to prove the raw path engages (seed meat is cooked).
    const rawBeef: FoodRecord = {
      id: 'test-raw-beef',
      db: 'USDA',
      name: 'raw beef',
      category: 'meat',
      state: 'raw',
      per100g: { kcal: 250, protein: 26, fat: 15, salt: 0.1 },
    };
    const table = createMemoryTable([rawBeef]);
    // 75g cooked -> raw-equivalent 75 / 0.75 = 100g -> 250 kcal point.
    const est = estimateNutrition([{ name: 'raw beef', grams: 75 }], table);
    expect(contains(est.kcal, 250)).toBe(true);
    // Without yield, 75g would be 187.5 kcal; the yield must push the point up.
    expect(est.kcal.max).toBeGreaterThan(200);
  });
});

describe('estimateNutrition — physical-plausibility guards (never absurd)', () => {
  // A calorie-dense record; with crazy grams this would explode without the guards.
  const denseRice: FoodRecord = {
    id: 'x-rice', db: 'USDA', name: 'rice', category: 'grain', state: 'raw',
    per100g: { kcal: 360, protein: 7, fat: 1, carbs: 80, salt: 0 },
  };
  const cheese: FoodRecord = {
    id: 'x-cheese', db: 'USDA', name: 'cheese', category: 'dairy', state: 'raw',
    per100g: { kcal: 400, protein: 25, fat: 33, satFat: 21, salt: 1.8 },
  };
  const butter: FoodRecord = {
    id: 'x-butter', db: 'USDA', name: 'butter', category: 'fat', state: 'raw',
    per100g: { kcal: 717, protein: 1, fat: 81, satFat: 51, salt: 0.1 },
  };
  const table = createMemoryTable([denseRice, cheese, butter]);

  it('caps a wildly over-portioned dish (the "4000 kcal risotto" case) to a sane range', () => {
    // Absurd guesses: 2 kg rice + 1 kg cheese + 0.5 kg butter. Unclamped this is
    // many thousands of kcal; the guards must bring it back to one plausible plate.
    const est = estimateNutrition(
      [
        { name: 'rice', grams: 2000 },
        { name: 'cheese', grams: 1000 },
        { name: 'butter', grams: 500 },
      ],
      table,
    );
    expect(est.kcal.max).toBeLessThanOrEqual(1900); // absolute ceiling
    expect(est.kcal.min).toBeGreaterThanOrEqual(0);
    expect(est.fat.max).toBeLessThanOrEqual(160);
    expect(est.salt.max).toBeLessThanOrEqual(22);
    // Macros stay coherent (scaled together), never NaN/negative.
    for (const r of [est.kcal, est.protein, est.fat, est.salt]) {
      expect(Number.isFinite(r.min)).toBe(true);
      expect(Number.isFinite(r.max)).toBe(true);
      expect(r.min).toBeLessThanOrEqual(r.max);
    }
  });

  it('never emits NaN/Infinity even for garbage grams', () => {
    const garbage: IngredientGuess[] = [
      { name: 'rice', grams: Number.POSITIVE_INFINITY },
      { name: 'cheese', grams: -50 },
      { name: 'butter', grams: NaN },
    ];
    const est = estimateNutrition(garbage, table);
    for (const r of [est.kcal, est.protein, est.fat, est.salt]) {
      expect(Number.isFinite(r.min)).toBe(true);
      expect(Number.isFinite(r.max)).toBe(true);
      expect(r.min).toBeGreaterThanOrEqual(0);
    }
  });

  it('leaves a normal, plausible dish unscaled (guards do not distort real data)', () => {
    // ~90g rice + 30g cheese + 10g butter — a realistic risotto serving.
    const est = estimateNutrition(
      [
        { name: 'rice', grams: 90 },
        { name: 'cheese', grams: 30 },
        { name: 'butter', grams: 10 },
      ],
      table,
    );
    // Point ~ 360*0.9 + 400*0.3 + 717*0.1 ≈ 515 kcal — well under the cap, untouched.
    expect(est.kcal.max).toBeLessThan(900);
    expect(est.kcal.min).toBeGreaterThan(200);
  });
});

describe('estimateNutrition — guard-fired confidence + widening (per-guard)', () => {
  const denseRice: FoodRecord = {
    id: 'g-rice', db: 'USDA', name: 'rice', category: 'grain', state: 'cooked',
    per100g: { kcal: 130, protein: 2.7, fat: 0.3, carbs: 28, salt: 0 },
  };
  const butter: FoodRecord = {
    id: 'g-butter', db: 'USDA', name: 'butter', category: 'fat', state: 'raw',
    per100g: { kcal: 717, protein: 1, fat: 81, satFat: 51, salt: 0.1 },
  };
  const table = createMemoryTable([denseRice, butter]);

  /** Relative width of a range about its midpoint. */
  function relWidth(r: { min: number; max: number }): number {
    const mid = (r.min + r.max) / 2;
    return mid === 0 ? 0 : (r.max - r.min) / mid;
  }

  it('GUARD 1 (per-ingredient grams cap) caps confidence at medium + widens', () => {
    // 200 g rice is a clean, perfectly-matched, plausible dish -> high confidence.
    const clean = estimateNutrition([{ name: 'rice', grams: 200 }], table);
    expect(clean.confidence).toBe('high');
    // 900 g rice exceeds MAX_INGREDIENT_GRAMS (450): guard 1 fires in-loop. It does
    // NOT trip the dish-mass/energy guards (capped at 450 g, ~585 kcal), so this
    // isolates guard 1. Confidence must drop to medium and the band must widen.
    const capped = estimateNutrition([{ name: 'rice', grams: 900 }], table);
    expect(capped.confidence).toBe('medium');
    expect(relWidth(capped.kcal)).toBeGreaterThan(relWidth(clean.kcal));
  });

  it('GUARDS 2 & 3 (dish mass / energy scale) cap confidence at medium + widen', () => {
    // Many ingredients each under the per-ingredient cap, but together implausible:
    // total mass / energy guard scales the whole vector (sanityScale < 1).
    // butter 5 g is under the tight fat prior (20 g), so the clean dish trips NO guard
    // (the per-category clamp now bounds butter at 20 g — see priors.ts). Using 30 g
    // here would itself clamp and defeat the "clean baseline" purpose of this case.
    const clean = estimateNutrition(
      [{ name: 'rice', grams: 200 }, { name: 'butter', grams: 5 }],
      table,
    );
    const scaled = estimateNutrition(
      [
        { name: 'rice', grams: 400 }, { name: 'rice', grams: 400 },
        { name: 'rice', grams: 400 }, { name: 'butter', grams: 400 },
      ],
      table,
    );
    expect(scaled.confidence).toBe('medium'); // never 'high' once a guard fired
    expect(relWidth(scaled.kcal)).toBeGreaterThan(relWidth(clean.kcal));
  });

  it('no guard firing leaves a clean dish at high confidence (regression)', () => {
    const est = estimateNutrition(
      [{ name: 'rice', grams: 150 }, { name: 'butter', grams: 5 }],
      table,
    );
    expect(est.confidence).toBe('high');
  });
});

describe('estimateNutrition — per-category portion priors (the fat fix)', () => {
  const oil: FoodRecord = {
    id: 'p-oil', db: 'CIQUAL', name: 'olive oil', category: 'oil', state: 'raw',
    per100g: { kcal: 884, protein: 0, fat: 100, satFat: 14, salt: 0 },
  };
  const meat: FoodRecord = {
    id: 'p-meat', db: 'USDA', name: 'beef steak', category: 'meat', state: 'cooked',
    per100g: { kcal: 250, protein: 26, fat: 15, satFat: 6, salt: 0.1 },
  };
  const pasta: FoodRecord = {
    id: 'p-pasta', db: 'CIQUAL', name: 'pasta', category: 'grain', state: 'cooked',
    per100g: { kcal: 157, protein: 5.8, fat: 0.9, carbs: 31, salt: 0 },
  };
  const mystery: FoodRecord = {
    id: 'p-other', db: 'USDA', name: 'mystery thing', category: 'other', state: 'cooked',
    per100g: { kcal: 100, protein: 2, fat: 2, salt: 0.1 },
  };
  const table = createMemoryTable([oil, meat, pasta, mystery]);

  it('clamps an over-guessed OIL line to the 20 g prior (not 100 g) and widens', () => {
    // 100 g oil would be 100 g fat; the oil prior (max 20 g) holds it to ~20 g fat.
    const est = estimateNutrition([{ name: 'olive oil', grams: 100 }], table);
    // Clamped to ~20 g fat (the oil prior), not the 100 g a raw 100 g guess implies.
    // The point is ~20 g; the widened band tops out well under the unclamped 100 g.
    expect((est.fat.min + est.fat.max) / 2).toBeLessThanOrEqual(21);
    expect(est.fat.max).toBeLessThan(35);
    expect(est.confidence).not.toBe('high'); // guard fired -> capped
  });

  it('clamps MEAT to the 300 g prior and PASTA to the 480 g prior', () => {
    const bigMeat = estimateNutrition([{ name: 'beef steak', grams: 900 }], table);
    // 300 g cooked beef ~ 45 g fat (15/100 * 300); not the 135 g a 900 g guess implies.
    expect(bigMeat.fat.max).toBeLessThan(70);

    const bigPasta = estimateNutrition([{ name: 'pasta', grams: 900 }], table);
    // 480 g pasta clamp -> guard fired -> confidence capped.
    expect(bigPasta.confidence).not.toBe('high');
  });

  it('keeps the 450 g global fallback for an unknown / "other" category line', () => {
    // 'other' prior max is 300 g; 280 g is under it -> no guard.
    const ok = estimateNutrition([{ name: 'mystery thing', grams: 280 }], table);
    expect(ok.confidence).toBe('high');
    // 320 g exceeds the 'other' prior (300) -> guard fires.
    const over = estimateNutrition([{ name: 'mystery thing', grams: 320 }], table);
    expect(over.confidence).not.toBe('high');
  });

  it('a truly UNMATCHED line keeps the 450 g global cap (cannot dominate)', () => {
    const est = estimateNutrition([{ name: 'zzz unknown xyz', grams: 9000 }], table);
    // Unmatched -> no nutrients, but the grams are capped at 450 in the denominator.
    expect(est.unmatchedCount).toBe(1);
    expect(est.kcal.max).toBe(0);
  });
});

describe('estimateNutrition — deep-fry absorption (fried fat scales with the item)', () => {
  const squid: FoodRecord = {
    id: 'f-squid', db: 'CIQUAL', name: 'squid', category: 'seafood', state: 'cooked',
    per100g: { kcal: 92, protein: 16, fat: 1.4, salt: 0.4 },
  };
  const batter: FoodRecord = {
    id: 'f-batter', db: 'USDA', name: 'batter', category: 'fried', state: 'cooked',
    per100g: { kcal: 320, protein: 8, fat: 6, satFat: 1, carbs: 58, salt: 1 },
  };
  const table = createMemoryTable([squid, batter]);

  it('adds absorbed fat for a deep-fried dish (honestly high), no oil line needed', () => {
    const plain = estimateNutrition([{ name: 'squid', grams: 150 }, { name: 'batter', grams: 40 }], table, {
      cookingMethod: 'unknown',
    });
    const fried = estimateNutrition([{ name: 'squid', grams: 150 }, { name: 'batter', grams: 40 }], table, {
      cookingMethod: 'deep-fried',
    });
    // Frying adds ~15% of fried mass (190 g) ~ 28 g fat on top of the base.
    const plainFat = (plain.fat.min + plain.fat.max) / 2;
    const friedFat = (fried.fat.min + fried.fat.max) / 2;
    expect(friedFat).toBeGreaterThan(plainFat + 15);
    expect(fried.confidence).not.toBe('high'); // modelled fat -> wider band, capped
  });

  it('does NOT stack an oil line on top of absorbed fat (oil dropped when frying)', () => {
    const withOil = estimateNutrition(
      [
        { name: 'squid', grams: 150 },
        { name: 'batter', grams: 40 },
        { name: 'olive oil', grams: 20, isAddedFat: true },
      ],
      createMemoryTable([squid, batter, {
        id: 'f-oil', db: 'CIQUAL', name: 'olive oil', category: 'oil', state: 'raw',
        per100g: { kcal: 884, protein: 0, fat: 100, salt: 0 },
      }]),
      { cookingMethod: 'deep-fried' },
    );
    const noOil = estimateNutrition(
      [{ name: 'squid', grams: 150 }, { name: 'batter', grams: 40 }],
      table,
      { cookingMethod: 'deep-fried' },
    );
    // The oil line is dropped, so the two are within the band noise of each other —
    // absorbed fat carries the fried fat exactly once.
    const a = (withOil.fat.min + withOil.fat.max) / 2;
    const b = (noOil.fat.min + noOil.fat.max) / 2;
    expect(Math.abs(a - b)).toBeLessThan(5);
  });
});

describe('estimateNutrition — confidence policy (inferred / API)', () => {
  const chicken: FoodRecord = {
    id: 'c-chicken', db: 'CIQUAL', name: 'chicken', category: 'meat', state: 'cooked',
    per100g: { kcal: 165, protein: 31, fat: 3.6, satFat: 1, salt: 0.1 },
  };
  const apiRow: FoodRecord = {
    id: 'usda-fdc-9999', db: 'API', name: 'exotic stew', category: 'other', state: 'cooked',
    per100g: { kcal: 120, protein: 6, fat: 4, salt: 0.5 },
  };
  const table = createMemoryTable([chicken, apiRow]);

  it('basis="inferred" dominating (> 60% grams) caps confidence at low', () => {
    const est = estimateNutrition(
      [
        { canonicalName: 'chicken', grams: 30, basis: 'read' },
        { canonicalName: 'chicken', grams: 120, basis: 'inferred' },
      ],
      table,
    );
    expect(est.confidence).toBe('low');
  });

  it('an explicit "read" basis dish is not penalised for being inferred', () => {
    const est = estimateNutrition([{ canonicalName: 'chicken', grams: 150, basis: 'read' }], table);
    expect(est.confidence).toBe('high');
  });

  it('an API-sourced (db:"API") match widens uncertainty and caps confidence at medium', () => {
    const est = estimateNutrition([{ canonicalName: 'exotic stew', grams: 250, basis: 'read' }], table);
    expect(est.confidence).not.toBe('high');
    expect(est.sources[0]?.db).toBe('API');
  });
});

describe('estimateNutrition — honest uncertainty (sparse / unreliable dishes)', () => {
  // Records for the uncertainty corpus. A plain croquette filling (potato + bechamel)
  // is NOT category 'fried' and has no batter name, so for a deep-fried dish no
  // qualifying fried mass is found -> the absorbed-fat branch never runs.
  const potato: FoodRecord = {
    id: 'u-potato', db: 'CIQUAL', name: 'potato', category: 'tuber', state: 'cooked',
    per100g: { kcal: 87, protein: 2, fat: 0.1, satFat: 0, carbs: 20, salt: 0.01 },
  };
  const bechamel: FoodRecord = {
    id: 'u-bechamel', db: 'CIQUAL', name: 'bechamel', category: 'dairy', state: 'cooked',
    per100g: { kcal: 130, protein: 4, fat: 8, satFat: 5, carbs: 9, salt: 0.5 },
  };
  const lettuce: FoodRecord = {
    id: 'u-lettuce', db: 'CIQUAL', name: 'lettuce', category: 'vegetable', state: 'raw',
    per100g: { kcal: 15, protein: 1.4, fat: 0.2, carbs: 2.9, salt: 0.01 },
  };
  const chicken: FoodRecord = {
    id: 'u-chicken', db: 'CIQUAL', name: 'chicken', category: 'meat', state: 'cooked',
    per100g: { kcal: 165, protein: 31, fat: 3.6, satFat: 1, salt: 0.1 },
  };
  const squid: FoodRecord = {
    id: 'u-squid', db: 'CIQUAL', name: 'squid', category: 'seafood', state: 'cooked',
    per100g: { kcal: 92, protein: 16, fat: 1.4, salt: 0.4 },
  };
  const batter: FoodRecord = {
    id: 'u-batter', db: 'USDA', name: 'batter', category: 'other', state: 'cooked',
    per100g: { kcal: 320, protein: 8, fat: 6, satFat: 1, carbs: 58, salt: 1 },
  };
  const friedFries: FoodRecord = {
    id: 'u-fries', db: 'USDA', name: 'french fries', category: 'fried', state: 'cooked',
    per100g: { kcal: 312, protein: 3.4, fat: 15, satFat: 2.3, carbs: 41, salt: 0.5 },
  };
  const table = createMemoryTable([
    potato, bechamel, lettuce, chicken, squid, batter, friedFries,
  ]);

  // 1) FULLY-MATCHED SIMPLE control (raw salad) — high confidence, NOT uncertain.
  it('control: a fully-matched raw salad is high confidence and NOT uncertain', () => {
    const est = estimateNutrition([{ name: 'lettuce', grams: 120, basis: 'read' }], table, {
      cookingMethod: 'raw',
    });
    expect(est.confidence).toBe('high');
    expect(est.uncertain).toBe(false);
    expect(est.uncertaintyReason).toBeUndefined();
    // No display widening on a trustworthy estimate.
    expect(est.fat.displayMax).toBeUndefined();
  });

  // 2) GRILLED FISH-style control (well-matched, non-frying) — not uncertain.
  it('control: a well-matched grilled main is NOT uncertain', () => {
    const est = estimateNutrition([{ name: 'chicken', grams: 160, basis: 'read' }], table, {
      cookingMethod: 'grilled',
    });
    expect(est.confidence).toBe('high');
    expect(est.uncertain).toBe(false);
  });

  // 3) DEEP-FRIED CROQUETTES sparse: deep-fried method, but matched mass is plain
  //    potato + bechamel (neither category 'fried' nor batter-named) -> no fried mass
  //    -> friedButNoFriedMass fires. Coverage is HIGH (records matched), so it is NOT
  //    caught by mostlyUnaccounted — exactly the croquettes falsehood we close.
  it('deep-fried croquettes with no fried mass -> uncertain (fried-no-mass), fat reads low but flagged', () => {
    const est = estimateNutrition(
      [
        { name: 'potato', grams: 120, basis: 'read' },
        { name: 'bechamel', grams: 60, basis: 'read' },
      ],
      table,
      { cookingMethod: 'deep-fried' },
    );
    expect(est.uncertain).toBe(true);
    expect(est.uncertaintyReason).toBe(
      'We could not confirm how much oil this fried dish soaked up, so the numbers may read low.',
    );
    // Coverage is full (both matched) so this is NOT the mostly-unaccounted branch.
    expect(est.unmatchedCount).toBe(0);
    // The honest upper edge stretches UP (displayMax > max); min and point unchanged.
    expect(est.fat.displayMax).toBeGreaterThan(est.fat.max);
  });

  // 4) DEEP-FRIED + BATTER control (no over-fire): batter name matches isBatterOrFried,
  //    so sawFriedComponent=true and absorption fires -> NOT uncertain via fry trigger.
  it('control: deep-fried squid + batter (fried mass present) is NOT uncertain', () => {
    const est = estimateNutrition(
      [
        { name: 'squid', grams: 150, basis: 'read' },
        { name: 'batter', grams: 40, basis: 'read' },
      ],
      table,
      { cookingMethod: 'deep-fried' },
    );
    // Absorption fired -> guard bump caps confidence below high, but the fry trigger
    // did NOT fire (a fried component was found), and coverage is full.
    expect(est.uncertain).toBe(false);
  });

  // 4b) category-'fried' french fries also satisfy sawFriedComponent (no over-fire).
  it('control: deep-fried french fries (category fried) is NOT uncertain', () => {
    const est = estimateNutrition([{ name: 'french fries', grams: 150, basis: 'read' }], table, {
      cookingMethod: 'deep-fried',
    });
    expect(est.uncertain).toBe(false);
  });

  // 5) MOSTLY-UNMATCHED STEW: a small matched garnish, the main is unmatched ->
  //    coverage < 0.6 with unmatchedCount > 0 -> mostlyUnaccounted fires.
  it('mostly-unmatched stew -> uncertain (mostly-unaccounted)', () => {
    const est = estimateNutrition(
      [
        { name: 'lettuce', grams: 30, basis: 'read' }, // small matched garnish
        { name: 'zorblax mystery main', grams: 250, basis: 'read' }, // unmatched main
      ],
      table,
      { cookingMethod: 'stewed' },
    );
    expect(est.unmatchedCount).toBe(1);
    expect(est.confidence).toBe('low');
    expect(est.uncertain).toBe(true);
    // confidence is low here too, but the fried branch did not fire; reason is the
    // mostly-unaccounted one only if confidence were not low. Priority: fried > unacc >
    // low-confidence. Here confidence==='low' AND mostlyUnaccounted, fried false.
    expect(est.uncertaintyReason).toBe(
      'We could not account for most of this plate, so this estimate is rough.',
    );
  });

  // 6) EMPTY INGREDIENTS — low confidence, uncertain, all-zero ranges (no fabrication).
  it('empty ingredients -> uncertain with all-zero ranges and no displayMax', () => {
    const est = estimateNutrition([], table, { cookingMethod: 'unknown' });
    expect(est.confidence).toBe('low');
    expect(est.uncertain).toBe(true);
    expect(est.uncertaintyReason).toBe('We could not read this dish clearly enough to be sure.');
    expect(est.kcal.min).toBe(0);
    expect(est.kcal.max).toBe(0);
    // A 0-point nutrient gets NO widened top — we never invent a positive figure.
    expect(est.kcal.displayMax).toBeUndefined();
  });

  // 7) LOW-COVERAGE NOT FRIED — coverage ~0.5, raw, unmatchedCount 1 -> uncertain.
  it('low-coverage raw dish (not fried) -> uncertain (mostly-unaccounted / low confidence)', () => {
    const est = estimateNutrition(
      [
        { name: 'lettuce', grams: 120, basis: 'read' },
        { name: 'unknown mystery', grams: 130, basis: 'read' },
      ],
      table,
      { cookingMethod: 'raw' },
    );
    expect(est.uncertain).toBe(true);
    expect(est.unmatchedCount).toBe(1);
  });

  // 10) INFERRED-DOMINATES — inferredFraction > 0.6 caps confidence at low -> uncertain.
  it('inferred-grams-dominated dish -> low confidence -> uncertain', () => {
    const est = estimateNutrition(
      [
        { canonicalName: 'chicken', grams: 30, basis: 'read' },
        { canonicalName: 'chicken', grams: 120, basis: 'inferred' },
      ],
      table,
      { cookingMethod: 'grilled' },
    );
    expect(est.confidence).toBe('low');
    expect(est.uncertain).toBe(true);
    // Not fried-no-mass (grilled), not mostly-unaccounted (full coverage) -> low-conf reason.
    expect(est.uncertaintyReason).toBe('We could not read this dish clearly enough to be sure.');
  });

  // 12) ASYMMETRY UNIT: for a fried-uncertain dish, fat.min is the symmetric baseline,
  //     fat.max is unchanged from symmetric, displayMax == clamp(point*(1+u+0.15)),
  //     and the deterministic point is unchanged (still inside [min,max]).
  it('uncertain asymmetry: min/max stay symmetric, displayMax stretches the top, point unchanged', () => {
    // Compare the SAME matched mass with a non-frying method (trustworthy baseline) vs a
    // deep-fried method with no fried mass (uncertain). The matched fat point is identical;
    // only the deep-fried one gains a displayMax.
    const baseline = estimateNutrition(
      [{ name: 'bechamel', grams: 60, basis: 'read' }],
      table,
      { cookingMethod: 'baked' }, // non-frying -> trustworthy, symmetric band
    );
    const uncertainEst = estimateNutrition(
      [{ name: 'bechamel', grams: 60, basis: 'read' }],
      table,
      { cookingMethod: 'deep-fried' }, // fried but no fried mass -> uncertain
    );
    expect(baseline.uncertain).toBe(false);
    expect(uncertainEst.uncertain).toBe(true);
    // min and max are byte-identical to the trustworthy baseline (point + symmetric band
    // unchanged — we never claim leaner, never inflate the point).
    expect(uncertainEst.fat.min).toBe(baseline.fat.min);
    expect(uncertainEst.fat.max).toBe(baseline.fat.max);
    // displayMax is strictly greater than max and absent on the baseline.
    expect(baseline.fat.displayMax).toBeUndefined();
    expect(uncertainEst.fat.displayMax).toBeGreaterThan(uncertainEst.fat.max);
  });
});

describe('estimateNutrition — purity (same input -> byte-identical output)', () => {
  it('is a pure function of its inputs', () => {
    const table = createMemoryTable([
      { id: 'pure-x', db: 'CIQUAL', name: 'tomato', category: 'vegetable', state: 'raw',
        per100g: { kcal: 18, protein: 0.9, fat: 0.2, carbs: 3.9, sugar: 2.6, salt: 0 } },
    ]);
    const input: IngredientGuess[] = [
      { canonicalName: 'tomato', grams: 200, basis: 'inferred' },
      { canonicalName: 'olive oil', grams: 12, basis: 'inferred', isAddedFat: true },
    ];
    const a = JSON.stringify(estimateNutrition(input, table, { cookingMethod: 'raw' }));
    const b = JSON.stringify(estimateNutrition(input, table, { cookingMethod: 'raw' }));
    expect(a).toBe(b);
  });
});
