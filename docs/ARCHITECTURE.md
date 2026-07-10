# ARCHITECTURE

> All decisions here are grounded in verified technical foundations with sources on file. Facts are
> as of 2026-06-16; re-verify model slugs/prices before launch.

## 0. The one rule everything follows: two planes

The whole privacy + anti-hallucination story rests on splitting the system into two planes that
never mix:

| Plane | What | Where it runs | Sees user data? |
|-------|------|---------------|-----------------|
| **Perception** (anonymous, stateless) | menu photo → structured dishes (OCR, structure, translate, explain, infer ingredients) | third-party vision model via our Worker | **No.** Only the cleaned image + a static prompt |
| **Personalization** (identified, EU) | diet/allergy profile, ranking, nutrition math, suitability dot, history | Cloudflare EU + on-device | Yes — and it never leaves the EU/device |

The vision model is given a menu photo and nothing else. The user's identity, allergies, location,
and preferences are joined to the result **only after** the model returns, on our side. This is
what makes "AI never touches user data" a code-enforced fact, not a slogan.

## 1. Scan → result data flow

```
[ Phone / Expo ]
  1. Capture photo (vision-camera)
  2. ON-DEVICE: strip EXIF/GPS · pre-flight (is it a menu? any faces/people? -> block or crop)
                optional fast OCR draft (Apple Vision / ML Kit) for offline + sanity
        │  (sends: cleaned image bytes only)
        ▼
[ Cloudflare Worker  (TS, EU) ]
  3. PERCEPTION call -> AI Gateway -> OpenRouter (ZDR) -> MiniMax M3
        prompt = STATIC structuring template; body = image + template ONLY
        returns: dishes[] { originalText, translatedName, explanation,
                            inferredIngredients[{name, grams}], section }
  4. DETERMINISTIC engine (no AI):
        - nutrition = Σ (CIQUAL/USDA per-100g × grams)  -> range + confidence
        - suitability dot = rules(timeOfDay, profile, nutrition)  [good/caution/avoid]
        - allergen flags = ingredient match -> "may contain X — confirm with staff"
  5. PERSONALIZE: join user profile (from on-device / D1-EU) -> reorder, filter, flag
        ▼
[ Phone ]  render list (dot + label + est. kcal range + optional thumb)
  6. LAZY image (on dish tap): check R2 cache by normalized name
        -> miss: FLUX.1 schnell (Workers AI) -> store R2 -> serve (labeled "AI illustration")
```

## 2. Components

- **Mobile** — Expo (React Native + TypeScript). Camera, on-device OCR + image cleaning, UI,
  on-device profile store (allergies kept local by default). See [STACK.md](STACK.md).
- **API** — Cloudflare Workers (TypeScript, EU). Orchestrates the perception call, runs the
  deterministic engine, personalizes, manages caches. See [INFRASTRUCTURE.md](INFRASTRUCTURE.md).
- **Vision model** — MiniMax M3 (`minimax/minimax-m3`) via OpenRouter, fronted by Cloudflare AI
  Gateway, Zero-Data-Retention on. Fallback `minimax/minimax-01`.
- **Nutrition engine** — deterministic summation over CIQUAL (primary) + USDA FoodData Central
  (gap-fill) per-100g tables. Each value tagged with `sourceDb` + `recordId`.
- **Image generation** — FLUX.1 [schnell] on Workers AI (primary) / Fal.ai (fallback). Lazy +
  R2-cached by normalized dish name.
- **Storage** — D1 (`jurisdiction=eu`) for users/metadata; R2 (EU jurisdiction) for photos +
  generated images.

## 3. How the LLM is boxed in (anti-hallucination)

The LLM is allowed to be fuzzy only where fuzziness is unavoidable, and is forbidden from inventing
the numbers users will trust.

| LLM **may** do | LLM **must not** do |
|----------------|---------------------|
| OCR + structure a messy menu photo | Produce calorie/macro numbers |
| Translate dish names | Decide the suitability dot |
| Explain a dish / decode ingredient words | Assert a dish is "safe" / allergen-free |
| Infer a likely ingredient list + rough grammage | Touch any user identity / health data |

Everything a user reads as a fact (kcal, the dot, allergen flag) is produced by deterministic code
over a real database — never by the model.

## 4. The deterministic engine

- **Nutrition.** For each inferred ingredient: resolve to a CIQUAL record (USDA fallback), take
  per-100g values, multiply by inferred grams, apply a cooking-method/yield adjustment, sum.
  Output is an **interval** (e.g. ~620–760 kcal) with a confidence derived from match quality +
  grammage certainty. Never a single hard number. Store provenance for audit + attribution.
- **Suitability dot.** Pure rules, unit-testable. Inputs: meal context (time of day), user profile
  (diet, allergies, goals), and the nutrition interval. Example shape: late-night + high energy
  density + high fat → `avoid`; matches diet + moderate → `good`; allergen possibly present →
  forced `caution` with "confirm with staff". Thresholds live in versioned config.
- **Allergens.** Matched from the inferred ingredient list against the user's profile → "may
  contain". Never a guarantee. See [SECURITY.md](SECURITY.md).

## 5. Caching strategy

- **Menus**: store the structured result per user in D1/R2 so re-opens are instant.
- **Generated images**: keyed in R2 by `normalize(dishName) + locale + promptTemplateVersion`.
  Generated once globally, reused for everyone — this is the cost control. **Not** delegated to AI
  Gateway caching, whose key is an exact hash of the full request body (it would never hit on
  "same dish name"). AI Gateway response caching stays on only as a cheap safety net for identical
  retries.

## 6. Failure / degraded modes

- **Offline or model error** → fall back to on-device OCR draft; show dishes with translation/
  nutrition marked "unavailable" rather than guessing.
- **Low OCR/vision confidence** → prompt the user to retake or manually correct before scoring.
- **Image-gen slow/cold-start** → optimistic placeholder; generation happens on first tap only, so
  latency is hidden behind a skeleton and the result is cached for everyone after.
