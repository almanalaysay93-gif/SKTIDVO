/* ===================================================================
   sync/engine.js — orchestration (plan §14.3): gate → push → pull →
   merge → store, status events, backoff. All IO is injected so the
   whole cycle runs in node tests with a fake server and fake clock.
   Never blocks the UI: every step is async and merges yield between
   entities (NFR008). The ID token comes from auth.getToken() per call.
   =================================================================== */

import { BATCH_MAX_RECORDS, CONSENT_VERSION, ENTITIES, WRITE_DEBOUNCE_MS } from './config.js';
import { markAcked, merge, resync } from './merge.js';
import { ack, nextRetryAt, takeBatch } from './queue.js';

const MAX_PUSH_ROUNDS = 50;

/** Pure status: {state, pending, lastSyncAt, error}. state ∈
    off | signin | consent | offline | syncing | pending | synced | error. */
export function computeStatus({ configured = true, user, hasToken, consentOk, online, pending, lastSyncAt, error, running }) {
  const base = { pending, lastSyncAt: lastSyncAt || null, error: error || null };
  if (!configured || !user) return { ...base, state: 'off' };
  if (!hasToken) return { ...base, state: 'signin' };
  if (!consentOk) return { ...base, state: 'consent' };
  if (!online) return { ...base, state: 'offline' };
  if (running) return { ...base, state: 'syncing' };
  if (error) return { ...base, state: 'error' };
  if (pending > 0 || !lastSyncAt) return { ...base, state: 'pending' };
  return { ...base, state: 'synced' };
}

export function consentOk(st, email) {
  return !!email && st.consentVersion === CONSENT_VERSION && st.consentEmail === email;
}

/**
 * deps: {
 *   api(op, body, idToken) → Promise<data> (throws SyncError),
 *   store: {syncRecords, applySyncRecords, getSyncState, setSyncState, markAllUnsynced},
 *   outbox: {load() → list, save(list)},
 *   auth: {getToken() → jwt|null, user() → {email}|null, clearToken()},
 *   now(), isOnline(), rand(), setTimer(fn, ms) → id, clearTimer(id), yieldFn() → Promise,
 *   configured: bool
 * }
 */
export function createEngine(deps) {
  const { api, store, outbox, auth } = deps;
  const now = deps.now || (() => Date.now());
  const isOnline = deps.isOnline || (() => true);
  const rand = deps.rand || Math.random;
  const setTimer = deps.setTimer || ((fn, ms) => setTimeout(fn, ms));
  const clearTimer = deps.clearTimer || (id => clearTimeout(id));
  const yieldFn = deps.yieldFn || (() => new Promise(r => setTimeout(r, 0)));
  const configured = deps.configured !== false;
  const onWhoami = deps.onWhoami || (() => {});

  const listeners = new Set();
  let running = false;
  let rerun = false;
  let attempt = 0;
  let error = null;
  let timer = null;
  let timerAt = 0;
  let syncOp = true;             // server has op 'sync'; false after bad_op (pre-redeploy server)

  const email = () => auth.user()?.email || null;

  function status() {
    const st = store.getSyncState();
    return computeStatus({
      configured, user: auth.user(), hasToken: !!auth.getToken(), consentOk: consentOk(st, email()),
      online: isOnline(), pending: outbox.load().length, lastSyncAt: st.lastSyncAt, error, running
    });
  }
  function publish() { const s = status(); listeners.forEach(fn => { try { fn(s); } catch { /* UI listener */ } }); return s; }
  function onStatus(fn) { listeners.add(fn); fn(status()); return () => listeners.delete(fn); }

  function schedule(ms) {
    const at = now() + Math.max(0, ms);
    if (timer && timerAt <= at) return;
    if (timer) clearTimer(timer);
    timerAt = at;
    timer = setTimer(() => { timer = null; run(); }, Math.max(0, ms));
  }
  function cancel() { if (timer) clearTimer(timer); timer = null; }

  const call = (op, body = {}) => {
    const tok = auth.getToken();
    return api(op, body, tok);
  };

  function recordIndex(entity) {
    return new Map(store.syncRecords(entity).map(r => [r.id, r]));
  }

  /* Apply a push ack: only records still at the pushed version get syncedAt. */
  function applyAck(batch, data) {
    const t = now();
    const accepted = data.accepted || [];
    const ignored = data.ignored || [];
    const normalized = data.normalized || [];
    const pushedAt = new Map(batch.map(b => [b.entity + '|' + b.record.id, b.record.updatedAt]));
    const done = [];
    for (const entity of new Set(batch.map(b => b.entity))) {
      const list = store.syncRecords(entity);
      const cur = new Map(list.map(r => [r.id, r]));
      const ids = accepted.filter(a => a.entity === entity && cur.get(a.id)?.updatedAt === pushedAt.get(entity + '|' + a.id)).map(a => a.id);
      const norm = normalized.filter(n => n.entity === entity && ids.includes(n.record.id)).map(n => n.record);
      if (ids.length) store.applySyncRecords(entity, markAcked(list, ids, t, norm));
      ids.forEach(id => done.push({ entity, id }));
    }
    ignored.forEach(i => done.push({ entity: i.entity, id: i.id }));
    outbox.save(ack(outbox.load(), done));
  }

  async function pushAll() {
    for (let round = 0; round < MAX_PUSH_ROUNDS; round++) {
      const list = outbox.load();
      if (!list.length) return;
      const idx = {};
      const get = (entity, id) => (idx[entity] ||= recordIndex(entity)).get(id) || null;
      const { batch, stale } = takeBatch(list, get);
      if (stale.length) outbox.save(ack(outbox.load(), stale));
      if (!batch.length) continue;
      const data = await call('push', { records: batch, lastSyncAt: store.getSyncState().lastSyncAt || 0 });
      applyAck(batch, data);
      publish();
    }
  }

  async function pullAll() {
    const since = store.getSyncState().cursor || 0;
    const data = await call('pull', { since });
    await mergeRemote(data.records || [], false);
    store.setSyncState({ cursor: Number(data.cursor) || since });
  }

  /* One round trip: first outbox batch + pull since cursor + whoami (server op 'sync').
     Returns false when the server predates op 'sync' (bad_op) → caller uses push/pull. */
  async function syncOnce() {
    const list = outbox.load();
    const idx = {};
    const get = (entity, id) => (idx[entity] ||= recordIndex(entity)).get(id) || null;
    const { batch, stale } = list.length ? takeBatch(list, get) : { batch: [], stale: [] };
    if (stale.length) outbox.save(ack(outbox.load(), stale));
    const st = store.getSyncState();
    const since = st.cursor || 0;
    const body = { since, lastSyncAt: st.lastSyncAt || 0 };
    if (batch.length) body.records = batch;
    let data;
    try { data = await call('sync', body); }
    catch (e) { if (e && e.code === 'bad_op') { syncOp = false; return false; } throw e; }
    if (data.whoami) { try { onWhoami(data.whoami); } catch { /* UX only */ } }
    if (batch.length && data.push) { applyAck(batch, data.push); publish(); }
    const pulled = data.pull || {};
    await mergeRemote(pulled.records || []);
    store.setSyncState({ cursor: Number(pulled.cursor) || since });
    await pushAll();             // rest of a large outbox (> one batch); pulled next cycle
    return true;
  }

  function groupByEntity(records) {
    const by = {};
    for (const it of records) if (it && ENTITIES.includes(it.entity) && it.record) (by[it.entity] ||= []).push(it.record);
    return by;
  }

  async function mergeRemote(records) {
    const by = groupByEntity(records);
    for (const entity of Object.keys(by)) {
      const { list, changed } = merge(store.syncRecords(entity), by[entity], now());
      if (changed) store.applySyncRecords(entity, list);
      await yieldFn();
    }
  }

  /* §14.3 step 8: cursor_too_old → snapshot, drop synced-and-missing, re-push the rest. */
  async function resyncAll(purgedBefore) {
    const snap = await call('pull', { snapshot: true });
    const by = groupByEntity(snap.records || []);
    const ob = outbox.load();
    const toPush = [];
    for (const entity of ENTITIES) {
      const local = store.syncRecords(entity);
      if (!local.length && !by[entity]) continue;
      const outboxIds = new Set(ob.filter(o => o.entity === entity).map(o => o.id));
      const { list, push } = resync(local, by[entity] || [], { now: now(), purgedBefore: Number(purgedBefore) || 0, outboxIds });
      store.applySyncRecords(entity, list);
      push.forEach(record => toPush.push({ entity, record }));
      await yieldFn();
    }
    for (let i = 0; i < toPush.length; i += BATCH_MAX_RECORDS) {
      const batch = toPush.slice(i, i + BATCH_MAX_RECORDS);
      const data = await call('push', { records: batch, lastSyncAt: now() });
      applyAck(batch, data);
    }
    outbox.save([]);
    store.setSyncState({ cursor: Number(snap.cursor) || 0 });
  }

  function fail(e) {
    if (e && e.status === 401) { auth.clearToken(); error = null; attempt = 0; return; }   // re-auth prompt, no storm
    if (e && e.code === 'no_consent') { store.setSyncState({ consentVersion: undefined }); error = null; return; }
    error = (e && e.code) || 'error';
    const at = nextRetryAt(now(), attempt, { status: e && e.status, retryAfter: e && e.retryAfter }, rand());
    attempt += 1;
    if (at != null) { cancel(); schedule(at - now()); }
  }

  async function run() {
    if (running) { rerun = true; return status(); }
    const st = store.getSyncState();
    const me = email();
    if (!configured || !me || !auth.getToken()) return publish();
    if (st.pendingWithdraw && isOnline()) {
      try { await call('withdraw', { version: st.pendingWithdraw }); store.setSyncState({ pendingWithdraw: undefined }); }
      catch { /* retried next cycle; sync stays off anyway */ }
    }
    if (!consentOk(store.getSyncState(), me) || !isOnline()) return publish();
    running = true;
    publish();
    try {
      try {
        if (!(syncOp && await syncOnce())) {
          await pushAll();
          await pullAll();
        }
      } catch (e) {
        if (!e || e.code !== 'cursor_too_old') throw e;
        await resyncAll(e.data && e.data.purgedBefore);
      }
      store.setSyncState({ lastSyncAt: now(), boundEmail: me });
      attempt = 0;
      error = null;
    } catch (e) {
      fail(e);
    } finally {
      running = false;
    }
    if (rerun) { rerun = false; return run(); }
    return publish();
  }

  /** Local write happened (store emit): debounce a push if anything is queued. */
  function localWrite() {
    if (outbox.load().length && consentOk(store.getSyncState(), email()) && auth.getToken()) schedule(WRITE_DEBOUNCE_MS);
    else publish();
  }

  async function giveConsent() {
    await call('consent', { version: CONSENT_VERSION });
    store.setSyncState({ consentVersion: CONSENT_VERSION, consentAt: now(), consentEmail: email(), pendingWithdraw: undefined });
    publish();
    return run();
  }

  /** Stops sync immediately; server record best-effort now, retried later. */
  async function withdraw() {
    cancel();
    store.setSyncState({ consentVersion: undefined, consentAt: undefined, withdrawnAt: now(), pendingWithdraw: CONSENT_VERSION });
    publish();
    if (!auth.getToken() || !isOnline()) return { recorded: false };
    try {
      await call('withdraw', { version: CONSENT_VERSION });
      store.setSyncState({ pendingWithdraw: undefined });
      return { recorded: true };
    } catch { return { recorded: false }; }
  }

  /** FR027: server deletes every row for the token email; local data untouched; sync off. */
  async function deleteMe() {
    cancel();
    const data = await call('deleteMe', {});
    store.markAllUnsynced();
    store.setSyncState({ consentVersion: undefined, consentAt: undefined, cursor: 0, lastSyncAt: undefined, boundEmail: undefined, pendingWithdraw: undefined });
    error = null;
    publish();
    return data.deleted || {};
  }

  function signedOut() { cancel(); error = null; attempt = 0; publish(); }

  return { run, status, onStatus, publish, localWrite, giveConsent, withdraw, deleteMe, signedOut, schedule, call,
    _state: () => ({ attempt, error, timerAt: timer ? timerAt : null, syncOp }) };
}
