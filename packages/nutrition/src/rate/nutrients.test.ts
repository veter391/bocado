import { describe, it, expect } from 'vitest';
import type { NutrientKey, NutrientLevel, NutritionEstimate, Range } from '@bocado/shared';
import { rateNutrients } from './nutrients';

/**
 * THRESHOLD UNIT TESTS — every cutoff pinned to its anchor.
 *
 * RED lines (cited UK FSA / DoH 2016 per-portion HIGH = >30% of the EU 1169/2011
 * Annex XIII RI): fat >21 g, satFat >6 g, sugar >27 g, salt >1.8 g.
 * GREEN ceilings (BOCADO guidance, 10% RI): fat 7, satFat 2, sugar 9, salt 0.6.
 * ENERGY light (BOCADO guidance, no FSA energy light): green ≤600, amber ≤800, red >800.
 * PROTEIN (BOCADO guidance, positive): good ≥15, OK 7.5..15, Low <7.5; never red.
 */

/** A nutrient range helper. */
function r(min: number, max: number, unit: string): Range {
  return { min, max, unit };
}

/**
 * Build a NutritionEstimate from ranges. Only the keys present in `opts` for the
 * optional nutrients (satFat, sugar) are set, so tests can verify "absent -> no row".
 */
function nutri(opts: {
  kcal: Range;
  protein: Range;
  fat: Range;
  salt: Range;
  satFat?: Range;
  sugar?: Range;
  carbs?: Range;
}): NutritionEstimate {
  return {
    kcal: opts.kcal,
    protein: opts.protein,
    fat: opts.fat,
    salt: opts.salt,
    ...(opts.satFat ? { satFat: opts.satFat } : {}),
    ...(opts.sugar ? { sugar: opts.sugar } : {}),
    ...(opts.carbs ? { carbs: opts.carbs } : {}),
    confidence: 'medium',
    sources: [],
  };
}

/** Find a light by its key (or fail loudly). */
function lightFor(lights: ReturnType<typeof rateNutrients>, key: NutrientKey) {
  const found = lights.find((l) => l.key === key);
  expect(found, `expected a light for ${key}`).toBeDefined();
  return found!;
}

/** A Carbonara-like main: heavy, fatty, salty, low sugar, good protein. */
function carbonara(): NutritionEstimate {
  return nutri({
    kcal: r(680, 820, 'kcal'), // mid 750 -> High (>800? no — 750 <=800 -> caution)
    protein: r(24, 30, 'g'), // mid 27   -> good (>=15)
    fat: r(38, 48, 'g'), // mid 43   -> High (>21)
    satFat: r(16, 20, 'g'), // mid 18   -> High (>6)
    sugar: r(3, 5, 'g'), // mid 4    -> good (<=9)
    salt: r(2.2, 3.0, 'g'), // mid 2.6  -> High (>1.8)
  });
}

/** A light salad: low everything, modest protein. */
function lightSalad(): NutritionEstimate {
  return nutri({
    kcal: r(160, 240, 'kcal'), // mid 200 -> good (<=600)
    protein: r(18, 26, 'g'), // mid 22  -> good (>=15)
    fat: r(4, 6, 'g'), // mid 5   -> good (<=7)
    satFat: r(1, 2, 'g'), // mid 1.5 -> good (<=2)
    sugar: r(3, 5, 'g'), // mid 4   -> good (<=9)
    salt: r(0.3, 0.5, 'g'), // mid 0.4 -> good (<=0.6)
  });
}

describe('rateNutrients — Carbonara-like estimate', () => {
  const lights = rateNutrients(carbonara());

  it('classifies each nutrient into the expected level/tag', () => {
    const cals = lightFor(lights, 'calories');
    // mid 750 is in the amber band (600 < 750 <= 800), not red.
    expect(cals.level).toBe<NutrientLevel>('caution');
    expect(cals.label).toBe('Calories');
    expect(cals.positive).toBe(false);

    const protein = lightFor(lights, 'protein');
    expect(protein.level).toBe<NutrientLevel>('good');
    expect(protein.tag).toBe('Good');
    expect(protein.positive).toBe(true);

    const fat = lightFor(lights, 'fat');
    expect(fat.level).toBe<NutrientLevel>('high');
    expect(fat.tag).toBe('High');

    const satFat = lightFor(lights, 'satFat');
    expect(satFat.level).toBe<NutrientLevel>('high');
    expect(satFat.tag).toBe('High');
    expect(satFat.label).toBe('Saturated fat');

    const sugar = lightFor(lights, 'sugar');
    expect(sugar.level).toBe<NutrientLevel>('good');
    expect(sugar.tag).toBe('Low');

    const salt = lightFor(lights, 'salt');
    expect(salt.level).toBe<NutrientLevel>('high');
    expect(salt.tag).toBe('High');
  });

  it('emits all six nutrients in the fixed order', () => {
    expect(lights.map((l) => l.key)).toEqual([
      'calories',
      'protein',
      'fat',
      'satFat',
      'sugar',
      'salt',
    ]);
  });

  it('attaches the estimate range to each light and a 5..100 fill', () => {
    const cals = lightFor(lights, 'calories');
    expect(cals.range).toEqual(r(680, 820, 'kcal'));
    for (const l of lights) {
      expect(l.fillPct).toBeGreaterThanOrEqual(5);
      expect(l.fillPct).toBeLessThanOrEqual(100);
    }
  });
});

describe('rateNutrients — light salad', () => {
  const lights = rateNutrients(lightSalad());

  it('reads as mostly good (every nutrient good)', () => {
    expect(lights.every((l) => l.level === 'good')).toBe(true);
  });

  it('protein still reads good (positive nutrient)', () => {
    const protein = lightFor(lights, 'protein');
    expect(protein.level).toBe<NutrientLevel>('good');
    expect(protein.positive).toBe(true);
  });
});

describe('rateNutrients — present-only (never fabricate)', () => {
  it('skips satFat and sugar when absent', () => {
    const lights = rateNutrients(
      nutri({
        kcal: r(400, 500, 'kcal'),
        protein: r(20, 24, 'g'),
        fat: r(10, 14, 'g'),
        salt: r(0.4, 0.6, 'g'),
        // satFat & sugar intentionally omitted
      }),
    );
    expect(lights.map((l) => l.key)).toEqual(['calories', 'protein', 'fat', 'salt']);
    expect(lights.find((l) => l.key === 'satFat')).toBeUndefined();
    expect(lights.find((l) => l.key === 'sugar')).toBeUndefined();
  });

  it('includes sugar but not satFat when only sugar is present', () => {
    const lights = rateNutrients(
      nutri({
        kcal: r(400, 500, 'kcal'),
        protein: r(20, 24, 'g'),
        fat: r(10, 14, 'g'),
        salt: r(0.4, 0.6, 'g'),
        sugar: r(28, 32, 'g'), // mid 30 > 27 -> red
      }),
    );
    expect(lights.map((l) => l.key)).toEqual(['calories', 'protein', 'fat', 'sugar', 'salt']);
    const sugar = lightFor(lights, 'sugar');
    expect(sugar.level).toBe<NutrientLevel>('high'); // mid 30 > 27
  });
});

describe('rateNutrients — RED lines (cited FSA >30% RI per portion)', () => {
  function single(value: number): Range {
    return r(value, value, 'g');
  }
  function base(over: { fat?: number; satFat?: number; sugar?: number; salt?: number }): NutritionEstimate {
    return nutri({
      kcal: r(300, 300, 'kcal'),
      protein: single(25),
      fat: single(over.fat ?? 5),
      salt: single(over.salt ?? 0.3),
      ...(over.satFat !== undefined ? { satFat: single(over.satFat) } : {}),
      ...(over.sugar !== undefined ? { sugar: single(over.sugar) } : {}),
    });
  }

  it('fat: red strictly above 21 g, amber at exactly 21, green at/below 7', () => {
    expect(lightFor(rateNutrients(base({ fat: 21 })), 'fat').level).toBe<NutrientLevel>('caution');
    expect(lightFor(rateNutrients(base({ fat: 21.01 })), 'fat').level).toBe<NutrientLevel>('high');
    expect(lightFor(rateNutrients(base({ fat: 7 })), 'fat').level).toBe<NutrientLevel>('good');
    expect(lightFor(rateNutrients(base({ fat: 7.01 })), 'fat').level).toBe<NutrientLevel>('caution');
  });

  it('satFat: red above 6 g, green at/below 2', () => {
    expect(lightFor(rateNutrients(base({ satFat: 6 })), 'satFat').level).toBe<NutrientLevel>('caution');
    expect(lightFor(rateNutrients(base({ satFat: 6.01 })), 'satFat').level).toBe<NutrientLevel>('high');
    expect(lightFor(rateNutrients(base({ satFat: 2 })), 'satFat').level).toBe<NutrientLevel>('good');
  });

  it('sugar: red above 27 g, green at/below 9', () => {
    expect(lightFor(rateNutrients(base({ sugar: 27 })), 'sugar').level).toBe<NutrientLevel>('caution');
    expect(lightFor(rateNutrients(base({ sugar: 27.01 })), 'sugar').level).toBe<NutrientLevel>('high');
    expect(lightFor(rateNutrients(base({ sugar: 9 })), 'sugar').level).toBe<NutrientLevel>('good');
  });

  it('salt: m=1.8 is caution, m=1.81 is high; green at/below 0.6', () => {
    expect(lightFor(rateNutrients(base({ salt: 1.8 })), 'salt').level).toBe<NutrientLevel>('caution');
    expect(lightFor(rateNutrients(base({ salt: 1.81 })), 'salt').level).toBe<NutrientLevel>('high');
    expect(lightFor(rateNutrients(base({ salt: 0.6 })), 'salt').level).toBe<NutrientLevel>('good');
    expect(lightFor(rateNutrients(base({ salt: 0.61 })), 'salt').level).toBe<NutrientLevel>('caution');
  });
});

describe('rateNutrients — energy + protein (Bocado guidance)', () => {
  function single(value: number): Range {
    return r(value, value, 'g');
  }
  function singleKcal(value: number): Range {
    return r(value, value, 'kcal');
  }
  function base(over: { kcal?: number; protein?: number }): NutritionEstimate {
    return nutri({
      kcal: singleKcal(over.kcal ?? 300),
      protein: single(over.protein ?? 25),
      fat: single(5),
      salt: single(0.3),
    });
  }

  it('energy: green at/below 600, amber 600..800, red above 800', () => {
    expect(lightFor(rateNutrients(base({ kcal: 600 })), 'calories').level).toBe<NutrientLevel>('good');
    expect(lightFor(rateNutrients(base({ kcal: 601 })), 'calories').level).toBe<NutrientLevel>('caution');
    expect(lightFor(rateNutrients(base({ kcal: 800 })), 'calories').level).toBe<NutrientLevel>('caution');
    expect(lightFor(rateNutrients(base({ kcal: 801 })), 'calories').level).toBe<NutrientLevel>('high');
  });

  it('protein is POSITIVE: never high; good >=15, OK 7.5..15, Low <7.5', () => {
    const low = lightFor(rateNutrients(base({ protein: 2 })), 'protein');
    expect(low.level).toBe<NutrientLevel>('caution');
    expect(low.tag).toBe('Low');

    const ok = lightFor(rateNutrients(base({ protein: 10 })), 'protein');
    expect(ok.level).toBe<NutrientLevel>('caution');
    expect(ok.tag).toBe('OK');

    const okBoundary = lightFor(rateNutrients(base({ protein: 7.5 })), 'protein');
    expect(okBoundary.tag).toBe('OK');

    const good = lightFor(rateNutrients(base({ protein: 15 })), 'protein');
    expect(good.level).toBe<NutrientLevel>('good');
    expect(good.tag).toBe('Good');
  });

  it('protein never returns level "high" for any input', () => {
    for (const p of [0, 1, 7.4, 7.5, 14.9, 15, 30, 80, 200]) {
      const light = lightFor(rateNutrients(base({ protein: p })), 'protein');
      expect(light.level).not.toBe<NutrientLevel>('high');
    }
  });
});

describe('rateNutrients — fillPct is presentational + LOCKED (decoupled from bands)', () => {
  function single(value: number): Range {
    return r(value, value, 'g');
  }
  function singleKcal(value: number): Range {
    return r(value, value, 'kcal');
  }
  function base(over: { kcal?: number; salt?: number }): NutritionEstimate {
    return nutri({
      kcal: singleKcal(over.kcal ?? 300),
      protein: single(25),
      fat: single(5),
      salt: single(over.salt ?? 0.3),
    });
  }

  it('fillPct clamps to a 5% floor and 100% ceiling (full salt=3, energy=900 LOCKED)', () => {
    const tiny = lightFor(rateNutrients(base({ salt: 0.01 })), 'salt');
    expect(tiny.fillPct).toBe(5); // 0.01/3*100 < 5 -> floored
    const huge = lightFor(rateNutrients(base({ kcal: 5000 })), 'calories');
    expect(huge.fillPct).toBe(100); // 5000/900*100 > 100 -> ceiled
  });

  it('fillPct uses the LOCKED full=900 energy scale (not the band cutoffs)', () => {
    const cals = lightFor(rateNutrients(base({ kcal: 450 })), 'calories');
    expect(cals.fillPct).toBeCloseTo(50, 5); // 450/900*100 — unchanged by re-anchoring
  });

  it('is deterministic (same estimate -> identical output)', () => {
    const e = carbonara();
    expect(rateNutrients(e)).toEqual(rateNutrients(e));
  });
});
