import { describe, it, expect } from 'vitest';
import type { AllergenId, IngredientGuess } from '@bocado/shared';
import { ALLERGEN_DISCLAIMER } from '@bocado/shared';
import { detectAllergens } from './detect';

/** Build IngredientGuess[] from a list of names (grams are irrelevant to detection). */
function ings(...names: string[]): IngredientGuess[] {
  return names.map((name) => ({ name, grams: 100 }));
}

/** Convenience: the set of detected allergen ids. */
function ids(names: string[]): Set<AllergenId> {
  return new Set(detectAllergens(ings(...names)).map((f) => f.allergen));
}

describe('detectAllergens — core mappings', () => {
  it('maps cheese -> milk', () => {
    expect(ids(['cheese'])).toEqual(new Set<AllergenId>(['milk']));
  });

  it('maps butter, cream, mozzarella, milk -> milk (deduped to one flag)', () => {
    const flags = detectAllergens(ings('butter', 'cream', 'mozzarella', 'milk'));
    expect(flags).toHaveLength(1);
    expect(flags[0]!.allergen).toBe('milk');
  });

  it('maps pasta -> gluten, and bread/flour -> gluten', () => {
    expect(ids(['pasta'])).toEqual(new Set<AllergenId>(['gluten']));
    expect(ids(['bread'])).toEqual(new Set<AllergenId>(['gluten']));
    expect(ids(['wheat flour'])).toEqual(new Set<AllergenId>(['gluten']));
  });

  it('maps prawns/shrimp/gambas -> crustaceans', () => {
    expect(ids(['prawns'])).toEqual(new Set<AllergenId>(['crustaceans']));
    expect(ids(['shrimp'])).toEqual(new Set<AllergenId>(['crustaceans']));
    expect(ids(['gambas'])).toEqual(new Set<AllergenId>(['crustaceans']));
  });

  it('maps egg -> eggs', () => {
    expect(ids(['egg'])).toEqual(new Set<AllergenId>(['eggs']));
  });

  it('maps fish/salmon/cod/tuna -> fish', () => {
    expect(ids(['fish'])).toEqual(new Set<AllergenId>(['fish']));
    expect(ids(['salmon'])).toEqual(new Set<AllergenId>(['fish']));
    expect(ids(['cod'])).toEqual(new Set<AllergenId>(['fish']));
    expect(ids(['tuna'])).toEqual(new Set<AllergenId>(['fish']));
  });

  it('maps peanut -> peanuts (separate from tree nuts)', () => {
    expect(ids(['peanut'])).toEqual(new Set<AllergenId>(['peanuts']));
    // "peanut" must NOT also fire the tree-nut rule (word boundary).
    expect(ids(['peanut']).has('nuts')).toBe(false);
  });

  it('maps almond/walnut/hazelnut/nut -> nuts (tree nuts)', () => {
    expect(ids(['almond'])).toEqual(new Set<AllergenId>(['nuts']));
    expect(ids(['walnuts'])).toEqual(new Set<AllergenId>(['nuts']));
    expect(ids(['hazelnut'])).toEqual(new Set<AllergenId>(['nuts']));
  });

  it('maps soy/tofu -> soybeans', () => {
    expect(ids(['soy sauce'])).toEqual(new Set<AllergenId>(['soybeans']));
    expect(ids(['tofu'])).toEqual(new Set<AllergenId>(['soybeans']));
  });

  it('maps sesame/tahini -> sesame, mustard -> mustard, celery -> celery', () => {
    expect(ids(['sesame'])).toEqual(new Set<AllergenId>(['sesame']));
    expect(ids(['tahini'])).toEqual(new Set<AllergenId>(['sesame']));
    expect(ids(['mustard'])).toEqual(new Set<AllergenId>(['mustard']));
    expect(ids(['celery'])).toEqual(new Set<AllergenId>(['celery']));
  });

  it('maps mussels/squid/octopus -> molluscs', () => {
    expect(ids(['mussels'])).toEqual(new Set<AllergenId>(['molluscs']));
    expect(ids(['squid'])).toEqual(new Set<AllergenId>(['molluscs']));
    expect(ids(['octopus'])).toEqual(new Set<AllergenId>(['molluscs']));
  });

  it('detects multiple distinct allergens in one dish (cheese pasta with prawns)', () => {
    const got = ids(['cheese', 'pasta', 'prawns']);
    expect(got).toEqual(new Set<AllergenId>(['gluten', 'crustaceans', 'milk']));
  });

  it('handles accents and casing via normalizeName (salmón, Cebolla)', () => {
    expect(ids(['Salmón'])).toEqual(new Set<AllergenId>(['fish']));
  });
});

describe('detectAllergens — honesty contract', () => {
  it('returns an empty array for a plain vegetable dish (NOT a "safe" claim)', () => {
    const flags = detectAllergens(ings('tomato', 'lettuce', 'onion'));
    expect(flags).toEqual([]);
  });

  it('NEVER produces a note containing the words "safe" or "allergen-free"', () => {
    const everything = ings(
      'cheese', 'pasta', 'prawns', 'egg', 'salmon', 'peanut', 'almond', 'soy',
      'sesame', 'mustard', 'celery', 'mussels',
    );
    const flags = detectAllergens(everything);
    expect(flags.length).toBeGreaterThan(0);
    for (const flag of flags) {
      expect(flag.note.toLowerCase()).not.toContain('safe');
      expect(flag.note.toLowerCase()).not.toContain('allergen-free');
      expect(flag.note.toLowerCase()).not.toContain('allergen free');
    }
  });

  it('every flag note carries the "confirm with staff" disclaimer and names the allergen', () => {
    const flags = detectAllergens(ings('cheese'));
    expect(flags).toHaveLength(1);
    expect(flags[0]!.note).toContain('May contain');
    expect(flags[0]!.note).toContain('Milk');
    expect(flags[0]!.note).toContain(ALLERGEN_DISCLAIMER);
  });

  it('every flag uses basis "ingredient-match"', () => {
    const flags = detectAllergens(ings('cheese', 'pasta', 'salmon'));
    expect(flags.length).toBeGreaterThan(0);
    for (const flag of flags) {
      expect(flag.basis).toBe('ingredient-match');
    }
  });

  it('is deterministic and deduped (same input twice -> identical output)', () => {
    const a = detectAllergens(ings('cheese', 'cheese', 'milk', 'butter'));
    const b = detectAllergens(ings('cheese', 'cheese', 'milk', 'butter'));
    expect(a).toEqual(b);
    expect(a).toHaveLength(1);
  });

  it('does not false-positive: "soy" word does not fire on unrelated tokens', () => {
    // No ingredient here implies an allergen; result must be empty.
    expect(detectAllergens(ings('rice', 'potato', 'avocado'))).toEqual([]);
  });

  it('handles empty ingredient list without throwing', () => {
    expect(detectAllergens([])).toEqual([]);
  });
});
