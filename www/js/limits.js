/* ===================================================================
   limits.js — daily diet limits from clinician rules, plus the pure
   parsers the diet feature needs (custom-food CSV, lab-import JSON)
   and the clinician-PIN hash.

   NO clinical defaults live here. Every number comes from rules the
   clinician typed into Settings. A blank rule produces null, which the
   UI shows as "no limit", never as a guessed value.

   Rule shape (per mineral key na | k | p):
     { base: number|null, lab: labKey|'', threshold: number|null, then: number|null }
     -> if lab value > threshold, limit = then; otherwise limit = base.
   Protein: { gPerKg: number|null } -> gPerKg x profile.dryWeightKg (g).
   Fluid: profile.allowanceMl (mL), the same allowance the Fluid tab uses.
   =================================================================== */

export const MINERALS = ['na', 'k', 'p'];
export const LIMIT_KEYS = ['na', 'k', 'p', 'protein', 'fluid'];
export const LAB_KEYS = ['potassium', 'sodium', 'phosphorus', 'albumin',
                         'bun', 'creatinine', 'hemoglobin', 'calcium'];

const num = v => {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

/** Newest approved lab by date (then by approval time), or null. */
export function latestApprovedLab(labs) {
  const ok = (Array.isArray(labs) ? labs : []).filter(l => l && l.status === 'approved');
  ok.sort((a, b) => String(b.date).localeCompare(String(a.date)) || (num(b.approvedAt) ?? 0) - (num(a.approvedAt) ?? 0));
  return ok[0] || null;
}

/**
 * Pure. Returns {na,k,p,protein,fluid, labId, notes:[]}.
 * notes lists conditional rules that could not be checked because the
 * lab value was missing (the base limit was used instead).
 */
export function computeSuggestedLimits(labs, rules, profile) {
  const r = rules && typeof rules === 'object' ? rules : {};
  const lab = latestApprovedLab(labs);
  const out = { labId: lab ? lab.id ?? null : null, notes: [] };

  for (const key of MINERALS) {
    const rule = r[key] || {};
    const base = num(rule.base);
    const threshold = num(rule.threshold);
    const then = num(rule.then);
    const hasCond = !!rule.lab && threshold !== null && then !== null;
    let limit = base;
    if (hasCond) {
      const v = lab && lab.values ? num(lab.values[rule.lab]) : null;
      if (v === null) out.notes.push({ key, lab: rule.lab, reason: 'missing-lab' });
      else if (v > threshold) limit = then;
    }
    out[key] = limit;
  }

  const gPerKg = num(r.protein && r.protein.gPerKg);
  const dry = num(profile && profile.dryWeightKg);
  out.protein = gPerKg !== null && dry !== null && dry > 0 ? Math.round(gPerKg * dry * 10) / 10 : null;

  const fluid = num(profile && profile.allowanceMl);
  out.fluid = fluid !== null && fluid > 0 ? fluid : null;
  return out;
}

/** True when at least one limit is a number. */
export function hasAnyLimit(limits) {
  return !!limits && LIMIT_KEYS.some(k => num(limits[k]) !== null);
}

/* ---------- custom-food CSV ----------
   Header: name,sodium_mg,potassium_mg,phosphorus_mg,protein_g,water_g
   Values are per 100 g. Blank cell = not stated (null). */

const CSV_COLS = ['name', 'sodium_mg', 'potassium_mg', 'phosphorus_mg', 'protein_g', 'water_g'];
const COL_KEY = { sodium_mg: 'na', potassium_mg: 'k', phosphorus_mg: 'p', protein_g: 'protein', water_g: 'water' };
const MAX_PER100 = { na: 100000, k: 100000, p: 100000, protein: 100, water: 100 };

function splitCsvLine(line) {
  const out = []; let cur = ''; let q = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (q) {
      if (c === '"' && line[i + 1] === '"') { cur += '"'; i++; }
      else if (c === '"') q = false;
      else cur += c;
    } else if (c === '"') q = true;
    else if (c === ',') { out.push(cur); cur = ''; }
    else cur += c;
  }
  out.push(cur);
  return out.map(s => s.trim());
}

/** -> {foods:[{name, per100}], errors:[{line, reason}]}; throws on bad header. */
export function parseFoodsCsv(text) {
  const lines = String(text ?? '').replace(/^﻿/, '').split(/\r?\n/);
  const header = splitCsvLine(lines[0] || '').map(h => h.toLowerCase());
  if (CSV_COLS.some((c, i) => header[i] !== c)) {
    const err = new Error('bad header'); err.code = 'HEADER'; throw err;
  }
  const foods = []; const errors = [];
  for (let i = 1; i < lines.length; i++) {
    if (!lines[i].trim()) continue;
    const cells = splitCsvLine(lines[i]);
    const name = (cells[0] || '').slice(0, 120);
    if (!name) { errors.push({ line: i + 1, reason: 'name' }); continue; }
    if (cells.length > CSV_COLS.length) { errors.push({ line: i + 1, reason: 'columns' }); continue; }
    const per100 = {}; let bad = null; let any = false;
    for (let c = 1; c < CSV_COLS.length; c++) {
      const key = COL_KEY[CSV_COLS[c]];
      const raw = cells[c] ?? '';
      if (raw === '') { per100[key] = null; continue; }
      const n = Number(raw);
      if (!Number.isFinite(n) || n < 0 || n > MAX_PER100[key]) { bad = CSV_COLS[c]; break; }
      per100[key] = n; any = true;
    }
    if (bad) { errors.push({ line: i + 1, reason: bad }); continue; }
    if (!any) { errors.push({ line: i + 1, reason: 'empty' }); continue; }
    foods.push({ name, per100 });
  }
  return { foods, errors };
}

/* ---------- lab import (tools/lab_ocr.py output) ---------- */

/** -> {date, values, units, origin}; throws on unusable input. */
export function normalizeLabImport(data, origin = 'ocr') {
  if (!data || typeof data !== 'object' || !data.values || typeof data.values !== 'object') {
    throw new Error('not a lab file');
  }
  const date = String(data.date ?? '');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error('bad date');
  const values = {}; let any = false;
  for (const k of LAB_KEYS) {
    const v = num(data.values[k]);
    values[k] = v !== null && v >= 0 ? v : null;
    if (values[k] !== null) any = true;
  }
  if (!any) throw new Error('no values');
  const units = {};
  if (data.units && typeof data.units === 'object') {
    for (const k of LAB_KEYS) if (typeof data.units[k] === 'string') units[k] = data.units[k].slice(0, 20);
  }
  return { date, values, units, origin: origin === 'manual' ? 'manual' : 'ocr' };
}

/* ---------- clinician PIN ---------- */

/** Hex SHA-256 of salt + ':' + pin. Async: SubtleCrypto. */
export async function hashPin(pin, salt) {
  const bytes = new TextEncoder().encode(`${salt}:${pin}`);
  const buf = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
}

export function newSalt() {
  const a = new Uint8Array(16);
  crypto.getRandomValues(a);
  return [...a].map(b => b.toString(16).padStart(2, '0')).join('');
}
