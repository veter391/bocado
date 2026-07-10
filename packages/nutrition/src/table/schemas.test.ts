/**
 * Trust-boundary schema tests for the perception contract additions (lives in the
 * nutrition package because that is where the gated `test` script runs and where the
 * back-compat shim — `matchName` — is consumed by the engine).
 *
 * Covers: cookingMethod enum + default, the dual-shape ingredientGuessSchema
 * (legacy `{name,grams}` AND new `{canonicalName,...}`) with the canonicalName
 * backfill, and rejection of bad enums.
 */
import { describe, expect, it } from 'vitest';
import {
  ingredientGuessSchema,
  perceivedDishSchema,
  perceivedMenuSchema,
  matchName,
} from '@bocado/shared';

describe('ingredientGuessSchema — back-compat dual shape', () => {
  it('accepts the legacy {name,grams} shape and backfills canonicalName', () => {
    const parsed = ingredientGuessSchema.parse({ name: 'chicken', grams: 150 });
    expect(parsed.canonicalName).toBe('chicken');
    expect(parsed.basis).toBe('inferred'); // default
    expect(parsed.isAddedFat).toBe(false); // default
    expect(matchName(parsed)).toBe('chicken');
  });

  it('accepts the new shape with canonicalName / originalTerm / basis / isAddedFat', () => {
    const parsed = ingredientGuessSchema.parse({
      canonicalName: 'olive oil',
      originalTerm: 'aceite de oliva',
      grams: 8,
      basis: 'read',
      isAddedFat: true,
    });
    expect(parsed.canonicalName).toBe('olive oil');
    expect(parsed.originalTerm).toBe('aceite de oliva');
    expect(parsed.basis).toBe('read');
    expect(parsed.isAddedFat).toBe(true);
    expect(matchName(parsed)).toBe('olive oil');
  });

  it('prefers canonicalName over a legacy name when both are present', () => {
    const parsed = ingredientGuessSchema.parse({ name: 'lubina', canonicalName: 'sea bass', grams: 200 });
    expect(parsed.canonicalName).toBe('sea bass');
    expect(matchName(parsed)).toBe('sea bass');
  });

  it('rejects an ingredient with neither name nor canonicalName', () => {
    expect(ingredientGuessSchema.safeParse({ grams: 100 }).success).toBe(false);
  });

  it('rejects non-positive / over-max grams (defence in depth)', () => {
    expect(ingredientGuessSchema.safeParse({ name: 'x', grams: 0 }).success).toBe(false);
    expect(ingredientGuessSchema.safeParse({ name: 'x', grams: 5000 }).success).toBe(false);
  });

  it('rejects a bad basis enum', () => {
    expect(
      ingredientGuessSchema.safeParse({ name: 'x', grams: 10, basis: 'guessed' }).success,
    ).toBe(false);
  });
});

describe('perceivedDishSchema — cookingMethod', () => {
  it('defaults cookingMethod to "unknown" when omitted (back-compat)', () => {
    const parsed = perceivedDishSchema.parse({
      originalText: 'Pollo a la plancha',
      translatedName: 'Grilled chicken',
      ingredients: [{ name: 'chicken', grams: 150 }],
    });
    expect(parsed.cookingMethod).toBe('unknown');
  });

  it('accepts a valid cookingMethod and rejects an invalid one', () => {
    const ok = perceivedDishSchema.safeParse({
      originalText: 'x',
      translatedName: 'x',
      cookingMethod: 'deep-fried',
      ingredients: [{ canonicalName: 'squid', grams: 150 }],
    });
    expect(ok.success).toBe(true);

    const bad = perceivedDishSchema.safeParse({
      originalText: 'x',
      translatedName: 'x',
      cookingMethod: 'microwaved',
      ingredients: [{ canonicalName: 'squid', grams: 150 }],
    });
    expect(bad.success).toBe(false);
  });

  it('caps ingredients at 40', () => {
    const many = Array.from({ length: 41 }, () => ({ canonicalName: 'tomato', grams: 10 }));
    const res = perceivedDishSchema.safeParse({
      originalText: 'x',
      translatedName: 'x',
      ingredients: many,
    });
    expect(res.success).toBe(false);
  });
});

describe('perceivedMenuSchema — a legacy cached perception still parses', () => {
  it('parses an old {name,grams} menu (D1 cache back-compat) and backfills', () => {
    const legacy = {
      title: 'La Taberna',
      dishes: [
        {
          originalText: 'Ensalada',
          translatedName: 'Salad',
          ingredients: [{ name: 'lettuce', grams: 80 }],
        },
      ],
    };
    const parsed = perceivedMenuSchema.parse(legacy);
    expect(parsed.dishes[0]!.cookingMethod).toBe('unknown');
    expect(parsed.dishes[0]!.ingredients[0]!.canonicalName).toBe('lettuce');
  });
});
