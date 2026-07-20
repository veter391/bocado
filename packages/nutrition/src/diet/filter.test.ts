import { describe, it, expect } from 'vitest';
import type { Dish, IngredientGuess } from '@bocado/shared';
import { dishFitsDiet, dishHitsAllergies } from './filter';

/** Minimal dish carrying only the ingredients the predicates read. */
function dish(...names: string[]): Pick<Dish, 'ingredients'> {
  const ingredients: IngredientGuess[] = names.map((name) => ({ name, grams: 100 }));
  return { ingredients };
}

describe('dishFitsDiet', () => {
  it('vegan: excludes meat, fish, and animal products', () => {
    expect(dishFitsDiet(dish('Chicken breast', 'Olive oil'), 'vegan')).toBe(false);
    expect(dishFitsDiet(dish('Salmon', 'Lemon'), 'vegan')).toBe(false);
    expect(dishFitsDiet(dish('Parmesan', 'Rice'), 'vegan')).toBe(false);
    expect(dishFitsDiet(dish('Egg', 'Spinach'), 'vegan')).toBe(false);
    // Egg+milk desserts that are curated/canonical foods must not pass as vegan.
    expect(dishFitsDiet(dish('Flan'), 'vegan')).toBe(false);
    expect(dishFitsDiet(dish('Custard', 'Berries'), 'vegan')).toBe(false);
    expect(dishFitsDiet(dish('Mixed leaves', 'Olive oil', 'Vinegar'), 'vegan')).toBe(true);
  });

  it('vegetarian: excludes meat and fish but allows dairy/egg', () => {
    expect(dishFitsDiet(dish('Beef', 'Onion'), 'vegetarian')).toBe(false);
    expect(dishFitsDiet(dish('Tuna', 'Pasta'), 'vegetarian')).toBe(false);
    expect(dishFitsDiet(dish('Cheese', 'Egg', 'Tomato'), 'vegetarian')).toBe(true);
  });

  it('pescatarian: excludes meat but allows fish', () => {
    expect(dishFitsDiet(dish('Pork', 'Beans'), 'pescatarian')).toBe(false);
    expect(dishFitsDiet(dish('Salmon', 'Rice'), 'pescatarian')).toBe(true);
  });

  it('gluten-free: excludes gluten-bearing ingredients', () => {
    expect(dishFitsDiet(dish('Spaghetti', 'Egg'), 'gluten-free')).toBe(false);
    // Wheat foods that are curated/canonical (model emits them verbatim) — kept in
    // lock-step with the allergen gluten list so none get a silent gluten-free pass.
    expect(dishFitsDiet(dish('Croissant', 'Butter'), 'gluten-free')).toBe(false);
    expect(dishFitsDiet(dish('Oats', 'Milk'), 'gluten-free')).toBe(false);
    expect(dishFitsDiet(dish('Cracker', 'Cheese'), 'gluten-free')).toBe(false);
    expect(dishFitsDiet(dish('Grilled chicken', 'Salad'), 'gluten-free')).toBe(true);
  });

  it('dairy-free: excludes dairy', () => {
    expect(dishFitsDiet(dish('Butter', 'Rice'), 'dairy-free')).toBe(false);
    expect(dishFitsDiet(dish('Olive oil', 'Tomato'), 'dairy-free')).toBe(true);
  });

  it('none / halal / kosher / keto / low-carb: never name-excluded', () => {
    const meat = dish('Beef steak');
    expect(dishFitsDiet(meat, 'none')).toBe(true);
    expect(dishFitsDiet(meat, 'halal')).toBe(true);
    expect(dishFitsDiet(meat, 'kosher')).toBe(true);
    expect(dishFitsDiet(meat, 'keto')).toBe(true);
    expect(dishFitsDiet(meat, 'low-carb')).toBe(true);
  });
});

describe('dishHitsAllergies', () => {
  it('returns false for an empty allergy set', () => {
    expect(dishHitsAllergies(dish('Spaghetti', 'Egg'), [])).toBe(false);
  });

  it('hits when a flagged allergen is detected', () => {
    expect(dishHitsAllergies(dish('Spaghetti', 'Egg'), ['gluten'])).toBe(true);
    expect(dishHitsAllergies(dish('Spaghetti', 'Egg'), ['eggs'])).toBe(true);
    expect(dishHitsAllergies(dish('Prawns', 'Wheat batter'), ['crustaceans'])).toBe(true);
  });

  it('does not hit when no flagged allergen is present', () => {
    expect(dishHitsAllergies(dish('Grilled chicken', 'Salad'), ['gluten', 'milk'])).toBe(false);
  });
});
