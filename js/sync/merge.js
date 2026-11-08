/* ===================================================================
   sync/merge.js — pure LWW merge, tombstones, stale-device resync
   (plan §14.3 steps 3 and 8). No storage, no network.
   Record: {id, ..., updatedAt, deviceId, deleted, syncedAt?}
   =================================================================== */

import { isDirty } from './meta.js';

/** Last-writer-wins: higher updatedAt, tie → higher deviceId. Returns the winner. */
export function lww(a, b) {
  if (!a) return b;
  if (!b) return a;
  if (a.updatedAt !== b.updatedAt) return a.updatedAt > b.updatedAt ? a : b;
  return String(a.deviceId) >= String(b.deviceId) ? a : b;
}

const sameVersion = (a, b) => a.updatedAt === b.updatedAt && a.deviceId === b.deviceId;
const acked = (r, now) => ({ ...r, syncedAt: now });

/**
 * Normal pull merge. Remote rows are server state (acknowledged).
 * Returns {list, changed} — `list` is the full new local list.
 */
export function merge(local, remote, now) {
  const map = new Map(local.map(r => [r.id, r]));
  let changed = false;
  for (const r of remote) {
    const l = map.get(r.id);
    if (!l) { map.set(r.id, acked(stripFlags(r), now)); changed = true; continue; }
    if (sameVersion(l, r)) {
      if (l.syncedAt !== now && isDirty(l)) { map.set(r.id, acked(l, now)); changed = true; }
      continue;
    }
    if (lww(l, r) === r) { map.set(r.id, acked(stripFlags(r), now)); changed = true; }
    // local wins: keep it (still dirty, stays in the outbox)
  }
  return { list: [...map.values()], changed };
}

/**
 * Stale-device resync after `cursor_too_old` (§14.3 step 8).
 * snapshot = full server state for this email/entity.
 * outboxIds = Set of ids queued locally. purgedBefore = server watermark (ms).
 * Returns {list, push}: `push` = records to re-push; never-synced ones carry
 * neverSynced:true so the server exempts them from the watermark.
 */
export function resync(local, snapshot, { now, purgedBefore = 0, outboxIds = new Set() }) {
  const snap = new Map(snapshot.map(r => [r.id, r]));
  const out = new Map();
  const push = [];
  for (const l of local) {
    const s = snap.get(l.id);
    const synced = Number.isFinite(l.syncedAt);
    if (!synced) {
      // never acknowledged: keep regardless of age, re-push flagged (C005)
      const win = s ? lww(l, s) : l;
      out.set(l.id, win === l ? l : acked(stripFlags(s), now));
      if (win === l) push.push({ ...l, neverSynced: true });
      continue;
    }
    if (!s) continue;                 // synced but gone from server: deleted + purged elsewhere
    const dirty = l.updatedAt > l.syncedAt;
    const win = lww(l, s);
    if (win === l && !sameVersion(l, s)) {
      out.set(l.id, l);
      if (dirty || (outboxIds.has(l.id) && l.updatedAt >= purgedBefore)) push.push(l);
    } else {
      out.set(l.id, acked(stripFlags(s), now));
    }
  }
  for (const s of snapshot) if (!out.has(s.id) && !local.some(l => l.id === s.id)) out.set(s.id, acked(stripFlags(s), now));
  return { list: [...out.values()], push };
}

/** Set syncedAt on acknowledged ids (push ack). Server-normalized records replace local ones. */
export function markAcked(list, ackedIds, now, normalized = []) {
  const norm = new Map(normalized.map(r => [r.id, r]));
  const ids = new Set(ackedIds);
  return list.map(r => {
    if (!ids.has(r.id)) return r;
    const n = norm.get(r.id);
    return acked(stripFlags(n ? { ...r, ...n } : r), now);
  });
}

function stripFlags(r) {
  const { neverSynced, serverSeq, serverUpdatedAt, ...rest } = r;
  return rest;
}
