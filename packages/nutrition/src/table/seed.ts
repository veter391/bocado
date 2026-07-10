import type { FoodRecord } from '../types';

/**
 * SEED / FIXTURE DATA — approximate per-100g values for ~30 common European
 * restaurant ingredients. Used for unit tests and demo only.
 *
 * THIS IS NOT THE PRODUCTION DATASET. Production ingests the real CIQUAL
 * (Etalab 2.0) + USDA FoodData Central (CC0) tables into this same FoodRecord
 * shape (see the ingestion script). Values here are rounded approximations and
 * MUST NOT be shipped as authoritative nutrition.
 */
export const SEED_FOODS: FoodRecord[] = [
  { id: 'seed-chicken', db: 'CIQUAL', name: 'chicken breast', aliases: ['chicken', 'pollo', 'poulet'], category: 'meat', state: 'cooked', per100g: { kcal: 165, protein: 31, fat: 3.6, satFat: 1, carbs: 0, sugar: 0, salt: 0.1 } },
  { id: 'seed-beef', db: 'CIQUAL', name: 'beef steak', aliases: ['beef', 'ternera', 'boeuf', 'steak'], category: 'meat', state: 'cooked', per100g: { kcal: 250, protein: 26, fat: 15, satFat: 6, carbs: 0, sugar: 0, salt: 0.1 } },
  { id: 'seed-pork', db: 'CIQUAL', name: 'pork', aliases: ['cerdo', 'porc'], category: 'meat', state: 'cooked', per100g: { kcal: 242, protein: 27, fat: 14, satFat: 5, carbs: 0, sugar: 0, salt: 0.1 } },
  { id: 'seed-salmon', db: 'CIQUAL', name: 'salmon', aliases: ['salmón', 'saumon'], category: 'fish', state: 'cooked', per100g: { kcal: 208, protein: 20, fat: 13, satFat: 3, carbs: 0, sugar: 0, salt: 0.1 } },
  { id: 'seed-cod', db: 'CIQUAL', name: 'cod', aliases: ['bacalao', 'cabillaud'], category: 'fish', state: 'cooked', per100g: { kcal: 105, protein: 23, fat: 1, carbs: 0, salt: 0.2 } },
  { id: 'seed-prawn', db: 'CIQUAL', name: 'prawns', aliases: ['shrimp', 'gambas', 'crevettes'], category: 'seafood', state: 'cooked', per100g: { kcal: 99, protein: 24, fat: 0.3, carbs: 0, salt: 0.6 } },
  { id: 'seed-egg', db: 'USDA', name: 'egg', aliases: ['huevo', 'oeuf', 'eggs'], category: 'egg', state: 'cooked', per100g: { kcal: 155, protein: 13, fat: 11, satFat: 3.3, carbs: 1.1, sugar: 1.1, salt: 0.3 } },
  { id: 'seed-rice', db: 'CIQUAL', name: 'white rice', aliases: ['rice', 'arroz', 'riz'], category: 'grain', state: 'cooked', per100g: { kcal: 130, protein: 2.7, fat: 0.3, carbs: 28, sugar: 0.1, salt: 0 } },
  { id: 'seed-pasta', db: 'CIQUAL', name: 'pasta', aliases: ['spaghetti', 'macarrones', 'pâtes', 'noodles'], category: 'grain', state: 'cooked', per100g: { kcal: 157, protein: 5.8, fat: 0.9, carbs: 31, sugar: 0.6, salt: 0 } },
  { id: 'seed-bread', db: 'CIQUAL', name: 'bread', aliases: ['pan', 'pain', 'baguette'], category: 'grain', state: 'cooked', per100g: { kcal: 265, protein: 9, fat: 3.2, carbs: 49, sugar: 5, salt: 1.2 } },
  { id: 'seed-potato', db: 'CIQUAL', name: 'potato', aliases: ['potatoes', 'patata', 'pomme de terre'], category: 'vegetable', state: 'cooked', per100g: { kcal: 87, protein: 2, fat: 0.1, carbs: 20, sugar: 0.9, salt: 0 } },
  { id: 'seed-fries', db: 'CIQUAL', name: 'french fries', aliases: ['fries', 'patatas fritas', 'frites', 'chips'], category: 'fried', state: 'cooked', per100g: { kcal: 312, protein: 3.4, fat: 15, satFat: 2.3, carbs: 41, sugar: 0.3, salt: 0.5 } },
  { id: 'seed-tomato', db: 'CIQUAL', name: 'tomato', aliases: ['tomatoes', 'tomate'], category: 'vegetable', state: 'raw', per100g: { kcal: 18, protein: 0.9, fat: 0.2, carbs: 3.9, sugar: 2.6, salt: 0 } },
  { id: 'seed-lettuce', db: 'CIQUAL', name: 'lettuce', aliases: ['salad leaves', 'lechuga', 'laitue'], category: 'vegetable', state: 'raw', per100g: { kcal: 15, protein: 1.4, fat: 0.2, carbs: 2.9, sugar: 0.8, salt: 0 } },
  { id: 'seed-onion', db: 'CIQUAL', name: 'onion', aliases: ['cebolla', 'oignon'], category: 'vegetable', state: 'raw', per100g: { kcal: 40, protein: 1.1, fat: 0.1, carbs: 9, sugar: 4.2, salt: 0 } },
  { id: 'seed-garlic', db: 'CIQUAL', name: 'garlic', aliases: ['ajo', 'ail'], category: 'vegetable', state: 'raw', per100g: { kcal: 149, protein: 6.4, fat: 0.5, carbs: 33, sugar: 1, salt: 0 } },
  { id: 'seed-mushroom', db: 'CIQUAL', name: 'mushroom', aliases: ['mushrooms', 'champiñón', 'champignon'], category: 'vegetable', state: 'cooked', per100g: { kcal: 22, protein: 3.1, fat: 0.3, carbs: 3.3, sugar: 2, salt: 0 } },
  { id: 'seed-olive-oil', db: 'CIQUAL', name: 'olive oil', aliases: ['oil', 'aceite de oliva', "huile d'olive"], category: 'oil', state: 'raw', per100g: { kcal: 884, protein: 0, fat: 100, satFat: 14, carbs: 0, sugar: 0, salt: 0 } },
  { id: 'seed-butter', db: 'CIQUAL', name: 'butter', aliases: ['mantequilla', 'beurre'], category: 'fat', state: 'raw', per100g: { kcal: 717, protein: 0.9, fat: 81, satFat: 51, carbs: 0.1, sugar: 0.1, salt: 1.4 } },
  { id: 'seed-cheese', db: 'CIQUAL', name: 'cheese', aliases: ['queso', 'fromage', 'cheddar'], category: 'dairy', state: 'raw', per100g: { kcal: 402, protein: 25, fat: 33, satFat: 21, carbs: 1.3, sugar: 0.5, salt: 1.8 } },
  { id: 'seed-mozzarella', db: 'CIQUAL', name: 'mozzarella', aliases: ['fresh cheese'], category: 'dairy', state: 'raw', per100g: { kcal: 280, protein: 22, fat: 22, satFat: 13, carbs: 2.2, sugar: 1, salt: 0.6 } },
  { id: 'seed-milk', db: 'CIQUAL', name: 'milk', aliases: ['leche', 'lait'], category: 'dairy', state: 'raw', per100g: { kcal: 64, protein: 3.3, fat: 3.6, satFat: 2.3, carbs: 4.8, sugar: 4.8, salt: 0.1 } },
  { id: 'seed-cream', db: 'CIQUAL', name: 'cream', aliases: ['nata', 'crème', 'crema'], category: 'dairy', state: 'raw', per100g: { kcal: 292, protein: 2.4, fat: 30, satFat: 19, carbs: 3, sugar: 3, salt: 0.1 } },
  { id: 'seed-tuna', db: 'CIQUAL', name: 'tuna', aliases: ['atún', 'thon'], category: 'fish', state: 'cooked', per100g: { kcal: 132, protein: 28, fat: 1, carbs: 0, salt: 0.4 } },
  { id: 'seed-chickpea', db: 'CIQUAL', name: 'chickpeas', aliases: ['garbanzos', 'pois chiches', 'hummus base'], category: 'legume', state: 'cooked', per100g: { kcal: 164, protein: 9, fat: 2.6, carbs: 27, sugar: 4.8, salt: 0 } },
  { id: 'seed-lentil', db: 'CIQUAL', name: 'lentils', aliases: ['lentejas', 'lentilles'], category: 'legume', state: 'cooked', per100g: { kcal: 116, protein: 9, fat: 0.4, carbs: 20, sugar: 1.8, salt: 0 } },
  { id: 'seed-avocado', db: 'CIQUAL', name: 'avocado', aliases: ['aguacate', 'avocat'], category: 'fruit', state: 'raw', per100g: { kcal: 160, protein: 2, fat: 15, satFat: 2.1, carbs: 9, sugar: 0.7, salt: 0 } },
  { id: 'seed-sugar', db: 'CIQUAL', name: 'sugar', aliases: ['azúcar', 'sucre'], category: 'sugar', state: 'raw', per100g: { kcal: 387, protein: 0, fat: 0, carbs: 100, sugar: 100, salt: 0 } },
  { id: 'seed-chocolate', db: 'CIQUAL', name: 'chocolate', aliases: ['chocolat', 'cacao'], category: 'sweet', state: 'raw', per100g: { kcal: 546, protein: 4.9, fat: 31, satFat: 19, carbs: 61, sugar: 48, salt: 0.1 } },
  { id: 'seed-flour', db: 'CIQUAL', name: 'wheat flour', aliases: ['flour', 'harina', 'farine'], category: 'grain', state: 'raw', per100g: { kcal: 364, protein: 10, fat: 1, carbs: 76, sugar: 0.3, salt: 0 } },
];
