/* ===================================================================
   Tests for limits.js — clinician limit rules, custom-food CSV, lab
   import. Numbers are arbitrary test values, not clinical guidance.
   =================================================================== */

import * as L from '../js/limits.js';
import { suite, test, eq, throws } from './harness.js';

const lab = (id, date, values, status = 'approved', approvedAt = 1) =>
  ({ id, date, values, status, approvedAt });

export function runLimitsTests() {
  suite('limits — rules');

  test('no rules -> every mineral and protein null', () => {
    const r = L.computeSuggestedLimits([], {}, { dryWeightKg: 60, allowanceMl: null });
    eq(r.na, null); eq(r.k, null); eq(r.p, null); eq(r.protein, null); eq(r.fluid, null);
    eq(L.hasAnyLimit(r), false);
  });

  test('base limit used when no condition', () => {
    const r = L.computeSuggestedLimits([], { na: { base: 1111 } }, {});
    eq(r.na, 1111);
  });

  test('condition met (lab > threshold) -> then value', () => {
    const labs = [lab('a', '2026-10-01', { potassium: 6 })];
    const r = L.computeSuggestedLimits(labs, { k: { base: 3000, lab: 'potassium', threshold: 5.5, then: 2000 } }, {});
    eq(r.k, 2000); eq(r.labId, 'a');
  });

  test('condition not met (equal to threshold) -> base', () => {
    const labs = [lab('a', '2026-10-01', { potassium: 5.5 })];
    const r = L.computeSuggestedLimits(labs, { k: { base: 3000, lab: 'potassium', threshold: 5.5, then: 2000 } }, {});
    eq(r.k, 3000);
  });

  test('missing lab value -> base + note', () => {
    const labs = [lab('a', '2026-10-01', { potassium: null })];
    const r = L.computeSuggestedLimits(labs, { k: { base: 3000, lab: 'potassium', threshold: 5, then: 2000 } }, {});
    eq(r.k, 3000); eq(r.notes.length, 1); eq(r.notes[0].reason, 'missing-lab');
  });

  test('no labs at all -> base + note', () => {
    const r = L.computeSuggestedLimits([], { p: { base: 900, lab: 'phosphorus', threshold: 2, then: 700 } }, {});
    eq(r.p, 900); eq(r.labId, null); eq(r.notes.length, 1);
  });

  test('condition only, no base, not triggered -> null', () => {
    const labs = [lab('a', '2026-10-01', { sodium: 130 })];
    const r = L.computeSuggestedLimits(labs, { na: { base: '', lab: 'sodium', threshold: 140, then: 1500 } }, {});
    eq(r.na, null);
  });

  test('pending and rejected labs are ignored; newest approved wins', () => {
    const labs = [
      lab('old', '2026-01-01', { potassium: 7 }),
      lab('new', '2026-09-01', { potassium: 4 }),
      lab('pend', '2026-10-01', { potassium: 9 }, 'pending'),
      lab('rej', '2026-11-01', { potassium: 9 }, 'rejected')
    ];
    const r = L.computeSuggestedLimits(labs, { k: { base: 3000, lab: 'potassium', threshold: 5, then: 2000 } }, {});
    eq(r.labId, 'new'); eq(r.k, 3000);
  });

  test('protein = g/kg x dry weight', () => {
    const r = L.computeSuggestedLimits([], { protein: { gPerKg: 1.2 } }, { dryWeightKg: 55 });
    eq(r.protein, 66);
  });

  test('protein null without dry weight or g/kg', () => {
    eq(L.computeSuggestedLimits([], { protein: { gPerKg: 1.2 } }, { dryWeightKg: null }).protein, null);
    eq(L.computeSuggestedLimits([], {}, { dryWeightKg: 55 }).protein, null);
  });

  test('fluid = profile allowance', () => {
    eq(L.computeSuggestedLimits([], {}, { allowanceMl: 800 }).fluid, 800);
  });

  suite('limits — CSV and lab import');

  test('CSV parses rows, blanks become null', () => {
    const r = L.parseFoodsCsv('name,sodium_mg,potassium_mg,phosphorus_mg,protein_g,water_g\n"Food, A",10,20,,1.5,80\n');
    eq(r.foods.length, 1); eq(r.foods[0].name, 'Food, A'); eq(r.foods[0].per100.p, null); eq(r.foods[0].per100.water, 80);
    eq(r.errors.length, 0);
  });

  test('CSV rejects bad rows with line numbers', () => {
    const r = L.parseFoodsCsv('name,sodium_mg,potassium_mg,phosphorus_mg,protein_g,water_g\n,1,1,1,1,1\nB,x,1,1,1,1\nC,1,1,1,200,1\nD,,,,,\nE,1,2,3,4,5');
    eq(r.foods.length, 1); eq(r.errors.length, 4);
    eq(r.errors[0].line, 2); eq(r.errors[1].reason, 'sodium_mg'); eq(r.errors[2].reason, 'protein_g'); eq(r.errors[3].reason, 'empty');
  });

  test('CSV bad header throws', () => {
    throws(() => L.parseFoodsCsv('food,na\nA,1'));
  });

  test('lab import normalizes lab_ocr.py JSON', () => {
    const r = L.normalizeLabImport({ date: '2026-10-02', source: 'ocr', values: { potassium: '5.1', sodium: null, junk: 3 }, units: { potassium: 'mmol/L' } });
    eq(r.values.potassium, 5.1); eq(r.values.sodium, null); eq(r.values.junk, undefined); eq(r.units.potassium, 'mmol/L'); eq(r.origin, 'ocr');
  });

  test('lab import rejects bad date / no values', () => {
    throws(() => L.normalizeLabImport({ date: '10/02/2026', values: { potassium: 5 } }));
    throws(() => L.normalizeLabImport({ date: '2026-10-02', values: {} }));
    throws(() => L.normalizeLabImport(null));
  });
}
