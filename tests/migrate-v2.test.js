/* T048 migration v2 + tombstones + outbox (A023, OQ-14, PR038). */
import * as S from '../js/store.js';
import { loadOutbox } from '../js/sync/queue.js';
import { suite, test, eq } from './harness.js';

const legacy = () => {
  localStorage.clear();
  localStorage.setItem('skti.v1.weights', JSON.stringify([
    { id: 'w1', day: '2026-01-01', ts: 1000, kg: 60 }, { id: 'w2', day: '2026-01-02', ts: 2000, kg: 61 }]));
  localStorage.setItem('skti.v1.labs', JSON.stringify([
    { id: 'l1', ts: 3000, date: '2026-01-03', values: { potassium: 5 }, status: 'approved', approvedBy: 'Dr', approvedAt: 3 }]));
  localStorage.setItem('skti.v1.diet_limits', JSON.stringify({ current: { k: 2000, approvedBy: 'Dr', approvedAt: 1 }, pending: null, rules: {} }));
  localStorage.setItem('skti.v1.profile', JSON.stringify({ name: 'P', setupDone: true }));
};

export function runMigrateV2Tests() {
  suite('migrate-v2');

  test('A023: stamps records, no syncedAt, keeps counts and values', () => {
    legacy();
    eq(S.migrateV2(5000), true);
    const raw = S.syncRecords('weights');
    eq(raw.length, 2);
    eq(raw[0].updatedAt, 1000); eq(raw[0].deleted, false);
    eq(/^[0-9a-f]{32}$/.test(raw[0].deviceId), true);
    eq(raw.every(r => !('syncedAt' in r)), true);
    eq(S.getWeights().length, 2); eq(S.getWeights()[0].kg, 61);
    eq(S.getProfile().name, 'P');
  });

  test('OQ-14: legacy approved labs and limits reset to pending', () => {
    legacy(); S.migrateV2(5000);
    eq(S.getLabs()[0].status, 'pending'); eq(S.getLabs()[0].approvedBy, null);
    const d = S.getDietLimits();
    eq(d.current, null); eq(d.pending.k, 2000);
  });

  test('idempotent; everything queued once for first push', () => {
    legacy(); S.migrateV2(5000);
    const before = localStorage.getItem('skti.v1.weights');
    eq(S.migrateV2(9999), false);
    eq(localStorage.getItem('skti.v1.weights'), before);
    const q = loadOutbox();
    eq(q.filter(x => x.entity === 'weights').length, 2);
    eq(q.some(x => x.entity === 'profile' && x.id === 'profile'), true);
  });

  test('delete becomes a hidden tombstone and is queued', () => {
    legacy(); S.migrateV2(5000);
    S.deleteWeight('w1');
    eq(S.getWeights().length, 1);
    const t = S.syncRecords('weights').find(r => r.id === 'w1');
    eq(t.deleted, true); eq(t.updatedAt > 5000, true);
    eq(S.exportAll().weights.length, 1);
  });

  test('edit of a synced record keeps syncedAt (dirty); unchanged keeps meta', () => {
    legacy(); S.migrateV2(5000);
    S.applySyncRecords('weights', S.syncRecords('weights').map(r => ({ ...r, syncedAt: 6000 })));
    S.logIntake(250, 'fluid.water');            // unrelated write
    const w2 = S.syncRecords('weights').find(r => r.id === 'w2');
    eq(w2.syncedAt, 6000); eq(w2.updatedAt, 2000);
  });

  test('PR038: importAll clears syncedAt on restored records', () => {
    legacy(); S.migrateV2(5000);
    const backup = S.exportAll();
    S.applySyncRecords('weights', S.syncRecords('weights').map(r => ({ ...r, syncedAt: 6000 })));
    S.importAll(backup);
    eq(S.syncRecords('weights').filter(r => !r.deleted).every(r => !('syncedAt' in r)), true);
  });
}
