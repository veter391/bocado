/** Shared constants: EU-14 allergens, diets, goals, meal-context mapping. */
import type { AllergenId, DietId, GoalId, MealContext } from './types';

/** EU Reg 1169/2011 Annex II, with plain-language labels (grandma-readable). */
export const ALLERGENS: { id: AllergenId; label: string }[] = [
  { id: 'gluten', label: 'Gluten (wheat, rye, barley)' },
  { id: 'crustaceans', label: 'Crustaceans (prawns, crab)' },
  { id: 'eggs', label: 'Eggs' },
  { id: 'fish', label: 'Fish' },
  { id: 'peanuts', label: 'Peanuts' },
  { id: 'soybeans', label: 'Soy' },
  { id: 'milk', label: 'Milk / dairy' },
  { id: 'nuts', label: 'Tree nuts' },
  { id: 'celery', label: 'Celery' },
  { id: 'mustard', label: 'Mustard' },
  { id: 'sesame', label: 'Sesame' },
  { id: 'sulphites', label: 'Sulphites' },
  { id: 'lupin', label: 'Lupin' },
  { id: 'molluscs', label: 'Molluscs (mussels, squid)' },
];

export const DIETS: { id: DietId; label: string }[] = [
  { id: 'none', label: 'No restriction' },
  { id: 'vegan', label: 'Vegan' },
  { id: 'vegetarian', label: 'Vegetarian' },
  { id: 'pescatarian', label: 'Pescatarian' },
  { id: 'halal', label: 'Halal' },
  { id: 'kosher', label: 'Kosher' },
  { id: 'keto', label: 'Keto' },
  { id: 'low-carb', label: 'Low carb' },
  { id: 'gluten-free', label: 'Gluten-free' },
  { id: 'dairy-free', label: 'Dairy-free' },
];

export const GOALS: { id: GoalId; label: string }[] = [
  { id: 'balanced', label: 'Balanced' },
  { id: 'weight-loss', label: 'Lighter meals' },
  { id: 'high-protein', label: 'High protein' },
  { id: 'low-sodium', label: 'Low salt' },
];

/**
 * Map a local hour (0–23) to a meal context for time-aware suitability.
 *
 * IMPORTANT: these hour boundaries (notably 22:00 → late-night and 05:00 →
 * breakfast) are a BOCADO DESIGN CHOICE, not a cited nutritional standard. They are
 * presented as our convention, not as fact, and must be documented as such wherever
 * the time adaptation is explained (DESIGN.md). `snack` is NEVER derived from the
 * clock — it is a caller-supplied explicit context (see SNACK_CONTEXT_NOTE).
 */
export function mealContextForHour(hour: number): MealContext {
  if (hour >= 5 && hour < 11) return 'breakfast';
  if (hour >= 11 && hour < 16) return 'lunch';
  if (hour >= 16 && hour < 22) return 'dinner';
  return 'late-night';
}

/** Standard "may contain — confirm with staff" copy. Never say "safe". */
export const ALLERGEN_DISCLAIMER = 'May contain — always confirm with restaurant staff.';
export const NUTRITION_DISCLAIMER = 'Estimate only, not exact.';
export const AI_IMAGE_LABEL = 'AI illustration';

/**
 * 'snack' is a CALLER-SUPPLIED explicit meal context, never inferred from the clock.
 * It is scored intentionally LENIENTLY (a smaller, between-meals portion): it gets a
 * friendlier label and no time-of-day strictness. This note documents that intent so
 * the context is not silently inert; surface it to the UI when the snack context is
 * active. (Open question: whether snack should instead apply light-meal strictness —
 * that is a one-line config flip, deliberately deferred.)
 */
export const SNACK_CONTEXT_NOTE =
  'Snack — scored leniently as a smaller, between-meals portion.';

/**
 * Footnote for the energy + protein traffic lights: unlike fat/saturates/sugar/salt
 * (whose RED line is the UK FSA per-portion HIGH threshold), energy and protein have
 * NO FSA front-of-pack light. Their bands are Bocado guidance off the EU Reference
 * Intakes. The UI MUST show this footnote next to those two lights (no-invented-
 * thresholds guardrail).
 */
export const GUIDANCE_LIGHT_FOOTNOTE = 'Bocado guidance (not an FSA label).';

/**
 * Below this self-reported `menuConfidence` (0..1) the edge treats the perception as
 * "this is probably not a menu / unreadable" and the app shows an honest try-again
 * state instead of any dishes. A DELIBERATELY LOW bar (0.35): we only reject when the
 * model is fairly sure the frame is not a menu, so a hard-to-read but real menu still
 * goes through (the engine then widens ranges + lowers nutrition confidence). The
 * signal is advisory — `isMenu === false` or zero dishes also trigger the non-menu
 * state; a present-but-decent confidence never overrides real dishes.
 */
export const MIN_MENU_CONFIDENCE = 0.35;
