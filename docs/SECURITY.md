# SECURITY & COMPLIANCE

> EU/Spain-first. Four non-negotiable legal constraints, each tied to a named instrument. Legal
> facts verified 2026-06-16; confirm primary sources (BOE/EUR-Lex) before any legal-facing copy.

## 1. Data classification

| Data | Class | Where it lives | Leaves device? |
|------|-------|----------------|----------------|
| Menu photo (cleaned) | Non-personal **iff** no faces/people + EXIF/GPS stripped | transient → vision model | yes, anonymized |
| Allergies / intolerances / medical diet | **GDPR Art. 9 health data** | on-device by default; EU D1 only with consent | only with explicit consent |
| Account (email/login) | Personal data | D1 `jurisdiction=eu` | no |
| Diet goals, history | Personal data | on-device / EU D1 | no |
| Generated dish images | Non-personal | R2 EU | n/a |

The vision call carries **only** the cleaned image + a static prompt — never account, allergies,
location, goals, or user free-text. This is enforced in Worker code, not just policy.

## 2. The four hard constraints

### A. Allergy/health data → GDPR Art. 9 explicit consent + minimization
- Treat any allergy/intolerance/medical-diet input as **health data** (GDPR Recital 35).
- Lawful basis: **Art. 9(2)(a) explicit consent** — a separate, affirmative, purpose-specific
  opt-in. **Not** pre-ticked, **not** bundled in ToS.
- **Minimize** (Art. 5(1)(c)): collect only what the feature needs; default to **on-device**
  storage/processing; if it leaves the device, keep it in the **EU** and delete when no longer
  needed. Support withdrawal + deletion.
- Sources: [Art. 9](https://gdpr-info.eu/art-9-gdpr/), [Recital 35](https://gdpr-info.eu/recitals/no-35/), [Art. 5](https://gdpr-info.eu/art-5-gdpr/).

### B. Allergens → "may contain, confirm with staff", never "safe"
- The legal allergen duty sits on the **restaurant** (food business operator), not the app — EU
  Reg **1169/2011** (Annex II = 14 allergens) + Spain **RD 126/2015**. The app is not the food
  information provider and cannot guarantee a dish.
- Therefore: **never** label a dish "safe" / "allergen-free"; frame all allergen output as
  informational ("**may contain X — always confirm with staff**"); preserve the legal
  **contiene** vs **puede contener** distinction.
- Why it matters: a wrong "safe" claim can shift liability onto the app and triggers fines up to
  **€600k** (Ley 17/2011) plus civil/criminal exposure after a reaction.
- Sources: [1169/2011](https://eur-lex.europa.eu/eli/reg/2011/1169/oj/eng), [RD 126/2015](https://www.boe.es/diario_boe/txt.php?id=BOE-A-2015-2293).

### C. AI-generated images → machine-readable mark + visible label (AI Act Art. 50)
- From **2 Aug 2026**, providers must mark synthetic images machine-readably and deployers must
  **clearly disclose** AI-generated visuals. (Grandfather: pre-existing systems get until 2 Dec
  2026 for watermarking only.)
- So every generated dish image: (1) preserve any C2PA/watermark the model emits; (2) add our own
  machine-readable mark if the model emits none; (3) show a **clear, visible "AI illustration"
  label** in the UI — not a faint footer, not a ToS clause.
- Sources: [Art. 50](https://artificialintelligenceact.eu/article/50/), [transparency timeline](https://artificialintelligenceact.eu/transparency-rules-article-50/).

### D. Nutrition → estimate, never a health claim (Reg 1924/2006)
- Show nutrition as a clearly-labelled **estimate** with a methodology/uncertainty note (ranges,
  not hard figures).
- **Forbidden copy:** "healthy", "boosts immunity", "lowers cholesterol", "helps weight loss", or
  any benefit/disease language — unless the exact wording is an authorised claim on the EU
  register. Keep nutrition descriptive, never promissory.
- Source: [Reg 1924/2006 summary](https://eur-lex.europa.eu/EN/legal-content/summary/nutrition-and-health-claims-made-on-foods.html).

## 3. Camera handling

- Photos may capture faces/bystanders → potential special-category exposure.
- **On-device pre-flight before any upload:**
  - **EXIF/GPS stripped — SHIPPED.** Every photo is re-encoded on-device (`clean.ts`), which drops
    all EXIF/GPS metadata, and is downscaled/compressed before leaving the device.
  - **Face/person detect → block-or-crop, and menu-frame confirmation — NOT YET IMPLEMENTED.**
    `hasLikelyFaces()` / `isLikelyMenu()` are documented stubs (return `false` / `true`) and the
    scan flow does **not** gate on them; real detection needs an on-device vision capability and a
    physical device to validate. Until it lands, a menu photo that incidentally contains a
    bystander's face is uploaded to the perception model with no face mitigation beyond the user
    framing the shot. This is a known gap, tracked in `clean.ts` (SECURITY.md §3 TODOs), and must
    be closed before any general-audience launch.
- **No server-side retention of raw photos** without explicit consent. The cleaned image is
  transient (sent to the model, not stored long-term unless the user saves the menu).

## 4. DO / DON'T (build checklist)

**DO**
- Gate allergy data behind separate affirmative explicit consent; store on-device/EU; allow delete.
- Strip EXIF/GPS on every photo before it leaves the device (shipped). Add the face-check /
  menu-confirm pre-flight before general-audience launch (not yet implemented — see §3).
- Keep the perception call payload to image + static prompt only.
- Watermark **and** visibly label every AI image.
- Show nutrition as a labelled estimate/range with provenance + attribution (CIQUAL/USDA).
- Pin model versions; keep OpenRouter ZDR on; store all user data in EU D1/R2.

**DON'T**
- Never say a dish is "safe" / "allergen-free"; never collapse contiene/puede-contener; never drop
  the "confirm with staff" caveat.
- Never attach user id / allergies / location / free-text to a model call.
- Never ship AI images with only a faint or ToS-buried label.
- Never use health-benefit/disease language for nutrition.
- Never store allergy data "just in case" or outside the EU.
- Never let the LLM output the calorie number or the safety verdict.

## 5. Residual legal checks before launch

- Read RD 126/2015 + Ley 17/2011 penalty bands from the BOE primary source for final legal copy.
- Confirm the final Commission Art. 50 guidance on the exact required visible-label format.
- Confirm whether the chosen image model emits a machine-readable mark by default (else we add it).
- If allergy data ever syncs to the cloud, pin exact EU region + retention and re-confirm the Art.
  9 consent flow.
