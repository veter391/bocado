/**
 * Zod schemas. The perception model's output is validated against
 * `perceivedMenuSchema` at the trust boundary (the Worker) before the
 * deterministic engine touches it — never trust raw model JSON.
 */
import { z } from 'zod';

/**
 * The 13 cooking methods the engine understands (plus 'unknown'). This is the single
 * most load-bearing schema addition: it lets the engine pick the right yield AND the
 * right added-fat allowance instead of trusting a free oil gram from the model.
 */
export const cookingMethodSchema = z.enum([
  'grilled',
  'fried',
  'deep-fried',
  'roasted',
  'baked',
  'sauteed',
  'steamed',
  'boiled',
  'raw',
  'braised',
  'stewed',
  'cured',
  'unknown',
]);

/**
 * Ingredient guess — accepts BOTH the legacy `{ name, grams }` shape and the new
 * `{ canonicalName, originalTerm?, grams, basis, isAddedFat }` shape (back-compat,
 * NOT a cutover — directive G). The transform backfills `canonicalName` from `name`
 * so every downstream reader sees a canonical name; legacy cached perceptions in D1
 * and existing fixtures keep parsing unchanged.
 *
 * At least one of `name` / `canonicalName` must be present and non-empty (defence at
 * the trust boundary: a nameless ingredient is meaningless to the engine). Grams keep
 * the 0 < g <= 2000 schema bound as defence-in-depth; the per-category portion prior
 * in the engine is the REAL bound applied after the table lookup.
 */
export const ingredientGuessSchema = z
  .object({
    name: z.string().min(1).optional(),
    canonicalName: z.string().min(1).optional(),
    originalTerm: z.string().min(1).optional(),
    grams: z.number().positive().max(2000),
    basis: z.enum(['read', 'inferred']).default('inferred'),
    isAddedFat: z.boolean().default(false),
  })
  .refine((v) => Boolean(v.canonicalName ?? v.name), {
    message: 'ingredient must carry a canonicalName or a legacy name',
    path: ['canonicalName'],
  })
  .transform((v) => ({
    ...v,
    // Backfill so every consumer can rely on canonicalName being set.
    canonicalName: v.canonicalName ?? v.name!,
  }));

export const perceivedDishSchema = z.object({
  originalText: z.string().min(1),
  translatedName: z.string().min(1),
  section: z.string().optional(),
  explanation: z.string().optional(),
  cookingMethod: cookingMethodSchema.default('unknown'),
  ingredients: z.array(ingredientGuessSchema).max(40),
});

export const perceivedMenuSchema = z.object({
  title: z.string().optional(),
  dishes: z.array(perceivedDishSchema).max(200),
  /**
   * Model self-reported "is this a readable menu?" confidence, 0..1. Optional +
   * back-compat: legacy/cached perceptions without it parse unchanged. Clamped to
   * [0,1] defensively so an out-of-range model value can never poison the gate.
   */
  menuConfidence: z.number().min(0).max(1).optional(),
  /** Coarse boolean "this is a menu" signal from the model. Optional + back-compat. */
  isMenu: z.boolean().optional(),
});

export const allergenIdSchema = z.enum([
  'gluten', 'crustaceans', 'eggs', 'fish', 'peanuts', 'soybeans', 'milk',
  'nuts', 'celery', 'mustard', 'sesame', 'sulphites', 'lupin', 'molluscs',
]);

export const dietIdSchema = z.enum([
  'none', 'vegan', 'vegetarian', 'pescatarian', 'halal', 'kosher',
  'keto', 'low-carb', 'gluten-free', 'dairy-free',
]);

export const goalIdSchema = z.enum(['balanced', 'weight-loss', 'high-protein', 'low-sodium']);

export const userProfileSchema = z.object({
  diet: dietIdSchema,
  allergies: z.array(allergenIdSchema),
  goals: z.array(goalIdSchema),
  // Free-text special diet/condition. Bounded so a stored profile can never grow
  // unbounded; trimmed empty strings are normalized away by the caller (the store).
  otherNotes: z.string().max(280).optional(),
  consentHealthDataAt: z.string().datetime().optional(),
});

export type PerceivedMenuInput = z.infer<typeof perceivedMenuSchema>;
export type UserProfileInput = z.infer<typeof userProfileSchema>;
