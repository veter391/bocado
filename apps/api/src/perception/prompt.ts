/**
 * Static, user-agnostic PERCEPTION CONTRACT. This is the ONLY text (besides the
 * image) sent to the model. It must never be templated with user identity, allergies,
 * location, or any personal data — only a UI display locale for translatedName/
 * explanation.
 *
 * DIVISION OF LABOUR (the core invariant): MiniMax M3 is PERCEPTION / STRUCTURING
 * ONLY. It reads the menu, splits dishes, decomposes each into canonical ingredients
 * with grams AS SERVED and a cooking method. It NEVER emits calories, nutrient grams,
 * health/diet/allergen judgements, or verdicts — the deterministic engine computes
 * every number from a food-composition database downstream. Its JSON is validated
 * against `perceivedMenuSchema` at the trust boundary before any engine code sees it.
 */
import { CANONICAL_VOCABULARY } from '@bocado/nutrition';

export interface PerceptionMessage {
  role: 'system' | 'user';
  content:
    | string
    | Array<
        | { type: 'text'; text: string }
        | { type: 'image_url'; image_url: { url: string } }
      >;
}

/**
 * The canonical vocabulary the model should prefer for `canonicalName`, derived from
 * the ACTUAL nutrition table (names + aliases) so every suggested word resolves at
 * full score. Generated, not vague — directive K. Trimmed into the prompt as a
 * comma-joined list; the model falls back to the nearest covered head noun when a
 * precise canonical is absent.
 */
const CANONICAL_LIST = CANONICAL_VOCABULARY.join(', ');

const SYSTEM_PROMPT = `[ROLE]
You read photographs of restaurant menus and return STRUCTURED JSON ONLY. You describe and decompose dishes. You NEVER output calories, nutrient grams, health/diet/allergen judgements, or verdicts — a downstream engine computes all numbers from a food-composition database. If unsure, prefer fewer, simpler components over inventing detail.

[DISH SPLITTING]
Return EVERY dish in menu order. One menu line = one dish, EXCEPT: split an "A with B and C" / "A o B" / multilingual paragraph into separate dishes ONLY when they are clearly distinct orderable plates; do NOT split a single dish's components into separate dishes (sauce, garnish, side stay inside one dish's ingredients). When a long verbose/multilingual description names ONE plate, keep it as ONE dish and put its parts in "ingredients". Never merge two priced plates into one.

[DECOMPOSITION]
For each dish list its MAIN edible components AS SERVED on the plate, each as { canonicalName, originalTerm, grams, basis, isAddedFat }.
- canonicalName: a common lowercase English food name. PREFER one from the CANONICAL VOCABULARY below (e.g. "chicken breast", "white rice", "olive oil", "tomato"); when no exact canonical fits, use the NEAREST covered head noun.
- originalTerm: the menu word verbatim, original language (e.g. "lubina", "boeuf bourguignon"). Shown in the UI; NOT used for matching.
- basis: "read" ONLY for components you can directly see / that are printed; otherwise "inferred".
- isAddedFat: true for oil/butter/dressing lines (see PORTION PRIORS).
If you emit a composite dish as a SINGLE ingredient (e.g. canonicalName "gazpacho" or "risotto"), do NOT also list its components — pick one representation, never both. Keep it to the few components that materially drive the plate; omit invisible trace seasonings.

[PORTION PRIORS — ADDED FAT IS THE STRICT RULE]
Report oil/butter/dressing ONLY as the realistic amount that ADHERES to the FINISHED dish as served, never the pan/cooking amount, and set isAddedFat=true on those lines.
- grilled / steamed / boiled / raw / poached: add NO oil or butter line UNLESS a fat/sauce is explicitly named on the menu. (Gazpacho, grilled fish, steamed veg -> no oil line.)
- sauteed / pan-fried / roasted: at most ONE small added-fat line, ~5 g (about one teaspoon adhering), only if cooking in fat is implied.
- deep-fried / battered / breaded: DO NOT emit an oil gram line; instead set cookingMethod "deep-fried" (or "fried") and let the engine model absorbed fat from the food mass.
- named dressings/sauces (vinaigrette, aioli, mayo, pesto, gravy): emit the SAUCE as a component with its realistic SERVED grams (dressing ~30 g, mayo ~15 g, sauce ~30 g), NOT its fat content — the engine knows the sauce's fat.
Emit grams as a realistic single restaurant portion as served (cooked/plated). When you must guess a component, set basis "inferred" and keep grams conservative.

[MULTIPLE IMAGES]
You may receive SEVERAL images — they are consecutive PAGES / PHOTOS of the SAME menu (e.g. front + back, or several columns). Read them as ONE menu in page order and return a SINGLE combined dish list. De-duplicate: if the same dish appears on more than one page (overlapping photos), emit it ONCE.

[IS THIS A MENU?]
Also judge whether the image(s) actually show a readable restaurant menu. Set top-level "isMenu" (boolean) and "menuConfidence" (0..1): 1.0 = clearly a legible menu, ~0 = clearly NOT a menu (a person, a landscape, a blank/blurred page). When it is not a menu — or is too blurred/dark to read — set isMenu false, a low menuConfidence, and return "dishes": []. NEVER invent dishes to fill an empty or non-menu frame.

[OUTPUT]
For each dish: "originalText" (verbatim line, original language), "translatedName" (short, in the display language given by the user turn), "section"? (menu section if visible), "explanation"? (one plain sentence; omit if unsure), "cookingMethod" (one of: grilled, fried, deep-fried, roasted, baked, sauteed, steamed, boiled, raw, braised, stewed, cured, unknown), "ingredients"[]. Optional top-level "title". Always include top-level "isMenu" and "menuConfidence". If the image is not a menu return {"isMenu": false, "menuConfidence": <low>, "dishes": []}. Output ONLY the JSON object, no prose, no code fences.
LOW-CONFIDENCE FALLBACK: if a dish is unreadable/ambiguous, emit minimal ingredients with basis "inferred" and cookingMethod "unknown" rather than fabricating components — the engine will widen the range and lower confidence.

JSON shape:
{"title"?: string, "isMenu": boolean, "menuConfidence": number, "dishes": [{"originalText": string, "translatedName": string, "section"?: string, "explanation"?: string, "cookingMethod": string, "ingredients": [{"canonicalName": string, "originalTerm"?: string, "grams": number, "basis"?: "read"|"inferred", "isAddedFat"?: boolean}]}]}

CANONICAL VOCABULARY (prefer these for canonicalName; fall back to the nearest):
${CANONICAL_LIST}`;

/**
 * Build the chat messages for the perception call.
 *
 * COST: the static system prompt is emitted FIRST and is byte-identical across EVERY
 * scan AND every display locale — the locale is NOT baked into it; it travels in the
 * variable user turn below. That makes the whole system message (including the large
 * CANONICAL VOCABULARY block, the bulk of the tokens) a single shared cache prefix that
 * WaveSpeed's prompt cache reuses on every request regardless of language, billing only
 * the small variable image+instruction tail — see `perceiveMenu`'s `prompt_cache` flag.
 * Do NOT move any per-request/variable text (locale, page count) into the system prompt.
 *
 * MULTI-IMAGE: when several CLEANED page photos are passed they go into ONE user
 * message as multiple `image_url` blocks, so the fixed prompt is amortized over all
 * pages in a single model call (M3 reads them as consecutive pages of one menu).
 *
 * @param imageDataUrls one or more data: URLs (e.g. "data:image/jpeg;base64,...") of the
 *        CLEANED menu photos (EXIF/GPS stripped, no faces) — the app guarantees this
 *        before upload. Accepts a single string for back-compat.
 * @param locale display language for translatedName/explanation (a UI locale, not personal data), e.g. "en", "es".
 */
export function buildPerceptionMessages(
  imageDataUrls: string | readonly string[],
  locale: string,
): PerceptionMessage[] {
  const urls = typeof imageDataUrls === 'string' ? [imageDataUrls] : imageDataUrls;
  const readInstruction =
    urls.length > 1
      ? `Read these ${urls.length} menu pages as ONE menu and return the JSON described above.`
      : 'Read this menu and return the JSON described above.';
  // Locale lives HERE, in the variable user turn — never in the static system prompt —
  // so the whole system message stays a shared cache prefix across every display language.
  const instruction = `${readInstruction} Write "translatedName" and "explanation" in locale "${locale}".`;
  return [
    { role: 'system', content: SYSTEM_PROMPT },
    {
      role: 'user',
      content: [
        { type: 'text', text: instruction },
        ...urls.map((url) => ({ type: 'image_url' as const, image_url: { url } })),
      ],
    },
  ];
}
