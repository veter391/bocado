/**
 * Sample scanned menu — lets the screens render with realistic data before the
 * perception/engine API exists. Mirrors the production contract exactly
 * (`ScannedMenu` from '@bocado/shared'): the model would produce text +
 * ingredient guesses; everything a user reads as fact (nutrition, suitability,
 * allergen flags) is shown here as if deterministic code had filled it in.
 *
 * Mixed verdicts (good / caution / avoid), a couple of AI-illustrated dishes,
 * allergen flags, and nutrition ranges with confidence. Dinner context.
 *
 * NOTE: this is mock data only. Do not ship it. Replace with API output.
 */
import type { ScannedMenu } from '@bocado/shared';
import { ALLERGEN_DISCLAIMER } from '@bocado/shared';

export const SAMPLE_MENU_ID = 'mock-menu-trattoria-dinner';

export const sampleMenu: ScannedMenu = {
  id: SAMPLE_MENU_ID,
  createdAt: '2026-06-16T20:10:00.000Z',
  context: 'dinner',
  title: 'Trattoria da Lucia',
  dishes: [
    {
      id: 'dish-insalata-verde',
      originalText: 'Insalata verde con vinaigrette',
      translatedName: 'Green salad with light dressing',
      section: 'Starters',
      explanation:
        'A simple plate of fresh leaves with a little oil-and-vinegar dressing. Light and easy on the stomach.',
      ingredients: [
        { name: 'Mixed leaves', grams: 80 },
        { name: 'Olive oil', grams: 10 },
        { name: 'Vinegar', grams: 5 },
      ],
      nutrition: {
        kcal: { min: 110, max: 160, unit: 'kcal' },
        protein: { min: 2, max: 4, unit: 'g' },
        fat: { min: 9, max: 13, unit: 'g' },
        carbs: { min: 4, max: 7, unit: 'g' },
        salt: { min: 0.2, max: 0.5, unit: 'g' },
        confidence: 'high',
        sources: [{ db: 'CIQUAL', recordId: '20009', name: 'Green salad, dressed' }],
      },
      allergenFlags: [],
      suitability: {
        level: 'good',
        label: 'Good now',
        reasons: ['Light for the evening', 'Low in calories'],
        confidence: 'high',
        uncertain: false,
      },
    },
    {
      id: 'dish-minestrone',
      originalText: 'Minestrone della casa',
      translatedName: 'House vegetable soup',
      section: 'Starters',
      explanation:
        'A warm soup of seasonal vegetables and beans. Gentle, filling, and not heavy.',
      ingredients: [
        { name: 'Mixed vegetables', grams: 180 },
        { name: 'White beans', grams: 60 },
        { name: 'Celery', grams: 20 },
        { name: 'Olive oil', grams: 8 },
      ],
      nutrition: {
        kcal: { min: 180, max: 240, unit: 'kcal' },
        protein: { min: 7, max: 11, unit: 'g' },
        fat: { min: 5, max: 9, unit: 'g' },
        carbs: { min: 24, max: 32, unit: 'g' },
        salt: { min: 0.8, max: 1.3, unit: 'g' },
        confidence: 'medium',
        sources: [{ db: 'CIQUAL', recordId: '20512', name: 'Minestrone soup' }],
      },
      allergenFlags: [
        { allergen: 'celery', basis: 'ingredient-match', note: ALLERGEN_DISCLAIMER },
      ],
      suitability: {
        level: 'good',
        label: 'Good now',
        reasons: ['Warm and light', 'Good protein from beans'],
        confidence: 'high',
        uncertain: false,
      },
    },
    {
      id: 'dish-branzino',
      originalText: 'Branzino al forno con verdure',
      translatedName: 'Baked sea bass with vegetables',
      section: 'Mains',
      explanation:
        'A whole white fish baked in the oven, served with roasted vegetables. Lean and light.',
      ingredients: [
        { name: 'Sea bass', grams: 200 },
        { name: 'Mixed vegetables', grams: 150 },
        { name: 'Olive oil', grams: 12 },
        { name: 'Lemon', grams: 15 },
      ],
      nutrition: {
        kcal: { min: 320, max: 410, unit: 'kcal' },
        protein: { min: 34, max: 42, unit: 'g' },
        fat: { min: 14, max: 20, unit: 'g' },
        carbs: { min: 8, max: 14, unit: 'g' },
        salt: { min: 0.6, max: 1.1, unit: 'g' },
        confidence: 'high',
        sources: [{ db: 'USDA', recordId: '15261', name: 'Sea bass, baked' }],
      },
      allergenFlags: [{ allergen: 'fish', basis: 'name-keyword', note: ALLERGEN_DISCLAIMER }],
      suitability: {
        level: 'good',
        label: 'Good now',
        reasons: ['High in protein', 'Light for the evening'],
        confidence: 'high',
        uncertain: false,
      },
    },
    {
      id: 'dish-risotto-funghi',
      originalText: 'Risotto ai funghi porcini',
      translatedName: 'Mushroom risotto',
      section: 'Mains',
      explanation:
        'Creamy rice cooked slowly with mushrooms, butter and cheese. Tasty but rich for the evening.',
      ingredients: [
        { name: 'Arborio rice', grams: 90 },
        { name: 'Porcini mushrooms', grams: 60 },
        { name: 'Butter', grams: 20 },
        { name: 'Parmesan', grams: 25 },
      ],
      nutrition: {
        kcal: { min: 520, max: 640, unit: 'kcal' },
        protein: { min: 12, max: 16, unit: 'g' },
        fat: { min: 22, max: 30, unit: 'g' },
        satFat: { min: 12, max: 18, unit: 'g' },
        carbs: { min: 62, max: 74, unit: 'g' },
        salt: { min: 1.4, max: 2.0, unit: 'g' },
        confidence: 'medium',
        sources: [{ db: 'CIQUAL', recordId: '25001', name: 'Risotto, mushroom' }],
      },
      allergenFlags: [{ allergen: 'milk', basis: 'ingredient-match', note: ALLERGEN_DISCLAIMER }],
      suitability: {
        level: 'caution',
        label: 'Heavy late',
        reasons: ['Rich and filling', 'Better earlier in the day'],
        confidence: 'high',
        uncertain: false,
      },
      imageUrl: 'https://images.bocado.invalid/ai/mushroom-risotto.png',
      imageIsAi: true,
    },
    {
      id: 'dish-pollo-griglia',
      originalText: 'Pollo alla griglia con insalata',
      translatedName: 'Grilled chicken with salad',
      section: 'Mains',
      explanation:
        'A grilled chicken breast served with a side salad. Plenty of protein, not heavy.',
      ingredients: [
        { name: 'Chicken breast', grams: 180 },
        { name: 'Mixed leaves', grams: 70 },
        { name: 'Olive oil', grams: 10 },
      ],
      nutrition: {
        kcal: { min: 340, max: 430, unit: 'kcal' },
        protein: { min: 38, max: 46, unit: 'g' },
        fat: { min: 12, max: 18, unit: 'g' },
        carbs: { min: 3, max: 7, unit: 'g' },
        salt: { min: 0.5, max: 0.9, unit: 'g' },
        confidence: 'high',
        sources: [{ db: 'USDA', recordId: '05064', name: 'Chicken breast, grilled' }],
      },
      allergenFlags: [],
      suitability: {
        level: 'good',
        label: 'Good now',
        reasons: ['High in protein', 'Light for the evening'],
        confidence: 'high',
        uncertain: false,
      },
    },
    {
      id: 'dish-carbonara',
      originalText: 'Spaghetti alla carbonara',
      translatedName: 'Carbonara pasta',
      section: 'Pasta',
      explanation:
        'Pasta in a rich sauce of egg, cured pork and hard cheese. Very filling and heavy late in the day.',
      ingredients: [
        { name: 'Spaghetti', grams: 120 },
        { name: 'Egg', grams: 50 },
        { name: 'Guanciale (cured pork)', grams: 40 },
        { name: 'Pecorino cheese', grams: 30 },
      ],
      nutrition: {
        kcal: { min: 680, max: 820, unit: 'kcal' },
        protein: { min: 24, max: 30, unit: 'g' },
        fat: { min: 32, max: 42, unit: 'g' },
        satFat: { min: 14, max: 20, unit: 'g' },
        carbs: { min: 70, max: 84, unit: 'g' },
        salt: { min: 1.8, max: 2.6, unit: 'g' },
        confidence: 'medium',
        sources: [{ db: 'CIQUAL', recordId: '25410', name: 'Spaghetti carbonara' }],
      },
      allergenFlags: [
        { allergen: 'gluten', basis: 'ingredient-match', note: ALLERGEN_DISCLAIMER },
        { allergen: 'eggs', basis: 'ingredient-match', note: ALLERGEN_DISCLAIMER },
        { allergen: 'milk', basis: 'ingredient-match', note: ALLERGEN_DISCLAIMER },
      ],
      suitability: {
        level: 'caution',
        label: 'Heavy late',
        reasons: ['Rich and very filling', 'High in salt'],
        confidence: 'high',
        uncertain: false,
      },
      imageUrl: 'https://images.bocado.invalid/ai/carbonara.png',
      imageIsAi: true,
    },
    {
      id: 'dish-gamberi-fritti',
      originalText: 'Gamberi fritti in pastella',
      translatedName: 'Deep-fried prawns in batter',
      section: 'Mains',
      explanation:
        'Prawns coated in batter and deep-fried. Greasy and heavy, best avoided in the evening.',
      ingredients: [
        { name: 'Prawns', grams: 120 },
        { name: 'Wheat batter', grams: 60 },
        { name: 'Frying oil', grams: 30 },
      ],
      nutrition: {
        kcal: { min: 560, max: 700, unit: 'kcal' },
        protein: { min: 18, max: 24, unit: 'g' },
        fat: { min: 34, max: 46, unit: 'g' },
        satFat: { min: 6, max: 10, unit: 'g' },
        carbs: { min: 38, max: 50, unit: 'g' },
        salt: { min: 1.6, max: 2.4, unit: 'g' },
        confidence: 'low',
        sources: [{ db: 'OFF', recordId: 'off-3017620', name: 'Battered fried prawns' }],
      },
      allergenFlags: [
        { allergen: 'crustaceans', basis: 'name-keyword', note: ALLERGEN_DISCLAIMER },
        { allergen: 'gluten', basis: 'ingredient-match', note: ALLERGEN_DISCLAIMER },
      ],
      suitability: {
        level: 'avoid',
        label: 'Avoid now',
        reasons: ['Deep-fried and greasy', 'Heavy for the evening'],
        confidence: 'high',
        uncertain: false,
      },
    },
    {
      id: 'dish-tiramisu',
      originalText: 'Tiramisù della casa',
      translatedName: 'Tiramisu',
      section: 'Desserts',
      explanation:
        'A sweet dessert of coffee-soaked biscuits, mascarpone cheese and cocoa. Sugary and rich.',
      ingredients: [
        { name: 'Mascarpone', grams: 70 },
        { name: 'Savoiardi biscuits', grams: 50 },
        { name: 'Egg', grams: 30 },
        { name: 'Sugar', grams: 25 },
      ],
      nutrition: {
        kcal: { min: 420, max: 540, unit: 'kcal' },
        protein: { min: 6, max: 9, unit: 'g' },
        fat: { min: 26, max: 34, unit: 'g' },
        satFat: { min: 15, max: 21, unit: 'g' },
        carbs: { min: 38, max: 48, unit: 'g' },
        sugar: { min: 28, max: 36, unit: 'g' },
        salt: { min: 0.2, max: 0.4, unit: 'g' },
        confidence: 'medium',
        sources: [{ db: 'CIQUAL', recordId: '26012', name: 'Tiramisu' }],
      },
      allergenFlags: [
        { allergen: 'milk', basis: 'ingredient-match', note: ALLERGEN_DISCLAIMER },
        { allergen: 'eggs', basis: 'ingredient-match', note: ALLERGEN_DISCLAIMER },
        { allergen: 'gluten', basis: 'ingredient-match', note: ALLERGEN_DISCLAIMER },
      ],
      suitability: {
        level: 'avoid',
        label: 'Avoid now',
        reasons: ['Very sugary', 'Rich and heavy late'],
        confidence: 'high',
        uncertain: false,
      },
    },
  ],
};

/** Look up a menu by id (mock; swaps out for a store/API later). */
export function getMockMenu(menuId: string): ScannedMenu | undefined {
  return menuId === sampleMenu.id ? sampleMenu : undefined;
}

/** Look up a single dish within a mock menu. */
export function getMockDish(menuId: string, dishId: string) {
  return getMockMenu(menuId)?.dishes.find((d) => d.id === dishId);
}
