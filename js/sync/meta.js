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

/* ---------- daily sync quota (local mirror of the server limit) ----------
   Stored in sync state as quota: {email, day, used, resetAt}. Non-secret. */

const MANILA_OFFSET_MS = 8 * 3600000;

/** ms -> 'YYYY-MM-DD' in Asia/Manila (UTC+8, no DST). */
export function manilaDayKey(ms) {
  return new Date(Number(ms) + MANILA_OFFSET_MS).toISOString().slice(0, 10);
}

/** Next Asia/Manila midnight after ms (epoch ms). */
export function nextManilaMidnight(ms) {
  return (Math.floor((Number(ms) + MANILA_OFFSET_MS) / 86400000) + 1) * 86400000 - MANILA_OFFSET_MS;
}

/** Today's usage for `email` -> {used, limit, remaining, resetAt}. Rolls over at Manila midnight
    (and when a server resetAt has passed). Another account's counter does not apply. */
export function quotaState(q, email, now, limit) {
  const fresh = !!q && q.email === email && q.day === manilaDayKey(now) && !(q.resetAt && now >= q.resetAt);
  const used = fresh ? Math.min(limit, Number(q.used) || 0) : 0;
  return { used, limit, remaining: Math.max(0, limit - used), resetAt: nextManilaMidnight(now) };
}

/** Quota record after one server-accepted cycle (prefers the server's own count). */
export function bumpQuota(q, email, now, limit, serverUsed) {
  const cur = quotaState(q, email, now, limit).used;
  const used = Number.isFinite(serverUsed) ? Math.min(limit, serverUsed) : Math.min(limit, cur + 1);
  return { email, day: manilaDayKey(now), used, resetAt: nextManilaMidnight(now) };
}

/** Quota record after the server refused with daily_limit. */
export function exhaustQuota(email, now, limit, resetAt) {
  return { email, day: manilaDayKey(now), used: limit, resetAt: Number(resetAt) || nextManilaMidnight(now) };
}
