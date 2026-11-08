/* ===================================================================
   sync/meta.js — pure sync metadata helpers (F-SYNC-01, plan §14.2).
   No storage, no network. Every synced record carries:
     updatedAt (ms), deviceId (hex), deleted (bool), syncedAt (ms|absent).
   =================================================================== */

export const META_FIELDS = ['updatedAt', 'deviceId', 'deleted', 'syncedAt', 'neverSynced'];

/** Random 128-bit id as 32 lowercase hex chars. `rand` is injectable for tests. */
export function newDeviceId(rand = defaultRandom) {
  const bytes = rand(16);
  let out = '';
  for (let i = 0; i < 16; i++) out += (bytes[i] & 255).toString(16).padStart(2, '0');
  return out;
}

function defaultRandom(n) {
  const a = new Uint8Array(n);
  globalThis.crypto.getRandomValues(a);
  return a;
}

/** Fresh metadata for a local write. Keeps `syncedAt` of the previous version
    (a record edited after its last ack is "dirty": updatedAt > syncedAt). */
export function stamp(record, { now, deviceId, deleted = false, prev = null }) {
  const out = { ...stripMeta(record), updatedAt: now, deviceId, deleted: !!deleted };
  if (prev && Number.isFinite(prev.syncedAt)) out.syncedAt = prev.syncedAt;
  return out;
}

/** Record without sync metadata. */
export function stripMeta(record) {
  const out = {};
  for (const k of Object.keys(record || {})) if (!META_FIELDS.includes(k)) out[k] = record[k];
  return out;
}

/** Stable JSON (sorted keys) of the content only, for change detection. */
export function contentKey(record) {
  return stableJson(stripMeta(record));
}

export function stableJson(v) {
  if (Array.isArray(v)) return '[' + v.map(stableJson).join(',') + ']';
  if (v && typeof v === 'object') {
    return '{' + Object.keys(v).sort().filter(k => v[k] !== undefined)
      .map(k => JSON.stringify(k) + ':' + stableJson(v[k])).join(',') + '}';
  }
  return JSON.stringify(v === undefined ? null : v);
}

/** True when the record changed locally since the server last acknowledged it. */
export function isDirty(r) {
  return !Number.isFinite(r.syncedAt) || r.updatedAt > r.syncedAt;
}
