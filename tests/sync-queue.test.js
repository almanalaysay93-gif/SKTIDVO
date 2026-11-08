/* T047 meta + T049 outbox/backoff (A021). Pure; fake clock and rand. */
import { newDeviceId, stamp, stripMeta, contentKey, isDirty } from '../js/sync/meta.js';
import { enqueue, ack, takeBatch, backoff, nextRetryAt, loadOutbox, saveOutbox } from '../js/sync/queue.js';
import { suite, test, eq } from './harness.js';

export function runSyncQueueTests() {
  suite('sync-meta');

  test('deviceId is 32 hex chars and random', () => {
    const a = newDeviceId(), b = newDeviceId();
    eq(/^[0-9a-f]{32}$/.test(a), true); eq(a === b, false);
    eq(newDeviceId(n => new Uint8Array(n).fill(255)), 'f'.repeat(32));
  });

  test('stamp sets meta and keeps prev syncedAt (dirty)', () => {
    const r = stamp({ id: 'x', kg: 60 }, { now: 500, deviceId: 'd1', prev: { syncedAt: 100 } });
    eq(r.updatedAt, 500); eq(r.deviceId, 'd1'); eq(r.deleted, false); eq(r.syncedAt, 100);
    eq(isDirty(r), true);
    eq(isDirty({ updatedAt: 100, syncedAt: 100 }), false);
    eq('syncedAt' in stamp({ id: 'y' }, { now: 1, deviceId: 'd' }), false);
  });

  test('contentKey ignores meta and key order', () => {
    eq(contentKey({ a: 1, b: 2, updatedAt: 5 }), contentKey({ b: 2, a: 1, syncedAt: 9 }));
    eq(JSON.stringify(stripMeta({ id: 1, deleted: true })), '{"id":1}');
  });

  suite('sync-queue');

  test('enqueue dedupes, ack removes', () => {
    let q = enqueue([], 'weights', 'a');
    q = enqueue(q, 'weights', 'a'); q = enqueue(q, 'labs', 'a');
    eq(q.length, 2);
    eq(ack(q, [{ entity: 'weights', id: 'a' }]).length, 1);
  });

  test('takeBatch caps records and bytes, drops stale', () => {
    const q = Array.from({ length: 250 }, (_, i) => ({ entity: 'intake', id: 'i' + i }));
    const get = (e, id) => (id === 'i3' ? null : { id, ml: 250 });
    const r = takeBatch(q, get);
    eq(r.batch.length, 200); eq(r.stale.length, 1);
    const big = takeBatch(q, (e, id) => ({ id, pad: 'x'.repeat(1000) }), { maxBytes: 5000 });
    eq(big.batch.length, 4);
    eq(takeBatch(q.slice(0, 1), () => ({ pad: 'x'.repeat(9999) }), { maxBytes: 10 }).batch.length, 1);
  });

  test('backoff: 1 s base, doubles, caps at 15 min, jitter 0.5–1.0', () => {
    eq(backoff(0, 0.999999), 1000); eq(backoff(0, 0), 500);
    eq(backoff(3, 0.999999), 8000);
    eq(backoff(30, 0.999999), 900000); eq(backoff(30, 0), 450000);
  });

  test('retry: 401 → no retry; 429 honours retryAfter; else backoff (fake clock)', () => {
    eq(nextRetryAt(1000, 2, { status: 401 }), null);
    eq(nextRetryAt(1000, 2, { status: 429, retryAfter: 30 }), 31000);
    eq(nextRetryAt(1000, 1, { status: 500 }, 0), 2000);
  });

  test('outbox persists in storage and ignores junk', () => {
    const mem = new Map();
    const st = { getItem: k => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, v) };
    saveOutbox([{ entity: 'labs', id: '1' }, { bad: 1 }], st);
    eq(loadOutbox(st).length, 1);
    mem.set('skti.v1.outbox', '{oops'); eq(loadOutbox(st).length, 0);
  });
}
