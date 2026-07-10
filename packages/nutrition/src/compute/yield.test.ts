import { describe, expect, it } from 'vitest';
import type { CookingYield } from '../types';
import { getCookingYield, IDENTITY_YIELD, retentionFor } from './yield';

describe('getCookingYield', () => {
  it('returns identity yield for an already-cooked record regardless of category', () => {
    // Seed meat/fish/grain records are state:'cooked' — their per-100g values
    // already describe the cooked food, so no raw->cooked factor must apply.
    for (const category of ['meat', 'fish', 'grain', 'legume', 'vegetable']) {
      const y = getCookingYield(category, 'cooked');
      expect(y.yieldFactor).toBe(1);
      expect(y).toEqual(IDENTITY_YIELD);
    }
  });

  it('applies a sub-1 yield to raw muscle meat (mass lost on dry heat)', () => {
    const y = getCookingYield('meat', 'raw');
    expect(y.yieldFactor).toBeLessThan(1);
    expect(y.yieldFactor).toBeGreaterThan(0);
    // some fat renders off
    expect(retentionFor(y, 'fat')).toBeLessThanOrEqual(1);
  });

  it('applies a >1 yield to raw grains and legumes (water absorbed)', () => {
    expect(getCookingYield('grain', 'raw').yieldFactor).toBeGreaterThan(1);
    expect(getCookingYield('legume', 'raw').yieldFactor).toBeGreaterThan(1);
  });

  it('falls back to identity for an unknown or missing category', () => {
    expect(getCookingYield('unicorn', 'raw')).toEqual(IDENTITY_YIELD);
    expect(getCookingYield(undefined, 'raw')).toEqual(IDENTITY_YIELD);
    expect(getCookingYield()).toEqual(IDENTITY_YIELD);
  });

  it('treats oils/fats/sugars as as-served (no mass change)', () => {
    expect(getCookingYield('oil', 'raw').yieldFactor).toBe(1);
    expect(getCookingYield('fat', 'raw').yieldFactor).toBe(1);
    expect(getCookingYield('sugar', 'raw').yieldFactor).toBe(1);
  });

  it('keeps oil/fat RETENTION at identity (1.0) — directive B: NO uncitable 0.5 halving', () => {
    // The added-fat fix is carried by the TIGHT oil/butter portion priors + the
    // perception "no oil line for grilled/steamed" rule + deep-fry absorption — NOT by
    // silently halving fat. Oil/fat must therefore pass fat through at 1:1.
    for (const cat of ['oil', 'fat']) {
      const y = getCookingYield(cat, 'raw');
      expect(retentionFor(y, 'fat')).toBe(1);
      expect(retentionFor(y, 'satFat')).toBe(1);
      expect(retentionFor(y, 'kcal')).toBe(1);
    }
  });

  it('cooked grains/legumes stay IDENTITY; raw grains still absorb (x2.4) for raw input only', () => {
    expect(getCookingYield('grain', 'cooked')).toEqual(IDENTITY_YIELD);
    expect(getCookingYield('legume', 'cooked')).toEqual(IDENTITY_YIELD);
    expect(getCookingYield('grain', 'raw').yieldFactor).toBeGreaterThan(2);
  });

  it('is deterministic: same inputs produce equal outputs', () => {
    expect(getCookingYield('meat', 'raw')).toEqual(getCookingYield('meat', 'raw'));
  });
});

describe('retentionFor', () => {
  it('returns 1 for a nutrient not listed in the retention map', () => {
    const y: CookingYield = { method: 'x', yieldFactor: 1, retention: { fat: 0.9 } };
    expect(retentionFor(y, 'fat')).toBe(0.9);
    expect(retentionFor(y, 'protein')).toBe(1);
    expect(retentionFor(y, 'kcal')).toBe(1);
  });
});
