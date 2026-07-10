# Bocado — Disclaimers

> **STATUS: DRAFT / TEMPLATE — NOT LEGAL ADVICE.**
> This document was assembled from Bocado's actual product behaviour (code + internal
> docs) and is a starting template only. It **must** be reviewed and approved by the
> owner and a qualified lawyer before it is published or relied upon — in particular the
> parts touching **GDPR Art. 9 health data**, EU food-allergen law (Reg 1169/2011, Spain
> RD 126/2015 / Ley 17/2011), and the **EU AI Act Art. 50** transparency duty. Where a
> fact is only known to the owner it is marked `[OWNER: …]`.
>
> Last assembled: 2026-06-18. Legal facts cited here trace to internal `SECURITY.md`
> (verified 2026-06-16); confirm the primary sources (EUR-Lex / BOE / Commission
> guidance) before publishing.

---

## 0. Who & what this covers

- **App:** Bocado — a menu-understanding app. You photograph a restaurant menu; the app
  reads it, translates and explains dishes, shows an **estimated** nutrition range and a
  glanceable suitability indicator per dish, and can show an **AI-generated illustration**
  of a dish.
- **Provider:** `[OWNER: legal/company name]`, `[OWNER: registered address / jurisdiction]`.
- **Contact for these disclaimers:** `[OWNER: support/legal contact email]`.
- **Scope:** This page states the limits of what Bocado's information means. It sits
  alongside, and does not replace, the app's Privacy Policy and Terms of Service
  (`[OWNER: confirm those documents exist and link them]`).

These disclaimers describe behaviour that is **enforced in the product**, not aspirational
copy. The exact in-app strings are reproduced verbatim below and cited to their source.

---

## 1. Health & nutrition — estimates, not exact figures, not medical advice

### 1.1 What Bocado actually does

Bocado does **not** weigh your food, read a recipe, or know the kitchen's portion sizes.
It works from a menu *name* and inferred ingredients, then computes nutrition
**deterministically** from real reference databases (CIQUAL and USDA FoodData Central),
summing per-100g values across inferred ingredients and inferred grammage. The result is
always an **interval (a range) with a confidence level — never a single hard number**.

- Output is "an *interval* (e.g. ~620–760 kcal) with a confidence … Never a single hard
  number." — `ARCHITECTURE.md` §4.
- The nutrition type is documented as "Always an estimate, never a hard figure." —
  `packages/shared/src/types.ts:77`.
- Nutrition is shown honestly as **ranges**, not fixed truths. —
  `apps/mobile/src/components/EstimateBar.tsx` header.
- The large-language model is **forbidden** from producing the calorie/macro numbers or
  the suitability verdict; those are produced by deterministic code over a real database.
  — `ARCHITECTURE.md` §3 table; `SECURITY.md` §4 ("Never let the LLM output the calorie
  number or the safety verdict").

### 1.2 Exact in-app disclaimer copy (reproduced verbatim)

These strings ship in the app today. They are the authoritative wording; this page
explains them, it does not override them.

- **Nutrition disclaimer constant:**
  `NUTRITION_DISCLAIMER = 'Estimate only, not exact.'`
  — `packages/shared/src/constants.ts:60`.
- **Per-dish footnote (dish detail):**
  `'Lights are estimates for one portion, not medical advice.'`
  — `apps/mobile/src/screens/DishDetailScreen.tsx:286`.
- **When the estimate is uncertain (dish detail):**
  `'Rough estimate — we could not read this dish clearly.'`
  — `apps/mobile/src/screens/DishDetailScreen.tsx:285`.
- **Results-list footnote:**
  `'Calories and nutrients are estimates from the menu, shown as ranges. Always confirm
  details with the restaurant.'`
  — `apps/mobile/src/screens/ResultsScreen.tsx:560`.
- **Per-portion label:** `'PER PORTION · ESTIMATE'`
  — `apps/mobile/src/screens/DishDetailScreen.tsx:170`.
- **Guidance-light footnote (energy & protein lights):**
  `GUIDANCE_LIGHT_FOOTNOTE = 'Bocado guidance (not an FSA label).'`
  — `packages/shared/src/constants.ts:81`. Energy and protein lights are Bocado guidance
  derived from EU Reference Intakes, **not** an official UK FSA front-of-pack threshold.

### 1.3 The disclaimer in plain language

> **Nutrition figures in Bocado are estimates, not measurements.** They are shown as a
> range, not an exact number, because they are calculated from a dish *name* and the
> ingredients we infer — not from the actual plate, recipe, or portion served. Real values
> depend on the restaurant's recipe, portion size, and preparation, and can differ
> significantly from our estimate.
>
> **Bocado is not a medical device and does not provide medical, dietary, or nutritional
> advice.** The suitability indicators ("lights"/dots) are general guidance for one
> portion, not a clinical assessment. **Do not** use Bocado to manage a medical condition,
> dose medication or insulin, or make decisions that depend on precise nutrient values.
> Always consult a qualified doctor, dietitian, or other healthcare professional for advice
> about your diet or health, and follow their guidance over anything shown in the app.
>
> Bocado does **not** make health claims about any dish. We do not state that a dish is
> "healthy", aids weight loss, or confers any health benefit; the app deliberately avoids
> such language. (Internal basis: `SECURITY.md` §2.D — nutrition is descriptive, never
> promissory; EU Reg 1924/2006.)

---

## 2. Allergens — "may contain", confirm with the restaurant; never "safe"

### 2.1 What Bocado actually does

Bocado infers possible allergens by matching inferred ingredients against the **EU-14**
allergen list (Reg 1169/2011 Annex II — encoded in `packages/shared/src/constants.ts:4-20`).
This is **inference from a menu name**, not a reading of the kitchen's actual ingredients
or cross-contamination practices. By design and in code, Bocado:

- frames every allergen flag as **"may contain"** and **never** says a dish is "safe" or
  "allergen-free". — `SECURITY.md` §2.B; `apps/mobile/src/data/menuService.test.ts:11`
  ("never 'safe'/'allergen-free'; only 'may contain — confirm with staff'");
  `packages/nutrition/src/allergens/detect.ts:201`.
- always attaches the standard "confirm with staff" caveat to a flag. —
  `packages/nutrition/src/allergens/detect.ts:234`
  (`note = 'May contain {allergen}. ' + ALLERGEN_DISCLAIMER`).
- forces at least a `caution` state when an allergen may be present. —
  `apps/mobile/src/data/menuService.ts:12`.

The legal duty to provide accurate allergen information sits on the **restaurant** (the
food business operator), not on Bocado — EU Reg 1169/2011 + Spain RD 126/2015. Bocado is
not the food-information provider and cannot guarantee any dish. — `SECURITY.md` §2.B.

### 2.2 Exact in-app disclaimer copy (reproduced verbatim)

- **Allergen disclaimer constant:**
  `ALLERGEN_DISCLAIMER = 'May contain — always confirm with restaurant staff.'`
  — `packages/shared/src/constants.ts:59`.
- **Allergen chip title:** `'May contain {allergen}'`
  — `apps/mobile/src/components/AllergenChip.tsx:42`; the chip always renders
  `ALLERGEN_DISCLAIMER` beneath it (`AllergenChip.tsx:82`) and in its accessibility label
  (`AllergenChip.tsx:68`).
- **Dish-detail allergen block header:** `'MAY CONTAIN'`
  — `apps/mobile/src/screens/DishDetailScreen.tsx:233`, followed by `ALLERGEN_DISCLAIMER`
  (`DishDetailScreen.tsx:247`).
- **Onboarding (allergy opt-in) copy:**
  `'We keep them only on your device to flag dishes for you. We never say a dish is safe —
  always confirm with staff. You can turn this off any time.'`
  — `apps/mobile/src/screens/OnboardingScreen.tsx:234`.

### 2.3 The disclaimer in plain language

> **Bocado's allergen flags are informational guesses, not a safety guarantee.** A flag
> means a dish **may contain** an allergen based on the ingredients we infer from the menu;
> the absence of a flag does **not** mean a dish is safe or allergen-free. Menus are read
> imperfectly, ingredients are inferred, and Bocado has no visibility into the kitchen's
> actual ingredients, substitutions, or cross-contamination.
>
> **Always confirm allergen information directly with the restaurant before ordering.**
> The restaurant is legally responsible for accurate allergen information.
>
> **If you have a severe allergy, intolerance, or any condition where an allergen could
> cause you harm: do not rely on Bocado. Always confirm with the restaurant's staff, and
> follow your medical guidance and emergency plan.** Bocado must never be your only source
> of allergen safety information.

### 2.4 Note on health data (GDPR Art. 9)

Allergy / intolerance / medical-diet inputs are treated as **special-category health data**
under GDPR Art. 9. Bocado keeps these **on your device by default** and processes the
perception (image) plane without any of your identity, allergies, location, or profile.
— `SECURITY.md` §1–§2.A; `ARCHITECTURE.md` §0 ("the vision model is given a menu photo and
nothing else"); onboarding copy `OnboardingScreen.tsx:234`.
The lawful basis, consent flow, retention, and any cloud sync are governed by the Privacy
Policy, **not** this disclaimer. `[OWNER + LAWYER: confirm the Art. 9 explicit-consent
flow and the Privacy Policy cover this; this disclaimer is not a substitute for that
review.]`

---

## 3. AI-generated dish images (EU AI Act Art. 50 transparency)

### 3.1 What Bocado actually does

When a dish has no real photo, Bocado can show an **AI-generated illustration**. The
prompt explicitly asks for an illustration "not a real photograph" so the output is
decorative and is never presented as a real photo of the actual plate. —
`apps/api/src/routes/image.ts:43-51` (`foodImagePrompt`).

Every AI image is marked in **two** ways, matching the AI Act Art. 50 split between a
machine-readable mark and a clear visible disclosure:

1. **Machine-readable marker** — the image API marks each generated image as AI-generated
   on the wire (`X-AI-Generated: true`) and in storage provenance metadata
   (`customMetadata.aiGenerated = 'true'`). — `apps/api/src/routes/image.ts:54-62, 107-110`;
   verified by tests asserting the header and stored metadata —
   `apps/api/src/routes/image.test.ts:90, 110, 131, 145`.
2. **Clear visible label in the UI** — the app renders a legible **"AI illustration"** pill
   on every generated image (never a faint footer or a buried ToS clause). —
   `apps/mobile/src/components/AIBadge.tsx` (uses `AI_IMAGE_LABEL`); dish-detail hero tag
   `apps/mobile/src/screens/DishDetailScreen.tsx:142`; accessibility labels
   `apps/mobile/src/screens/ResultsScreen.tsx:531-532`.

- **AI image label constant:** `AI_IMAGE_LABEL = 'AI illustration'`
  — `packages/shared/src/constants.ts:61`.

### 3.2 The disclosure in plain language

> **Dish images in Bocado that are labelled "AI illustration" are generated by an AI image
> model. They are not photographs of the actual dish you will be served.** They are
> stylised, decorative illustrations created from the dish name and may differ from the
> real dish in appearance, ingredients, portion, and presentation. Do not rely on an AI
> illustration to judge what a dish contains, how large it is, or whether it is suitable
> for you — use the dish description, the allergen guidance (Section 2), and confirmation
> from the restaurant.

### 3.3 Compliance notes (for owner + legal review)

- The relevant rule is **EU AI Act Art. 50** transparency for AI-generated content, with
  the transparency obligations applying from **2 Aug 2026** (a watermarking grace period
  for pre-existing systems runs to 2 Dec 2026). — `SECURITY.md` §2.C.
  `[OWNER + LAWYER: confirm the final Commission Art. 50 guidance on the exact required
  visible-label format before relying on this.]`
- `SECURITY.md` §2.C also requires preserving any C2PA/watermark the image model emits, and
  adding our own machine-readable mark when the model emits none. The product currently
  asserts the `X-AI-Generated` header + R2 `aiGenerated` metadata as the machine-readable
  marker. `[OWNER: confirm whether the chosen image model emits a C2PA/watermark by
  default, and that a durable machine-readable mark (not only an HTTP header) is in place —
  flagged as an open item in SECURITY.md §5.]`
- **Image model:** internal sources are inconsistent — `ARCHITECTURE.md` §2/§5 name
  FLUX.1 [schnell] / Fal.ai, while `apps/api/src/image/providers.ts:24-38` names Imagen 4
  Fast (Vertex, default) with FLUX fallback and a WaveSpeed provider. This disclaimer
  deliberately does **not** name a specific model. `[OWNER: confirm the production image
  model so any model-specific marking/attribution wording can be finalised.]`

---

## 4. General

- **No professional advice.** Bocado provides general information to help you understand a
  menu. It does not provide medical, nutritional, dietary, legal, or other professional
  advice, and is not a substitute for a qualified professional.
- **Accuracy & availability.** Menu reading, translation, ingredient inference, nutrition
  estimates, and allergen flags can be wrong or incomplete; the app degrades to "unavailable"
  rather than guessing when it cannot read a dish (`ARCHITECTURE.md` §6). You use the
  information at your own risk and should verify anything important with the restaurant.
- **Governing terms.** These disclaimers form part of, and are subject to, Bocado's Terms
  of Service and Privacy Policy. `[OWNER: confirm governing law / jurisdiction and link the
  ToS + Privacy Policy.]`
- **Liability.** `[OWNER + LAWYER: insert the limitation-of-liability wording consistent
  with the ToS and applicable consumer law; do not rely on this template wording.]`

---

## 5. Owner / legal to-do before publishing

1. `[OWNER: legal/company name, registered address, jurisdiction.]`
2. `[OWNER: support/legal contact email for these disclaimers.]`
3. `[OWNER: confirm and link the Privacy Policy and Terms of Service.]`
4. `[OWNER + LAWYER: review the GDPR Art. 9 health-data handling + explicit-consent flow.]`
5. `[OWNER + LAWYER: confirm allergen wording against Reg 1169/2011, RD 126/2015, Ley
   17/2011 from BOE/EUR-Lex primary sources.]`
6. `[OWNER + LAWYER: confirm AI Act Art. 50 visible-label format + machine-readable mark /
   C2PA from final Commission guidance.]`
7. `[OWNER: confirm the production image model and finalise any model-specific wording.]`
8. `[OWNER + LAWYER: insert governing law, jurisdiction, and limitation-of-liability.]`
