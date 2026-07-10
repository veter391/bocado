# Attribution & Third-Party Licences — Bocado

This notice lists the data sources, AI models, fonts, and open-source software Bocado depends on, and the
attribution each one legally requires. Items marked **MUST be shown in-app** have to appear in a user-reachable
"Licences / Data sources" screen (e.g. Settings → About). This is a developer-prepared draft; have it confirmed
against the final shipped build. `[OWNER: …]` marks a fact only the owner can supply.

---

## 1. Nutrition data (attribution legally required)

### CIQUAL 2020 — ANSES
- **Licence:** Etalab Open Licence 2.0 (Licence Ouverte 2.0). Permits reuse incl. commercial, **with attribution**.
- **Required attribution (MUST be shown in-app + here):**
  > "Nutrition data: CIQUAL 2020, ANSES — Etalab Open Licence 2.0."
- **Source:** https://ciqual.anses.fr — table version `2020-07-07` (see `packages/nutrition/src/table/foods.generated.ts` header and `packages/nutrition/scripts/INGEST.md §7`).
- The attribution string + version are already emitted in the generated data header and `GENERATED_DATA_ATTRIBUTION`; the in-app surface must render it.

### USDA FoodData Central (Foundation Foods)
- **Licence:** CC0 1.0 (public domain dedication). No attribution legally required, but credited as good practice.
- **Required/courtesy text (MUST be shown in-app + here):**
  > "Nutrition data: U.S. Department of Agriculture, FoodData Central (CC0). fdc.nal.usda.gov"
- **Source:** https://fdc.nal.usda.gov — dataset version `2025-04-24`.

### USDA FoodData Central API (runtime long-tail fallback)
- Used only when `FDC_API_KEY` is configured (`apps/api/src/nutrition/usdaFallback.ts`). Public-domain (CC0) data served via a free API key.
- **API terms:** USDA FDC API Terms of Service — https://fdc.nal.usda.gov/api-guide.html . Free, rate-limited; key is read-only to public food data.
- Records fetched at runtime are tagged `db:'API'` (lower-trust provenance) and cached in D1.

> [OWNER: if OpenFoodFacts (ODbL) is ever enabled as an additional source, ODbL **requires** attribution
> "Data: Open Food Facts contributors — ODbL" AND share-alike of any derived database — add it here before shipping that source.]

---

## 2. AI models

### MiniMax M3 (menu perception) — via WaveSpeed
- Role: reads/structures the menu photo into text + ingredients only; **does not** produce nutrition numbers.
- Provider: WaveSpeedAI (`https://llm.wavespeed.ai/v1`), model `minimax/minimax-m3`. Governed by WaveSpeed + MiniMax terms.
- [OWNER: confirm WaveSpeed/MiniMax commercial-use terms + any output-ownership/indemnity clauses for your account tier.]

### Flux-2 Flash (dish images) — via WaveSpeed
- Provider: WaveSpeedAI, model `wavespeed-ai/flux-2-flash/text-to-image`.
- AI-generated images are disclosed in-app ("AI illustration" badge) and via the `X-AI-Generated` HTTP header + R2 metadata (see `DISCLAIMERS.md` for the EU AI Act Art. 50 note).
- [OWNER: confirm output licence/commercial-use + whether a watermark (SynthID/C2PA) is emitted; record any "no IP indemnity" clause.]

### FLUX.1 [schnell] (on-platform fallback image model)
- Cloudflare Workers AI model `@cf/black-forest-labs/flux-1-schnell`.
- **Licence:** Apache-2.0 (model weights). Commercial use permitted.

---

## 3. Fonts
- **Plus Jakarta Sans** — SIL Open Font Licence 1.1 (OFL). Free for commercial use; OFL reserved-name + no-standalone-sale terms apply.
- **Inter** — SIL Open Font Licence 1.1 (OFL).
- (If Fraunces or any other family ships, it is also OFL — confirm against the final bundle.)
- OFL requires the licence text to ship with the font files; keep the OFL.txt that accompanies each family.

---

## 4. Key open-source software
Delivered under their respective licences (full texts in each package; this is a summary, not exhaustive):

| Component | Licence |
|---|---|
| Expo SDK, React Native, React | MIT |
| Hono (Worker framework) | MIT |
| Zod | MIT |
| react-native-svg, react-native-reanimated, react-native-gesture-handler, react-native-screens | MIT |
| @shopify/flash-list | MIT |
| expo-secure-store, expo-image, expo-notifications, expo-camera/vision-camera | MIT |
| lucide icons | ISC |
| TypeScript, Vitest | Apache-2.0 / MIT |

A full machine-generated dependency licence list should be produced at build time (e.g. `license-checker`) and bundled in the in-app licences screen.

---

## 5. In-app "Data sources & licences" screen — minimum contents
MUST include, verbatim where required:
1. CIQUAL Etalab-2.0 attribution + version (mandatory).
2. USDA FoodData Central CC0 credit.
3. AI-illustration disclosure (Art. 50) — cross-reference DISCLAIMERS.
4. Font OFL notices.
5. A link/expandable list of OSS dependency licences.

> [OWNER: add the company/publisher legal name + contact once known, and confirm the final model + data
> versions match what ships. Re-generate this file if the dataset is re-ingested (version/date changes).]
