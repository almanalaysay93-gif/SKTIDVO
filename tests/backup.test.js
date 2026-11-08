/* ===================================================================
   Tests for backup restore (store.importAll) — FR008 / A007 approval
   reset, T023 validation, C005 fixture compatibility. Node-only: needs
   the localStorage shim from tests/run-all.mjs.
   =================================================================== */

import * as S from '../js/store.js';
import { suite, test, eq, throws } from './harness.js';
import { readFileSync } from 'node:fs';

const fixture = () => JSON.parse(readFileSync(new URL('./fixtures/backup-v1.json', import.meta.url), 'utf8'));

export function runBackupTests() {
  suite('backup');

  test('diet: logged food keeps kcal per 100 g; absent kcal stays null', () => {
    localStorage.clear();
    const a = S.logFood({ name: 'Rice', grams: 200, source: 'fdc', ref: '1', per100: { na: 5, kcal: 130 } });
    const b = S.logFood({ name: 'Old', grams: 100, source: 'custom', per100: { na: 5 } });
    eq(a.per100.kcal, 130);
    eq(b.per100.kcal, null);
    const dump = JSON.parse(JSON.stringify(S.exportAll()));
    localStorage.clear();
    S.importAll(dump);
    const log = S.getDietLog();
    eq(log.find(e => e.name === 'Rice').per100.kcal, 130, 'backup round-trip keeps kcal: ');
    eq(log.find(e => e.name === 'Old').per100.kcal, null);
  });

  test('fixture has an approved lab (precondition)', () => {
    eq(fixture().labs.some(l => l.status === 'approved'), true);
  });

  test('A007: restored labs are all pending, none approved', () => {
    localStorage.clear();
    S.importAll(fixture());
    const labs = S.getLabs();
    eq(labs.length > 0, true);
    eq(labs.every(l => l.status === 'pending'), true);
    eq(labs.every(l => l.approvedBy === null && l.approvedAt === null), true);
  });

  test('A007: approved limit set is demoted to pending', () => {
    localStorage.clear();
    const data = fixture();
    data.dietLimits = { current: { na: 2000, k: 2500, p: 900, approvedBy: 'Dr X', approvedAt: 1 }, pending: null, rules: {} };
    S.importAll(data);
    const d = S.getDietLimits();
    eq(d.current, null);
    eq(S.approvedLimits(), null);
    eq(d.pending.na, 2000);
    eq('approvedBy' in d.pending, false);
  });

  test('A007: an existing pending set wins over a demoted current set', () => {
    localStorage.clear();
    const data = fixture();
    data.dietLimits = { current: { na: 2000 }, pending: { na: 1500 }, rules: {} };
    S.importAll(data);
    eq(S.getDietLimits().pending.na, 1500);
  });

  test('C005: fixture restores with equal counts', () => {
    localStorage.clear();
    const data = fixture();
    const c = S.importAll(data);
    eq(c.weights, data.weights.length);
    eq(c.intake, data.intake.length);
    eq(c.sessions, data.sessions.length);
    eq(c.hdBp, data.hdBp.length);
    eq(c.dietLog, data.dietLog.length);
    eq(c.labs, data.labs.length);
    eq(c.medications, data.medications.length);
  });

  test('rejects foreign and newer files', () => {
    throws(() => S.importAll({ app: 'other', version: 1 }));
    throws(() => S.importAll(null));
    throws(() => S.importAll({ app: S.EXPORT_APP, version: S.EXPORT_VERSION + 1 }));
  });

  test('T023: medications are type-cleaned, junk dropped', () => {
    localStorage.clear();
    const data = fixture();
    data.medications = [null, 7, { name: 42 }, { id: { x: 1 }, name: 'A', dose: 5, notes: 'n'.repeat(999) }];
    S.importAll(data);
    const m = S.getMedications();
    eq(m.length, 1);
    eq(typeof m[0].id, 'string');
    eq(m[0].dose, '');
    eq(m[0].notes.length, 300);
  });

  test('T023: medications not an array falls back to defaults', () => {
    localStorage.clear();
    const data = fixture();
    data.medications = 'nope';
    S.importAll(data);
    eq(S.getMedications().length > 0, true);
  });

  test('T023: medLogs keep only real days and boolean true', () => {
    localStorage.clear();
    const data = fixture();
    data.medLogs = { '2026-01-01': { a_default: true, b_default: 'yes' }, 'bad': { c: true }, '2026-01-02': 5 };
    S.importAll(data);
    const logs = S.getMedLogs();
    eq(Object.keys(logs).join(), '2026-01-01');
    eq(logs['2026-01-01'].a_default, true);
    eq(logs['2026-01-01'].b_default, false);
  });

  test('T023: medLogs array is rejected', () => {
    localStorage.clear();
    const data = fixture();
    data.medLogs = [1, 2];
    S.importAll(data);
    eq(JSON.stringify(S.getMedLogs()), '{}');
  });
}
