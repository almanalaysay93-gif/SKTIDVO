/* T050 LWW merge + tombstones + stale-device resync (A022, plan §14.3 step 8). */
import { lww, merge, resync, markAcked } from '../js/sync/merge.js';
import * as S from '../js/store.js';
import { suite, test, eq } from './harness.js';
import { readFileSync } from 'node:fs';

const R = (id, updatedAt, extra = {}) => ({ id, updatedAt, deviceId: 'dA', deleted: false, ...extra });
const ids = list => list.map(r => r.id).sort().join(',');

export function runSyncMergeTests() {
  suite('sync-merge');

  test('lww: newer wins; tie → higher deviceId', () => {
    eq(lww(R('a', 2), R('a', 1)).updatedAt, 2);
    eq(lww(R('a', 1, { deviceId: 'a' }), R('a', 1, { deviceId: 'b' })).deviceId, 'b');
  });

  test('pull: remote newer replaces, local newer kept, new added, all acked', () => {
    const local = [R('x', 5, { v: 'L', syncedAt: 1 }), R('y', 9, { v: 'L', syncedAt: 1 })];
    const remote = [R('x', 6, { v: 'R', deviceId: 'dB' }), R('y', 7, { v: 'R' }), R('z', 3)];
    const { list } = merge(local, remote, 100);
    const m = Object.fromEntries(list.map(r => [r.id, r]));
    eq(m.x.v, 'R'); eq(m.x.syncedAt, 100);
    eq(m.y.v, 'L'); eq(m.y.syncedAt, 1);
    eq(m.z.syncedAt, 100);
  });

  test('tombstone wins when newer; older tombstone loses to edit', () => {
    eq(merge([R('x', 5, { syncedAt: 5 })], [R('x', 6, { deleted: true })], 10).list[0].deleted, true);
    eq(merge([R('x', 8, { syncedAt: 5 })], [R('x', 6, { deleted: true })], 10).list[0].deleted, false);
  });

  test('stale device after purge does not resurrect', () => {
    // x synced, then deleted on another device and the tombstone purged
    const { list, push } = resync([R('x', 5, { syncedAt: 5 })], [], { now: 50, purgedBefore: 40 });
    eq(list.length, 0); eq(push.length, 0);
  });

  test('never-synced old create survives resync', () => {
    const { list, push } = resync([R('n', 1)], [], { now: 50, purgedBefore: 40 });
    eq(ids(list), 'n'); eq(push.length, 1); eq(push[0].neverSynced, true);
  });

  test('previously synced deleted record does not resurrect', () => {
    // tombstone still on the server: it wins over the stale synced copy
    const snap = [R('x', 9, { deleted: true, deviceId: 'dB' })];
    const { list, push } = resync([R('x', 5, { syncedAt: 5 })], snap, { now: 50, purgedBefore: 1 });
    eq(list[0].deleted, true); eq(push.length, 0);
    // and deleted + purged elsewhere while locally dirty: still dropped
    eq(resync([R('x', 30, { syncedAt: 5 })], [], { now: 50, purgedBefore: 40 }).list.length, 0);
  });

  test('dirty synced record edited offline is re-pushed and resolved by LWW', () => {
    const snap = [R('x', 5, { v: 'old' })];
    const win = resync([R('x', 20, { v: 'mine', syncedAt: 5 })], snap, { now: 50, purgedBefore: 40 });
    eq(win.list[0].v, 'mine'); eq(win.push.length, 1); eq(win.push[0].neverSynced, undefined);
    const lose = resync([R('x', 20, { v: 'mine', syncedAt: 5 })], [R('x', 30, { v: 'theirs', deviceId: 'dB' })], { now: 50 });
    eq(lose.list[0].v, 'theirs'); eq(lose.push.length, 0);
  });

  test('restored backup records survive resync', () => {
    localStorage.clear();
    const fx = JSON.parse(readFileSync(new URL('./fixtures/backup-v1.json', import.meta.url), 'utf8'));
    S.importAll(fx);
    const local = S.syncRecords('weights');
    eq(local.length > 0, true);
    eq(local.every(r => !('syncedAt' in r)), true);
    const { list, push } = resync(local, [], { now: Date.now(), purgedBefore: Date.now() });
    eq(list.length, local.length);
    eq(push.length, local.length); eq(push.every(r => r.neverSynced), true);
  });

  test('markAcked sets syncedAt and applies server-normalized fields', () => {
    const out = markAcked([R('l', 5, { status: 'approved' }), R('m', 5)], ['l'], 99, [{ id: 'l', status: 'pending' }]);
    eq(out[0].syncedAt, 99); eq(out[0].status, 'pending'); eq('syncedAt' in out[1], false);
  });
}
