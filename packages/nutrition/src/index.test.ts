/**
 * Integration tests for the public API (`enrichDish`) — the engine end-to-end over
 * the seed fixture. These assert the HONESTY INVARIANTS (range shape, provenance,
 * confidence semantics, "may contain" allergen framing) rather than exact figures,
 * because the seed numbers are approximate and the real CIQUAL/USDA dataset will
 * shift them. What must NOT shift is the contract: ranges that widen with
 * uncertainty, every value traced to a source, and allergens never declared "safe".
 *
 * NOTE: the compute/, suitability/, and allergens/ sub-modules are built in parallel
 * against the contracts documented in this package; until they land (and node_modules
 * is installed) `pnpm --filter @bocado/nutrition test` cannot execute. These tests
 * encode the integration contract the orchestrator depends on.
 */
import { describe, expect, it } from 'vitest';

import type { PerceivedDish, Range, UserProfile } from '@bocado/shared';
import { ALLERGEN_DISCLAIMER, NUTRITION_DISCLAIMER } from '@bocado/shared';

import { enrichDish } from './index';

/** A range is honest when it has a unit, min<=max, and non-negative bounds. */
function expectValidRange(range: Range): void {
  expect(typeof range.unit).toBe('string');
  expect(range.unit.length).toBeGreaterThan(0);
  expect(range.min).toBeGreaterThanOrEqual(0);
  expect(range.max).toBeGreaterThanOrEqual(range.min);
  expect(Number.isFinite(range.min)).toBe(true);
  expect(Number.isFinite(range.max)).toBe(true);
}

const grilledChickenAndFries: PerceivedDish = {
  originalText: 'Pollo a la plancha con patatas fritas',
  translatedName: 'Grilled chicken with fries',
  ingredients: [
    { name: 'chicken', grams: 160 },
    { name: 'french fries', grams: 130 },
    { name: 'olive oil', grams: 10 },
  ],
};

describe('enrichDish — grilled chicken with fries (dinner, milk allergy)', () => {
  const profile: UserProfile = { diet: 'none', allergies: ['milk'], goals: ['balanced'] };
  const result = enrichDish(grilledChickenAndFries, { context: 'dinner', profile });

  it('echoes the ingredient basis it scored', () => {
    expect(result.ingredients).toEqual(grilledChickenAndFries.ingredients);
  });

  it('returns a sane kcal range for ~300 g of chicken/fries/oil', () => {
    const { kcal } = result.nutrition;
    expectValidRange(kcal);
    expect(kcal.unit).toBe('kcal');
    // Chicken ~165, fries ~312, oil 884 per 100 g over 160/130/10 g
    // lands the central estimate roughly in the high-hundreds. Assert a wide,
    // forgiving band so real-data numbers don't make this brittle.
    expect(kcal.min).toBeGreaterThan(300);
    expect(kcal.max).toBeLessThan(1600);
  });

  it('produces a widening range, not a hard number (min strictly below max)', () => {
    const { kcal, protein, fat, salt } = result.nutrition;
    for (const range of [kcal, protein, fat, salt]) expectValidRange(range);
    // With any uncertainty present the interval must have width.
    expect(kcal.max).toBeGreaterThan(kcal.min);
  });

  it('traces every estimate to a real source (no invented numbers)', () => {
    expect(result.nutrition.sources.length).toBeGreaterThan(0);
    for (const source of result.nutrition.sources) {
      expect(['CIQUAL', 'USDA', 'OFF', 'API']).toContain(source.db);
      expect(source.recordId.length).toBeGreaterThan(0);
      expect(source.name.length).toBeGreaterThan(0);
    }
    // All three ingredients exist in the seed -> full coverage -> not 'low'.
    expect(['low', 'medium', 'high']).toContain(result.nutrition.confidence);
    expect(result.nutrition.confidence).not.toBe('low');
  });

  it('gives a suitability verdict with human-readable reasons', () => {
    expect(['good', 'caution', 'avoid']).toContain(result.suitability.level);
    expect(result.suitability.label.length).toBeGreaterThan(0);
    expect(result.suitability.reasons.length).toBeGreaterThan(0);
    for (const reason of result.suitability.reasons) expect(reason.length).toBeGreaterThan(0);
  });

  it('does not flag milk for a dish with no dairy ingredients', () => {
    const flagged = result.allergenFlags.map((flag) => flag.allergen);
    expect(flagged).not.toContain('milk');
  });

  it('frames any allergen flag as "may contain", never as a guarantee', () => {
    for (const flag of result.allergenFlags) {
      expect(['ingredient-match', 'name-keyword']).toContain(flag.basis);
      // Honesty: notes carry the disclaimer spirit; never the word "safe".
      expect(flag.note.toLowerCase()).not.toContain('safe');
      expect(flag.note.length).toBeGreaterThan(0);
    }
  });
});

describe('enrichDish — vegan profile on a meat dish', () => {
  const veganProfile: UserProfile = { diet: 'vegan', allergies: [], goals: ['balanced'] };
  const result = enrichDish(grilledChickenAndFries, { context: 'lunch', profile: veganProfile });

  it('does not mark a chicken dish suitable for a vegan', () => {
    // A meat dish must not read as 'good' for a vegan; rules force caution/avoid.
    expect(result.suitability.level).not.toBe('good');
    expect(result.suitability.reasons.length).toBeGreaterThan(0);
  });

  it('still computes honest nutrition regardless of profile', () => {
    expectValidRange(result.nutrition.kcal);
    expect(result.nutrition.sources.length).toBeGreaterThan(0);
  });
});

describe('enrichDish — late-night context', () => {
  const lateNightDish: PerceivedDish = {
    originalText: 'Hamburguesa con queso y patatas',
    translatedName: 'Cheeseburger with fries',
    ingredients: [
      { name: 'beef', grams: 150 },
      { name: 'cheese', grams: 40 },
      { name: 'bread', grams: 80 },
      { name: 'french fries', grams: 150 },
    ],
  };

  const result = enrichDish(lateNightDish, { context: 'late-night' });

  it('reflects late-night + energy-dense food in the verdict (not "good")', () => {
    expect(['good', 'caution', 'avoid']).toContain(result.suitability.level);
    expect(result.suitability.level).not.toBe('good');
  });

  it('flags milk for a dish containing cheese, as "may contain"', () => {
    const milkFlag = result.allergenFlags.find((flag) => flag.allergen === 'milk');
    expect(milkFlag).toBeDefined();
    if (milkFlag) {
      expect(milkFlag.basis).toBe('ingredient-match');
      expect(milkFlag.note.toLowerCase()).not.toContain('allergen-free');
    }
  });

  it('works without a profile (profile is optional)', () => {
    expect(result.nutrition).toBeDefined();
    expect(result.allergenFlags).toBeDefined();
    expect(result.suitability).toBeDefined();
  });
});

describe('two-planes: server path is profile-free, device path applies the profile', () => {
  // The /scan Worker route runs enrichDish WITHOUT a profile (anonymity invariant,
  // SECURITY.md §1) -> time-only scoring. The mobile app is expected to re-invoke the
  // engine ON-DEVICE WITH the profile against the same nutrition + ingredients. This
  // test proves the profile rules are dormant server-side but active on-device — i.e.
  // the diet/allergy value prop depends on that on-device caller existing.
  const meatDish: PerceivedDish = {
    originalText: 'Entrecot con patatas',
    translatedName: 'Steak with potatoes',
    ingredients: [
      { name: 'beef steak', grams: 180 },
      { name: 'potato', grams: 150 },
    ],
  };

  it('server path (no profile) does NOT apply a vegan diet conflict', () => {
    const server = enrichDish(meatDish, { context: 'lunch' });
    // No profile reached the engine, so no "Not vegan" label can appear.
    expect(server.suitability.label).not.toBe('Not vegan');
    expect(server.suitability.reasons.join(' ').toLowerCase()).not.toContain('vegan');
  });

  it('device path (with profile) applies the vegan diet conflict -> avoid "Not vegan"', () => {
    const vegan: UserProfile = { diet: 'vegan', allergies: [], goals: [] };
    const device = enrichDish(meatDish, { context: 'lunch', profile: vegan });
    expect(device.suitability.level).toBe('avoid');
    expect(device.suitability.label).toBe('Not vegan');
  });

  it('the underlying nutrition + allergen flags are identical on both planes', () => {
    const vegan: UserProfile = { diet: 'vegan', allergies: [], goals: [] };
    const server = enrichDish(meatDish, { context: 'lunch' });
    const device = enrichDish(meatDish, { context: 'lunch', profile: vegan });
    // Only the suitability verdict differs; the facts (numbers + may-contain) match.
    expect(device.nutrition).toEqual(server.nutrition);
    expect(device.allergenFlags).toEqual(server.allergenFlags);
  });
});

describe('honesty disclaimers are available to callers', () => {
  it('exposes the standard allergen + nutrition disclaimer copy', () => {
    expect(ALLERGEN_DISCLAIMER.toLowerCase()).toContain('confirm');
    expect(NUTRITION_DISCLAIMER.toLowerCase()).toContain('estimate');
  });
});
