#!/usr/bin/env node
/**
 * ingest.mjs — offline ETL: CIQUAL 2020 (ANSES, Etalab 2.0) + USDA FoodData Central
 * Foundation Foods (CC0) -> a single static `src/table/foods.generated.ts` of
 * `FoodRecord[]`, in the EXACT shape the deterministic engine sums over.
 *
 * The engine never changes — only the data it reads. See scripts/INGEST.md for the
 * full field-mapping spec this script implements (units, salt-from-sodium, trace/LOD
 * handling, category normalization, attribution).
 *
 * Zero npm dependencies: uses Node's built-in fetch + a tolerant hand-rolled
 * CSV/XML reader so it runs anywhere `node >= 20` does.
 *
 * Usage:
 *   node scripts/ingest.mjs            # download sources, parse, write generated module
 *   node scripts/ingest.mjs --offline # parse from ./data/raw if already downloaded
 *   NUTRITION_DATA_DIR=/tmp/x node scripts/ingest.mjs   # override cache dir
 *
 * Honesty invariants enforced here (mirrors INGEST.md §1):
 *   - per-100 g edible portion basis, kcal for energy, grams for macros AND salt.
 *   - salt(g) = sodium(mg) * 2.5 / 1000 for USDA; CIQUAL ships salt directly.
 *   - "traces" / "< LOD" -> 0 (present but below detection); "-"/not-measured ->
 *     undefined (optional field stays missing, never fabricated as 0).
 *   - required fields (kcal/protein/fat/salt) missing => row is DROPPED, not faked.
 *   - every row tagged with its source db + recordId for `sources[]` provenance.
 */

import { mkdir, readFile, writeFile, access } from 'node:fs/promises';
import { createWriteStream } from 'node:fs';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PKG_ROOT = path.resolve(HERE, '..');
const DATA_DIR = process.env.NUTRITION_DATA_DIR
  ? path.resolve(process.env.NUTRITION_DATA_DIR)
  : path.join(PKG_ROOT, 'data', 'raw');
const OUT_FILE = path.join(PKG_ROOT, 'src', 'table', 'foods.generated.ts');

const OFFLINE = process.argv.includes('--offline');

// --- Source descriptors (re-verify before a production run; see INGEST.md §0) ---
const CIQUAL = {
  name: 'CIQUAL 2020 (ANSES) — Etalab Open Licence 2.0',
  version: '2020-07-07',
  zipUrl: 'https://ciqual.anses.fr/cms/sites/default/files/inline-files/XML_2020_07_07.zip',
  zip: 'ciqual_xml.zip',
  files: {
    alim: 'alim_2020_07_07.xml',
    grp: 'alim_grp_2020_07_07.xml',
    compo: 'compo_2020_07_07.xml',
  },
  // CIQUAL const_code -> our Per100g field. salt(10004) ships as NaCl grams already.
  const: { kcal: '328', protein: '25000', fat: '40000', satFat: '40302', carbs: '31000', sugar: '32000', salt: '10004' },
};

const USDA = {
  name: 'USDA FoodData Central — Foundation Foods (CC0 1.0)',
  version: '2025-04-24',
  zipUrl: 'https://fdc.nal.usda.gov/fdc-datasets/FoodData_Central_foundation_food_csv_2025-04-24.zip',
  zip: 'usda_foundation.zip',
  dir: 'FoodData_Central_foundation_food_csv_2025-04-24',
  // USDA nutrient_id -> our Per100g field. salt derived from sodium (1093).
  nutrient: { kcalGeneral: 1008, kcalAtwater: 2047, protein: 1003, fat: 1004, satFat: 1258, carbs: 1005, sugarTotal: 2000, sugarAlt: 1063, sodium: 1093 },
};

const SODIUM_MG_TO_SALT_G = 2.5 / 1000; // EU 1169/2011: salt = sodium * 2.5

// =============================================================================
// Generic helpers
// =============================================================================

async function exists(p) {
  try {
    await access(p);
    return true;
  } catch {
    return false;
  }
}

async function download(url, dest) {
  if (await exists(dest)) {
    console.log(`  cached: ${path.basename(dest)}`);
    return;
  }
  console.log(`  fetching: ${url}`);
  const res = await fetch(url, { redirect: 'follow' });
  if (!res.ok || !res.body) throw new Error(`download failed ${res.status} for ${url}`);
  await pipeline(Readable.fromWeb(res.body), createWriteStream(dest));
}

/** Unzip selected members into DATA_DIR using the system `unzip` (portable, no deps). */
function unzip(zipPath, members) {
  const r = spawnSync('unzip', ['-o', '-q', zipPath, ...members, '-d', DATA_DIR], {
    encoding: 'utf8',
  });
  if (r.status !== 0) {
    throw new Error(`unzip failed for ${zipPath}: ${r.stderr || r.stdout || r.status}`);
  }
}

/** Minimal RFC-4180-ish CSV parser (quotes + embedded commas/newlines). Returns rows of strings. */
function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ',') {
      row.push(field);
      field = '';
    } else if (c === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else if (c === '\r') {
      // ignore; handled by \n
    } else {
      field += c;
    }
  }
  if (field !== '' || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

/** Parse a CSV file into objects keyed by header. */
async function readCsvObjects(file) {
  const text = await readFile(file, 'utf8');
  const rows = parseCsv(text);
  if (rows.length === 0) return [];
  const header = rows[0];
  const out = [];
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    if (r.length === 1 && r[0] === '') continue;
    const obj = {};
    for (let j = 0; j < header.length; j++) obj[header[j]] = r[j] ?? '';
    out.push(obj);
  }
  return out;
}

/**
 * Parse a CIQUAL French-formatted numeric cell.
 *   "12,3" -> 12.3 ; "traces" / "< 0,1" -> 0 (present but below LOD) ;
 *   "-" / "" / not-measured -> undefined (leave optional field missing).
 */
function parseCiqualNumber(raw) {
  if (raw === undefined || raw === null) return undefined;
  const s = String(raw).trim().toLowerCase();
  if (s === '' || s === '-' || s === 'nd' || s.includes('non')) return undefined;
  if (s === 'traces' || s.startsWith('<')) return 0;
  const n = Number(s.replace(/\s/g, '').replace(',', '.'));
  return Number.isFinite(n) ? n : undefined;
}

/** Build a Per100g, dropping the row (null) if any required field is missing. */
function buildPer100g(kcal, protein, fat, salt, optional) {
  if (kcal === undefined || protein === undefined || fat === undefined || salt === undefined) {
    return null;
  }
  if (![kcal, protein, fat, salt].every((v) => Number.isFinite(v) && v >= 0)) return null;
  const per = { kcal, protein, fat, salt };
  if (optional.satFat !== undefined && optional.satFat >= 0) per.satFat = optional.satFat;
  if (optional.carbs !== undefined && optional.carbs >= 0) per.carbs = optional.carbs;
  if (optional.sugar !== undefined && optional.sugar >= 0) per.sugar = optional.sugar;
  return per;
}

/**
 * Infer raw/cooked from a name; default undefined (the engine treats undefined safely
 * via IDENTITY yield). The x2.4/x2.3 grain/legume absorption only fires for a row
 * POSITIVELY known raw/dry — so dried/sec/seche/flour/flake also map to 'raw' here
 * (directive: cooked composition rows MUST be tagged 'cooked', never undefined; a
 * leftover-undefined grain/legume row therefore never gets the absorption blow-up).
 */
function inferState(name) {
  const s = name.toLowerCase();
  if (/\b(raw|cru|crue|fresh|uncooked|dried|dry|sec|seche|flour|farine|flake|flakes)\b/.test(s)) {
    return 'raw';
  }
  if (/\b(cooked|cuit|cuite|boiled|grilled|roasted|baked|fried|braised|steamed|poached|sauteed)\b/.test(s)) {
    return 'cooked';
  }
  return undefined;
}

function dedupeStrings(arr) {
  const seen = new Set();
  const out = [];
  for (const a of arr) {
    const t = (a ?? '').trim();
    if (t && !seen.has(t.toLowerCase())) {
      seen.add(t.toLowerCase());
      out.push(t);
    }
  }
  return out;
}

// =============================================================================
// CIQUAL ingest (XML)
// =============================================================================

/** Extract simple <TAG>value</TAG> blocks from a CIQUAL XML record body. */
function tagValue(block, tag) {
  const m = block.match(new RegExp(`<${tag}>\\s*([^<]*?)\\s*<\\/${tag}>`));
  return m ? m[1].trim() : undefined;
}

/** Map a CIQUAL group code (alim_grp_code, 2-digit) to our coarse cooking-yield class. */
function ciqualCategory(grpCode) {
  switch (grpCode) {
    case '02': return 'fruit';        // also veg/legumes; refined below if needed
    case '03': return 'meat';         // meat, eggs, fish (split heuristically by name elsewhere)
    case '04': return 'fat';          // fats, oils
    case '05': return 'grain';        // cereals & cereal products
    case '07': return 'sweet';        // sugary products
    case '09': return 'vegetable';    // fruits, vegetables, legumes
    case '11': return 'dairy';        // milk & dairy
    case '13': return 'fried';        // ready-to-eat / fried
    default: return 'other';
  }
}

/**
 * Refine category + state from the English name, since CIQUAL groups are coarse.
 *
 * ORDER MATTERS: run the GRAIN and LEGUME head-noun checks BEFORE the broad meat check.
 * A name like "wheat meat (seitan)" or "bean burger" has a grain/legume head noun and
 * must NOT be tagged 'meat' (which would apply the 0.75 meat-shrink yield to a grain).
 * The grain/legume regexes are broadened (quinoa|spelt|buckwheat|bulgur|millet|semolina|
 * oat|polenta; garbanzo|fava|soja|edamame) so the long tail lands in the right class.
 */
function refineCiqual(name, baseCategory) {
  const s = name.toLowerCase();
  // Grain / legume head nouns FIRST (before the broad meat check) — directive.
  if (/\b(rice|pasta|bread|flour|wheat|noodle|couscous|oat|oatmeal|avoine|barley|cereal|quinoa|spelt|buckwheat|sarrasin|bulgur|boulgour|millet|semolina|semoule|polenta)\b/.test(s)) return 'grain';
  if (/\b(lentil|chickpea|garbanzo|bean|fava|feve|pea|legume|soja|edamame)\b/.test(s)) return 'legume';
  if (/\b(beef|pork|lamb|veal|chicken|turkey|duck|ham|bacon|sausage|steak|mutton|game|meat)\b/.test(s)) return 'meat';
  if (/\b(salmon|cod|tuna|trout|hake|sardine|anchovy|mackerel|herring|fish)\b/.test(s)) return 'fish';
  if (/\b(prawn|shrimp|crab|lobster|mussel|clam|oyster|squid|octopus|scallop|seafood|shellfish)\b/.test(s)) return 'seafood';
  if (/\b(egg|eggs)\b/.test(s)) return 'egg';
  if (/\b(oil|olive oil)\b/.test(s)) return 'oil';
  if (/\b(butter|cream|cheese|milk|yogurt|yoghurt)\b/.test(s)) return 'dairy';
  if (/\b(potato|carrot|onion|tomato|lettuce|pepper|courgette|spinach|broccoli|mushroom|vegetable)\b/.test(s)) return 'vegetable';
  return baseCategory;
}

async function ingestCiqual() {
  const alimPath = path.join(DATA_DIR, CIQUAL.files.alim);
  const compoPath = path.join(DATA_DIR, CIQUAL.files.compo);
  if (!(await exists(alimPath)) || !(await exists(compoPath))) {
    console.log('  CIQUAL files missing — skipping CIQUAL.');
    return [];
  }

  // alim: code -> { nameEn, nameFr, grpCode }
  const alimXml = await readFile(alimPath, 'latin1');
  const foods = new Map();
  for (const m of alimXml.matchAll(/<ALIM>([\s\S]*?)<\/ALIM>/g)) {
    const b = m[1];
    const code = tagValue(b, 'alim_code');
    if (!code) continue;
    foods.set(code, {
      nameEn: tagValue(b, 'alim_nom_eng') || '',
      nameFr: tagValue(b, 'alim_nom_fr') || '',
      grpCode: tagValue(b, 'alim_grp_code') || '',
    });
  }

  // compo: (alim_code, const_code) -> teneur
  const wanted = new Set(Object.values(CIQUAL.const));
  const compoXml = await readFile(compoPath, 'latin1');
  const byFood = new Map();
  for (const m of compoXml.matchAll(/<COMPO>([\s\S]*?)<\/COMPO>/g)) {
    const b = m[1];
    const constCode = tagValue(b, 'const_code');
    if (!constCode || !wanted.has(constCode)) continue;
    const alimCode = tagValue(b, 'alim_code');
    if (!alimCode) continue;
    if (!byFood.has(alimCode)) byFood.set(alimCode, {});
    byFood.get(alimCode)[constCode] = tagValue(b, 'teneur');
  }

  const out = [];
  for (const [code, food] of foods) {
    const c = byFood.get(code);
    if (!c) continue;
    const get = (field) => parseCiqualNumber(c[CIQUAL.const[field]]);
    const per100g = buildPer100g(get('kcal'), get('protein'), get('fat'), get('salt'), {
      satFat: get('satFat'),
      carbs: get('carbs'),
      sugar: get('sugar'),
    });
    if (!per100g) continue;
    const name = (food.nameEn || food.nameFr).trim();
    if (!name || name === '-') continue;
    const baseCat = ciqualCategory(food.grpCode);
    out.push({
      id: `ciqual-${code}`,
      db: 'CIQUAL',
      name,
      aliases: dedupeStrings([food.nameFr]).filter((a) => a.toLowerCase() !== name.toLowerCase()),
      category: refineCiqual(name, baseCat),
      state: inferState(name),
      per100g,
    });
  }
  console.log(`  CIQUAL rows: ${out.length}`);
  return out;
}

// =============================================================================
// USDA ingest (CSV)
// =============================================================================

function usdaCategory(catId) {
  switch (catId) {
    case '1': return 'dairy';       // Dairy and Egg Products (egg refined by name)
    case '4': return 'fat';         // Fats and Oils
    case '5': return 'meat';        // Poultry
    case '7': return 'meat';        // Sausages and Luncheon Meats
    case '9': return 'fruit';       // Fruits
    case '10': return 'meat';       // Pork
    case '11': return 'vegetable';  // Vegetables
    case '12': return 'other';      // Nut and Seed
    case '13': return 'meat';       // Beef
    case '15': return 'fish';       // Finfish and Shellfish (seafood refined by name)
    case '16': return 'legume';     // Legumes
    case '17': return 'meat';       // Lamb, Veal, Game
    case '18': return 'grain';      // Baked Products
    case '19': return 'sweet';      // Sweets
    case '20': return 'grain';      // Cereal Grains and Pasta
    default: return 'other';
  }
}

async function ingestUsda() {
  const dir = path.join(DATA_DIR, USDA.dir);
  const foodCsv = path.join(dir, 'food.csv');
  const fnCsv = path.join(dir, 'food_nutrient.csv');
  if (!(await exists(foodCsv)) || !(await exists(fnCsv))) {
    console.log('  USDA files missing — skipping USDA.');
    return [];
  }

  const foods = await readCsvObjects(foodCsv);
  // foundation_food + sr_legacy_food are the curated generic rows; ignore sample/sub-sample noise.
  const keepTypes = new Set(['foundation_food', 'sr_legacy_food']);
  const keptFoods = foods.filter((f) => keepTypes.has(f.data_type));
  const keptIds = new Set(keptFoods.map((f) => f.fdc_id));

  // food_nutrient: fdc_id -> Map(nutrient_id -> amount)
  const fnObjs = await readCsvObjects(fnCsv);
  const byFood = new Map();
  for (const fn of fnObjs) {
    if (!keptIds.has(fn.fdc_id)) continue;
    const amt = Number(fn.amount);
    if (!Number.isFinite(amt)) continue;
    if (!byFood.has(fn.fdc_id)) byFood.set(fn.fdc_id, new Map());
    byFood.get(fn.fdc_id).set(Number(fn.nutrient_id), amt);
  }

  const N = USDA.nutrient;
  const out = [];
  for (const f of keptFoods) {
    const n = byFood.get(f.fdc_id);
    if (!n) continue;
    const kcal = n.get(N.kcalGeneral) ?? n.get(N.kcalAtwater);
    const sodiumMg = n.get(N.sodium);
    const per100g = buildPer100g(
      kcal,
      n.get(N.protein),
      n.get(N.fat),
      sodiumMg === undefined ? undefined : sodiumMg * SODIUM_MG_TO_SALT_G,
      {
        satFat: n.get(N.satFat),
        carbs: n.get(N.carbs),
        sugar: n.get(N.sugarTotal) ?? n.get(N.sugarAlt),
      },
    );
    if (!per100g) continue;
    const name = (f.description || '').trim();
    if (!name) continue;
    out.push({
      id: `usda-${f.fdc_id}`,
      db: 'USDA',
      name,
      category: usdaCategory(f.food_category_id),
      state: inferState(name),
      per100g,
    });
  }
  console.log(`  USDA rows: ${out.length}`);
  return out;
}

// =============================================================================
// Merge + validate + emit
// =============================================================================

function normalizeName(s) {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** CIQUAL wins ties; USDA fills gaps. Dedup on normalized name. */
function merge(ciqual, usda) {
  const out = [];
  const seen = new Set();
  for (const r of [...ciqual, ...usda]) {
    const key = normalizeName(r.name);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(r);
  }
  return out;
}

/** Validation gate (INGEST.md §4): finite, non-negative, sane bounds, unique id. */
function validate(records) {
  const ids = new Set();
  const issues = [];
  for (const r of records) {
    if (ids.has(r.id)) issues.push(`duplicate id ${r.id}`);
    ids.add(r.id);
    const p = r.per100g;
    for (const k of ['kcal', 'protein', 'fat', 'salt']) {
      if (typeof p[k] !== 'number' || !Number.isFinite(p[k]) || p[k] < 0) {
        issues.push(`${r.id} bad required ${k}`);
      }
    }
    if (p.kcal > 950) issues.push(`${r.id} kcal>950 (${p.kcal})`);
    for (const k of ['fat', 'protein', 'carbs', 'sugar', 'satFat']) {
      if (p[k] !== undefined && p[k] > 100) issues.push(`${r.id} ${k}>100 (${p[k]})`);
    }
    if (p.salt > 100) issues.push(`${r.id} salt>100 (${p.salt})`);

    // CATEGORY SANITY: a row whose NAME has a grain/legume head noun must NOT be tagged
    // meat/fish — that would wrongly apply the 0.75 meat-shrink yield to a grain/legume.
    // (Historically 27 grain + 13 legume rows were mis-tagged 'meat'.)
    const nm = (r.name || '').toLowerCase();
    const isGrainName = /\b(rice|pasta|bread|flour|wheat|noodle|couscous|oat|barley|quinoa|spelt|buckwheat|bulgur|millet|semolina|polenta)\b/.test(nm);
    const isLegumeName = /\b(lentil|chickpea|garbanzo|bean|fava|pea|legume|soja|edamame)\b/.test(nm);
    if ((isGrainName || isLegumeName) && (r.category === 'meat' || r.category === 'fish')) {
      issues.push(`${r.id} grain/legume head noun mis-tagged ${r.category} ("${r.name}")`);
    }
  }
  return issues;
}

/**
 * Non-fatal QA: warn when a row whose NAME implies a cooked composition is left with an
 * UNDEFINED state. Such a row falls back to IDENTITY yield (safe), but the convention
 * (INGEST.md) is to tag cooked rows 'cooked' explicitly so the absorption factor can
 * never fire on them. Printed, not fatal — does not block the emit.
 */
function warnUntaggedCookedComposites(records) {
  const warnings = [];
  for (const r of records) {
    const nm = (r.name || '').toLowerCase();
    const looksCooked = /\b(risotto|paella|stew|soup|curry|gratin|casserole|bake|pie|lasagne|lasagna|ramen|pad thai)\b/.test(nm);
    if (looksCooked && r.state === undefined) {
      warnings.push(`${r.id} looks cooked but state is undefined ("${r.name}")`);
    }
  }
  return warnings;
}

function emit(records) {
  const countsByDb = {};
  const countsByCat = {};
  for (const r of records) {
    countsByDb[r.db] = (countsByDb[r.db] || 0) + 1;
    countsByCat[r.category || 'other'] = (countsByCat[r.category || 'other'] || 0) + 1;
  }
  const header = `/**
 * AUTOGENERATED by scripts/ingest.mjs — DO NOT EDIT BY HAND.
 *
 * Source datasets (re-run ingest to refresh):
 *  - ${CIQUAL.name} [version ${CIQUAL.version}]
 *  - ${USDA.name} [version ${USDA.version}]
 *
 * Salt is NaCl in grams (USDA sodium converted: salt = sodium_mg * 2.5 / 1000).
 * Trace / "< LOD" values are summed as 0; not-measured optional fields are omitted.
 *
 * Attribution (must remain visible in the app UI, per INGEST.md §7):
 *  "Nutrition data: CIQUAL 2020, ANSES — Etalab Open Licence 2.0; USDA FoodData Central (CC0)."
 *
 * Row counts — total ${records.length}; by db ${JSON.stringify(countsByDb)};
 * by category ${JSON.stringify(countsByCat)}.
 */
import type { FoodRecord } from '../types';

/** Provenance + version for the UI attribution surface. */
export const GENERATED_DATA_ATTRIBUTION = {
  ciqual: { name: ${JSON.stringify(CIQUAL.name)}, version: ${JSON.stringify(CIQUAL.version)} },
  usda: { name: ${JSON.stringify(USDA.name)}, version: ${JSON.stringify(USDA.version)} },
} as const;

// Emitted as a JSON STRING parsed at module load, NOT as an inline TS array
// literal. A literal of thousands of object literals makes the compiler infer an
// enormous union and blow up with TS2590 ("union type too complex"); a single
// string + one cast keeps typechecking O(1) while runtime data is identical.
//
// The string is assembled from an ARRAY of per-record chunks joined at runtime —
// NOT a chain of `"a" + "b" + …`. A long `+` chain compiles to a left-nested
// BinaryExpression thousands of levels deep, which overflows Babel's recursive
// AST traversal in the Metro/web bundler ("Maximum call stack size exceeded").
// An array literal is WIDE, not deep, so the bundler walks it iteratively.
export const GENERATED_FOODS: FoodRecord[] = JSON.parse(
[
`;

  // Inner: the data pretty-printed (one record per chunk) for readable diffs.
  // Outer: each chunk a safely-escaped TS string literal, one per line, so the
  // file stays git-reviewable; `.join('')` reassembles the JSON document.
  const dataJson = JSON.stringify(records, null, 0);
  const lines = dataJson.replace(/},{/g, '},\n{').split('\n');
  const body = lines.map((l) => JSON.stringify(l)).join(',\n');
  const footer = `,
].join(''),
) as FoodRecord[];
`;
  return `${header}${body}${footer}`;
}

async function main() {
  console.log(`nutrition ingest — data dir: ${DATA_DIR}`);
  await mkdir(DATA_DIR, { recursive: true });

  if (!OFFLINE) {
    console.log('downloading sources...');
    try {
      const ciqualZip = path.join(DATA_DIR, CIQUAL.zip);
      await download(CIQUAL.zipUrl, ciqualZip);
      unzip(ciqualZip, Object.values(CIQUAL.files));
    } catch (e) {
      console.warn(`  CIQUAL download/unzip failed: ${e.message}`);
    }
    try {
      const usdaZip = path.join(DATA_DIR, USDA.zip);
      await download(USDA.zipUrl, usdaZip);
      unzip(usdaZip, [`${USDA.dir}/food.csv`, `${USDA.dir}/food_nutrient.csv`]);
    } catch (e) {
      console.warn(`  USDA download/unzip failed: ${e.message}`);
    }
  } else {
    console.log('offline mode — parsing from cached files only.');
  }

  console.log('parsing CIQUAL...');
  const ciqual = await ingestCiqual();
  console.log('parsing USDA...');
  const usda = await ingestUsda();

  const merged = merge(ciqual, usda);
  console.log(`merged unique rows: ${merged.length}`);

  if (merged.length === 0) {
    console.error('No rows produced — refusing to overwrite generated module. Check network/inputs.');
    process.exit(1);
  }

  const issues = validate(merged);
  if (issues.length > 0) {
    console.error(`validation failed (${issues.length} issues):`);
    for (const i of issues.slice(0, 30)) console.error(`  - ${i}`);
    process.exit(1);
  }

  const warnings = warnUntaggedCookedComposites(merged);
  if (warnings.length > 0) {
    console.warn(`cooked-composite state warnings (${warnings.length}, non-fatal):`);
    for (const w of warnings.slice(0, 20)) console.warn(`  - ${w}`);
  }

  await writeFile(OUT_FILE, emit(merged), 'utf8');
  console.log(`wrote ${OUT_FILE} (${merged.length} records)`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
