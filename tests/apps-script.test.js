/* T051 Apps Script pure lib (A024, A025, A029, A030, A036 unit). Loads lib.gs via vm. */
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { suite, test, eq } from './harness.js';

function load() {
  const ctx = { module: { exports: {} } };
  vm.createContext(ctx);
  vm.runInContext(readFileSync(new URL('../apps-script/lib.gs', import.meta.url), 'utf8'), ctx);
  return ctx.module.exports;
}

const NOW = 1_800_000_000_000;
const AUD = ['web-client.apps.googleusercontent.com'];
const claims = (o = {}) => ({ aud: AUD[0], iss: 'https://accounts.google.com', exp: String(NOW / 1000 + 600),
  email: 'Pat@Example.com', email_verified: 'true', ...o });
const rec = (id, updatedAt, o = {}) => ({ id, updatedAt, deviceId: 'd1', deleted: false, ...o });

export function runAppsScriptTests() {
  const L = load();
  suite('apps-script');

  test('access-token tokeninfo normalised and verified (popup sign-in)', () => {
    const info = { azp: AUD[0], aud: AUD[0], exp: String(NOW / 1000 + 600), email: 'Pat@Example.com', email_verified: 'true', scope: 'openid email' };
    eq(L.verifyClaims(L.accessTokenClaims(info), NOW, AUD).email, 'pat@example.com');
    eq(L.verifyClaims(L.accessTokenClaims({ ...info, aud: 'evil', azp: 'evil' }), NOW, AUD).code, 'bad_aud');
    eq(L.verifyClaims(L.accessTokenClaims({ ...info, exp: String(NOW / 1000 - 1) }), NOW, AUD).code, 'expired');
    eq(L.accessTokenClaims(null), null);
  });

  test('A024 verifyClaims: valid → lowercased email; wrong aud/iss, expired, unverified rejected', () => {
    const ok = L.verifyClaims(claims(), NOW, AUD);
    eq(ok.ok, true); eq(ok.email, 'pat@example.com');
    eq(L.verifyClaims(claims({ aud: 'evil' }), NOW, AUD).code, 'bad_aud');
    eq(L.verifyClaims(claims({ iss: 'evil.com' }), NOW, AUD).code, 'bad_iss');
    eq(L.verifyClaims(claims({ exp: String(NOW / 1000 - 1) }), NOW, AUD).code, 'expired');
    eq(L.verifyClaims(claims({ email_verified: 'false' }), NOW, AUD).code, 'unverified_email');
    eq(L.verifyClaims(null, NOW, AUD).ok, false);
  });

  test('A025 authorize: clinician ops only for CLINICIAN_EMAILS', () => {
    const cl = ['share@spmcdvo.net'];
    eq(L.authorize('push', 'pat@x.com', cl).ok, true);
    for (const op of ['approve', 'clinicianEdit', 'patients']) {
      eq(L.authorize(op, 'pat@x.com', cl).code, 'forbidden');
      eq(L.authorize(op, 'SHARE@spmcdvo.net', cl).ok, true);
    }
    eq(L.authorize('dropTables', 'share@spmcdvo.net', cl).code, 'bad_op');
  });

  test('A029 validatePayload: caps, entity whitelist, types, future skew > 24 h', () => {
    const body = recs => ({ op: 'push', idToken: 't', records: recs });
    eq(L.validatePayload(body([{ entity: 'weights', record: rec('a', NOW) }]), 100, NOW).ok, true);
    eq(L.validatePayload(body([]), 400 * 1024 + 1, NOW).code, 'too_large');
    eq(L.validatePayload(body(Array(201).fill({ entity: 'weights', record: rec('a', 1) })), 10, NOW).code, 'too_many');
    eq(L.validatePayload(body([{ entity: 'secrets', record: rec('a', 1) }]), 10, NOW).code, 'bad_entity');
    eq(L.validatePayload(body([{ entity: 'weights', record: rec('a', NOW + 24 * 3600e3 + 1) }]), 10, NOW).code, 'future_updatedAt');
    eq(L.validatePayload(body([{ entity: 'weights', record: rec('a', NOW + 3600e3) }]), 10, NOW).ok, true);
    eq(L.validatePayload(body([{ entity: 'weights', record: rec('a', 1, { note: 'x'.repeat(2049) }) }]), 10, NOW).code, 'bad_field');
    eq(L.validatePayload(body([{ entity: 'weights', record: rec('a', 1, { deleted: 'no' }) }]), 10, NOW).code, 'bad_deleted');
    eq(L.validatePayload({ op: 'push', records: [] }, 10, NOW).code, 'no_token');
    eq(L.validatePayload({ op: 'nope', idToken: 't' }, 10, NOW).code, 'bad_op');
  });

  test('lww: newer wins, tie → higher deviceId', () => {
    eq(L.lww(rec('a', 2), rec('a', 1)).updatedAt, 2);
    eq(L.lww(rec('a', 1, { deviceId: 'b' }), rec('a', 1, { deviceId: 'c' })).deviceId, 'c');
  });

  test('forcePendingLabs: patient lab → pending; unchanged approved kept; clinician untouched', () => {
    const lab = rec('l', 5, { values: { potassium: 5 }, status: 'approved', approvedBy: 'me', approvedAt: 1 });
    const p = L.forcePendingLabs('labs', lab, false, null);
    eq(p.status, 'pending'); eq(p.approvedBy, null);
    const stored = { ...lab, approvedBy: 'share@spmcdvo.net' };
    eq(L.forcePendingLabs('labs', lab, false, stored).approvedBy, 'share@spmcdvo.net');
    eq(L.forcePendingLabs('labs', { ...lab, values: { potassium: 6 } }, false, stored).status, 'pending');
    eq(L.forcePendingLabs('labs', lab, true, null).status, 'approved');
    const lim = L.forcePendingLabs('limits', rec('limits', 5, { value: { current: { k: 1, approvedBy: 'x' }, pending: null } }), false, null);
    eq(lim.value.current, null); eq(lim.value.pending.k, 1); eq(lim.value.pending.approvedBy, undefined);
  });

  test('A030 rateLimitDecision: 60/min, 600/day, retryAfter seconds', () => {
    eq(L.rateLimitDecision(59, 10, 0, 0, NOW).allow, true);
    const m = L.rateLimitDecision(60, 10, 0, 0, NOW);
    eq(m.allow, false); eq(m.retryAfter > 0 && m.retryAfter <= 60, true);
    eq(L.rateLimitDecision(1, 600, 0, 0, NOW).allow, false);
  });

  test('cursorTooOld: since or lastSyncAt before purgedBefore', () => {
    eq(L.cursorTooOld('pull', 5, null, 10), true);
    eq(L.cursorTooOld('pull', 0, null, 10), false);
    eq(L.cursorTooOld('push', 0, 5, 10), true);
    eq(L.cursorTooOld('pull', 5, null, 0), false);
  });

  test('server: never-synced old create survives resync', () => {
    const r = L.applyPush([{ entity: 'weights', record: rec('n', 1, { neverSynced: true }) }], {}, { purgedBefore: 100 });
    eq(r.upserts.length, 1); eq(r.upserts[0].record.neverSynced, undefined); eq(r.ignored.length, 0);
  });

  test('server: previously synced deleted record does not resurrect', () => {
    // purged: unknown id below watermark, not flagged → ignored
    const purged = L.applyPush([{ entity: 'weights', record: rec('x', 5) }], {}, { purgedBefore: 100 });
    eq(purged.upserts.length, 0); eq(purged.ignored.length, 1);
    // tombstone still stored and newer → stays, client gets the tombstone back
    const tomb = rec('x', 50, { deleted: true, deviceId: 'd2' });
    const r = L.applyPush([{ entity: 'weights', record: rec('x', 5) }], { 'weights|x': tomb }, { purgedBefore: 1 });
    eq(r.upserts.length, 0); eq(r.normalized[0].record.deleted, true);
  });

  test('applyPush: newer client edit replaces stored; labs normalized to pending', () => {
    const r = L.applyPush([{ entity: 'labs', record: rec('l', 9, { values: {}, status: 'approved' }) }],
      { 'labs|l': rec('l', 5, { values: { k: 1 }, status: 'pending' }) }, { purgedBefore: 0, isClinician: false });
    eq(r.upserts[0].record.status, 'pending'); eq(r.normalized.length, 1);
  });

  test('A036 approve / clinicianEdit stamp clinician email and bump updatedAt', () => {
    const a = L.approveRecord('labs', rec('l', NOW + 5, { status: 'pending' }), 'approved', 'share@spmcdvo.net', NOW);
    eq(a.status, 'approved'); eq(a.approvedBy, 'share@spmcdvo.net'); eq(a.updatedAt, NOW + 6);
    const lim = L.approveRecord('limits', rec('limits', 1, { value: { current: null, pending: { k: 2 } } }), 'approved', 'c@x', NOW);
    eq(lim.value.current.k, 2); eq(lim.value.pending, null);
    const e = L.clinicianEditRecord('limits', rec('limits', 1, { value: { pending: { k: 3 } } }), 'c@x', NOW);
    eq(e.value.current.k, 3); eq(e.value.current.approvedBy, 'c@x');
  });

  test('A039 retention: 1 year inactivity; sheet edit trusted as approved', () => {
    eq(L.retentionExpired(NOW - 366 * 86400e3, NOW), true);
    eq(L.retentionExpired(NOW - 364 * 86400e3, NOW), false);
    eq(L.tombstonePurgeCutoff(NOW), NOW - 365 * 86400e3);
    const s = L.sheetEditStamp('labs', { id: 'l', values: {} }, NOW, 7);
    eq(s.record.approvedBy, 'sheet edit'); eq(s.serverSeq, 7); eq(s.record.deleted, false);
  });

  test('T060 whoami any user; patientRecords clinician only, needs target email', () => {
    eq(L.authorize('whoami', 'pat@x', ['share@spmcdvo.net']).ok, true);
    eq(L.authorize('patientRecords', 'pat@x', ['share@spmcdvo.net']).code, 'forbidden');
    eq(L.authorize('patientRecords', 'share@spmcdvo.net', ['share@spmcdvo.net']).ok, true);
    eq(L.validatePayload({ op: 'patientRecords', idToken: 't' }, 10, NOW).code, 'bad_email');
    eq(L.validatePayload({ op: 'patientRecords', idToken: 't', email: 'p@x' }, 10, NOW).ok, true);
  });

  test('A019 consentGiven: latest row per email decides; withdrawn blocks; other emails ignored', () => {
    eq(L.consentGiven([], 'p@x'), false);
    eq(L.consentGiven([['p@x', 'v1', 1, 'given']], 'p@x'), true);
    eq(L.consentGiven([['p@x', 'v1', 1, 'given'], ['p@x', 'v1', 2, 'withdrawn']], 'p@x'), false);
    eq(L.consentGiven([['P@X', 'v1', 3, 'given'], ['p@x', 'v1', 2, 'withdrawn']], 'p@x'), true);
    eq(L.consentGiven([['q@x', 'v1', 1, 'given']], 'p@x'), false);
  });

  test('T055b retention constants fixed at 365 days; tombstone older than cutoff is purgeable', () => {
    eq(L.LIB.RETENTION_DAYS, 365);
    const cutoff = L.tombstonePurgeCutoff(NOW, L.LIB.RETENTION_DAYS);
    eq(NOW - 366 * 86400e3 < cutoff, true);
    eq(NOW - 10 * 86400e3 < cutoff, false);
    eq(L.cursorTooOld('pull', cutoff - 1, null, cutoff), true);
  });

  // 2026-07-27 23:30 UTC = 2026-07-28 07:30 Manila
  const T = Date.UTC(2026, 6, 27, 23, 30);

  test('view: manilaDateTime is UTC+8 and empty for bad input', () => {
    const d = L.manilaDateTime(T);
    eq(d.date, '2026-07-28'); eq(d.time, '07:30');
    eq(L.manilaDateTime(null).date, ''); eq(L.manilaDateTime('x').time, '');
  });

  test('view: fluid row = date, time, name, email, ml, drink, details', () => {
    const r = L.viewRows('intake', rec('i1', T, { ts: T, day: '2026-07-28', ml: 250, labelKey: 'water' }), 'Juan', 'j@x');
    eq(r.length, 1);
    eq(JSON.stringify(r[0]), JSON.stringify(['2026-07-28', '07:30', 'Juan', 'j@x', 250, 'water', '']));
    eq(L.viewHeader('intake').length, r[0].length);
  });

  test('view: name falls back to email; tombstones produce no rows', () => {
    eq(L.viewRows('weights', rec('w', T, { ts: T, kg: 61.2 }), '', 'j@x')[0][2], 'j@x');
    eq(L.viewRows('weights', rec('w', T, { ts: T, kg: 61.2, deleted: true }), 'J', 'j@x').length, 0);
  });

  test('view: unknown fields go to Details, never dropped', () => {
    const r = L.viewRows('weights', rec('w', T, { ts: T, kg: 60, mood: 'ok', extra: { a: 1 } }), 'J', 'j@x')[0];
    eq(r[r.length - 1], 'extra: {"a":1}; mood: ok');
    eq(L.viewDetails({ id: 'x', updatedAt: 1, b: 2, a: null }, []), 'b: 2');
  });

  test('view: dialysis, labs, diet key fields', () => {
    const s = L.viewRows('sessions', rec('s', T, { ts: T, preKg: 63, postKg: 61, ufL: 2, bpSys: 130, bpDia: 80 }), 'J', 'j@x')[0];
    eq(JSON.stringify(s.slice(4, 9)), '[63,61,2,130,80]');
    const l = L.viewRows('labs', rec('l', T, { ts: T, date: '2026-07-20', values: { K: 5.1 }, units: { K: 'mmol/L' },
      status: 'approved', approvedBy: 'share@spmcdvo.net', approvedAt: T, origin: 'ocr' }), 'J', 'j@x')[0];
    eq(l[4], '2026-07-20'); eq(l[5], 'K: 5.1 mmol/L'); eq(l[6], 'approved'); eq(l[7], 'share@spmcdvo.net');
    eq(l[8], '2026-07-28 07:30'); eq(l[9], 'origin: ocr');
    const d = L.viewRows('dietLog', rec('d', T, { ts: T, name: 'Rice', grams: 200, source: 'fdc', ref: '1',
      per100: { na: 5, k: 35, p: 43, protein: 2.7, water: 68 } }), 'J', 'j@x')[0];
    eq(JSON.stringify(d.slice(4, 12)), '["Rice",200,10,70,86,5.4,136,"fdc"]');
    eq(d[12], 'ref: 1');
  });

  test('view: medLogs/checklist expand per day; profile row', () => {
    const m = L.viewRows('medLogs', rec('medLogs', T, { value: { '2026-07-28': { m1_default: true, m2_default: false } } }), 'J', 'j@x');
    eq(m.length, 2); eq(m[0][0], '2026-07-28'); eq(m[0][4], 'm1_default'); eq(m[0][5], 'yes'); eq(m[1][5], 'no');
    const c = L.viewRows('checklist', rec('checklist', T, { value: { '2026-07-28': [{ id: 'chk-1', text: 'Weigh', done: true }] } }), 'J', 'j@x');
    eq(c[0][4], 'Weigh'); eq(c[0][5], 'yes'); eq(c[0][6], 'id: chk-1');
    const p = L.viewRows('profile', rec('profile', T, { value: { name: 'Juan', dryWeightKg: 60, allowanceMl: 1000, foo: 'bar' } }), 'Juan', 'j@x')[0];
    eq(p[0], '2026-07-28'); eq(p[4], 60); eq(p[p.length - 1], 'foo: bar');
  });

  test('view: buildView sorts by date, then patient name, then time', () => {
    const at = (h, d = 28) => Date.UTC(2026, 6, d - 1, h - 8 + 24, 0);
    const raw = [
      { email: 'b@x', rec: rec('1', 1, { ts: at(9), kg: 1 }) },
      { email: 'a@x', rec: rec('2', 1, { ts: at(10), kg: 2 }) },
      { email: 'a@x', rec: rec('3', 1, { ts: at(8), kg: 3 }) },
      { email: 'b@x', rec: rec('4', 1, { ts: at(7, 27), kg: 4 }) },
    ];
    const v = L.buildView('weights', raw, { 'a@x': 'Ana', 'b@x': 'Ben' });
    eq(v.tab, 'Weight');
    eq(JSON.stringify(v.rows.map(r => r[4])), '[4,3,2,1]');
    const tabs = Object.values(L.VIEWS).map(x => x.tab.toLowerCase());
    eq(tabs.some(t => L.LIB.ENTITIES.map(e => e.toLowerCase()).includes(t)), false);
  });
}
