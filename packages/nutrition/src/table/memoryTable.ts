import type { FoodRecord, MatchResult, NutritionTable } from '../types';
import { SEED_FOODS } from './seed';
import { CURATED_FOODS } from './foods.curated';
import { GENERATED_FOODS } from './foods.generated';

/**
 * The broadest dataset available at build time: the curated set unioned with the
 * generated CIQUAL/USDA set (curated wins exact/alias ties; generated adds breadth).
 *
 * - `GENERATED_FOODS` is the machine-ingested CIQUAL + USDA table (thousands of
 *   rows, real source values) emitted by `scripts/ingest.mjs`.
 * - `CURATED_FOODS` is the hand-authored set of common European restaurant
 *   ingredients with clean EN/ES/FR aliases the perception layer hits reliably.
 *
 * Curated rows are listed FIRST so that, on an exact/alias tie with a noisier
 * generated description, the clean curated record wins (the matcher keeps the
 * first highest-scoring hit). The generated rows then provide the long-tail
 * breadth. SEED_FOODS is intentionally NOT part of the default — it stays a test
 * fixture only (pass it explicitly).
 */
export const DEFAULT_FOODS: FoodRecord[] = [...CURATED_FOODS, ...GENERATED_FOODS];

/** Normalize a food name for matching: lowercase, strip diacritics, collapse spaces. */
export function normalizeName(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // strip combining accents
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

interface IndexEntry {
  key: string;
  record: FoodRecord;
}

/**
 * MATCHER HARDENING (truthfulness, Stage 0 — offline/deterministic):
 *
 * The single most impactful honesty fix is to refuse a confident wrong match. A
 * best hit below MIN_SCORE on the LOOSE-SUBSTRING tier is treated as UNMATCHED so
 * the ingredient's grams stay in the coverage denominator (widening the range,
 * lowering confidence) instead of contributing a low-confidence guess for the
 * dominant mass — this kills the risotto->rice / paneer->bread class of error.
 *
 * Note: the floor applies ONLY to the loose-substring tier (the noisy one), AFTER
 * the qualifier/negation guard, and never to exact (1.0) or whole-word shared-token
 * (0.5..0.9) hits — so 'grilled salmon' -> 'salmon' (shared whole word) and 3-4 word
 * EN/ES/FR dish names still resolve to their head ingredient, while 'risotto' ->
 * 'rice' (substring only) is rejected.
 */
const MIN_SUBSTRING_SCORE = 0.55;

/**
 * Minimum candidate-key length for the loose-substring tier to fire, AND the
 * substring must land on a word boundary in the longer string. This stops short,
 * promiscuous keys (e.g. the bread alias 'pan', length 3) from swallowing unrelated
 * words ('pan' inside 'paneer'). We gate on the MATCHED RECORD's key length, not on
 * noisy query length.
 */
const MIN_SUBSTRING_KEY_LEN = 5;

/**
 * Plant-milk / plant-based qualifiers. When the QUERY carries one of these, it must
 * NOT resolve to a plain dairy candidate (milk/cream/yogurt/cheese) on a shared word
 * like 'milk'. Curated plant-milk rows resolve these correctly; absent a plant row,
 * the query goes honestly unmatched rather than mis-resolving to dairy.
 */
const PLANT_QUALIFIERS = [
  'coconut', 'soy', 'soya', 'oat', 'almond', 'rice', 'hemp', 'cashew', 'plant',
  // 'vegan'/'plantbased' so 'vegan cheese' / 'plant butter' never collapse onto
  // dairy cheese (33 g fat) or butter (81 % fat). 'plant based' / 'plant-based'
  // normalize to tokens including 'plant', already covered by the 'plant' qualifier.
  'vegan', 'plantbased',
] as const;

/**
 * Plain-dairy candidate words a plant-qualified query must never collapse onto. Now
 * includes solid dairy (cheese/butter) so a plant-qualified query for those never
 * resolves to the fatty dairy row — it resolves to a plant row or goes honestly
 * UNMATCHED (wider band) instead (directive E4).
 */
const PLAIN_DAIRY_WORDS = [
  'milk', 'leche', 'lait', 'cream', 'nata', 'crema', 'yogurt', 'yoghurt', 'yogur',
  'cheese', 'queso', 'fromage', 'butter', 'mantequilla', 'beurre',
] as const;

/**
 * Plain-MEAT candidate words a plant-qualified query must never collapse onto — the
 * meat analog of the dairy guard. A 'soy patty' / 'plant burger' / 'vegan sausage'
 * must NOT resolve to beef/ground-beef on a shared word like 'patty' or 'burger'
 * (wrong protein class, inflated fat). Absent a plant row it goes honestly UNMATCHED
 * (wider band, lower confidence) instead of mis-resolving to meat. Directive E4 (intent
 * extended from dairy to meat) + J (honest floor made visible).
 */
const PLAIN_MEAT_WORDS = [
  'beef', 'pork', 'chicken', 'lamb', 'veal', 'turkey', 'duck', 'bacon', 'ham',
  'sausage', 'patty', 'burger', 'meat', 'mince', 'steak', 'pollo', 'cerdo', 'ternera',
] as const;

/**
 * Low-information words that must NOT, on their own, carry a shared-word match. A
 * single overlap on a stopword (e.g. "a"/"la"/"with"/"de") against a long, noisy
 * generated description ("egg, soft-boiled oeuf, a la coque") is not a real match —
 * it is the classic false positive. We strip these before scoring shared overlap.
 */
const STOPWORDS = new Set<string>([
  'a', 'al', 'la', 'le', 'el', 'los', 'las', 'de', 'del', 'du', 'des', 'the',
  'with', 'and', 'or', 'con', 'y', 'et', 'in', 'en', 'au', 'aux', 'sur', 'type',
  'sin', 'plain', 'fresh', 'mixed', 'style', 'served', 'prepacked', 'raw', 'cooked',
  // COOKING VERBS (EN/ES/FR) — a method word carries no FOOD identity, so it must be
  // stripped before shared-token / substring scoring. Without this, 'whole grilled
  // fish' could share the word 'grilled' with a 'grilled chicken' alias and resolve
  // to chicken (wrong protein class). Directive E1.
  'grilled', 'roasted', 'fried', 'deepfried', 'baked', 'sauteed', 'sauted', 'seared',
  'panseared', 'braised', 'poached', 'steamed', 'boiled', 'stewed', 'smoked', 'cured',
  'breaded', 'battered',
  'asado', 'asada', 'frito', 'frita', 'horno', 'plancha', 'guisado',
  'grille', 'grillee', 'roti', 'rotie', 'frit', 'frite', 'four', 'poele', 'poelee',
  'braise', 'fume',
]);

/**
 * Minimum coverage of the MATCHED RECORD'S KEY required for the shared-word tier to
 * fire — gating on the candidate key (per the critic), NOT on noisy query length. A
 * clean alias like "salmon" (1 word) is fully covered by "grilled salmon" (1/1 = 1.0)
 * and resolves; a single shared word inside a 12-word CIQUAL description (~0.08
 * coverage) is rejected as not a real match.
 */
const MIN_KEY_COVERAGE = 0.5;

/**
 * Tie-break epsilon. When two candidates score within EPS of each other we apply a
 * small, deterministic preference (state, then leanness/fat) rather than relying on
 * list order alone — so 'lean beef' lands on a leaner row and a cooked row beats a raw
 * one on an otherwise-equal match (directive E5/E6). Determinism is preserved by the
 * fully-ordered comparator: score, then state (cooked > raw/undefined), then lower
 * per100g.fat, then first-seen (index) id.
 */
const TIE_EPS = 0.001;
/** Wider fat-preference window for a LEAN-qualified query (directive E6 explicit steer). */
const LEAN_TIE_EPS = 0.06;

/**
 * Leanness qualifiers. When the QUERY carries one, the tie-break prefers the
 * same-tier candidate with the LOWER per100g.fat — steering, never fabricating; if no
 * leaner candidate exists the behaviour is unchanged (directive E6).
 */
const LEAN_QUALIFIERS = [
  'lean', 'extralean', 'lowfat', 'skinless', 'light', 'magro', 'maigre',
] as const;

/** Does the substring `needle` appear in `hay` on whole-word boundaries? */
function substringOnWordBoundary(hay: string, needle: string): boolean {
  let from = 0;
  for (;;) {
    const at = hay.indexOf(needle, from);
    if (at < 0) return false;
    const before = at === 0 ? ' ' : hay[at - 1]!;
    const afterIdx = at + needle.length;
    const after = afterIdx >= hay.length ? ' ' : hay[afterIdx]!;
    if (before === ' ' && after === ' ') return true;
    from = at + 1;
  }
}

/**
 * In-memory NutritionTable. Exact/alias match scores 1.0; whole-word containment
 * scores 0.5..0.9; gated loose substring scores 0.5 (subject to MIN_SUBSTRING_SCORE
 * + key-length/word-boundary gates + the qualifier guard). Returns the
 * highest-scoring record, or null when the best hit is an unconfident substring.
 *
 * Production uses the SAME interface populated from real CIQUAL+USDA rows — only
 * the data changes, not the engine. Pass your own records to swap the dataset.
 *
 * MATCHER BLIND SPOT (documented): only ingredients with a curated/generated row (or
 * a clean alias) resolve. Any un-curated long-tail name returns null -> the compute
 * layer keeps its grams in the denominator (wider range, lower confidence). We never
 * mis-resolve an unknown to a superficially similar row.
 */
export function createMemoryTable(records: FoodRecord[] = DEFAULT_FOODS): NutritionTable {
  const index: IndexEntry[] = [];
  for (const record of records) {
    index.push({ key: normalizeName(record.name), record });
    for (const alias of record.aliases ?? []) {
      index.push({ key: normalizeName(alias), record });
    }
  }

  function lookup(name: string): MatchResult | null {
    const q = normalizeName(name);
    if (!q) return null;

    const qWords = q.split(' ');
    const queryHasPlantQualifier = qWords.some((w) =>
      (PLANT_QUALIFIERS as readonly string[]).includes(w),
    );
    // A lean-qualified query (e.g. "lean beef") reinforces the lower-fat tie-break
    // below; the comparator already prefers the lower-fat representative on a near-tie,
    // so a lean query simply lands on the leaner same-family row when one exists.
    const queryIsLean = qWords.some((w) => (LEAN_QUALIFIERS as readonly string[]).includes(w));

    // Best hit per tier. We keep the substring tier separate so its MIN_SCORE floor
    // only gates substring hits, never an exact or shared-whole-word hit.
    let strong: MatchResult | null = null; // exact (1.0) or shared-word (0.5..0.9)
    let substring: MatchResult | null = null; // loose substring (0.5)

    /**
     * Should `cand` replace `best`? Higher score always wins. Within TIE_EPS we apply
     * a fully-ordered, deterministic tie-break so we never depend on list order alone:
     *   1. prefer state==='cooked' (the common restaurant case; avoids the raw-grain
     *      x2.4 trap when a raw and cooked row tie),
     *   2. prefer the LOWER per100g.fat representative (esp. for a lean-qualified query;
     *      also a sane default so 'beef' does not land on the fattiest row by order),
     *   3. otherwise keep the first-seen candidate (stable).
     */
    // A lean-qualified query widens the fat-preference window (LEAN_TIE_EPS), so the
    // leaner same-family row wins even at a slightly larger score gap; a normal query
    // applies the lower-fat preference only on a near-exact tie (TIE_EPS).
    const fatPrefWindow = queryIsLean ? LEAN_TIE_EPS : TIE_EPS;
    const beats = (cand: MatchResult, best: MatchResult): boolean => {
      if (cand.score > best.score + TIE_EPS) return true;
      if (cand.score < best.score - TIE_EPS) return false;
      // Near-tie: state preference (cooked beats raw/undefined).
      const candCooked = cand.record.state === 'cooked';
      const bestCooked = best.record.state === 'cooked';
      if (candCooked !== bestCooked) return candCooked;
      return false; // exact-score tie on state -> fall through to fat pref below.
    };

    /** Fat-preference replacement: within the (possibly widened) window, lower fat wins. */
    const beatsOnFat = (cand: MatchResult, best: MatchResult): boolean => {
      if (Math.abs(cand.score - best.score) > fatPrefWindow) return false;
      const candCooked = cand.record.state === 'cooked';
      const bestCooked = best.record.state === 'cooked';
      if (candCooked !== bestCooked) return false; // state already decided it.
      return cand.record.per100g.fat < best.record.per100g.fat;
    };

    const considerStrong = (record: FoodRecord, score: number): void => {
      const cand: MatchResult = { record, score };
      if (!strong || beats(cand, strong) || beatsOnFat(cand, strong)) strong = cand;
    };
    const considerSubstring = (record: FoodRecord, score: number): void => {
      const cand: MatchResult = { record, score };
      if (!substring || beats(cand, substring) || beatsOnFat(cand, substring)) substring = cand;
    };

    for (const entry of index) {
      if (entry.key === q) {
        considerStrong(entry.record, 1);
        continue;
      }

      const kWords = entry.key.split(' ');

      // QUALIFIER / NEGATION GUARD: a plant-qualified query must not resolve to a plain
      // DAIRY or plain MEAT candidate that lacks that qualifier (coconut milk != dairy
      // milk; soy patty != beef patty). It then resolves to a plant row or goes
      // honestly UNMATCHED (wider band) rather than mis-resolving to an animal product.
      const candidateHasPlant = kWords.some((w) =>
        (PLANT_QUALIFIERS as readonly string[]).includes(w),
      );
      const candidateIsPlainDairy =
        kWords.some((w) => (PLAIN_DAIRY_WORDS as readonly string[]).includes(w)) && !candidateHasPlant;
      const candidateIsPlainMeat =
        kWords.some((w) => (PLAIN_MEAT_WORDS as readonly string[]).includes(w)) && !candidateHasPlant;
      if (queryHasPlantQualifier && (candidateIsPlainDairy || candidateIsPlainMeat)) {
        continue; // skip this candidate entirely (both tiers)
      }

      // Whole-word containment (shared-token tier). Stopwords are ignored, and the
      // shared content words must cover a meaningful fraction of the CANDIDATE key —
      // so a lone overlap on a noisy generated description does not masquerade as a
      // match. 'grilled salmon' -> alias 'salmon' covers 1/1 of the key and fires.
      const kContent = kWords.filter((w) => !STOPWORDS.has(w));
      const shared = qWords.filter((w) => !STOPWORDS.has(w) && kContent.includes(w));
      if (shared.length > 0) {
        const keyCoverage = shared.length / Math.max(1, kContent.length);
        if (keyCoverage >= MIN_KEY_COVERAGE) {
          const score = 0.5 + 0.2 * (shared.length / Math.max(qWords.length, kWords.length));
          considerStrong(entry.record, Math.min(score, 0.9));
        }
        continue;
      }

      // Loose substring tier — GATED. Only fires when the candidate key is long
      // enough to be specific AND lands on a word boundary in the longer string.
      if (entry.key.length < MIN_SUBSTRING_KEY_LEN) continue;
      const longer = q.length >= entry.key.length ? q : entry.key;
      const shorter = q.length >= entry.key.length ? entry.key : q;
      if (substringOnWordBoundary(longer, shorter)) {
        considerSubstring(entry.record, 0.5);
      }
    }

    // A strong (exact / shared-word) hit always wins. Otherwise the substring hit is
    // only accepted if it clears the MIN_SCORE floor — below it, the ingredient is
    // honestly UNMATCHED (returns null), keeping its grams in the denominator.
    if (strong) return strong;
    if (substring && (substring as MatchResult).score >= MIN_SUBSTRING_SCORE) return substring;
    return null;
  }

  return {
    lookup,
    size: () => records.length,
  };
}

/**
 * Default table backed by the broadest available dataset (curated + generated
 * CIQUAL/USDA). Despite the historical name, this is the PRODUCTION-grade table the
 * orchestrator uses by default — not the seed fixture (which is tests-only).
 */
export const seedTable: NutritionTable = createMemoryTable(DEFAULT_FOODS);

/** Seed-fixture-only table, retained for the original unit tests. */
export const seedFixtureTable: NutritionTable = createMemoryTable(SEED_FOODS);
