/**
 * Allergen detection — the SAFETY-CRITICAL, honest-by-design half of the engine.
 *
 * What this does and (deliberately) does NOT do:
 *  - It INFERS which of the EU-14 allergens (Reg 1169/2011, Annex II) a dish *may*
 *    contain, from the words in its guessed ingredient names.
 *  - It NEVER asserts a dish is "safe" or "allergen-free". An empty result means
 *    "we found no allergen keyword", not "this is safe to eat". Every flag we DO
 *    emit is framed as "may contain X — confirm with staff" (ALLERGEN_DISCLAIMER
 *    spirit), per SECURITY.md §B and the legal contiene/puede-contener distinction.
 *  - It is pure and deterministic: same ingredients in -> same flags out. No clock,
 *    no randomness, no I/O.
 *
 * Detection is keyword-based over the NORMALIZED ingredient name (lowercased,
 * diacritics stripped, punctuation collapsed — see {@link normalizeName}). Patterns
 * are matched on whole words so that, e.g., "soy" does not fire inside an unrelated
 * token. We cover the common European/Spanish/French ingredient words the perception
 * layer is likely to emit (the seed table's aliases informed this list); allergens
 * that are essentially never inferable from a bare ingredient word in this domain
 * (sulphites, lupin) are intentionally not pattern-matched here — we would rather
 * surface nothing than fabricate a flag, and the "confirm with staff" caveat covers
 * the gap honestly.
 *
 * basis is always 'ingredient-match' here: these flags come from matching an
 * ingredient NAME the perception layer supplied. ('name-keyword' is reserved for a
 * future pass that scans a raw dish title rather than parsed ingredients.)
 */
import type { AllergenFlag, AllergenId, IngredientGuess } from '@bocado/shared';
import { ALLERGENS, ALLERGEN_DISCLAIMER, matchName } from '@bocado/shared';
import { normalizeName } from '../table/memoryTable';

/**
 * One detectable allergen: the EU-14 id plus the word patterns that imply it.
 *
 * Patterns are matched against the normalized name with whole-word semantics
 * (see {@link matchesWord}). Multi-word patterns (e.g. "olive oil" is not here,
 * but "fish sauce" would be) match as an ordered run of whole words. Keep patterns
 * lowercase and accent-free — they run against already-normalized text.
 */
interface AllergenRule {
  allergen: AllergenId;
  /** Whole-word keyword patterns (lowercase, no accents) that imply this allergen. */
  patterns: string[];
}

/**
 * Keyword map: AllergenId -> ingredient-name patterns.
 *
 * Coverage rationale (EU-14, Annex II order):
 *  - gluten      wheat/flour and the common wheat-based staples (bread/pasta/etc.)
 *                across EN/ES/FR, plus rye/barley/oats/couscous/semolina/breaded.
 *  - crustaceans prawn/shrimp/gambas/crevette, crab, lobster, langoustine, crayfish.
 *  - eggs        egg/huevo/oeuf, mayonnaise (egg-based), aioli, meringue, omelette.
 *  - fish        generic "fish" + common species (salmon/cod/tuna/anchovy/...),
 *                ES/FR words, and fish-derived sauces (anchovy/worcester is omitted
 *                to avoid over-reach; anchovy is included as it is overtly fish).
 *  - peanuts     peanut/groundnut/cacahuete/cacahuète cluster (kept separate from
 *                tree nuts, which are a distinct Annex II allergen).
 *  - soybeans    soy/soya/soja, tofu, edamame, miso, tempeh, soy/tamari sauce.
 *  - milk        milk/dairy and the dairy staples: cheese/butter/cream/yogurt and
 *                named cheeses (mozzarella/parmesan/cheddar/feta...), EN/ES/FR.
 *  - nuts        TREE nuts only: almond/walnut/hazelnut/cashew/pistachio/pecan/...
 *                plus generic "nut"/"nuts" and pesto/praline/marzipan/nutella.
 *  - celery      celery/celeriac/apio/celeri.
 *  - mustard     mustard/mostaza/moutarde/dijon.
 *  - sesame      sesame/sesamo/tahini/tahina.
 *  - molluscs    mussel/clam/oyster/squid/calamari/octopus/scallop/snail, ES/FR.
 *
 * Not pattern-matched (see module doc): sulphites, lupin — rarely inferable from a
 * bare ingredient word; we do not fabricate. The "confirm with staff" note covers it.
 */
const ALLERGEN_RULES: readonly AllergenRule[] = [
  {
    allergen: 'gluten',
    patterns: [
      'wheat', 'flour', 'harina', 'farine', 'bread', 'pan', 'pain', 'baguette',
      'pasta', 'spaghetti', 'macaroni', 'macarrones', 'pates', 'noodles', 'noodle',
      'couscous', 'semolina', 'bulgur', 'rye', 'barley', 'malt', 'oats', 'oat',
      'breaded', 'breadcrumbs', 'crouton', 'croutons', 'cracker', 'crackers',
      'tortilla wrap', 'pizza', 'dough', 'pastry', 'croissant', 'cake', 'biscuit',
    ],
  },
  {
    allergen: 'crustaceans',
    patterns: [
      'prawn', 'prawns', 'shrimp', 'shrimps', 'gamba', 'gambas', 'crevette',
      'crevettes', 'crab', 'crabs', 'cangrejo', 'lobster', 'langoustine',
      'langostino', 'langostinos', 'crayfish', 'krill',
    ],
  },
  {
    allergen: 'eggs',
    patterns: [
      'egg', 'eggs', 'huevo', 'huevos', 'oeuf', 'oeufs', 'mayonnaise', 'mayo',
      'aioli', 'alioli', 'meringue', 'merengue', 'omelette', 'omelet', 'tortilla',
      'frittata', 'custard', 'carbonara',
    ],
  },
  {
    allergen: 'fish',
    patterns: [
      'fish', 'pescado', 'poisson', 'salmon', 'saumon', 'cod', 'bacalao',
      'cabillaud', 'tuna', 'atun', 'thon', 'anchovy', 'anchovies', 'anchoa',
      'anchoas', 'sardine', 'sardines', 'sardina', 'trout', 'trucha', 'hake',
      'merluza', 'sea bass', 'lubina', 'mackerel', 'caballa', 'haddock',
    ],
  },
  {
    allergen: 'peanuts',
    patterns: ['peanut', 'peanuts', 'groundnut', 'groundnuts', 'cacahuete', 'cacahuetes', 'cacahuate'],
  },
  {
    allergen: 'soybeans',
    patterns: [
      'soy', 'soya', 'soja', 'tofu', 'edamame', 'miso', 'tempeh', 'soy sauce',
      'tamari',
    ],
  },
  {
    allergen: 'milk',
    patterns: [
      'milk', 'leche', 'lait', 'dairy', 'cheese', 'queso', 'fromage', 'cheddar',
      'mozzarella', 'parmesan', 'parmesano', 'parmigiano', 'feta', 'gouda', 'brie',
      'manchego', 'butter', 'mantequilla', 'beurre', 'cream', 'nata', 'crema',
      'creme', 'yogurt', 'yoghurt', 'yogur', 'custard', 'bechamel', 'ghee',
    ],
  },
  {
    allergen: 'nuts',
    patterns: [
      'nut', 'nuts', 'almond', 'almonds', 'almendra', 'almendras', 'amande',
      'walnut', 'walnuts', 'nuez', 'nueces', 'hazelnut', 'hazelnuts', 'avellana',
      'avellanas', 'cashew', 'cashews', 'anacardo', 'pistachio', 'pistachios',
      'pistacho', 'pecan', 'pecans', 'macadamia', 'pine nut', 'pine nuts', 'pinon',
      'pesto', 'praline', 'marzipan', 'nutella', 'frangipane',
    ],
  },
  {
    allergen: 'celery',
    patterns: ['celery', 'celeriac', 'apio', 'celeri'],
  },
  {
    allergen: 'mustard',
    patterns: ['mustard', 'mostaza', 'moutarde', 'dijon'],
  },
  {
    allergen: 'sesame',
    patterns: ['sesame', 'sesamo', 'tahini', 'tahina'],
  },
  {
    allergen: 'molluscs',
    patterns: [
      'mussel', 'mussels', 'mejillon', 'mejillones', 'clam', 'clams', 'almeja',
      'almejas', 'oyster', 'oysters', 'ostra', 'ostras', 'squid', 'calamari',
      'calamar', 'calamares', 'octopus', 'pulpo', 'scallop', 'scallops', 'vieira',
      'vieiras', 'snail', 'snails', 'caracol', 'escargot', 'cockle', 'cockles',
      'whelk', 'periwinkle',
    ],
  },
];

/** Plain-language label for an allergen id (from the shared EU-14 table). */
function labelFor(allergen: AllergenId): string {
  const entry = ALLERGENS.find((a) => a.id === allergen);
  return entry ? entry.label : allergen;
}

/**
 * Whole-word match of a (possibly multi-word) lowercase pattern inside an array
 * of normalized words. Multi-word patterns must appear as a contiguous run.
 *
 * Whole-word semantics (rather than substring) prevent false positives such as
 * "soy" firing inside "soybean-free dressing" wording or "nut" firing inside an
 * unrelated token. normalizeName has already lowercased, stripped accents, and
 * split-able-by-space the input, so we tokenize on spaces here.
 */
function matchesWord(words: readonly string[], pattern: string): boolean {
  const patternWords = pattern.split(' ').filter((w) => w.length > 0);
  if (patternWords.length === 0) return false;
  if (patternWords.length === 1) {
    return words.includes(patternWords[0]!);
  }
  // Multi-word: find a contiguous run.
  for (let i = 0; i + patternWords.length <= words.length; i++) {
    let all = true;
    for (let j = 0; j < patternWords.length; j++) {
      if (words[i + j] !== patternWords[j]) {
        all = false;
        break;
      }
    }
    if (all) return true;
  }
  return false;
}

/**
 * Detect which EU-14 allergens a dish MAY contain from its guessed ingredients.
 *
 * Honest contract:
 *  - The result is "may contain", never a guarantee, and never "safe": an empty
 *    array means "no keyword matched", not "allergen-free". Callers must keep the
 *    ALLERGEN_DISCLAIMER visible regardless of length.
 *  - Deterministic: order follows {@link ALLERGEN_RULES} (Annex II order); deduped
 *    so each allergen appears at most once even if several ingredients imply it.
 *  - Pure: no I/O, clock, or randomness.
 *
 * @param ingredients guessed ingredient names + grams from the perception layer.
 * @returns one {@link AllergenFlag} per distinct detected allergen, each with a
 *          "May contain … — confirm with staff" note.
 */
export function detectAllergens(ingredients: IngredientGuess[]): AllergenFlag[] {
  // Pre-tokenize every ingredient name once.
  const tokenizedNames: string[][] = ingredients.map((ing) =>
    normalizeName(matchName(ing)).split(' ').filter((w) => w.length > 0),
  );

  const flags: AllergenFlag[] = [];
  const seen = new Set<AllergenId>();

  for (const rule of ALLERGEN_RULES) {
    if (seen.has(rule.allergen)) continue;
    const hit = tokenizedNames.some((words) =>
      rule.patterns.some((pattern) => matchesWord(words, pattern)),
    );
    if (hit) {
      seen.add(rule.allergen);
      flags.push({
        allergen: rule.allergen,
        basis: 'ingredient-match',
        // Disclaimer spirit: informational "may contain", deferring to the venue.
        // We name the specific allergen and append the shared "confirm with staff"
        // caveat verbatim, so the note never drifts from the canonical wording.
        note: `May contain ${labelFor(rule.allergen)}. ${ALLERGEN_DISCLAIMER}`,
      });
    }
  }

  return flags;
}
