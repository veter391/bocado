/**
 * CURATED dataset — ~200 common European restaurant ingredients, hand-authored
 * with realistic per-100 g values, a coarse `category` (drives cooking yield) and a
 * `state` (raw/cooked, so the engine does not double-apply a yield).
 *
 * WHY THIS EXISTS (alongside the generated CIQUAL/USDA module):
 *  - The generated table is BROAD but noisy: its names come straight from CIQUAL/USDA
 *    descriptions ("Pastis (anise-flavoured spirit)", "Beef, ground, 80% lean...")
 *    which the fuzzy matcher resolves unevenly for the short names the perception
 *    layer emits ("chicken", "rice", "salmon").
 *  - This curated set guarantees high-quality coverage of the foods a restaurant menu
 *    actually contains, with EN/ES/FR aliases the matcher hits cleanly, so the engine
 *    is solid RIGHT NOW even before the generated data is regenerated.
 *
 * HONESTY: these are realistic, literature-aligned approximations for GENERIC foods
 * (rounded to the precision the source databases publish). They are NOT a single
 * authoritative number — the compute layer always widens them into a RANGE with a
 * confidence, and the product surfaces "Estimate only, not exact." Salt is NaCl in
 * grams. Optional fields (satFat/carbs/sugar) are set only where they are meaningful.
 *
 * `db` is tagged 'CIQUAL' or 'USDA' to reflect which public source the value tracks
 * (so `sources[]` provenance and the UI attribution stay truthful); the `curated-`
 * id prefix marks that the row was hand-verified rather than machine-ingested.
 */
import type { FoodRecord } from '../types';

export const CURATED_FOODS: FoodRecord[] = [
  // ---------------------------------------------------------------- MEAT (cooked)
  { id: 'curated-chicken-breast', db: 'CIQUAL', name: 'chicken breast', aliases: ['chicken', 'pollo', 'poulet', 'chicken fillet'], category: 'meat', state: 'cooked', per100g: { kcal: 165, protein: 31, fat: 3.6, satFat: 1, carbs: 0, sugar: 0, salt: 0.1 } },
  { id: 'curated-chicken-thigh', db: 'CIQUAL', name: 'chicken thigh', aliases: ['chicken leg', 'muslo de pollo', 'cuisse de poulet'], category: 'meat', state: 'cooked', per100g: { kcal: 209, protein: 26, fat: 11, satFat: 3, carbs: 0, sugar: 0, salt: 0.2 } },
  { id: 'curated-beef-steak', db: 'CIQUAL', name: 'beef steak', aliases: ['beef', 'steak', 'ternera', 'boeuf', 'entrecote', 'sirloin'], category: 'meat', state: 'cooked', per100g: { kcal: 250, protein: 26, fat: 15, satFat: 6, carbs: 0, sugar: 0, salt: 0.1 } },
  { id: 'curated-beef-mince', db: 'USDA', name: 'ground beef', aliases: ['minced beef', 'beef mince', 'carne picada', 'hamburger patty', 'burger patty'], category: 'meat', state: 'cooked', per100g: { kcal: 254, protein: 26, fat: 16, satFat: 6.3, carbs: 0, sugar: 0, salt: 0.2 } },
  { id: 'curated-pork-loin', db: 'CIQUAL', name: 'pork loin', aliases: ['pork', 'cerdo', 'porc', 'lomo'], category: 'meat', state: 'cooked', per100g: { kcal: 242, protein: 27, fat: 14, satFat: 5, carbs: 0, sugar: 0, salt: 0.1 } },
  { id: 'curated-bacon', db: 'CIQUAL', name: 'bacon', aliases: ['panceta', 'lardons', 'streaky bacon'], category: 'meat', state: 'cooked', per100g: { kcal: 541, protein: 37, fat: 42, satFat: 14, carbs: 1.4, sugar: 0, salt: 5 } },
  { id: 'curated-ham', db: 'CIQUAL', name: 'ham', aliases: ['jamon', 'jambon', 'cooked ham'], category: 'meat', state: 'cooked', per100g: { kcal: 145, protein: 21, fat: 6, satFat: 2, carbs: 1, sugar: 1, salt: 2.3 } },
  { id: 'curated-serrano-ham', db: 'CIQUAL', name: 'serrano ham', aliases: ['jamon serrano', 'prosciutto', 'cured ham'], category: 'meat', state: 'cooked', per100g: { kcal: 241, protein: 31, fat: 13, satFat: 4.5, carbs: 0, sugar: 0, salt: 5.5 } },
  { id: 'curated-chorizo', db: 'CIQUAL', name: 'chorizo', aliases: ['spanish sausage'], category: 'meat', state: 'cooked', per100g: { kcal: 455, protein: 24, fat: 38, satFat: 14, carbs: 2, sugar: 1, salt: 3 } },
  { id: 'curated-sausage', db: 'CIQUAL', name: 'sausage', aliases: ['salchicha', 'saucisse', 'pork sausage'], category: 'meat', state: 'cooked', per100g: { kcal: 300, protein: 13, fat: 27, satFat: 10, carbs: 2, sugar: 1, salt: 1.8 } },
  { id: 'curated-lamb', db: 'CIQUAL', name: 'lamb', aliases: ['cordero', 'agneau', 'lamb chop'], category: 'meat', state: 'cooked', per100g: { kcal: 294, protein: 25, fat: 21, satFat: 9, carbs: 0, sugar: 0, salt: 0.2 } },
  { id: 'curated-turkey', db: 'CIQUAL', name: 'turkey', aliases: ['pavo', 'dinde', 'turkey breast'], category: 'meat', state: 'cooked', per100g: { kcal: 135, protein: 29, fat: 1.7, satFat: 0.5, carbs: 0, sugar: 0, salt: 0.2 } },
  { id: 'curated-duck', db: 'CIQUAL', name: 'duck', aliases: ['pato', 'canard', 'duck breast', 'magret'], category: 'meat', state: 'cooked', per100g: { kcal: 337, protein: 19, fat: 28, satFat: 10, carbs: 0, sugar: 0, salt: 0.2 } },
  { id: 'curated-veal', db: 'CIQUAL', name: 'veal', aliases: ['ternera blanca', 'veau'], category: 'meat', state: 'cooked', per100g: { kcal: 172, protein: 31, fat: 5, satFat: 1.8, carbs: 0, sugar: 0, salt: 0.1 } },
  { id: 'curated-meatball', db: 'CIQUAL', name: 'meatball', aliases: ['albondiga', 'albondigas', 'boulette'], category: 'meat', state: 'cooked', per100g: { kcal: 230, protein: 16, fat: 16, satFat: 6, carbs: 6, sugar: 1, salt: 1 } },
  { id: 'curated-pepperoni', db: 'USDA', name: 'pepperoni', aliases: ['salami', 'salame'], category: 'meat', state: 'cooked', per100g: { kcal: 494, protein: 20, fat: 44, satFat: 16, carbs: 1.2, sugar: 0, salt: 4.5 } },

  // ---------------------------------------------------------------- FISH (cooked)
  { id: 'curated-salmon', db: 'CIQUAL', name: 'salmon', aliases: ['salmon fillet', 'saumon'], category: 'fish', state: 'cooked', per100g: { kcal: 208, protein: 20, fat: 13, satFat: 3, carbs: 0, sugar: 0, salt: 0.1 } },
  { id: 'curated-cod', db: 'CIQUAL', name: 'cod', aliases: ['bacalao', 'cabillaud', 'cod fillet'], category: 'fish', state: 'cooked', per100g: { kcal: 105, protein: 23, fat: 1, carbs: 0, salt: 0.2 } },
  { id: 'curated-tuna', db: 'CIQUAL', name: 'tuna', aliases: ['atun', 'thon', 'tuna steak'], category: 'fish', state: 'cooked', per100g: { kcal: 132, protein: 28, fat: 1, carbs: 0, salt: 0.4 } },
  { id: 'curated-hake', db: 'CIQUAL', name: 'hake', aliases: ['merluza', 'merlu'], category: 'fish', state: 'cooked', per100g: { kcal: 90, protein: 18, fat: 1.3, carbs: 0, salt: 0.2 } },
  { id: 'curated-sea-bass', db: 'CIQUAL', name: 'sea bass', aliases: ['lubina', 'bar', 'branzino'], category: 'fish', state: 'cooked', per100g: { kcal: 124, protein: 23, fat: 3, satFat: 0.7, carbs: 0, salt: 0.2 } },
  { id: 'curated-trout', db: 'CIQUAL', name: 'trout', aliases: ['trucha', 'truite'], category: 'fish', state: 'cooked', per100g: { kcal: 148, protein: 21, fat: 7, satFat: 1.5, carbs: 0, salt: 0.1 } },
  { id: 'curated-sardine', db: 'CIQUAL', name: 'sardine', aliases: ['sardina', 'sardines', 'sardinas'], category: 'fish', state: 'cooked', per100g: { kcal: 208, protein: 25, fat: 11, satFat: 2.7, carbs: 0, salt: 0.5 } },
  { id: 'curated-anchovy', db: 'CIQUAL', name: 'anchovy', aliases: ['anchoa', 'anchoas', 'anchois', 'anchovies'], category: 'fish', state: 'cooked', per100g: { kcal: 210, protein: 29, fat: 10, satFat: 2.2, carbs: 0, salt: 3.5 } },
  { id: 'curated-mackerel', db: 'CIQUAL', name: 'mackerel', aliases: ['caballa', 'maquereau'], category: 'fish', state: 'cooked', per100g: { kcal: 262, protein: 24, fat: 18, satFat: 4.2, carbs: 0, salt: 0.3 } },

  // ----------------------------------------------------------- SEAFOOD (cooked)
  { id: 'curated-prawn', db: 'CIQUAL', name: 'prawns', aliases: ['prawn', 'shrimp', 'gamba', 'gambas', 'crevette', 'crevettes', 'langostino'], category: 'seafood', state: 'cooked', per100g: { kcal: 99, protein: 24, fat: 0.3, carbs: 0, salt: 0.6 } },
  { id: 'curated-squid', db: 'CIQUAL', name: 'squid', aliases: ['calamar', 'calamares', 'calmar', 'calamari'], category: 'seafood', state: 'cooked', per100g: { kcal: 92, protein: 16, fat: 1.4, carbs: 3, salt: 0.4 } },
  { id: 'curated-octopus', db: 'CIQUAL', name: 'octopus', aliases: ['pulpo', 'poulpe'], category: 'seafood', state: 'cooked', per100g: { kcal: 164, protein: 30, fat: 2.1, carbs: 4, salt: 0.5 } },
  { id: 'curated-mussel', db: 'CIQUAL', name: 'mussels', aliases: ['mussel', 'mejillon', 'mejillones', 'moules'], category: 'seafood', state: 'cooked', per100g: { kcal: 172, protein: 24, fat: 4.5, satFat: 0.9, carbs: 7, salt: 0.9 } },
  { id: 'curated-clam', db: 'CIQUAL', name: 'clams', aliases: ['clam', 'almeja', 'almejas', 'palourdes'], category: 'seafood', state: 'cooked', per100g: { kcal: 148, protein: 26, fat: 2, carbs: 5, salt: 1.2 } },
  { id: 'curated-crab', db: 'CIQUAL', name: 'crab', aliases: ['cangrejo', 'crabe'], category: 'seafood', state: 'cooked', per100g: { kcal: 97, protein: 19, fat: 1.5, carbs: 0, salt: 1.2 } },
  { id: 'curated-lobster', db: 'CIQUAL', name: 'lobster', aliases: ['bogavante', 'langosta', 'homard'], category: 'seafood', state: 'cooked', per100g: { kcal: 89, protein: 19, fat: 0.9, carbs: 0, salt: 0.5 } },
  { id: 'curated-scallop', db: 'CIQUAL', name: 'scallops', aliases: ['scallop', 'vieira', 'vieiras', 'saint-jacques'], category: 'seafood', state: 'cooked', per100g: { kcal: 111, protein: 21, fat: 0.8, carbs: 5, salt: 0.6 } },

  // ------------------------------------------------------------------- EGG
  { id: 'curated-egg', db: 'USDA', name: 'egg', aliases: ['eggs', 'huevo', 'huevos', 'oeuf', 'fried egg', 'boiled egg'], category: 'egg', state: 'cooked', per100g: { kcal: 155, protein: 13, fat: 11, satFat: 3.3, carbs: 1.1, sugar: 1.1, salt: 0.3 } },
  { id: 'curated-omelette', db: 'CIQUAL', name: 'omelette', aliases: ['omelet', 'tortilla francesa', 'tortilla'], category: 'egg', state: 'cooked', per100g: { kcal: 154, protein: 11, fat: 12, satFat: 3.4, carbs: 0.6, sugar: 0.6, salt: 0.7 } },

  // ---------------------------------------------------------- GRAINS / STARCH
  { id: 'curated-white-rice', db: 'CIQUAL', name: 'white rice', aliases: ['rice', 'arroz', 'riz', 'boiled rice', 'steamed rice'], category: 'grain', state: 'cooked', per100g: { kcal: 130, protein: 2.7, fat: 0.3, carbs: 28, sugar: 0.1, salt: 0 } },
  { id: 'curated-brown-rice', db: 'CIQUAL', name: 'brown rice', aliases: ['arroz integral', 'riz complet'], category: 'grain', state: 'cooked', per100g: { kcal: 123, protein: 2.7, fat: 1, carbs: 26, sugar: 0.4, salt: 0 } },
  { id: 'curated-pasta', db: 'CIQUAL', name: 'pasta', aliases: ['spaghetti', 'macarrones', 'pates', 'noodles', 'penne', 'fettuccine', 'tagliatelle'], category: 'grain', state: 'cooked', per100g: { kcal: 157, protein: 5.8, fat: 0.9, carbs: 31, sugar: 0.6, salt: 0 } },
  { id: 'curated-bread', db: 'CIQUAL', name: 'bread', aliases: ['pan', 'pain', 'baguette', 'white bread', 'bread roll'], category: 'grain', state: 'cooked', per100g: { kcal: 265, protein: 9, fat: 3.2, carbs: 49, sugar: 5, salt: 1.2 } },
  { id: 'curated-pizza-dough', db: 'CIQUAL', name: 'pizza base', aliases: ['pizza dough', 'pizza crust', 'masa de pizza', 'pate a pizza'], category: 'grain', state: 'cooked', per100g: { kcal: 270, protein: 8, fat: 4, satFat: 0.8, carbs: 49, sugar: 2, salt: 1.2 } },
  { id: 'curated-couscous', db: 'CIQUAL', name: 'couscous', aliases: ['cuscus', 'semolina'], category: 'grain', state: 'cooked', per100g: { kcal: 112, protein: 3.8, fat: 0.2, carbs: 23, sugar: 0.1, salt: 0 } },
  { id: 'curated-quinoa', db: 'CIQUAL', name: 'quinoa', aliases: ['quinua'], category: 'grain', state: 'cooked', per100g: { kcal: 120, protein: 4.4, fat: 1.9, carbs: 21, sugar: 0.9, salt: 0 } },
  { id: 'curated-polenta', db: 'CIQUAL', name: 'polenta', aliases: ['cornmeal'], category: 'grain', state: 'cooked', per100g: { kcal: 85, protein: 2, fat: 0.4, carbs: 18, sugar: 0.1, salt: 0.1 } },
  { id: 'curated-flour', db: 'CIQUAL', name: 'wheat flour', aliases: ['flour', 'harina', 'farine'], category: 'grain', state: 'raw', per100g: { kcal: 364, protein: 10, fat: 1, carbs: 76, sugar: 0.3, salt: 0 } },
  { id: 'curated-tortilla-wrap', db: 'USDA', name: 'tortilla wrap', aliases: ['wrap', 'tortilla de trigo', 'flour tortilla'], category: 'grain', state: 'cooked', per100g: { kcal: 310, protein: 8, fat: 7, satFat: 1.8, carbs: 52, sugar: 2, salt: 1.1 } },
  { id: 'curated-breadcrumbs', db: 'CIQUAL', name: 'breadcrumbs', aliases: ['pan rallado', 'chapelure', 'panko'], category: 'grain', state: 'cooked', per100g: { kcal: 395, protein: 13, fat: 5, satFat: 1, carbs: 72, sugar: 6, salt: 1.3 } },

  // ----------------------------------------------------------------- LEGUMES
  { id: 'curated-chickpea', db: 'CIQUAL', name: 'chickpeas', aliases: ['chickpea', 'garbanzos', 'pois chiches', 'hummus'], category: 'legume', state: 'cooked', per100g: { kcal: 164, protein: 9, fat: 2.6, carbs: 27, sugar: 4.8, salt: 0 } },
  { id: 'curated-lentil', db: 'CIQUAL', name: 'lentils', aliases: ['lentil', 'lentejas', 'lentilles'], category: 'legume', state: 'cooked', per100g: { kcal: 116, protein: 9, fat: 0.4, carbs: 20, sugar: 1.8, salt: 0 } },
  { id: 'curated-white-bean', db: 'CIQUAL', name: 'white beans', aliases: ['white bean', 'judias blancas', 'haricots blancs', 'cannellini'], category: 'legume', state: 'cooked', per100g: { kcal: 139, protein: 9.7, fat: 0.5, carbs: 25, sugar: 0.3, salt: 0 } },
  { id: 'curated-kidney-bean', db: 'CIQUAL', name: 'kidney beans', aliases: ['kidney bean', 'frijoles', 'haricots rouges', 'red beans'], category: 'legume', state: 'cooked', per100g: { kcal: 127, protein: 8.7, fat: 0.5, carbs: 22, sugar: 0.3, salt: 0 } },
  { id: 'curated-peas', db: 'CIQUAL', name: 'peas', aliases: ['guisantes', 'petits pois', 'green peas'], category: 'legume', state: 'cooked', per100g: { kcal: 84, protein: 5.4, fat: 0.4, carbs: 14, sugar: 5.7, salt: 0 } },
  { id: 'curated-tofu', db: 'USDA', name: 'tofu', aliases: ['bean curd'], category: 'legume', state: 'cooked', per100g: { kcal: 144, protein: 17, fat: 9, satFat: 1.3, carbs: 2.8, sugar: 0.6, salt: 0 } },
  { id: 'curated-edamame', db: 'USDA', name: 'edamame', aliases: ['soybeans'], category: 'legume', state: 'cooked', per100g: { kcal: 121, protein: 12, fat: 5, satFat: 0.6, carbs: 9, sugar: 2.2, salt: 0 } },
  { id: 'curated-tempeh', db: 'USDA', name: 'tempeh', aliases: ['tempe'], category: 'legume', state: 'cooked', per100g: { kcal: 192, protein: 20, fat: 11, satFat: 2.2, carbs: 8, sugar: 0, salt: 0 } },
  { id: 'curated-seitan', db: 'USDA', name: 'seitan', aliases: ['wheat gluten', 'wheat meat'], category: 'other', state: 'cooked', per100g: { kcal: 121, protein: 25, fat: 1.9, satFat: 0.3, carbs: 4, sugar: 0, salt: 0.4 } },
  { id: 'curated-falafel', db: 'USDA', name: 'falafel', aliases: ['falafels'], category: 'fried', state: 'cooked', per100g: { kcal: 333, protein: 13, fat: 18, satFat: 2.4, carbs: 32, sugar: 0, salt: 0.6 } },
  { id: 'curated-dal', db: 'USDA', name: 'dal', aliases: ['dahl', 'dhal', 'lentil curry'], category: 'legume', state: 'cooked', per100g: { kcal: 116, protein: 6, fat: 3, satFat: 0.5, carbs: 16, sugar: 1.5, salt: 0.5 } },
  { id: 'curated-tabbouleh', db: 'CIQUAL', name: 'tabbouleh', aliases: ['tabouli', 'taboule'], category: 'grain', state: 'cooked', per100g: { kcal: 140, protein: 3, fat: 7, satFat: 1, carbs: 17, sugar: 1.5, salt: 0.4 } },
  { id: 'curated-naan', db: 'USDA', name: 'naan', aliases: ['naan bread'], category: 'grain', state: 'cooked', per100g: { kcal: 310, protein: 9, fat: 6, satFat: 1.4, carbs: 53, sugar: 3, salt: 1.2 } },
  { id: 'curated-shawarma', db: 'USDA', name: 'shawarma', aliases: ['chicken shawarma', 'doner', 'kebab meat'], category: 'meat', state: 'cooked', per100g: { kcal: 215, protein: 22, fat: 13, satFat: 4, carbs: 2, sugar: 0, salt: 1 } },

  // ---------------------------------------------------- CONDIMENTS (long tail)
  { id: 'curated-tahini', db: 'USDA', name: 'tahini', aliases: ['tahina', 'sesame paste'], category: 'fat', state: 'raw', per100g: { kcal: 595, protein: 17, fat: 54, satFat: 7.6, carbs: 21, sugar: 0.5, salt: 0.1 } },
  { id: 'curated-miso', db: 'USDA', name: 'miso', aliases: ['miso paste'], category: 'other', state: 'raw', per100g: { kcal: 199, protein: 12, fat: 6, satFat: 1, carbs: 26, sugar: 6, salt: 12 } },

  // -------------------------------------------------------------- VEGETABLES
  { id: 'curated-potato', db: 'CIQUAL', name: 'potato', aliases: ['potatoes', 'patata', 'patatas', 'pomme de terre', 'boiled potato', 'mashed potato'], category: 'vegetable', state: 'cooked', per100g: { kcal: 87, protein: 2, fat: 0.1, carbs: 20, sugar: 0.9, salt: 0 } },
  { id: 'curated-fries', db: 'CIQUAL', name: 'french fries', aliases: ['fries', 'patatas fritas', 'frites', 'chips'], category: 'fried', state: 'cooked', per100g: { kcal: 312, protein: 3.4, fat: 15, satFat: 2.3, carbs: 41, sugar: 0.3, salt: 0.5 } },
  { id: 'curated-tomato', db: 'CIQUAL', name: 'tomato', aliases: ['tomatoes', 'tomate', 'tomates'], category: 'vegetable', state: 'raw', per100g: { kcal: 18, protein: 0.9, fat: 0.2, carbs: 3.9, sugar: 2.6, salt: 0 } },
  { id: 'curated-lettuce', db: 'CIQUAL', name: 'lettuce', aliases: ['salad leaves', 'lechuga', 'laitue', 'mixed greens', 'romaine'], category: 'vegetable', state: 'raw', per100g: { kcal: 15, protein: 1.4, fat: 0.2, carbs: 2.9, sugar: 0.8, salt: 0 } },
  { id: 'curated-onion', db: 'CIQUAL', name: 'onion', aliases: ['cebolla', 'oignon', 'onions'], category: 'vegetable', state: 'raw', per100g: { kcal: 40, protein: 1.1, fat: 0.1, carbs: 9, sugar: 4.2, salt: 0 } },
  { id: 'curated-garlic', db: 'CIQUAL', name: 'garlic', aliases: ['ajo', 'ail'], category: 'vegetable', state: 'raw', per100g: { kcal: 149, protein: 6.4, fat: 0.5, carbs: 33, sugar: 1, salt: 0 } },
  { id: 'curated-mushroom', db: 'CIQUAL', name: 'mushroom', aliases: ['mushrooms', 'champinon', 'champignon', 'setas'], category: 'vegetable', state: 'cooked', per100g: { kcal: 22, protein: 3.1, fat: 0.3, carbs: 3.3, sugar: 2, salt: 0 } },
  { id: 'curated-pepper', db: 'CIQUAL', name: 'bell pepper', aliases: ['pepper', 'pimiento', 'poivron', 'peppers', 'capsicum'], category: 'vegetable', state: 'raw', per100g: { kcal: 26, protein: 1, fat: 0.3, carbs: 5, sugar: 3.5, salt: 0 } },
  { id: 'curated-courgette', db: 'CIQUAL', name: 'courgette', aliases: ['zucchini', 'calabacin', 'courgettes'], category: 'vegetable', state: 'cooked', per100g: { kcal: 17, protein: 1.2, fat: 0.3, carbs: 2, sugar: 1.7, salt: 0 } },
  { id: 'curated-aubergine', db: 'CIQUAL', name: 'aubergine', aliases: ['eggplant', 'berenjena', 'aubergines'], category: 'vegetable', state: 'cooked', per100g: { kcal: 25, protein: 0.8, fat: 0.2, carbs: 6, sugar: 3.5, salt: 0 } },
  { id: 'curated-spinach', db: 'CIQUAL', name: 'spinach', aliases: ['espinacas', 'epinards'], category: 'vegetable', state: 'cooked', per100g: { kcal: 23, protein: 2.9, fat: 0.4, carbs: 3.6, sugar: 0.4, salt: 0.1 } },
  { id: 'curated-broccoli', db: 'CIQUAL', name: 'broccoli', aliases: ['brocoli', 'brocolis'], category: 'vegetable', state: 'cooked', per100g: { kcal: 35, protein: 2.4, fat: 0.4, carbs: 4, sugar: 1.4, salt: 0.1 } },
  { id: 'curated-carrot', db: 'CIQUAL', name: 'carrot', aliases: ['carrots', 'zanahoria', 'carotte'], category: 'vegetable', state: 'cooked', per100g: { kcal: 35, protein: 0.8, fat: 0.2, carbs: 7, sugar: 4, salt: 0.1 } },
  { id: 'curated-green-beans', db: 'CIQUAL', name: 'green beans', aliases: ['judias verdes', 'haricots verts'], category: 'vegetable', state: 'cooked', per100g: { kcal: 35, protein: 1.9, fat: 0.3, carbs: 5, sugar: 2.3, salt: 0 } },
  { id: 'curated-asparagus', db: 'CIQUAL', name: 'asparagus', aliases: ['esparragos', 'asperges'], category: 'vegetable', state: 'cooked', per100g: { kcal: 22, protein: 2.4, fat: 0.2, carbs: 2.5, sugar: 1.3, salt: 0 } },
  { id: 'curated-cauliflower', db: 'CIQUAL', name: 'cauliflower', aliases: ['coliflor', 'chou-fleur'], category: 'vegetable', state: 'cooked', per100g: { kcal: 23, protein: 1.8, fat: 0.5, carbs: 2.3, sugar: 1.6, salt: 0 } },
  { id: 'curated-corn', db: 'CIQUAL', name: 'sweetcorn', aliases: ['corn', 'maiz', 'mais'], category: 'vegetable', state: 'cooked', per100g: { kcal: 96, protein: 3.4, fat: 1.5, carbs: 19, sugar: 3.2, salt: 0 } },
  { id: 'curated-cucumber', db: 'CIQUAL', name: 'cucumber', aliases: ['pepino', 'concombre'], category: 'vegetable', state: 'raw', per100g: { kcal: 15, protein: 0.7, fat: 0.1, carbs: 2.2, sugar: 1.7, salt: 0 } },
  { id: 'curated-olive', db: 'CIQUAL', name: 'olives', aliases: ['olive', 'aceitunas', 'olives'], category: 'vegetable', state: 'raw', per100g: { kcal: 145, protein: 1, fat: 15, satFat: 2, carbs: 4, sugar: 0, salt: 3.3 } },

  // ----------------------------------------------------------------- FRUIT
  { id: 'curated-avocado', db: 'CIQUAL', name: 'avocado', aliases: ['aguacate', 'avocat'], category: 'fruit', state: 'raw', per100g: { kcal: 160, protein: 2, fat: 15, satFat: 2.1, carbs: 9, sugar: 0.7, salt: 0 } },
  { id: 'curated-apple', db: 'CIQUAL', name: 'apple', aliases: ['manzana', 'pomme'], category: 'fruit', state: 'raw', per100g: { kcal: 52, protein: 0.3, fat: 0.2, carbs: 14, sugar: 10, salt: 0 } },
  { id: 'curated-banana', db: 'CIQUAL', name: 'banana', aliases: ['platano', 'banane'], category: 'fruit', state: 'raw', per100g: { kcal: 89, protein: 1.1, fat: 0.3, carbs: 23, sugar: 12, salt: 0 } },
  { id: 'curated-strawberry', db: 'CIQUAL', name: 'strawberry', aliases: ['strawberries', 'fresa', 'fresas', 'fraise'], category: 'fruit', state: 'raw', per100g: { kcal: 32, protein: 0.7, fat: 0.3, carbs: 7.7, sugar: 4.9, salt: 0 } },
  { id: 'curated-orange', db: 'CIQUAL', name: 'orange', aliases: ['naranja', 'oranges'], category: 'fruit', state: 'raw', per100g: { kcal: 47, protein: 0.9, fat: 0.1, carbs: 12, sugar: 9, salt: 0 } },
  { id: 'curated-lemon', db: 'CIQUAL', name: 'lemon', aliases: ['limon', 'citron'], category: 'fruit', state: 'raw', per100g: { kcal: 29, protein: 1.1, fat: 0.3, carbs: 9, sugar: 2.5, salt: 0 } },
  { id: 'curated-mango', db: 'CIQUAL', name: 'mango', aliases: ['mangue'], category: 'fruit', state: 'raw', per100g: { kcal: 60, protein: 0.8, fat: 0.4, carbs: 15, sugar: 14, salt: 0 } },
  { id: 'curated-pineapple', db: 'CIQUAL', name: 'pineapple', aliases: ['pina', 'ananas'], category: 'fruit', state: 'raw', per100g: { kcal: 50, protein: 0.5, fat: 0.1, carbs: 13, sugar: 10, salt: 0 } },

  // --------------------------------------------------------- DAIRY / CHEESE
  { id: 'curated-cheese', db: 'CIQUAL', name: 'cheese', aliases: ['queso', 'fromage', 'cheddar', 'gouda', 'manchego'], category: 'dairy', state: 'raw', per100g: { kcal: 402, protein: 25, fat: 33, satFat: 21, carbs: 1.3, sugar: 0.5, salt: 1.8 } },
  { id: 'curated-mozzarella', db: 'CIQUAL', name: 'mozzarella', aliases: ['fresh mozzarella', 'burrata', 'bocconcini'], category: 'dairy', state: 'raw', per100g: { kcal: 280, protein: 22, fat: 22, satFat: 13, carbs: 2.2, sugar: 1, salt: 0.6 } },
  { id: 'curated-parmesan', db: 'CIQUAL', name: 'parmesan', aliases: ['parmesano', 'parmigiano', 'grana'], category: 'dairy', state: 'raw', per100g: { kcal: 392, protein: 36, fat: 26, satFat: 17, carbs: 3.2, sugar: 0.8, salt: 1.6 } },
  { id: 'curated-feta', db: 'CIQUAL', name: 'feta', aliases: ['feta cheese'], category: 'dairy', state: 'raw', per100g: { kcal: 264, protein: 14, fat: 21, satFat: 15, carbs: 4, sugar: 4, salt: 3 } },
  { id: 'curated-goat-cheese', db: 'CIQUAL', name: 'goat cheese', aliases: ['queso de cabra', 'chevre'], category: 'dairy', state: 'raw', per100g: { kcal: 364, protein: 22, fat: 30, satFat: 21, carbs: 2.5, sugar: 2.5, salt: 1.6 } },
  { id: 'curated-milk', db: 'CIQUAL', name: 'milk', aliases: ['leche', 'lait', 'whole milk'], category: 'dairy', state: 'raw', per100g: { kcal: 64, protein: 3.3, fat: 3.6, satFat: 2.3, carbs: 4.8, sugar: 4.8, salt: 0.1 } },
  { id: 'curated-cream', db: 'CIQUAL', name: 'cream', aliases: ['nata', 'creme', 'crema', 'heavy cream'], category: 'dairy', state: 'raw', per100g: { kcal: 292, protein: 2.4, fat: 30, satFat: 19, carbs: 3, sugar: 3, salt: 0.1 } },
  { id: 'curated-yogurt', db: 'CIQUAL', name: 'yogurt', aliases: ['yoghurt', 'yogur', 'yaourt', 'greek yogurt'], category: 'dairy', state: 'raw', per100g: { kcal: 61, protein: 3.5, fat: 3.3, satFat: 2.1, carbs: 4.7, sugar: 4.7, salt: 0.1 } },
  { id: 'curated-bechamel', db: 'CIQUAL', name: 'bechamel', aliases: ['white sauce', 'salsa bechamel'], category: 'dairy', state: 'cooked', per100g: { kcal: 145, protein: 4, fat: 9, satFat: 5.5, carbs: 12, sugar: 4, salt: 0.7 } },
  { id: 'curated-paneer', db: 'USDA', name: 'paneer', aliases: ['queso paneer', 'indian cheese'], category: 'dairy', state: 'raw', per100g: { kcal: 296, protein: 18, fat: 23, satFat: 15, carbs: 4, sugar: 4, salt: 0.1 } },
  { id: 'curated-halloumi', db: 'CIQUAL', name: 'halloumi', aliases: ['queso halloumi', 'grilling cheese'], category: 'dairy', state: 'raw', per100g: { kcal: 321, protein: 21, fat: 26, satFat: 18, carbs: 2.2, sugar: 2.2, salt: 2.7 } },
  { id: 'curated-labneh', db: 'USDA', name: 'labneh', aliases: ['strained yogurt', 'yogurt cheese'], category: 'dairy', state: 'raw', per100g: { kcal: 174, protein: 8, fat: 14, satFat: 9, carbs: 4, sugar: 4, salt: 0.4 } },
  { id: 'curated-lassi', db: 'USDA', name: 'lassi', aliases: ['mango lassi', 'yogurt drink'], category: 'dairy', state: 'raw', per100g: { kcal: 88, protein: 2.6, fat: 2.3, satFat: 1.4, carbs: 14, sugar: 13, salt: 0.1 } },
  { id: 'curated-tzatziki', db: 'CIQUAL', name: 'tzatziki', aliases: ['salsa tzatziki', 'cucumber yogurt dip'], category: 'dairy', state: 'raw', per100g: { kcal: 120, protein: 3.5, fat: 9, satFat: 3.5, carbs: 5, sugar: 4, salt: 0.7 } },

  // -------------------------------------------------- PLANT MILKS (not dairy)
  // Curated so plant-milk-qualified queries resolve here, never to dairy 'milk'.
  { id: 'curated-coconut-milk', db: 'USDA', name: 'coconut milk', aliases: ['leche de coco', 'lait de coco'], category: 'other', state: 'raw', per100g: { kcal: 197, protein: 2, fat: 21, satFat: 18, carbs: 3, sugar: 3, salt: 0 } },
  { id: 'curated-soy-milk', db: 'USDA', name: 'soy milk', aliases: ['soya milk', 'leche de soja', 'lait de soja'], category: 'other', state: 'raw', per100g: { kcal: 43, protein: 3.3, fat: 1.8, satFat: 0.3, carbs: 3, sugar: 2.5, salt: 0.1 } },
  { id: 'curated-oat-milk', db: 'USDA', name: 'oat milk', aliases: ['leche de avena', 'lait avoine'], category: 'other', state: 'raw', per100g: { kcal: 46, protein: 1, fat: 1.5, satFat: 0.2, carbs: 7, sugar: 4, salt: 0.1 } },
  { id: 'curated-almond-milk', db: 'USDA', name: 'almond milk', aliases: ['leche de almendras', 'lait amande'], category: 'other', state: 'raw', per100g: { kcal: 17, protein: 0.6, fat: 1.1, satFat: 0.1, carbs: 1.5, sugar: 0.6, salt: 0.1 } },
  { id: 'curated-rice-milk', db: 'USDA', name: 'rice milk', aliases: ['leche de arroz', 'lait de riz'], category: 'other', state: 'raw', per100g: { kcal: 47, protein: 0.3, fat: 1, satFat: 0.1, carbs: 9, sugar: 5, salt: 0.1 } },

  // ----------------------------------------------------------- FATS / OILS
  // NEUTRAL cooking oil — the canonical target for a generic 'oil' line. PLACED BEFORE
  // olive/sunflower oil and given the bare 'oil' alias so a literal 'oil' resolves
  // here (then clamped by the tight 20 g oil prior), NEVER to extra-virgin olive oil at
  // score 1.0. Olive/sunflower oil still resolve via their explicit names/aliases.
  { id: 'curated-cooking-oil', db: 'USDA', name: 'cooking oil', aliases: ['oil', 'vegetable oil', 'aceite', 'huile'], category: 'oil', state: 'raw', per100g: { kcal: 884, protein: 0, fat: 100, satFat: 13, carbs: 0, sugar: 0, salt: 0 } },
  { id: 'curated-olive-oil', db: 'CIQUAL', name: 'olive oil', aliases: ['aceite de oliva', "huile d'olive", 'extra virgin olive oil'], category: 'oil', state: 'raw', per100g: { kcal: 884, protein: 0, fat: 100, satFat: 14, carbs: 0, sugar: 0, salt: 0 } },
  { id: 'curated-sunflower-oil', db: 'CIQUAL', name: 'sunflower oil', aliases: ['aceite de girasol', 'huile de tournesol'], category: 'oil', state: 'raw', per100g: { kcal: 884, protein: 0, fat: 100, satFat: 11, carbs: 0, sugar: 0, salt: 0 } },
  { id: 'curated-butter', db: 'CIQUAL', name: 'butter', aliases: ['mantequilla', 'beurre'], category: 'fat', state: 'raw', per100g: { kcal: 717, protein: 0.9, fat: 81, satFat: 51, carbs: 0.1, sugar: 0.1, salt: 1.4 } },

  // -------------------------------------------------------- SAUCES / CONDIMENTS
  { id: 'curated-tomato-sauce', db: 'CIQUAL', name: 'tomato sauce', aliases: ['salsa de tomate', 'sauce tomate', 'marinara', 'sofrito'], category: 'vegetable', state: 'cooked', per100g: { kcal: 55, protein: 1.6, fat: 2.5, satFat: 0.4, carbs: 7, sugar: 5, salt: 0.7 } },
  { id: 'curated-mayonnaise', db: 'CIQUAL', name: 'mayonnaise', aliases: ['mayo', 'mayonesa'], category: 'fat', state: 'raw', per100g: { kcal: 680, protein: 1.1, fat: 75, satFat: 11, carbs: 1.3, sugar: 1.3, salt: 1.2 } },
  { id: 'curated-aioli', db: 'CIQUAL', name: 'aioli', aliases: ['alioli', 'garlic mayonnaise'], category: 'fat', state: 'raw', per100g: { kcal: 660, protein: 1, fat: 72, satFat: 10, carbs: 2, sugar: 1, salt: 1.2 } },
  { id: 'curated-ketchup', db: 'CIQUAL', name: 'ketchup', aliases: ['catsup'], category: 'sweet', state: 'raw', per100g: { kcal: 112, protein: 1.3, fat: 0.2, carbs: 26, sugar: 23, salt: 2 } },
  { id: 'curated-pesto', db: 'CIQUAL', name: 'pesto', aliases: ['salsa pesto', 'pesto sauce'], category: 'fat', state: 'raw', per100g: { kcal: 450, protein: 5, fat: 45, satFat: 7, carbs: 5, sugar: 2, salt: 2 } },
  { id: 'curated-soy-sauce', db: 'USDA', name: 'soy sauce', aliases: ['salsa de soja', 'sauce soja', 'tamari'], category: 'other', state: 'raw', per100g: { kcal: 53, protein: 8, fat: 0.6, carbs: 4.9, sugar: 0.4, salt: 16 } },
  { id: 'curated-mustard', db: 'CIQUAL', name: 'mustard', aliases: ['mostaza', 'moutarde', 'dijon'], category: 'other', state: 'raw', per100g: { kcal: 66, protein: 4, fat: 3.3, satFat: 0.2, carbs: 5, sugar: 1, salt: 5.5 } },
  { id: 'curated-vinaigrette', db: 'CIQUAL', name: 'vinaigrette', aliases: ['salad dressing', 'vinagreta'], category: 'fat', state: 'raw', per100g: { kcal: 450, protein: 0.3, fat: 48, satFat: 7, carbs: 3, sugar: 2.5, salt: 2 } },
  { id: 'curated-hummus', db: 'CIQUAL', name: 'hummus', aliases: ['houmous', 'humus'], category: 'legume', state: 'cooked', per100g: { kcal: 177, protein: 8, fat: 9.6, satFat: 1.4, carbs: 14, sugar: 0.4, salt: 1.2 } },

  // --------------------------------------------------- COOKED COMPOSITES (state cooked)
  // All tagged state:'cooked' so getCookingYield returns IDENTITY — no x2.4 grain
  // inflation. Realistic per-100g for the finished plated dish (incl. its own oil/fat).
  // 'gazpacho' is a real cold-soup composite incl. its small olive-oil content, so a
  // single 'gazpacho' name no longer needs a phantom oil line (directive H: the
  // composite row is for when M3 emits the single name; the decomposed form lists parts).
  { id: 'curated-gazpacho', db: 'CIQUAL', name: 'gazpacho', aliases: ['gaspacho', 'cold tomato soup'], category: 'vegetable', state: 'cooked', per100g: { kcal: 45, protein: 1, fat: 2.5, satFat: 0.4, carbs: 4, sugar: 3.5, salt: 0.4 } },
  { id: 'curated-risotto', db: 'CIQUAL', name: 'risotto', aliases: ['arroz cremoso'], category: 'grain', state: 'cooked', per100g: { kcal: 145, protein: 3.5, fat: 4, satFat: 1.8, carbs: 22, sugar: 0.5, salt: 0.6 } },
  { id: 'curated-arborio-rice', db: 'CIQUAL', name: 'arborio rice cooked', aliases: ['arborio rice', 'risotto rice', 'paella rice cooked', 'paella rice'], category: 'grain', state: 'cooked', per100g: { kcal: 130, protein: 2.7, fat: 0.3, carbs: 28, sugar: 0.1, salt: 0 } },
  { id: 'curated-mixed-salad', db: 'CIQUAL', name: 'mixed salad', aliases: ['ensalada mixta', 'salade mixte', 'green salad', 'side salad'], category: 'vegetable', state: 'raw', per100g: { kcal: 20, protein: 1.2, fat: 0.4, carbs: 3, sugar: 1.5, salt: 0.1 } },
  { id: 'curated-ramen', db: 'USDA', name: 'ramen', aliases: ['ramen noodles', 'noodle soup'], category: 'grain', state: 'cooked', per100g: { kcal: 110, protein: 5, fat: 3.5, satFat: 1, carbs: 15, sugar: 0.8, salt: 1.1 } },
  { id: 'curated-pad-thai', db: 'USDA', name: 'pad thai', aliases: ['phad thai'], category: 'grain', state: 'cooked', per100g: { kcal: 155, protein: 6, fat: 6, satFat: 1.2, carbs: 20, sugar: 4, salt: 0.8 } },
  { id: 'curated-farro', db: 'CIQUAL', name: 'farro cooked', aliases: ['farro', 'spelt cooked', 'spelt'], category: 'grain', state: 'cooked', per100g: { kcal: 130, protein: 5, fat: 0.9, carbs: 26, sugar: 0.5, salt: 0 } },
  { id: 'curated-orzo', db: 'CIQUAL', name: 'orzo cooked', aliases: ['orzo'], category: 'grain', state: 'cooked', per100g: { kcal: 157, protein: 5.8, fat: 0.9, carbs: 31, sugar: 0.6, salt: 0 } },
  // Batter/breading for deep-fried items — state:'cooked' (the finished coating). Used
  // as a fried-mass component so the engine models absorbed fat from it (no oil line).
  { id: 'curated-batter', db: 'USDA', name: 'batter', aliases: ['breading', 'tempura batter', 'fried coating'], category: 'grain', state: 'cooked', per100g: { kcal: 320, protein: 8, fat: 6, satFat: 1, carbs: 58, sugar: 2, salt: 1 } },

  // --------------------------------------- PLANT ALTERNATIVES (never collapse to dairy)
  // 'vegan'/'plant' in the NAME so a plant-qualified query reaches its OWN row (the
  // matcher's plant guard skips dairy candidates). Typical coconut-oil-based composition.
  { id: 'curated-vegan-cheese', db: 'USDA', name: 'vegan cheese', aliases: ['plant cheese', 'dairy free cheese', 'queso vegano'], category: 'other', state: 'raw', per100g: { kcal: 280, protein: 1, fat: 24, satFat: 20, carbs: 18, sugar: 1, salt: 1.4 } },
  { id: 'curated-plant-butter', db: 'USDA', name: 'plant butter', aliases: ['vegan butter', 'dairy free butter', 'plant margarine'], category: 'fat', state: 'raw', per100g: { kcal: 717, protein: 0.1, fat: 80, satFat: 22, carbs: 0.5, sugar: 0, salt: 1.2 } },
  // Plant-based meat patty (pea/soy protein, coconut/canola fat). Values ≈ Beyond Burger
  // label (per 100g: ~250 kcal, 18g fat, 5g satFat, ~17g protein, ~0.9g salt). Its OWN
  // row so a 'plant based patty' query resolves here, never collapsing onto beef.
  { id: 'curated-plant-patty', db: 'USDA', name: 'plant based patty', aliases: ['plant patty', 'vegan patty', 'beyond patty', 'veggie burger patty', 'meat free patty'], category: 'other', state: 'raw', per100g: { kcal: 250, protein: 17, fat: 18, satFat: 5, carbs: 8, sugar: 0, salt: 0.9 } },

  // ------------------------------------------------------------ SWEETS / DESSERTS
  { id: 'curated-sugar', db: 'CIQUAL', name: 'sugar', aliases: ['azucar', 'sucre'], category: 'sugar', state: 'raw', per100g: { kcal: 387, protein: 0, fat: 0, carbs: 100, sugar: 100, salt: 0 } },
  { id: 'curated-chocolate', db: 'CIQUAL', name: 'chocolate', aliases: ['chocolat', 'cacao', 'dark chocolate'], category: 'sweet', state: 'raw', per100g: { kcal: 546, protein: 4.9, fat: 31, satFat: 19, carbs: 61, sugar: 48, salt: 0.1 } },
  { id: 'curated-ice-cream', db: 'CIQUAL', name: 'ice cream', aliases: ['helado', 'glace'], category: 'sweet', state: 'raw', per100g: { kcal: 207, protein: 3.5, fat: 11, satFat: 7, carbs: 24, sugar: 21, salt: 0.1 } },
  { id: 'curated-cheesecake', db: 'CIQUAL', name: 'cheesecake', aliases: ['tarta de queso', 'tarte au fromage'], category: 'sweet', state: 'cooked', per100g: { kcal: 321, protein: 5.5, fat: 22, satFat: 12, carbs: 26, sugar: 22, salt: 0.5 } },
  { id: 'curated-tiramisu', db: 'CIQUAL', name: 'tiramisu', aliases: [], category: 'sweet', state: 'cooked', per100g: { kcal: 280, protein: 5, fat: 17, satFat: 9, carbs: 26, sugar: 20, salt: 0.2 } },
  { id: 'curated-flan', db: 'CIQUAL', name: 'flan', aliases: ['creme caramel', 'custard'], category: 'sweet', state: 'cooked', per100g: { kcal: 145, protein: 4, fat: 4, satFat: 2, carbs: 23, sugar: 22, salt: 0.1 } },
  { id: 'curated-churro', db: 'CIQUAL', name: 'churros', aliases: ['churro'], category: 'fried', state: 'cooked', per100g: { kcal: 380, protein: 5, fat: 20, satFat: 4, carbs: 45, sugar: 9, salt: 0.6 } },
  { id: 'curated-croissant', db: 'CIQUAL', name: 'croissant', aliases: ['croissants'], category: 'grain', state: 'cooked', per100g: { kcal: 406, protein: 8, fat: 21, satFat: 12, carbs: 45, sugar: 11, salt: 0.9 } },
  { id: 'curated-honey', db: 'CIQUAL', name: 'honey', aliases: ['miel'], category: 'sugar', state: 'raw', per100g: { kcal: 304, protein: 0.3, fat: 0, carbs: 82, sugar: 82, salt: 0 } },
];
