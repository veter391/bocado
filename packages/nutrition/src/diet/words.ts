/**
 * Diet-conflict ingredient-word groups — the single source of truth shared by the
 * suitability rules (`../suitability/rules`) and the reusable diet-filter helpers
 * (`./filter`). Kept here so the verdict engine and the Pro "smart filter" list
 * can NEVER drift apart: a dish the engine calls "Not vegan" is exactly a dish the
 * vegan filter drops.
 *
 * Pure data + a whole-word membership test. No RN, no I/O, no clock, no randomness.
 * Words are lowercase + accent-free because they run against `normalizeName`d text.
 */

export const MEAT_WORDS = [
  'meat', 'beef', 'steak', 'ternera', 'boeuf', 'pork', 'cerdo', 'porc', 'bacon',
  'ham', 'jamon', 'jambon', 'chicken', 'pollo', 'poulet', 'turkey', 'pavo', 'duck',
  'pato', 'lamb', 'cordero', 'agneau', 'veal', 'sausage', 'chorizo', 'salami',
  'pepperoni', 'prosciutto', 'gelatin', 'gelatine', 'lard',
] as const;

export const FISH_AND_SEAFOOD_WORDS = [
  'fish', 'pescado', 'poisson', 'salmon', 'saumon', 'cod', 'bacalao', 'tuna',
  'atun', 'thon', 'anchovy', 'anchovies', 'anchoa', 'sardine', 'sardina', 'trout',
  'trucha', 'hake', 'merluza', 'prawn', 'prawns', 'shrimp', 'gamba', 'gambas',
  'crab', 'lobster', 'mussel', 'mussels', 'clam', 'oyster', 'squid', 'calamari',
  'calamares', 'octopus', 'pulpo', 'scallop', 'seafood', 'mariscos',
] as const;

export const ANIMAL_PRODUCT_WORDS = [
  // Dairy + eggs + honey — forbidden for vegans on top of meat/fish.
  // Includes non-Western dairy the long tail hits: paneer/halloumi/labneh/kefir.
  'milk', 'leche', 'lait', 'dairy', 'cheese', 'queso', 'fromage', 'cheddar',
  'mozzarella', 'parmesan', 'feta', 'paneer', 'halloumi', 'labneh', 'kefir',
  'butter', 'mantequilla', 'beurre', 'cream', 'nata', 'crema', 'yogurt',
  'yoghurt', 'yogur', 'lassi', 'egg', 'eggs', 'huevo', 'oeuf', 'mayonnaise',
  'honey', 'miel', 'ghee', 'bechamel',
] as const;

export const GLUTEN_WORDS = [
  // 'seitan' is PURE wheat gluten — a gluten-free user must never get a silent pass.
  // 'naan' is a wheat flatbread; both are added for non-Western coverage.
  'wheat', 'flour', 'harina', 'farine', 'bread', 'pan', 'pain', 'baguette',
  'pasta', 'spaghetti', 'macaroni', 'macarrones', 'noodles', 'couscous',
  'semolina', 'rye', 'barley', 'malt', 'breaded', 'breadcrumbs', 'crouton',
  'croutons', 'pizza', 'dough', 'pastry', 'seitan', 'naan',
] as const;

export const DAIRY_WORDS = [
  // Includes non-Western dairy the long tail hits: paneer (Indian cheese),
  // halloumi (Cypriot cheese), labneh (strained yogurt), kefir/lassi (dairy drinks).
  'milk', 'leche', 'lait', 'dairy', 'cheese', 'queso', 'fromage', 'cheddar',
  'mozzarella', 'parmesan', 'feta', 'paneer', 'halloumi', 'labneh', 'kefir',
  'lassi', 'butter', 'mantequilla', 'beurre', 'cream', 'nata', 'crema',
  'yogurt', 'yoghurt', 'yogur', 'ghee', 'bechamel', 'custard',
] as const;

/**
 * Pork + common haram/non-kosher animal derivatives. Used ONLY for the neutral
 * halal/kosher "confirm with staff" caveat — never a name-based avoid. Pork is haram
 * (Islam) and non-kosher (Judaism); gelatin/lard are common hidden pork derivatives.
 */
export const PORK_AND_HARAM_WORDS = [
  'pork', 'cerdo', 'porc', 'bacon', 'ham', 'jamon', 'jambon', 'prosciutto',
  'serrano', 'chorizo', 'pepperoni', 'salami', 'lard', 'lardons', 'gelatin',
  'gelatine', 'gelatina',
] as const;

/**
 * Shellfish (crustaceans + molluscs). Used ONLY for the neutral kosher caveat
 * (shellfish are never kosher) — never a name-based avoid.
 */
export const SHELLFISH_WORDS = [
  'prawn', 'prawns', 'shrimp', 'gamba', 'gambas', 'crab', 'lobster', 'crayfish',
  'langoustine', 'langostino', 'mussel', 'mussels', 'clam', 'clams', 'oyster',
  'oysters', 'squid', 'calamari', 'calamares', 'octopus', 'pulpo', 'scallop',
  'scallops', 'mariscos',
] as const;

/**
 * Alcohol words. Used ONLY for the neutral halal "confirm with staff" caveat
 * (alcohol is haram) — never a name-based avoid.
 */
export const ALCOHOL_WORDS = [
  'wine', 'vino', 'vin', 'beer', 'cerveza', 'biere', 'rum', 'ron', 'vodka',
  'whisky', 'whiskey', 'brandy', 'sherry', 'cognac', 'liqueur', 'licor',
  'sake', 'champagne', 'prosecco',
] as const;

/** Whole-word membership test of any pattern in a list against a token array. */
export function anyWord(words: readonly string[], patterns: readonly string[]): boolean {
  return patterns.some((p) => words.includes(p));
}
