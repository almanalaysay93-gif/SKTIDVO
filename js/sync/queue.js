/* ===================================================================
   sync/queue.js — outbox + backoff (plan §14.3 steps 2 and 5).
   Pure list functions plus thin storage helpers (storage injectable).
   Outbox item: {entity, id}. One entry per record; dedupe on enqueue.
   =================================================================== */

import { BACKOFF_BASE_MS, BACKOFF_CAP_MS, BATCH_MAX_BYTES, BATCH_MAX_RECORDS } from './config.js';

export const OUTBOX_KEY = 'skti.v1.outbox';

const same = (a, b) => a.entity === b.entity && a.id === b.id;

export function enqueue(list, entity, id) {
  const item = { entity: String(entity), id: String(id) };
  return list.some(x => same(x, item)) ? list : [...list, item];
}

/** Remove acknowledged items. `acked` = [{entity, id}]. */
export function ack(list, acked) {
  return list.filter(x => !acked.some(a => same(a, x)));
}

/**
 * Take the next push batch. `getRecord(entity, id)` returns the current
 * record (tombstones included) or null (item is dropped as stale).
 * Limits: ≤ maxRecords and ≤ maxBytes of JSON; always at least one record.
 */
export function takeBatch(list, getRecord, { maxRecords = BATCH_MAX_RECORDS, maxBytes = BATCH_MAX_BYTES } = {}) {
  const batch = [];
  const stale = [];
  let bytes = 2;
  for (const item of list) {
    if (batch.length >= maxRecords) break;
    const record = getRecord(item.entity, item.id);
    if (!record) { stale.push(item); continue; }
    const size = JSON.stringify({ entity: item.entity, record }).length + 1;
    if (batch.length && bytes + size > maxBytes) break;
    bytes += size;
    batch.push({ entity: item.entity, record });
  }
  return { batch, stale, bytes };
}

/** delay = min(cap, base * 2^attempt) * (0.5 + rand/2). rand ∈ [0,1). */
export function backoff(attempt, rand = Math.random(), { base = BACKOFF_BASE_MS, cap = BACKOFF_CAP_MS } = {}) {
  const raw = Math.min(cap, base * Math.pow(2, Math.max(0, attempt)));
  return Math.round(raw * (0.5 + rand / 2));
}

/** Next retry time after a failure. 429 honours the server's retryAfter (s). */
export function nextRetryAt(now, attempt, { status, retryAfter } = {}, rand = Math.random()) {
  if (status === 401) return null;                       // re-auth prompt, no retry storm
  if (status === 429 && Number.isFinite(retryAfter)) return now + retryAfter * 1000;
  return now + backoff(attempt, rand);
}

export function loadOutbox(storage = globalThis.localStorage) {
  try {
    const v = JSON.parse(storage.getItem(OUTBOX_KEY) || '[]');
    return Array.isArray(v) ? v.filter(x => x && typeof x.entity === 'string' && typeof x.id === 'string') : [];
  } catch { return []; }
}

export function saveOutbox(list, storage = globalThis.localStorage) {
  try { storage.setItem(OUTBOX_KEY, JSON.stringify(list)); return true; } catch { return false; }
}
