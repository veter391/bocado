# Ingesting real nutrition data → `FoodRecord[]`

> Goal: replace the ~30-row seed fixture (`src/table/seed.ts`) with the real
> **CIQUAL** + **USDA FoodData Central** datasets, mapped into the **same**
> `FoodRecord` shape so production swaps the *data*, not the engine. Nothing about
> the `NutritionTable` interface (`lookup`, `size`) changes.
>
> **Status:** this is a build-time, offline ETL spec. The skeletons below are
> pseudo-code; no data is downloaded here. Re-verify every URL, version, licence,
> and field name against the primary source before running — composition datasets
> and their column names change between releases.

---

## 0. Why these two sources (and the licences that bind us)

| Source | Role | Licence | Obligation we must honour |
|--------|------|---------|---------------------------|
| **CIQUAL** (ANSES) | **Primary** — generic French/European foods, per-100 g | **Etalab Open Licence 2.0** | Commercial use OK. **MUST** attribute the source **and** display its **last-update date**. |
| **USDA FoodData Central** | **Gap-fill** for foods CIQUAL lacks | **CC0 1.0** (public domain) | No legal obligation; citation *requested*. We still tag provenance. |
| **FatSecret Platform API** | **Long-tail fallback** | Commercial API ToS | Per-request fetch, **cached** in our store; attribution per their ToS. Branded/long-tail only — not a bulk dump. |
| ~~BEDCA~~ | **EXCLUDED** | Terms forbid commercial use w/o AESAN written permission | Do **not** ship BEDCA-derived data. |
| Open Food Facts | Optional, packaged/barcode only | ODbL | Share-alike only triggers if we *publicly redistribute a derived database* — a normal app does not. Out of scope here. |

The resolution order at lookup time is **CIQUAL → USDA → (cached) FatSecret**. Record
`db` on every row so the UI can attribute correctly and the estimate's `sources[]`
stays auditable.

**Verified 2026-06-16 (re-verify before the production run):**
- CIQUAL **2020** — **3,484 foods**, adds individual-sugar profiles (lactose,
  fructose, glucose, sucrose, maltose, galactose). Excel + data.gouv.fr, Etalab 2.0.
- USDA FDC — **Foundation Foods** (Dec 2025 release) + **SR Legacy** (Apr 2018),
  CSV + JSON full downloads, CC0. API needs a free data.gov key.

Sources:
- CIQUAL table + licence: <https://www.anses.fr/en/content/ciqual-nutritional-composition-table>
- CIQUAL 2020 dataset (Etalab): <https://www.data.gouv.fr/datasets/table-de-composition-nutritionnelle-des-aliments-ciqual-2020>
- USDA FDC downloads: <https://fdc.nal.usda.gov/download-datasets>
- USDA FDC API guide: <https://fdc.nal.usda.gov/api-guide>
- BEDCA terms (excluded): <https://www.bedca.net/bdpub/UsoBD.pdf>

---

## 1. Units & conventions — the things that silently corrupt the numbers

The `FoodRecord.per100g` contract (`src/types.ts`): **kcal** for energy, **grams**
for every macro **and for salt**, all **per 100 g of edible portion**. Get these
conversions right or the whole trust core lies.

1. **Per-100 g basis.** Both datasets are already per-100 g edible portion. No
   serving-size math at ingest. (Per-serving rescaling happens later, in
   `estimateNutrition`, by the inferred grams.)
2. **Energy.** Use **kcal**, not kJ. CIQUAL ships both (`Energie, Règlement
   UE N° 1169/2011 (kcal/100 g)` and the kJ column); USDA energy is `1008` kcal
   (`Atwater General`) — prefer the kcal row. If only kJ is present: `kcal = kJ / 4.184`.
3. **Salt vs sodium — the classic trap.** Our field is **salt (NaCl) in grams**.
   - CIQUAL already provides **`Sel chlorure de sodium (g/100 g)`** → use directly.
   - USDA provides **sodium `Na` in milligrams**. Convert:
     **`salt_g = sodium_mg × 2.5 / 1000`** (EU 1169/2011 factor: salt = sodium × 2.5,
     then mg → g). Never store sodium in the `salt` field.
4. **Trace / "<LOD" / "-" values.** CIQUAL encodes "trace" and "< limit of
   detection" and "not measured" as non-numeric tokens (`traces`, `< 0,1`, `-`,
   `NaN`). Decimal separator is a **comma** in the French CSV.
   - `traces`, `< x` → treat as `0` for summing but remember they are *not* true
     zeros (they widen uncertainty; the compute layer accounts for missing data).
   - `-` / empty / "not measured" → leave the optional field **undefined**, do not
     coerce to `0`. A missing `satFat`/`carbs`/`sugar` must stay missing so the
     estimator can widen the range rather than assert a false zero.
5. **Required vs optional.** `kcal`, `protein`, `fat`, `salt` are required by
   `Per100g`. `satFat`, `carbs`, `sugar` are optional — only set them when the
   source actually measured them.
6. **Rounding.** Keep source precision; do **not** pre-round. Rounding/range
   widening is the compute layer's job.

---

## 2. Field mapping

### 2.1 CIQUAL (Excel/XLSX → rows) → `FoodRecord`

CIQUAL column headers (French, 2020 layout — confirm exact strings against the
downloaded workbook; they carry footnote markers):

| `FoodRecord` field | CIQUAL column | Transform |
|--------------------|---------------|-----------|
| `id` | `alim_code` (food code) | `` `ciqual-${alim_code}` `` |
| `db` | — | constant `'CIQUAL'` |
| `name` | `alim_nom_eng` (English name) — fall back to `alim_nom_fr` | trim |
| `aliases` | `alim_nom_fr` + group names (`alim_grp_nom_*`) | dedupe, drop empties |
| `category` | derived from `alim_grp_code` / group name | map to coarse class (see §3) |
| `state` | inferred from name (`cru`/`raw` vs `cuit`/`cooked`) | best-effort; default undefined |
| `per100g.kcal` | `Energie, Règlement UE N° 1169/2011 (kcal/100 g)` | parse FR number |
| `per100g.protein` | `Protéines, N x facteur de Jones (g/100 g)` (or `Protéines, N x 6.25`) | parse FR number |
| `per100g.fat` | `Lipides (g/100 g)` | parse FR number |
| `per100g.satFat` | `AG saturés (g/100 g)` | optional |
| `per100g.carbs` | `Glucides (g/100 g)` | optional |
| `per100g.sugar` | `Sucres (g/100 g)` | optional |
| `per100g.salt` | `Sel chlorure de sodium (g/100 g)` | parse FR number (already salt) |

### 2.2 USDA FoodData Central (CSV bundle) → `FoodRecord`

Use the **Foundation Foods** + **SR Legacy** full CSV downloads (not Branded — too
noisy/long-tail; that's FatSecret's job). Three CSVs join on `fdc_id`:

- `food.csv` → `fdc_id`, `description`, `data_type`, `food_category_id`
- `nutrient.csv` → maps `nutrient nbr`/`id` to `name`, `unit_name`
- `food_nutrient.csv` → `fdc_id`, `nutrient_id`, `amount` (the per-100 g value)

| `FoodRecord` field | USDA nutrient (number `nutrient.number`) | Unit | Transform |
|--------------------|------------------------------------------|------|-----------|
| `id` | `fdc_id` | — | `` `usda-${fdc_id}` `` |
| `db` | — | — | constant `'USDA'` |
| `name` | `food.description` | — | trim |
| `category` | `food_category_id` → category lookup | — | map to coarse class (§3) |
| `per100g.kcal` | `1008` Energy (prefer `Atwater General`, fall back `2047/2048`) | kcal | use kcal row |
| `per100g.protein` | `1003` Protein | g | direct |
| `per100g.fat` | `1004` Total lipid (fat) | g | direct |
| `per100g.satFat` | `1258` Fatty acids, total saturated | g | optional |
| `per100g.carbs` | `1005` Carbohydrate, by difference | g | optional |
| `per100g.sugar` | `2000` Total sugars (fall back `1063`) | g | optional |
| `per100g.salt` | `1093` Sodium, Na | **mg** | **`salt_g = amount * 2.5 / 1000`** |

> USDA `food_nutrient.amount` is already per 100 g for Foundation/SR Legacy. Energy
> can appear as both kJ (`1062`) and kcal (`1008`); always take the kcal row.

---

## 3. Category normalization (drives cooking-yield class)

`FoodRecord.category` is a coarse class the compute layer maps to a default
`CookingYield` via `getCookingYield(category, state)`. Both sources have far finer
taxonomies; collapse them into this stable vocabulary (extend deliberately, keep it
small — it is part of the engine's behaviour):

```
meat · fish · seafood · egg · dairy · fat · oil · grain · vegetable ·
fruit · legume · fried · sugar · sweet · other
```

Maintain two lookup maps (`alim_grp_code → class` for CIQUAL,
`food_category_id → class` for USDA) in the ingest script. Anything unmapped → `'other'`.

---

## 4. Build-time ETL skeleton (pseudo-code, Node, run offline)

This produces a single static `foods.generated.ts` (or a `.json` loaded by the
table) committed/bundled into the package. **No network at runtime** — the engine
runs in a Worker over a baked-in dataset; FatSecret is the only runtime fetch (§6).

```ts
// scripts/ingest.ts — run with: pnpm tsx scripts/ingest.ts
// Inputs (downloaded manually, NOT committed if large — see data/.gitignore):
//   data/raw/ciqual-2020.xlsx
//   data/raw/usda/{food.csv,nutrient.csv,food_nutrient.csv}
// Output: src/table/foods.generated.ts  (FoodRecord[])

import type { FoodRecord, Per100g } from '../src/types';

/** Parse a French-formatted CIQUAL cell: "12,3" -> 12.3 ; "traces"/"< 0,1" -> 0 ; "-"/"" -> undefined. */
function parseCiqualNumber(raw: string): number | undefined {
  const s = raw.trim().toLowerCase();
  if (s === '' || s === '-' || s === 'nd' || s.includes('non')) return undefined; // not measured
  if (s === 'traces' || s.startsWith('<')) return 0; // present but below LOD -> 0 for summing
  const n = Number(s.replace(/\s/g, '').replace(',', '.'));
  return Number.isFinite(n) ? n : undefined;
}

function buildPer100gRequired(
  kcal: number | undefined,
  protein: number | undefined,
  fat: number | undefined,
  salt: number | undefined,
  optional: Pick<Per100g, 'satFat' | 'carbs' | 'sugar'>,
): Per100g | null {
  // Required fields must exist; otherwise drop the row (cannot fabricate).
  if (kcal === undefined || protein === undefined || fat === undefined || salt === undefined) {
    return null;
  }
  const per100g: Per100g = { kcal, protein, fat, salt };
  if (optional.satFat !== undefined) per100g.satFat = optional.satFat;
  if (optional.carbs !== undefined) per100g.carbs = optional.carbs;
  if (optional.sugar !== undefined) per100g.sugar = optional.sugar;
  return per100g;
}

// --- CIQUAL ---
function ingestCiqual(rows: CiqualRow[]): FoodRecord[] {
  const out: FoodRecord[] = [];
  for (const r of rows) {
    const per100g = buildPer100gRequired(
      parseCiqualNumber(r['Energie, Règlement UE N° 1169/2011 (kcal/100 g)']),
      parseCiqualNumber(r['Protéines, N x facteur de Jones (g/100 g)']),
      parseCiqualNumber(r['Lipides (g/100 g)']),
      parseCiqualNumber(r['Sel chlorure de sodium (g/100 g)']), // already salt, not sodium
      {
        satFat: parseCiqualNumber(r['AG saturés (g/100 g)']),
        carbs: parseCiqualNumber(r['Glucides (g/100 g)']),
        sugar: parseCiqualNumber(r['Sucres (g/100 g)']),
      },
    );
    if (!per100g) continue; // honesty: no required field => no fabricated row
    out.push({
      id: `ciqual-${r.alim_code}`,
      db: 'CIQUAL',
      name: (r.alim_nom_eng || r.alim_nom_fr).trim(),
      aliases: dedupe([r.alim_nom_fr, r.alim_grp_nom_fr].filter(Boolean)),
      category: ciqualCategory(r.alim_grp_code), // -> coarse class (§3)
      state: inferState(r.alim_nom_eng || r.alim_nom_fr), // 'raw' | 'cooked' | undefined
      per100g,
    });
  }
  return out;
}

const SODIUM_MG_TO_SALT_G = 2.5 / 1000; // EU 1169/2011: salt = sodium x 2.5

// --- USDA (join three CSVs on fdc_id) ---
function ingestUsda(foods: UsdaFood[], nutrientsByFood: Map<number, Map<number, number>>): FoodRecord[] {
  const out: FoodRecord[] = [];
  for (const f of foods) {
    const n = nutrientsByFood.get(f.fdc_id);
    if (!n) continue;
    const sodiumMg = n.get(1093); // Sodium, Na (mg)
    const per100g = buildPer100gRequired(
      n.get(1008),                         // Energy (kcal)
      n.get(1003),                         // Protein (g)
      n.get(1004),                         // Total lipid/fat (g)
      sodiumMg === undefined ? undefined : sodiumMg * SODIUM_MG_TO_SALT_G, // -> salt (g)
      {
        satFat: n.get(1258),               // saturated fat (g)
        carbs: n.get(1005),                // carbohydrate by difference (g)
        sugar: n.get(2000) ?? n.get(1063), // total sugars (g)
      },
    );
    if (!per100g) continue;
    out.push({
      id: `usda-${f.fdc_id}`,
      db: 'USDA',
      name: f.description.trim(),
      category: usdaCategory(f.food_category_id), // -> coarse class (§3)
      per100g,
    });
  }
  return out;
}

// --- Merge: CIQUAL first, USDA fills gaps (do NOT duplicate a near-identical food) ---
const merged: FoodRecord[] = dedupeByNormalizedName([...ciqual, ...usda]); // CIQUAL wins ties
writeGeneratedModule('src/table/foods.generated.ts', merged);
```

### Validation gate before committing the generated module
- Every row passes `Per100g` (required fields present, all numbers finite, `>= 0`).
- Sanity bounds: `kcal ≤ 900` (pure fat is ~884), `fat/protein/carbs ≤ 100`,
  `salt ≤ ~100`. Flag/inspect outliers; never silently clamp.
- No duplicate `id`. Report row counts per `db` and per category.
- Snapshot the counts so a future dataset bump shows an intentional diff.

---

## 5. Swapping the seed for production data (same interface)

`createMemoryTable(records?)` already accepts arbitrary `FoodRecord[]`. The only
change is which array it is built from — the `NutritionTable` contract is untouched.

```ts
// src/table/memoryTable.ts already exports createMemoryTable(records = SEED_FOODS).
// Production table:
import { createMemoryTable } from './memoryTable';
import { PRODUCTION_FOODS } from './foods.generated'; // emitted by scripts/ingest.ts

export const productionTable = createMemoryTable(PRODUCTION_FOODS);
```

Then pass `productionTable` into `enrichDish(perceived, { context, profile, table })`.
The seed stays in the repo as a test fixture; production code never imports it.

> At ~3.5k CIQUAL + thousands of USDA rows, the current `O(n)` scan in
> `createMemoryTable.lookup` becomes the hot path. Before shipping the real dataset,
> revisit the index (e.g. a normalized-key `Map` for exact/alias hits, with the
> fuzzy scan only as fallback). That is a `memoryTable.ts` change — out of scope for
> this doc — but note it here so the dataset swap doesn't silently regress latency.

---

## 6. USDA FoodData Central long-tail fallback (cached) — runtime, key-gated

> **SUPERSEDES the earlier FatSecret plan.** The chosen RUNTIME fallback is **USDA
> FoodData Central (FDC) v1** — Foundation Foods + SR Legacy + Survey/FNDDS, **EXCLUDE
> Branded**. Rationale: **CC0 1.0 public domain** (no share-alike, no attribution
> obligation, EU-safe), generic-food coverage that maps cleanly onto `FoodRecord`, and
> a free key at **1000 req/hr/IP** (DEMO_KEY 30/hr). Endpoint
> `https://api.nal.usda.gov/fdc/v1/` (api-guide: `fdc.nal.usda.gov/api-guide`). Open
> Food Facts is rejected as primary (barcode/branded + ODbL share-alike). CIQUAL stays
> baked-in (no API). FAO/INFOODS = manual gap-curation only.

CIQUAL + USDA (baked-in) cover generic foods well but miss the long tail (specific
regional / world dishes). The FDC fallback fills that gap **at runtime**, behind a
cache so it stays cheap and EU-friendly. Implemented in
`apps/api/src/nutrition/usdaFallback.ts` (`resolveViaUsdaFdc`), wired into the `/scan`
Worker in `apps/api/src/routes/scan.ts` (`buildScanTable`).

- **Feature flag:** runs ONLY when `env.FDC_API_KEY` is present. Absent (CI, local
  `wrangler dev`, tests) -> the fallback is skipped and the unknown ingredient stays
  honestly **UNMATCHED** (wider range, lower confidence). The system degrades safely
  and never depends on the network. `BOCADO_LIVE` is never set; the seam is unit-tested
  with an **injected fake fetch** returning canned FDC JSON (like `client.ts` FetchImpl).
- **When:** only when the baked-in table (`seedTable` over curated + generated) returns
  `null` for an ingredient's `canonicalName`, after the matcher upgrades have run.
- **Where:** in the Worker orchestrator, **not** inside the pure engine — the engine
  stays deterministic + I/O-free. The Worker resolves missing names, maps each FDC food
  to a `FoodRecord` (`db:'API'`, `id = `usda-fdc-${fdcId}``, `salt = sodium_mg * 2.5 /
  1000` per EU 1169/2011, energy from the kcal row 1008, coarse `category` via the
  SHARED `coarseCategoryFromUsdaGroup` mapper in `table/vocab.ts` — the SAME map the
  build-time ingest uses, so they cannot drift), then injects them into a **per-request
  overlay** table `createMemoryTable([...DEFAULT_FOODS, ...fetched])` passed to
  `estimateNutrition`. The pure engine still just sums real records.
- **Cache:** **EU D1** table `usda_food_cache` (migration `0002_usda_food_cache.sql`),
  keyed by `normalizeName(canonicalName)`, mirroring the perception cache. A long-tail
  food is fetched once globally then reused. **Negative** results are cached too (short
  TTL) so repeated unknowns do not hammer the API. A cache-write failure must NEVER fail
  the scan (best-effort, like `putCachedPerception`).
- **Honesty:** `db:'API'` rows are lower-trust — `compute/estimate.ts` treats an
  API-sourced match as wider-uncertainty and caps confidence at `medium`, and
  `sources[]` carries `db:'API'` so the UI attributes correctly. An unresolved name
  stays UNMATCHED — never fabricated.
- **Compliance / anonymity:** the lookup query is a **generic food name only** — never
  user identity / allergy / location (two-planes rule, ARCHITECTURE.md §0 / SECURITY.md).
  The call originates in the Worker, not the device; `FDC_API_KEY` lives in Worker env.

```ts
// Worker-side (real): runtime gap-fill, cached, key-gated. NOT part of the pure engine.
const record = await resolveViaUsdaFdc(canonicalName, env); // null when no key / unresolved
// ...collect fetched rows for the menu, then:
const table = createMemoryTable([...DEFAULT_FOODS, ...fetched]); // per-request overlay
const nutrition = estimateNutrition(dish.ingredients, table, { cookingMethod: dish.cookingMethod });
```

---

## 7. Attribution checklist (must ship in the app UI)

- **CIQUAL:** visible credit to **ANSES / CIQUAL** **and** the table's
  **last-update / version date** (Etalab 2.0 obligation). e.g. *"Nutrition data:
  CIQUAL 2020, ANSES — Etalab Open Licence 2.0."*
- **USDA:** credit **USDA FoodData Central** (CC0 — requested, not required). This
  covers both the baked-in USDA rows AND the runtime FDC fallback rows (`db:'API'`).
- Pair every nutrition surface with the `NUTRITION_DISCLAIMER` ("Estimate only, not
  exact.") and never use health-claim language (Reg 1924/2006 — SECURITY.md §2D).
- **Known accuracy gap (made visible):** with no `FDC_API_KEY`, non-Western / long-tail
  dishes the baked tables miss stay UNMATCHED -> low confidence + a wide band. The UI
  must surface this as a "rough estimate", never a confident wrong number.
```
