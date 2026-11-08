/* ===================================================================
   food.js — food lookup and per-100 g nutrient maths for the diet tracker.

   Sources (both free, no account):
     - USDA FoodData Central: name search.
     - Open Food Facts (ODbL, credit required): name search and barcode.

   Parsers and maths are pure, so they can be tested without a network.

   Units are the same everywhere in this module, per 100 g of food:
     na, k, p   mg
     protein    g
     water      g
   A null means the source did not state the value. It is never read as
   zero.
   =================================================================== */

const FDC_URL = 'https://api.nal.usda.gov/fdc/v1/foods/search';
/* Sent in a POST JSON body: the api.data.gov gateway answers HTTP 400 (nginx)
   to some percent-encoded forms of 'Survey (FNDDS)' in the query string. */
export const FDC_DATA_TYPES = ['Foundation', 'SR Legacy', 'Survey (FNDDS)'];
const OFF_ORIGIN = 'https://world.openfoodfacts.org';

const NUTRIENT_KEYS = ['na', 'k', 'p', 'protein', 'water'];
const MINERAL_KEYS = ['na', 'k', 'p'];

/* FDC nutrient number is the primary match. The name is a fallback for
   records that arrive without a number. */
const FDC_NUTRIENTS = {
  na:      { number: '307', name: 'sodium' },
  k:       { number: '306', name: 'potassium' },
  p:       { number: '305', name: 'phosphorus' },
  protein: { number: '203', name: 'protein' },
  water:   { number: '255', name: 'water' },
};

/* OFF nutriments are always grams per 100 g. Water is rarely present. */
const OFF_NUTRIENTS = {
  na: 'sodium_100g',
  k: 'potassium_100g',
  p: 'phosphorus_100g',
  protein: 'proteins_100g',
  water: 'water_100g',
};

/* ---------- small helpers ---------- */

function toNum(v) {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (typeof v === 'string' && v.trim() !== '') {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

/* Unit conversion to the module's units. An unknown unit returns null
   rather than a guess. */
function toMg(value, unit) {
  if (unit === 'MG') return value;
  if (unit === 'G') return value * 1000;
  if (unit === 'UG') return value / 1000;
  return null;
}

function toGrams(value, unit) {
  if (unit === 'G') return value;
  if (unit === 'MG') return value / 1000;
  if (unit === 'UG') return value / 1000000;
  return null;
}

function fail(code, message, status) {
  const err = new Error(message);
  err.code = code;
  if (status !== undefined) err.status = status;
  return err;
}

/* fetch wrapper. Aborts are rethrown untouched so callers can ignore
   them. Network failure becomes OFFLINE. */
async function getJson(url, signal, { allow404 = false, body } = {}) {
  let res;
  try {
    res = await fetch(url, body === undefined
      ? { signal, headers: { Accept: 'application/json' } }
      : { signal, method: 'POST', headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
          body: JSON.stringify(body) });
  } catch (e) {
    if (e && e.name === 'AbortError') throw e;
    throw fail('OFFLINE', 'Network request failed');
  }
  if (res.status === 429) throw fail('RATE_LIMITED', 'Too many lookups, try again shortly', 429);
  if (res.status === 404 && allow404) return null;
  if (!res.ok) throw fail('HTTP', `Lookup failed (HTTP ${res.status})`, res.status);
  try {
    return await res.json();
  } catch {
    throw fail('HTTP', 'Lookup returned unreadable data', res.status);
  }
}

/* ---------- FDC parsing ---------- */

/* Search results use nutrientNumber / nutrientName / unitName / value.
   The detail endpoint nests the same data under `nutrient` and uses
   `amount`. Both shapes are read. */
function fdcNumber(n) {
  const v = n.nutrientNumber ?? (n.nutrient && n.nutrient.number);
  return v == null ? null : String(v);
}
function fdcName(n) {
  return String(n.nutrientName ?? (n.nutrient && n.nutrient.name) ?? '');
}
function fdcUnit(n) {
  return String(n.unitName ?? (n.nutrient && n.nutrient.unitName) ?? '').toUpperCase();
}
function fdcValue(n) {
  return toNum(n.value ?? n.amount);
}

function findFdc(list, key) {
  const want = FDC_NUTRIENTS[key];
  let hit = list.find(n => fdcNumber(n) === want.number);
  if (!hit) {
    hit = list.find(n => fdcName(n).split(',')[0].trim().toLowerCase() === want.name);
  }
  if (!hit) return null;
  const value = fdcValue(hit);
  if (value === null) return null;
  const unit = fdcUnit(hit);
  return MINERAL_KEYS.includes(key) ? toMg(value, unit) : toGrams(value, unit);
}

/** One FDC food record → {name, source:'fdc', ref, per100}, or null if unnamed. */
export function parseFdcFood(food) {
  if (!food || typeof food !== 'object') return null;
  const name = String(food.description ?? '').trim();
  if (!name) return null;
  const list = Array.isArray(food.foodNutrients) ? food.foodNutrients : [];
  const per100 = {};
  for (const key of NUTRIENT_KEYS) per100[key] = findFdc(list, key);
  return {
    name,
    source: 'fdc',
    ref: food.fdcId == null ? null : String(food.fdcId),
    per100,
  };
}

/* ---------- OFF parsing ---------- */

/** One Open Food Facts product → {name, source:'off', ref, per100}, or null if unnamed. */
export function parseOffProduct(p) {
  if (!p || typeof p !== 'object') return null;
  const name = String(p.product_name ?? '').trim();
  if (!name) return null;
  const n = p.nutriments && typeof p.nutriments === 'object' ? p.nutriments : {};
  const grams = key => toNum(n[OFF_NUTRIENTS[key]]);
  const gToMg = key => {
    const g = grams(key);
    return g === null ? null : g * 1000;
  };
  return {
    name,
    source: 'off',
    ref: p.code == null ? null : String(p.code),
    per100: {
      na: gToMg('na'),
      k: gToMg('k'),
      p: gToMg('p'),
      protein: grams('protein'),
      water: grams('water'),
    },
  };
}

/* ---------- network ---------- */

/** Search USDA FoodData Central. Returns normalized items (max 15). */
export async function searchFdc(query, apiKey = 'DEMO_KEY', { signal } = {}) {
  const q = String(query ?? '').trim();
  if (!q) return [];
  const url = `${FDC_URL}?api_key=${encodeURIComponent(String(apiKey || '').trim() || 'DEMO_KEY')}`;
  const json = await getJson(url, signal, { body: { query: q, pageSize: 15, dataType: FDC_DATA_TYPES } });
  const foods = Array.isArray(json && json.foods) ? json.foods : [];
  return foods.map(parseFdcFood).filter(Boolean);
}

/** Look up a barcode on Open Food Facts. Returns a normalized item, or null if unknown. */
export async function lookupBarcode(code, { signal } = {}) {
  const digits = String(code ?? '').replace(/\D/g, '');
  if (!digits) return null;
  const url = `${OFF_ORIGIN}/api/v2/product/${digits}.json?fields=product_name,brands,nutriments`;
  const json = await getJson(url, signal, { allow404: true });
  if (!json || json.status === 0 || !json.product) return null;
  return parseOffProduct({ ...json.product, code: json.code ?? digits });
}

/** Search Open Food Facts by name. Returns normalized items (max 15). */
export async function searchOff(query, { signal } = {}) {
  const q = String(query ?? '').trim();
  if (!q) return [];
  const url = `${OFF_ORIGIN}/cgi/search.pl?search_terms=${encodeURIComponent(q)}`
    + '&json=1&page_size=15&fields=code,product_name,brands,nutriments';
  const json = await getJson(url, signal);
  const products = Array.isArray(json && json.products) ? json.products : [];
  return products.map(p => parseOffProduct(p)).filter(Boolean);
}

/* ---------- maths ---------- */

/** Scale a per-100 g record to a portion in grams. Nulls stay null. */
export function scale(per100, grams) {
  const g = toNum(grams);
  const out = {};
  for (const key of NUTRIENT_KEYS) {
    const v = per100 ? toNum(per100[key]) : null;
    out[key] = v === null || g === null ? null : (v * g) / 100;
  }
  return out;
}

/**
 * Totals over diet log entries ({grams, per100}).
 * totals[k]: sum of the entries that state k. Null only when there are
 * entries and none of them state k, so the UI can show "unknown".
 * missing[k]: how many entries do not state k.
 */
export function sumDay(entries) {
  const list = (Array.isArray(entries) ? entries : []).filter(Boolean);
  const totals = {};
  const missing = {};
  for (const key of NUTRIENT_KEYS) {
    let sum = 0;
    let miss = 0;
    for (const e of list) {
      const v = scale(e.per100, e.grams)[key];
      if (v === null) miss += 1;
      else sum += v;
    }
    missing[key] = miss;
    totals[key] = list.length > 0 && miss === list.length ? null : sum;
  }
  return { totals, missing };
}
