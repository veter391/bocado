/**
 * Reusable, PURE diet/allergy fit predicates — the logic the Results "smart filters"
 * (Pro) reuse so the filtered list and the suitability verdict can never disagree.
 *
 * These answer two questions, deterministically, from a dish's guessed ingredients:
 *   - `dishFitsDiet(dish, diet)`     — does this dish fit diet D? (hard category check)
 *   - `dishHitsAllergies(dish, A)`   — does this dish MAY-contain any flagged allergen?
 *
 * They share the EXACT word lists the verdict engine uses (`./words`) and, for
 * allergies, the EXACT detector the verdict + allergen chips use (`detectAllergens`),
 * so "Not vegan" in the ring == dropped by the vegan filter, and "May contain milk"
 * in the chips == hit by a milk allergy filter.
 *
 * Honesty: `dishHitsAllergies` reuses the "may contain" detector. A `false` here means
 * "no allergen keyword matched", NOT "safe" — the UI keeps the confirm-with-staff
 * caveat regardless (these predicates only decide list membership, never safety).
 *
 * No RN, no I/O, no clock, no randomness — runs in Node, Workers, and on-device.
 */
import type { AllergenId, DietId, Dish, IngredientGuess } from '@bocado/shared';
import { matchName } from '@bocado/shared';

import { detectAllergens } from '../allergens/detect';
import { normalizeName } from '../table/memoryTable';
import {
  ANIMAL_PRODUCT_WORDS,
  DAIRY_WORDS,
  FISH_AND_SEAFOOD_WORDS,
  GLUTEN_WORDS,
  MEAT_WORDS,
  anyWord,
} from './words';

/** Tokenize each ingredient name into normalized whole words (lowercase, accent-free). */
function tokenize(ingredients: readonly IngredientGuess[]): string[][] {
  return ingredients.map((ing) =>
    normalizeName(matchName(ing)).split(' ').filter((w) => w.length > 0),
  );
}

/**
 * Does this dish fit the given diet?
 *
 * Mirrors `assessSuitability`'s hard-category rules EXACTLY:
 *  - vegan       -> no meat, fish/seafood, or animal product (dairy/egg/honey).
 *  - vegetarian  -> no meat or fish/seafood.
 *  - pescatarian -> no meat (fish allowed).
 *  - gluten-free -> no gluten-bearing ingredient.
 *  - dairy-free  -> no dairy.
 *
 * `none` / halal / kosher / keto / low-carb are NOT name-inferable category bans
 * (same rationale as the verdict engine), so they never exclude a dish here — the
 * filter returns `true` (everything fits) for them rather than fabricating a ban.
 */
export function dishFitsDiet(dish: Pick<Dish, 'ingredients'>, diet: DietId): boolean {
  const tokenized = tokenize(dish.ingredients);
  const hasMeat = tokenized.some((w) => anyWord(w, MEAT_WORDS));
  const hasFish = tokenized.some((w) => anyWord(w, FISH_AND_SEAFOOD_WORDS));
  const hasAnimalProduct = tokenized.some((w) => anyWord(w, ANIMAL_PRODUCT_WORDS));
  const hasGluten = tokenized.some((w) => anyWord(w, GLUTEN_WORDS));
  const hasDairy = tokenized.some((w) => anyWord(w, DAIRY_WORDS));

  switch (diet) {
    case 'vegan':
      return !(hasMeat || hasFish || hasAnimalProduct);
    case 'vegetarian':
      return !(hasMeat || hasFish);
    case 'pescatarian':
      return !hasMeat;
    case 'gluten-free':
      return !hasGluten;
    case 'dairy-free':
      return !hasDairy;
    default:
      // none / halal / kosher / keto / low-carb: no name-based exclusion.
      return true;
  }
}

/**
 * Does this dish MAY-contain any of the user's flagged allergens?
 *
 * Reuses the canonical `detectAllergens` so the filter agrees with the allergen
 * chips + the verdict's allergy caution. Returns `true` if ANY flagged allergen is
 * detected. An empty `allergies` set never excludes anything.
 */
export function dishHitsAllergies(
  dish: Pick<Dish, 'ingredients'>,
  allergies: readonly AllergenId[],
): boolean {
  if (allergies.length === 0) return false;
  const detected = new Set(detectAllergens(dish.ingredients).map((f) => f.allergen));
  return allergies.some((a) => detected.has(a));
}
