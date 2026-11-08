/* ===================================================================
   Code.gs — SKTIDVO sync web app (plan §14.7). Bound to the owner's sheet.
   Deploy: Execute as Me, Who has access: Anyone. See README.md.
   Script Properties: WEB_CLIENT_ID, ANDROID_CLIENT_ID (optional),
   CLINICIAN_EMAILS (comma-separated). No secrets in the client.
   Pure logic lives in lib.gs.
   =================================================================== */

var COLS = ['email', 'id', 'updatedAt', 'deviceId', 'deleted', 'serverSeq', 'serverUpdatedAt', 'json'];
var C = { email: 0, id: 1, updatedAt: 2, deviceId: 3, deleted: 4, serverSeq: 5, serverUpdatedAt: 6, json: 7 };

/* ---------- entry points ---------- */

function doGet() {
  return json_({ ok: true, code: 'alive', data: { app: 'sktidvo' } });
}

function doPost(e) {
  var now = Date.now();
  var raw = (e && e.postData && e.postData.contents) || '';
  var body;
  try { body = JSON.parse(raw); } catch (err) { return json_({ ok: false, code: 'bad_json' }); }
  var v = validatePayload(body, raw.length, now);
  if (!v.ok) return json_({ ok: false, code: v.code, data: { index: v.index } });

  var claims = tokenClaims_(body.idToken);
  var who = verifyClaims(claims, now, allowedAuds_());
  if (!who.ok) return json_({ ok: false, code: 401, data: { reason: who.code } });
  var email = who.email;                     // email ONLY from the verified token

  var auth = authorize(body.op, email, clinicians_());
  if (!auth.ok) { audit_(email, body.op, 0, auth.code); return json_({ ok: false, code: 403, data: { reason: auth.code } }); }

  var rl = rateLimit_(email, now);
  if (!rl.allow) return json_({ ok: false, code: 429, data: { retryAfter: rl.retryAfter } });

  try {
    var out = route_(body, email, now);
    audit_(email, body.op, out.count || 0, out.ok ? 'ok' : out.code);
    return json_(out);
  } catch (err) {
    audit_(email, body.op, 0, 'error');
    return json_({ ok: false, code: 'server_error' });
  }
}

function route_(b, email, now) {
  var clin = isClinician(email, clinicians_());
  // C018 server-side gate: no data sync without a recorded consent.
  if ((b.op === 'push' || b.op === 'pull') && !consentGiven(consentRows_(), email)) return { ok: false, code: 'no_consent' };
  if (b.op === 'sync') return sync_(email, b, now, clin);
  switch (b.op) {
    case 'push': return push_(email, b, now, clin);
    case 'pull': return pull_(email, b);
    case 'approve': return approve_(email, b, now);
    case 'clinicianEdit': return clinicianEdit_(email, b, now);
    case 'patients': return patients_();
    case 'patientRecords': return patientRecords_(b);
    case 'whoami': return { ok: true, code: 'ok', data: { email: email, clinician: clin } };
    case 'consent': return consent_(email, b, now, 'given');
    case 'withdraw': return consent_(email, b, now, 'withdrawn');
    case 'deleteMe': return deleteMe_(email);
  }
  return { ok: false, code: 'bad_op' };
}

/* ---------- ops ---------- */

/** One round trip: token verified + rate-limited once (doPost), consent checked once,
    then push (reuses push_, same lock) BEFORE pull (reuses pull_). */
function sync_(email, b, now, clin) {
  var plan = syncSteps(b, consentGiven(consentRows_(), email));
  if (!plan.ok) return { ok: false, code: plan.code };
  var data = { whoami: { email: email, clinician: clin } };
  var count = 0;
  for (var i = 0; i < plan.steps.length; i++) {
    var r = plan.steps[i] === 'push' ? push_(email, b, now, clin) : pull_(email, b);
    if (!r.ok) return { ok: false, code: r.code, data: r.data };
    data[plan.steps[i]] = r.data;
    count += r.count || 0;
  }
  data.cursor = data.pull.cursor;
  return { ok: true, code: 'ok', count: count, data: data };
}

function push_(email, b, now, clin) {
  var purgedBefore = watermark_(email);
  if (cursorTooOld('push', 0, b.lastSyncAt, purgedBefore)) return { ok: false, code: 'cursor_too_old', data: { purgedBefore: purgedBefore } };
  return withLock_(function () {
    var existing = {}, where = {};
    var ents = {};
    b.records.forEach(function (it) { ents[it.entity] = true; });
    Object.keys(ents).forEach(function (ent) {
      var rows = rowsFor_(ent, email);
      rows.forEach(function (r) { existing[ent + '|' + r.rec.id] = r.rec; where[ent + '|' + r.rec.id] = r.row; });
    });
    var res = applyPush(b.records, existing, { purgedBefore: purgedBefore, isClinician: clin });
    res.upserts.forEach(function (u) {
      var key = u.entity + '|' + u.record.id;
      writeRow_(u.entity, email, u.record, nextSeq_(), now, where[key]);
    });
    if (res.upserts.length) refreshViews_(Object.keys(ents));
    return { ok: true, code: 'ok', count: res.upserts.length,
      data: { accepted: res.accepted, ignored: res.ignored, normalized: res.normalized, cursor: currentSeq_() } };
  });
}

function pull_(email, b) {
  var since = b.since || 0;
  var purgedBefore = watermark_(email);
  var snapshot = !!b.snapshot;
  if (!snapshot && cursorTooOld('pull', since, null, purgedBefore)) return { ok: false, code: 'cursor_too_old', data: { purgedBefore: purgedBefore } };
  var out = [];
  LIB.ENTITIES.forEach(function (ent) {
    rowsFor_(ent, email).forEach(function (r) {
      if (snapshot || r.seq > since) out.push({ entity: ent, record: r.rec });
    });
  });
  return { ok: true, code: 'ok', count: out.length, data: { records: out, cursor: currentSeq_(), purgedBefore: purgedBefore } };
}

function approve_(clinEmail, b, now) {
  return withLock_(function () {
    var target = String(b.email).toLowerCase();
    var hit = rowsFor_(b.entity, target).filter(function (r) { return r.rec.id === b.id; })[0];
    if (!hit) return { ok: false, code: 'not_found' };
    var rec = approveRecord(b.entity, hit.rec, b.status, clinEmail, now);
    writeRow_(b.entity, target, rec, nextSeq_(), now, hit.row);
    refreshViews_([b.entity]);
    return { ok: true, code: 'ok', count: 1, data: { record: rec } };
  });
}

function clinicianEdit_(clinEmail, b, now) {
  return withLock_(function () {
    var target = String(b.email).toLowerCase();
    var hit = rowsFor_(b.entity, target).filter(function (r) { return r.rec.id === b.record.id; })[0];
    var rec = clinicianEditRecord(b.entity, b.record, clinEmail, now);
    writeRow_(b.entity, target, rec, nextSeq_(), now, hit && hit.row);
    refreshViews_([b.entity]);
    return { ok: true, code: 'ok', count: 1, data: { record: rec } };
  });
}

function patients_() {
  var names = {};
  rowsFor_('profile', null).forEach(function (r) {
    names[r.email] = (r.rec.value && r.rec.value.name) || '';
  });
  var list = Object.keys(names).map(function (e) { return { email: e, name: names[e] }; });
  return { ok: true, code: 'ok', count: list.length, data: { patients: list } };
}

/** Clinician only (authorize): one patient's labs + limits for the approval UI. */
function patientRecords_(b) {
  var target = String(b.email).toLowerCase();
  var out = [];
  ['labs', 'limits', 'profile'].forEach(function (ent) {
    rowsFor_(ent, target).forEach(function (r) { if (!r.rec.deleted) out.push({ entity: ent, record: r.rec }); });
  });
  return { ok: true, code: 'ok', count: out.length, data: { records: out } };
}

function consent_(email, b, now, state) {
  return withLock_(function () {
    sheet_('consent').appendRow([email, String(b.version || ''), now, state]);
    return { ok: true, code: 'ok', count: 1 };
  });
}

function consentRows_() {
  var sh = sheet_('consent');
  var last = sh.getLastRow();
  return last < 2 ? [] : sh.getRange(2, 1, last - 1, 4).getValues();
}

function deleteMe_(email) {
  return withLock_(function () {
    var counts = {};
    LIB.ENTITIES.concat(['consent']).forEach(function (name) {
      counts[name] = deleteRowsWhere_(sheet_(name), function (row) { return row[0] === email; });
    });
    refreshViews_(LIB.ENTITIES);
    return { ok: true, code: 'ok', count: 1, data: { deleted: counts } };
  });
}

/* ---------- token ---------- */

function tokenClaims_(idToken) {
  var cache = CacheService.getScriptCache();
  var key = 'tok:' + Utilities.base64EncodeWebSafe(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, idToken));
  var hit = cache.get(key);
  if (hit) return JSON.parse(hit);
  // "at:" = OAuth access token from the app's own sign-in button; otherwise an ID token.
  var isAccess = idToken.indexOf('at:') === 0;
  var url = isAccess
    ? 'https://oauth2.googleapis.com/tokeninfo?access_token=' + encodeURIComponent(idToken.slice(3))
    : 'https://oauth2.googleapis.com/tokeninfo?id_token=' + encodeURIComponent(idToken);
  var res = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
  if (res.getResponseCode() !== 200) return null;
  var claims = JSON.parse(res.getContentText());
  if (isAccess) claims = accessTokenClaims(claims);
  var ttl = Math.floor(Number(claims.exp) - Date.now() / 1000);
  if (ttl > 5) cache.put(key, JSON.stringify(claims), Math.min(ttl, 21600));
  return claims;
}

function allowedAuds_() {
  var p = PropertiesService.getScriptProperties();
  return [p.getProperty('WEB_CLIENT_ID'), p.getProperty('ANDROID_CLIENT_ID')].filter(function (x) { return !!x; });
}

function clinicians_() {
  return String(PropertiesService.getScriptProperties().getProperty('CLINICIAN_EMAILS') || '')
    .split(',').map(function (s) { return s.trim().toLowerCase(); }).filter(function (s) { return !!s; });
}

/* ---------- rate limit (soft if the lock is busy) ---------- */

function rateLimit_(email, now) {
  var cache = CacheService.getScriptCache();
  var mk = 'rl:' + email + ':' + Math.floor(now / 60000);
  var dk = 'rld:' + email + ':' + Math.floor(now / 86400000);
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(2000)) return { allow: true };     // SOFT limit (plan §14.7)
  try {
    var m = Number(cache.get(mk) || 0), d = Number(cache.get(dk) || 0);
    var dec = rateLimitDecision(m, d, 0, 0, now);
    if (dec.allow) { cache.put(mk, String(m + 1), 120); cache.put(dk, String(d + 1), 21600); }
    return dec;
  } finally { lock.releaseLock(); }
}

/* ---------- sheet IO ---------- */

function withLock_(fn) {
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try { return fn(); } finally { lock.releaseLock(); }
}

function sheet_(name) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  return ss.getSheetByName(name) || ss.insertSheet(name);
}

/** Rows for an entity; email null = all patients. */
function rowsFor_(entity, email) {
  var sh = sheet_(entity);
  var last = sh.getLastRow();
  if (last < 2) return [];
  var vals = sh.getRange(2, 1, last - 1, COLS.length).getValues();
  var out = [];
  for (var i = 0; i < vals.length; i++) {
    var v = vals[i];
    if (email && v[C.email] !== email) continue;
    var rec;
    try { rec = JSON.parse(v[C.json] || '{}'); } catch (err) { continue; }
    rec.id = String(v[C.id]);
    rec.updatedAt = Number(v[C.updatedAt]);
    rec.deviceId = String(v[C.deviceId]);
    rec.deleted = v[C.deleted] === true || v[C.deleted] === 'TRUE';
    out.push({ row: i + 2, email: v[C.email], seq: Number(v[C.serverSeq]) || 0, rec: rec });
  }
  return out;
}

function writeRow_(entity, email, rec, seq, now, row) {
  var sh = sheet_(entity);
  var data = {};
  for (var k in rec) if (['id', 'updatedAt', 'deviceId', 'deleted', 'syncedAt', 'neverSynced'].indexOf(k) < 0) data[k] = rec[k];
  var line = [email, rec.id, rec.updatedAt, rec.deviceId, !!rec.deleted, seq, now, JSON.stringify(data)];
  if (row) sh.getRange(row, 1, 1, COLS.length).setValues([line]);
  else sh.appendRow(line);
}

function deleteRowsWhere_(sh, pred) {
  var last = sh.getLastRow();
  if (last < 2) return 0;
  var vals = sh.getRange(2, 1, last - 1, sh.getLastColumn()).getValues();
  var n = 0;
  for (var i = vals.length - 1; i >= 0; i--) if (pred(vals[i])) { sh.deleteRow(i + 2); n++; }
  return n;
}

function meta_(key, value) {
  var sh = sheet_('meta');
  var last = sh.getLastRow();
  var vals = last >= 1 ? sh.getRange(1, 1, last, 2).getValues() : [];
  for (var i = 0; i < vals.length; i++) if (vals[i][0] === key) {
    if (value === undefined) return vals[i][1];
    sh.getRange(i + 1, 2).setValue(value); return value;
  }
  if (value === undefined) return null;
  sh.appendRow([key, value]);
  return value;
}

function currentSeq_() { return Number(meta_('serverSeq') || 0); }
function nextSeq_() { return meta_('serverSeq', currentSeq_() + 1); }   // caller holds the script lock
function watermark_(email) { return Number(meta_('purgedBefore:' + email) || 0); }

function audit_(email, op, count, result) {
  try { sheet_('audit').appendRow([new Date(), email, op, count, String(result)]); } catch (err) { /* never fail a request on audit */ }
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

/* ---------- setup + daily job (owner runs setup() once) ---------- */

function setup() {
  LIB.ENTITIES.forEach(function (ent) {
    var sh = sheet_(ent);
    if (sh.getLastRow() === 0) { sh.appendRow(COLS); sh.setFrozenRows(1); }
  });
  [['consent', ['email', 'version', 'at', 'state']], ['audit', ['at', 'email', 'op', 'count', 'result']]].forEach(function (t) {
    var sh = sheet_(t[0]);
    if (sh.getLastRow() === 0) { sh.appendRow(t[1]); sh.setFrozenRows(1); }
  });
  sheet_('meta');
  if (meta_('serverSeq') === null) meta_('serverSeq', 0);
  ScriptApp.getProjectTriggers().forEach(function (t) { ScriptApp.deleteTrigger(t); });
  ScriptApp.newTrigger('dailyJob').timeBased().everyDays(1).atHour(3).create();
  ScriptApp.newTrigger('onSheetEdit').forSpreadsheet(SpreadsheetApp.getActive()).onEdit().create();
}

/** Daily: 1-year inactivity deletion, tombstone purge + watermark, sweep untagged sheet edits. */
function dailyJob() {
  var now = Date.now();
  withLock_(function () {
    sweepSheetEdits_(now);
    var last = {};
    LIB.ENTITIES.forEach(function (ent) {
      sheet_(ent).getDataRange().getValues().slice(1).forEach(function (v) {
        last[v[C.email]] = Math.max(last[v[C.email]] || 0, Number(v[C.serverUpdatedAt]) || 0);
      });
    });
    var cutoff = tombstonePurgeCutoff(now, LIB.RETENTION_DAYS);
    Object.keys(last).forEach(function (email) {
      if (!email) return;
      if (retentionExpired(last[email], now, LIB.RETENTION_DAYS)) {
        LIB.ENTITIES.concat(['consent']).forEach(function (n) { deleteRowsWhere_(sheet_(n), function (r) { return r[0] === email; }); });
        audit_(email, 'retentionDelete', 0, 'ok');
        return;
      }
      var purged = 0;
      LIB.ENTITIES.forEach(function (ent) {
        purged += deleteRowsWhere_(sheet_(ent), function (r) {
          return r[C.email] === email && (r[C.deleted] === true || r[C.deleted] === 'TRUE') && Number(r[C.updatedAt]) < cutoff;
        });
      });
      if (purged) { meta_('purgedBefore:' + email, Math.max(watermark_(email), cutoff)); audit_(email, 'tombstonePurge', purged, 'ok'); }
    });
    refreshViews_(LIB.ENTITIES);
  });
}

/* ---------- trusted sheet edits (T056, OQ-12) ----------
   Installable onEdit: stamps the edited row so devices pull it, and records the
   editor. UNVERIFIED: whether e.user / Session.getActiveUser() returns the
   editor email for consumer accounts — audit falls back to "unknown owner". */
function onSheetEdit(e) {
  if (!e || !e.range) return;
  var sh = e.range.getSheet();
  var ent = sh.getName();
  if (LIB.ENTITIES.indexOf(ent) < 0) return;
  var r0 = e.range.getRow(), n = e.range.getNumRows();
  var startCol = e.range.getColumn();
  // ignore the script's own stamping writes to meta columns
  if (startCol > C.deviceId + 1 && startCol + e.range.getNumColumns() - 1 <= C.serverUpdatedAt + 1) return;
  var editor = '';
  try { editor = (e.user && e.user.getEmail && e.user.getEmail()) || Session.getActiveUser().getEmail() || ''; } catch (err) { editor = ''; }
  withLock_(function () {
    for (var row = Math.max(2, r0); row < r0 + n; row++) stampRow_(sh, ent, row, Date.now());
    refreshViews_([ent]);
  });
  audit_(editor || 'unknown owner', 'sheetEdit:' + ent, n, 'ok');
}

function stampRow_(sh, ent, row, now) {
  var v = sh.getRange(row, 1, 1, COLS.length).getValues()[0];
  if (!v[C.email] || !v[C.id]) return;
  var data;
  try { data = JSON.parse(v[C.json] || '{}'); } catch (err) { return; }
  data.id = String(v[C.id]);
  data.deleted = v[C.deleted] === true || v[C.deleted] === 'TRUE';
  var s = sheetEditStamp(ent, data, now, nextSeq_());
  var rec = s.record;
  var j = {};
  for (var k in rec) if (['id', 'updatedAt', 'deviceId', 'deleted'].indexOf(k) < 0) j[k] = rec[k];
  sh.getRange(row, 1, 1, COLS.length).setValues([[v[C.email], rec.id, rec.updatedAt, rec.deviceId, rec.deleted, s.serverSeq, now, JSON.stringify(j)]]);
}

/** Fallback for unreliable onEdit: rows with empty serverSeq get stamped. */
function sweepSheetEdits_(now) {
  LIB.ENTITIES.forEach(function (ent) {
    var sh = sheet_(ent);
    var last = sh.getLastRow();
    if (last < 2) return;
    var seqs = sh.getRange(2, C.serverSeq + 1, last - 1, 1).getValues();
    for (var i = 0; i < seqs.length; i++) if (seqs[i][0] === '' || seqs[i][0] === null) stampRow_(sh, ent, i + 2, now);
  });
}

/* ---------- readable view tabs (derived; raw tabs stay the source of truth) ----------
   After each write, the touched entity's view tab is rebuilt from its raw tab
   (one read of the raw tab + the profile tab, one clearContents + one setValues).
   A profile change renames the patient everywhere, so it rebuilds all views.
   Fine at clinic scale; a view failure is audited and never fails a sync. */

function refreshViews_(entities) {
  try {
    var list = entities.indexOf('profile') >= 0 ? LIB.ENTITIES : entities;
    var names = patientNames_();
    list.forEach(function (ent) { if (VIEWS[ent]) writeView_(ent, names); });
  } catch (err) {
    audit_('system', 'viewRefresh', 0, 'error: ' + (err && err.message));
  }
}

function patientNames_() {
  var names = {};
  rowsFor_('profile', null).forEach(function (r) {
    if (!r.rec.deleted) names[r.email] = (r.rec.value && r.rec.value.name) || '';
  });
  return names;
}

function writeView_(ent, names) {
  var v = buildView(ent, rowsFor_(ent, null), names);
  var sh = sheet_(v.tab);
  sh.clearContents();
  var data = [v.header].concat(v.rows);
  sh.getRange(1, 1, data.length, v.header.length).setValues(data);
  sh.setFrozenRows(1);
}

/** Owner runs once from the editor after redeploying: builds every view tab from existing raw rows. */
function rebuildViews() {
  withLock_(function () {
    var names = patientNames_();
    LIB.ENTITIES.forEach(function (ent) { writeView_(ent, names); });
  });
}
