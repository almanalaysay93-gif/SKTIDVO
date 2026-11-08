#!/usr/bin/env node
// i18n coverage check for js/. Reports keys missing per language, empty values,
// and static t('key') calls in js/**/*.js whose key is absent in any language.
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Minimal shims so js/i18n.js can load even if it touches browser globals at import time.
globalThis.localStorage ??= { getItem: () => null, setItem() {}, removeItem() {} };
globalThis.navigator ??= { language: 'en' };
globalThis.document ??= { documentElement: { lang: 'en' } };

const I18N_URL = new URL('../js/i18n.js', import.meta.url);
const I18N_PATH = fileURLToPath(I18N_URL);
const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const JS_DIR = path.join(REPO, 'js');

const mod = await import(I18N_URL.href);
const LANGS = mod.LANGS;

// STRINGS is not exported from js/i18n.js. Load its source with the export keyword
// stripped and return the object, without modifying the file.
function loadStrings(src) {
  const body = src.replace(/^export\s+/gm, '') + '\nreturn STRINGS;';
  return new Function(body)();
}
const STRINGS = loadStrings(readFileSync(I18N_PATH, 'utf8'));

const allKeys = new Set();
for (const lang of LANGS) for (const k of Object.keys(STRINGS[lang] ?? {})) allKeys.add(k);

const missingPerLang = new Map(); // lang -> Set(keys)
const missingKeys = new Set();     // dedup "lang:key"
const addMissing = (lang, key) => {
  if (!missingPerLang.has(lang)) missingPerLang.set(lang, new Set());
  missingPerLang.get(lang).add(key);
  missingKeys.add(`${lang}:${key}`);
};

// 1. Missing vs union, and empty values.
const emptyValues = [];
for (const lang of LANGS) {
  const dict = STRINGS[lang] ?? {};
  for (const k of allKeys) if (!(k in dict)) addMissing(lang, k);
  for (const [k, v] of Object.entries(dict)) if (v === '') emptyValues.push(`${lang}:${k}`);
}

// 2. Static t('key') / t("key") calls in js/**/*.js.
function walk(dir, out = []) {
  for (const ent of readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) walk(p, out);
    else if (ent.isFile() && p.endsWith('.js')) out.push(p);
  }
  return out;
}
// Literal key only: the closing quote must be followed directly by ')'.
// Template strings and concatenation (t(`x${y}`), t('a' + b)) do not match.
const CALL_RE = /(?<![\w$.])t\(\s*(['"])([^'"\n]+)\1\s*\)/g;
const usedKeys = new Map(); // key -> Set(file)
for (const file of walk(JS_DIR)) {
  const src = readFileSync(file, 'utf8');
  for (const m of src.matchAll(CALL_RE)) {
    const key = m[2];
    if (!usedKeys.has(key)) usedKeys.set(key, new Set());
    usedKeys.get(key).add(path.relative(REPO, file).split(path.sep).join('/'));
  }
}
const codeMissing = []; // [key, lang, files]
for (const [key, files] of [...usedKeys].sort((a, b) => a[0].localeCompare(b[0]))) {
  for (const lang of LANGS) {
    if (!(key in (STRINGS[lang] ?? {}))) {
      addMissing(lang, key);
      codeMissing.push([key, lang, [...files].sort()]);
    }
  }
}

// Report.
console.log(`Languages: ${LANGS.join(', ')}`);
console.log(`Total unique keys (union): ${allKeys.size}`);
console.log(`Static t() keys used in js/: ${usedKeys.size}`);
console.log('');
console.log('== 1. Keys missing per language (vs union) ==');
for (const lang of LANGS) {
  const set = missingPerLang.get(lang);
  const list = set ? [...set].sort() : [];
  console.log(`${lang}: ${list.length}`);
  for (const k of list) console.log(`  - ${k}`);
}
console.log('');
console.log('== 1b. Empty string values ==');
console.log(`count: ${emptyValues.length}`);
for (const e of emptyValues) console.log(`  - ${e}`);
console.log('');
console.log('== 2. Keys used in code but missing in a language ==');
console.log(`count: ${codeMissing.length}`);
for (const [key, lang, files] of codeMissing) {
  console.log(`  - [${lang}] ${key}  (${files.join(', ')})`);
}
console.log('');
const N = missingKeys.size;
console.log(`missing keys = ${N}`);
process.exitCode = N > 0 ? 1 : 0;
