/* T054/T057/T059 sync transport, auth token handling and engine.
   Fake server + fake clock; no network. A019, A021, A030, A033, A034. */
import { suite, test, eq } from './harness.js';
import { call, interpret, SyncError } from '../js/sync/api.js';
import { createEngine, computeStatus } from '../js/sync/engine.js';
import { CONSENT_VERSION } from '../js/sync/config.js';
import { decodeJwt, tokenFresh, setCredential, getToken, clearToken, currentUser } from '../js/auth/gis.js';

const b64 = o => Buffer.from(JSON.stringify(o)).toString('base64url');
const jwt = claims => `h.${b64(claims)}.sig`;

function fakeWorld({ consent = true, email = 'pat@x' } = {}) {
  let t = 1_000_000;
  const data = { weights: [{ id: 'w1', kg: 60, updatedAt: 10, deviceId: 'd', deleted: false }] };
  let ob = [{ entity: 'weights', id: 'w1' }];
  let st = consent ? { consentVersion: CONSENT_VERSION, consentEmail: email } : {};
  const server = { rows: {}, seq: 0, calls: [], fail: null, purgedBefore: 0 };
  const timers = [];
  let token = 'tok';
  let unsyncedCalled = 0;
  const api = async (op, body, idToken) => {
    server.calls.push(op);
    if (server.fail) { const f = server.fail; server.fail = f.once ? null : f; throw f.err; }
    if (!idToken) throw new SyncError('auth', { status: 401 });
    if (op === 'push') {
      if (server.purgedBefore && body.lastSyncAt && body.lastSyncAt < server.purgedBefore)
        throw new SyncError('cursor_too_old', { data: { purgedBefore: server.purgedBefore } });
      for (const it of body.records) { const { neverSynced, syncedAt, ...r } = it.record; server.rows[it.entity + '|' + r.id] = { entity: it.entity, record: r, seq: ++server.seq }; }
      return { accepted: body.records.map(r => ({ entity: r.entity, id: r.record.id })), ignored: [], normalized: [], cursor: server.seq };
    }
    if (op === 'pull') {
      const rows = Object.values(server.rows).filter(r => body.snapshot || r.seq > (body.since || 0));
      return { records: rows.map(r => ({ entity: r.entity, record: r.record })), cursor: server.seq };
    }
    return {};
  };
  const engine = createEngine({
    api,
    store: {
      syncRecords: e => (data[e] || []).map(r => ({ ...r })),
      applySyncRecords: (e, list) => { data[e] = list.map(r => ({ ...r })); return true; },
      getSyncState: () => ({ ...st }),
      setSyncState: p => { st = { ...st, ...p }; for (const k of Object.keys(st)) if (st[k] === undefined) delete st[k]; return st; },
      markAllUnsynced: () => { unsyncedCalled++; }
    },
    outbox: { load: () => ob.slice(), save: l => { ob = l.slice(); } },
    auth: { getToken: () => token, user: () => (token || email ? { email } : null), clearToken: () => { token = null; } },
    now: () => t, isOnline: () => true, rand: () => 0,
    setTimer: (fn, ms) => { timers.push({ fn, ms }); return timers.length; }, clearTimer: () => {},
    yieldFn: async () => {}
  });
  return { engine, data, server, timers, get ob() { return ob; }, get st() { return st; }, set token(v) { token = v; }, get token() { return token; },
    tick: ms => { t += ms; }, get unsynced() { return unsyncedCalled; } };
}

export async function runSyncEngineTests() {
  suite('sync-api');
  test('interpret: ok → data; 401/403/429/cursor_too_old mapped', () => {
    eq(interpret({ ok: true, data: { a: 1 } }).a, 1);
    const err = j => { try { interpret(j); } catch (e) { return e; } return null; };
    eq(err({ ok: false, code: 401 }).status, 401);
    eq(err({ ok: false, code: 403 }).code, 'forbidden');
    const rl = err({ ok: false, code: 429, data: { retryAfter: 30 } });
    eq(rl.status, 429); eq(rl.retryAfter, 30);
    const c = err({ ok: false, code: 'cursor_too_old', data: { purgedBefore: 5 } });
    eq(c.code, 'cursor_too_old'); eq(c.data.purgedBefore, 5);
    eq(err(null).code, 'bad_response');
  });

  let seen = null;
  const okFetch = async (url, init) => { seen = { url, init }; return { ok: true, status: 200, json: async () => ({ ok: true, code: 'ok', data: { x: 1 } }) }; };
  const out = await call('pull', { since: 3 }, { idToken: 'T', fetchImpl: okFetch, url: 'https://script.google.com/x/exec' });
  test('call: text/plain POST, op + token in body, no credentials', () => {
    eq(out.x, 1);
    eq(seen.init.method, 'POST');
    eq(seen.init.headers['Content-Type'].startsWith('text/plain'), true);
    eq(seen.init.credentials, 'omit');
    const b = JSON.parse(seen.init.body);
    eq(b.op, 'pull'); eq(b.idToken, 'T'); eq(b.since, 3);
  });
  const errOf = async p => { try { await p; } catch (e) { return e; } return null; };
  const off = await errOf(call('pull', {}, { idToken: 'T', fetchImpl: async () => { throw new TypeError('Failed to fetch'); }, url: 'u' }));
  const noTok = await errOf(call('pull', {}, { idToken: null, fetchImpl: okFetch, url: 'u' }));
  const http = await errOf(call('pull', {}, { idToken: 'T', fetchImpl: async () => ({ ok: false, status: 500 }), url: 'u' }));
  test('call: network error → offline; no token → 401 without fetch; HTTP 500 → http_500', () => {
    eq(off.code, 'offline'); eq(noTok.status, 401); eq(http.code, 'http_500');
  });

  suite('auth-gis');
  test('decodeJwt reads payload; garbage → null', () => {
    eq(decodeJwt(jwt({ email: 'a@b', exp: 5 })).email, 'a@b');
    eq(decodeJwt('nope'), null);
  });
  test('tokenFresh: false within 60 s of exp', () => {
    eq(tokenFresh({ exp: 1000 }, 1000 * 1000 - 61000), true);
    eq(tokenFresh({ exp: 1000 }, 1000 * 1000 - 59000), false);
  });
  test('A033 token memory only: getToken null after expiry and after clearToken; nothing in localStorage', () => {
    const exp = Math.floor(Date.now() / 1000) + 3600;
    eq(setCredential(jwt({ email: 'Pat@X', exp })), true);
    eq(currentUser().email, 'pat@x');
    eq(!!getToken(), true);
    eq(getToken(Date.now() + 3600 * 1000), null);
    let leaked = false;
    for (let i = 0; i < localStorage.length; i++) if (String(localStorage.getItem(localStorage.key(i))).includes(getToken())) leaked = true;
    eq(leaked, false);
    clearToken();
    eq(getToken(), null); eq(currentUser(), null);
  });

  suite('sync-engine');
  test('A034 computeStatus: off / signin / consent / offline / pending / synced / error', () => {
    const b = { configured: true, user: { email: 'p' }, hasToken: true, consentOk: true, online: true, pending: 0, lastSyncAt: 5, error: null, running: false };
    eq(computeStatus({ ...b, user: null }).state, 'off');
    eq(computeStatus({ ...b, configured: false }).state, 'off');
    eq(computeStatus({ ...b, hasToken: false }).state, 'signin');
    eq(computeStatus({ ...b, consentOk: false }).state, 'consent');
    eq(computeStatus({ ...b, online: false }).state, 'offline');
    eq(computeStatus({ ...b, pending: 3 }).state, 'pending');
    eq(computeStatus({ ...b, pending: 3 }).pending, 3);
    eq(computeStatus(b).state, 'synced');
    eq(computeStatus({ ...b, error: 'offline' }).state, 'error');
  });

  {
    const w = fakeWorld({ consent: false });
    await w.engine.run();
    test('A019 signed in without consent → no sync request', () => {
      eq(w.server.calls.filter(c => c === 'push' || c === 'pull').length, 0);
      eq(w.engine.status().state, 'consent');
    });
    await w.engine.giveConsent();
    test('A019 consent → consent op recorded, then push + pull', () => {
      eq(w.server.calls[0], 'consent');
      eq(w.st.consentVersion, CONSENT_VERSION); eq(w.st.consentEmail, 'pat@x');
      eq(w.server.calls.includes('push'), true);
    });
  }

  {
    const w = fakeWorld();
    w.server.rows['intake|i9'] = { entity: 'intake', record: { id: 'i9', ml: 200, updatedAt: 50, deviceId: 'other', deleted: false }, seq: 99 };
    w.server.seq = 99;
    await w.engine.run();
    test('A021 cycle: outbox drained, push acked (syncedAt), remote pulled + merged, cursor saved', () => {
      eq(w.ob.length, 0);
      eq(Number.isFinite(w.data.weights[0].syncedAt), true);
      eq(w.data.intake[0].id, 'i9');
      eq(w.st.cursor, w.server.seq);
      eq(w.engine.status().state, 'synced');
      eq(w.st.boundEmail, 'pat@x');
    });
  }

  {
    const w = fakeWorld();
    w.server.fail = { err: new SyncError('offline'), once: false };
    await w.engine.run(); await w.engine.run(); await w.engine.run();
    test('A021 transient failures: retry delay grows exponentially (rand=0 → 0.5×)', () => {
      eq(w.timers.map(x => x.ms).join(), '500,1000,2000');
      eq(w.engine.status().state, 'error');
      eq(w.ob.length, 1);
    });
  }

  {
    const w = fakeWorld();
    w.server.fail = { err: new SyncError('rate_limited', { status: 429, retryAfter: 42 }), once: true };
    await w.engine.run();
    test('A030 429 → retry exactly after server retryAfter', () => eq(w.timers[0].ms, 42000));
  }

  {
    const w = fakeWorld();
    w.server.fail = { err: new SyncError('auth', { status: 401 }), once: true };
    await w.engine.run();
    test('401 → token dropped, no retry storm, status signin', () => {
      eq(w.token, null); eq(w.timers.length, 0); eq(w.engine.status().state, 'signin');
    });
  }

  {
    const w = fakeWorld();
    w.st.lastSyncAt = 5; w.server.purgedBefore = 100;
    await w.engine.run();
    test('cursor_too_old → snapshot pull, never-synced record re-pushed, outbox cleared', () => {
      eq(w.server.calls.join(), 'push,pull,push');
      eq(!!w.server.rows['weights|w1'], true);
      eq(w.ob.length, 0);
      eq(Number.isFinite(w.data.weights[0].syncedAt), true);
    });
  }

  {
    const w = fakeWorld();
    const realPush = w.engine.call;
    // simulate an edit landing while the push is in flight
    w.server.fail = null;
    let edited = false;
    const origApplyEdit = () => { if (edited) return; edited = true; w.data.weights[0] = { ...w.data.weights[0], kg: 61, updatedAt: 20 }; };
    const api0 = w.server;
    w.server.calls.push = function (op) { Array.prototype.push.call(this, op); if (op === 'push') origApplyEdit(); return this.length; };
    await w.engine.run();
    test('record edited during push is not acked at the old version; new version re-pushed same cycle', () => {
      eq(w.server.calls.filter(c => c === 'push').length, 2);
      eq(w.server.rows['weights|w1'].record.kg, 61);
      eq(w.data.weights[0].kg, 61);
      eq(w.ob.length, 0);
    });
    void realPush; void api0;
  }

  {
    const w = fakeWorld();
    await w.engine.run();
    const n = w.server.calls.length;
    const r = await w.engine.withdraw();
    w.data.weights.push({ id: 'w2', kg: 1, updatedAt: 30, deviceId: 'd', deleted: false });
    w.engine.localWrite();
    await w.engine.run();
    test('A037 withdraw: recorded server-side, sync stops, later writes not sent', () => {
      eq(r.recorded, true);
      eq(w.server.calls.slice(n).join(), 'withdraw');
      eq(w.st.consentVersion, undefined);
      eq(w.engine.status().state, 'consent');
    });
  }

  {
    const w = fakeWorld();
    w.server.fail = { err: new SyncError('offline'), once: true };
    const r = await w.engine.withdraw();
    await w.engine.run();
    test('A037 withdraw offline → retried on next cycle', () => {
      eq(r.recorded, false);
      eq(w.server.calls.filter(c => c === 'withdraw').length, 2);
      eq(w.st.pendingWithdraw, undefined);
    });
  }

  {
    const w = fakeWorld();
    await w.engine.run();
    await w.engine.deleteMe();
    test('A028 deleteMe → server op, local kept + marked unsynced, consent + cursor cleared', () => {
      eq(w.server.calls.includes('deleteMe'), true);
      eq(w.unsynced, 1);
      eq(w.data.weights.length, 1);
      eq(w.st.consentVersion, undefined); eq(w.st.cursor, 0);
    });
  }

  {
    const w = fakeWorld();
    w.token = null;
    await w.engine.run();
    test('A033 no token → no request at all', () => eq(w.server.calls.length, 0));
  }
}
