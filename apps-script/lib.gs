/* ===================================================================
   lib.gs — pure server functions for the SKTIDVO sync web app
   (plan §14.7). No Apps Script services here: Code.gs does all IO.
   Loaded by node tests via vm (tests/apps-script.test.js).
   =================================================================== */

var LIB = {
  ENTITIES: ['profile', 'weights', 'intake', 'sessions', 'medications', 'medLogs',
    'checklist', 'hdBp', 'dietLog', 'customFoods', 'labs', 'limits'],
  OPS: ['push', 'pull', 'approve', 'clinicianEdit', 'patients', 'patientRecords', 'consent', 'withdraw', 'deleteMe', 'whoami'],
  CLINICIAN_OPS: ['approve', 'clinicianEdit', 'patients', 'patientRecords'],
  MAX_BODY_BYTES: 400 * 1024,
  MAX_RECORDS: 200,
  MAX_STRING: 2048,
  MAX_ID: 64,
  FUTURE_SKEW_MS: 24 * 60 * 60 * 1000,
  RATE_PER_MIN: 60,
  RATE_PER_DAY: 600,
  RETENTION_DAYS: 365,
  ISSUERS: ['accounts.google.com', 'https://accounts.google.com']
};

/** tokeninfo claims → {ok, email} | {ok:false, code}. */
/** Normalise Google tokeninfo for an ACCESS token to ID-token-shaped claims.
    Access tokeninfo has azp/aud, exp, email, email_verified but no iss. Pure. */
function accessTokenClaims(info) {
  if (!info || typeof info !== 'object') return null;
  return { aud: info.aud || info.azp, iss: 'https://accounts.google.com', exp: info.exp,
    email: info.email, email_verified: info.email_verified };
}

function verifyClaims(claims, nowMs, allowedAuds) {
  if (!claims || typeof claims !== 'object') return { ok: false, code: 'bad_token' };
  if (allowedAuds.indexOf(claims.aud) < 0) return { ok: false, code: 'bad_aud' };
  if (LIB.ISSUERS.indexOf(claims.iss) < 0) return { ok: false, code: 'bad_iss' };
  if (!(Number(claims.exp) * 1000 > nowMs)) return { ok: false, code: 'expired' };
  if (!(claims.email_verified === true || claims.email_verified === 'true')) return { ok: false, code: 'unverified_email' };
  if (typeof claims.email !== 'string' || !claims.email) return { ok: false, code: 'no_email' };
  return { ok: true, email: claims.email.toLowerCase() };
}

function isClinician(email, clinicians) {
  return clinicians.map(function (e) { return String(e).trim().toLowerCase(); }).indexOf(String(email).toLowerCase()) >= 0;
}

/** Ops on own data: any verified user. Clinician ops: CLINICIAN_EMAILS only. */
function authorize(op, email, clinicians) {
  if (LIB.OPS.indexOf(op) < 0) return { ok: false, code: 'bad_op' };
  if (LIB.CLINICIAN_OPS.indexOf(op) >= 0 && !isClinician(email, clinicians)) return { ok: false, code: 'forbidden' };
  return { ok: true };
}

function maxStringOk(v, depth) {
  if (depth > 8) return false;
  if (typeof v === 'string') return v.length <= LIB.MAX_STRING;
  if (Array.isArray(v)) { for (var i = 0; i < v.length; i++) if (!maxStringOk(v[i], depth + 1)) return false; return true; }
  if (v && typeof v === 'object') { for (var k in v) if (k.length > 64 || !maxStringOk(v[k], depth + 1)) return false; return true; }
  return v === null || typeof v === 'number' || typeof v === 'boolean';
}

function validateRecord(entity, r, nowMs) {
  if (LIB.ENTITIES.indexOf(entity) < 0) return 'bad_entity';
  if (!r || typeof r !== 'object' || Array.isArray(r)) return 'bad_record';
  if (typeof r.id !== 'string' || !r.id || r.id.length > LIB.MAX_ID) return 'bad_id';
  if (typeof r.updatedAt !== 'number' || !isFinite(r.updatedAt) || r.updatedAt < 0) return 'bad_updatedAt';
  if (r.updatedAt > nowMs + LIB.FUTURE_SKEW_MS) return 'future_updatedAt';
  if (typeof r.deviceId !== 'string' || r.deviceId.length > 64) return 'bad_deviceId';
  if (typeof r.deleted !== 'boolean') return 'bad_deleted';
  if (!maxStringOk(r, 0)) return 'bad_field';
  return null;
}

/** Body caps + shape. `rawLength` = request body length in bytes/chars. */
function validatePayload(body, rawLength, nowMs) {
  if (rawLength > LIB.MAX_BODY_BYTES) return { ok: false, code: 'too_large' };
  if (!body || typeof body !== 'object') return { ok: false, code: 'bad_body' };
  if (LIB.OPS.indexOf(body.op) < 0) return { ok: false, code: 'bad_op' };
  if (typeof body.idToken !== 'string' || !body.idToken) return { ok: false, code: 'no_token' };
  if (body.op === 'push') {
    if (!Array.isArray(body.records)) return { ok: false, code: 'bad_records' };
    if (body.records.length > LIB.MAX_RECORDS) return { ok: false, code: 'too_many' };
    for (var i = 0; i < body.records.length; i++) {
      var it = body.records[i] || {};
      var err = validateRecord(it.entity, it.record, nowMs);
      if (err) return { ok: false, code: err, index: i };
    }
  }
  if (body.op === 'pull' && body.since != null && !(typeof body.since === 'number' && body.since >= 0)) return { ok: false, code: 'bad_since' };
  if (body.op === 'approve') {
    if (typeof body.email !== 'string' || ['labs', 'limits'].indexOf(body.entity) < 0 || typeof body.id !== 'string'
      || ['approved', 'rejected'].indexOf(body.status) < 0) return { ok: false, code: 'bad_approve' };
  }
  if (body.op === 'patientRecords' && typeof body.email !== 'string') return { ok: false, code: 'bad_email' };
  if (body.op === 'clinicianEdit') {
    if (typeof body.email !== 'string' || ['labs', 'limits'].indexOf(body.entity) < 0) return { ok: false, code: 'bad_edit' };
    var e2 = validateRecord(body.entity, body.record, nowMs);
    if (e2) return { ok: false, code: e2 };
  }
  return { ok: true };
}

/** LWW: higher updatedAt, tie → higher deviceId. */
function lww(a, b) {
  if (!a) return b;
  if (!b) return a;
  if (a.updatedAt !== b.updatedAt) return a.updatedAt > b.updatedAt ? a : b;
  return String(a.deviceId) >= String(b.deviceId) ? a : b;
}

var APPROVAL_FIELDS = ['status', 'approvedBy', 'approvedAt'];

function withoutApproval(r) {
  var o = {};
  for (var k in r) if (APPROVAL_FIELDS.indexOf(k) < 0 && k !== 'current' && k !== 'syncedAt' && k !== 'neverSynced') o[k] = r[k];
  return o;
}

function stable(v) {
  if (Array.isArray(v)) return '[' + v.map(stable).join(',') + ']';
  if (v && typeof v === 'object') return '{' + Object.keys(v).sort().map(function (k) { return JSON.stringify(k) + ':' + stable(v[k]); }).join(',') + '}';
  return JSON.stringify(v === undefined ? null : v);
}

/**
 * Patient pushes of labs/limits: force pending, strip approval, unless the
 * stored row is already approved and the values are unchanged.
 * limits record shape: {id:'limits', value:{current,pending,rules}}.
 */
function forcePendingLabs(entity, rec, isClin, stored) {
  if (isClin || (entity !== 'labs' && entity !== 'limits')) return rec;
  var out = JSON.parse(JSON.stringify(rec));
  if (entity === 'labs') {
    var keep = stored && stored.status === 'approved' && stable(withoutApproval(stored.values || {})) === stable(withoutApproval(rec.values || {}));
    if (keep) { out.status = 'approved'; out.approvedBy = stored.approvedBy; out.approvedAt = stored.approvedAt; }
    else { out.status = 'pending'; out.approvedBy = null; out.approvedAt = null; }
    return out;
  }
  var v = out.value || {};
  var sv = stored && stored.value;
  if (v.current) {
    var same = sv && sv.current && stable(withoutApproval(sv.current)) === stable(withoutApproval(v.current));
    if (same) v.current = sv.current;
    else { var c = withoutApproval(v.current); v.current = null; v.pending = v.pending || c; }
  }
  out.value = v;
  return out;
}

/** {allow, retryAfter(s)}. */
function rateLimitDecision(minuteCount, dayCount, perMin, perDay, nowMs) {
  perMin = perMin || LIB.RATE_PER_MIN; perDay = perDay || LIB.RATE_PER_DAY;
  if (dayCount >= perDay) return { allow: false, retryAfter: Math.ceil((86400000 - (nowMs % 86400000)) / 1000) };
  if (minuteCount >= perMin) return { allow: false, retryAfter: Math.ceil((60000 - (nowMs % 60000)) / 1000) };
  return { allow: true };
}

/** Watermark applies only to pushes NOT flagged neverSynced (§14.3 step 8). */
function purgeWatermarkDecision(rec, existsOnServer, purgedBefore, neverSynced) {
  if (neverSynced || existsOnServer) return 'accept';
  return rec.updatedAt < purgedBefore ? 'ignore' : 'accept';
}

function cursorTooOld(op, since, lastSyncAt, purgedBefore) {
  if (!purgedBefore) return false;
  if (op === 'pull') return since > 0 && since < purgedBefore;
  if (op === 'push') return lastSyncAt != null && lastSyncAt > 0 && lastSyncAt < purgedBefore;
  return false;
}

/**
 * Core push logic, pure. existing: map key "entity|id" → stored record (or undefined).
 * Returns {upserts:[{entity, record}], accepted:[{entity,id}], ignored:[...], normalized:[{entity, record}]}.
 * Caller assigns serverSeq / serverUpdatedAt and writes rows.
 */
function applyPush(records, existing, ctx) {
  var res = { upserts: [], accepted: [], ignored: [], normalized: [] };
  for (var i = 0; i < records.length; i++) {
    var entity = records[i].entity, rec = records[i].record;
    var key = entity + '|' + rec.id;
    var stored = existing[key];
    var never = rec.neverSynced === true;
    var clean = {};
    for (var k in rec) if (k !== 'neverSynced' && k !== 'syncedAt' && k !== 'serverSeq' && k !== 'serverUpdatedAt') clean[k] = rec[k];
    if (purgeWatermarkDecision(clean, !!stored, ctx.purgedBefore || 0, never) === 'ignore') {
      res.ignored.push({ entity: entity, id: rec.id }); continue;
    }
    clean = forcePendingLabs(entity, clean, ctx.isClinician, stored);
    res.accepted.push({ entity: entity, id: rec.id });
    if (stored && lww(stored, clean) === stored) {
      res.normalized.push({ entity: entity, record: stored });   // server copy wins; client takes it
      continue;
    }
    res.upserts.push({ entity: entity, record: clean });
    if (stable(clean) !== stable(withNeutral(rec))) res.normalized.push({ entity: entity, record: clean });
  }
  return res;
}

function withNeutral(rec) {
  var o = {};
  for (var k in rec) if (k !== 'neverSynced' && k !== 'syncedAt') o[k] = rec[k];
  return o;
}

/** Approval written by the clinician. */
function approveRecord(entity, stored, status, clinicianEmail, nowMs) {
  var out = JSON.parse(JSON.stringify(stored));
  out.updatedAt = Math.max(nowMs, (stored.updatedAt || 0) + 1);
  out.deviceId = 'server';
  if (entity === 'labs') {
    out.status = status; out.approvedBy = clinicianEmail; out.approvedAt = nowMs;
  } else {
    var v = out.value || {};
    if (status === 'approved' && v.pending) { v.current = Object.assign({}, v.pending, { approvedBy: clinicianEmail, approvedAt: nowMs }); }
    v.pending = null;
    out.value = v;
  }
  return out;
}

/** Clinician edit: stored approved by definition (FR031). */
function clinicianEditRecord(entity, rec, clinicianEmail, nowMs) {
  var out = JSON.parse(JSON.stringify(rec));
  delete out.neverSynced; delete out.syncedAt;
  out.updatedAt = Math.max(nowMs, (rec.updatedAt || 0) + 1);
  out.deviceId = 'server';
  out.deleted = false;
  if (entity === 'labs') { out.status = 'approved'; out.approvedBy = clinicianEmail; out.approvedAt = nowMs; }
  else {
    var v = out.value || {};
    var c = v.current || v.pending || {};
    v.current = Object.assign(withoutApproval(c), { approvedBy: clinicianEmail, approvedAt: nowMs });
    v.pending = null;
    out.value = v;
  }
  return out;
}

/** Retention: patient inactive longer than RETENTION_DAYS → delete all rows. */
function retentionExpired(lastActivityMs, nowMs, days) {
  return nowMs - lastActivityMs > (days || LIB.RETENTION_DAYS) * 86400000;
}

/** Tombstones older than the cutoff are purged; returns new watermark. */
function tombstonePurgeCutoff(nowMs, days) {
  return nowMs - (days || LIB.RETENTION_DAYS) * 86400000;
}

/** Trusted sheet edit stamping (T056, OQ-12). Row typed by an owner. */
function sheetEditStamp(entity, rec, nowMs, seq) {
  var out = JSON.parse(JSON.stringify(rec || {}));
  out.updatedAt = nowMs;
  out.deviceId = 'sheet';
  if (typeof out.deleted !== 'boolean') out.deleted = false;
  if (entity === 'labs' && !out.approvedBy) { out.status = 'approved'; out.approvedBy = 'sheet edit'; out.approvedAt = nowMs; }
  if (entity === 'limits' && out.value && out.value.current && !out.value.current.approvedBy) {
    out.value.current.approvedBy = 'sheet edit'; out.value.current.approvedAt = nowMs;
  }
  return { record: out, serverSeq: seq, serverUpdatedAt: nowMs };
}

/** consent tab rows [email, version, at, state] → true when the email's latest row is 'given'. */
function consentGiven(rows, email) {
  var last = null;
  for (var i = 0; i < rows.length; i++) {
    var r = rows[i];
    if (String(r[0]).toLowerCase() !== email) continue;
    if (!last || Number(r[2]) >= Number(last[2])) last = r;
  }
  return !!last && last[3] === 'given';
}

/* ---------- readable view tabs (derived from raw tabs; never synced) ----------
   One tab per entity, rows = [Date, Time, Patient name, Patient email, ...key fields, Details].
   Dates/times are Asia/Manila (UTC+8, no DST). Unknown fields go to Details. */

var VIEW_TZ_OFFSET_MS = 8 * 3600000;
var VIEW_META = ['id', 'updatedAt', 'deviceId', 'deleted', 'syncedAt', 'neverSynced', 'serverSeq', 'serverUpdatedAt'];
var NUT_LABELS = { na: 'Sodium mg', k: 'Potassium mg', p: 'Phosphorus mg', protein: 'Protein g', water: 'Water g' };

function pad2_(n) { return (n < 10 ? '0' : '') + n; }

/** ms → {date:'YYYY-MM-DD', time:'HH:MM'} in Asia/Manila. Bad input → empty strings. */
function manilaDateTime(ms) {
  var n = Number(ms);
  if (!isFinite(n) || n <= 0) return { date: '', time: '' };
  var d = new Date(n + VIEW_TZ_OFFSET_MS);
  return { date: d.getUTCFullYear() + '-' + pad2_(d.getUTCMonth() + 1) + '-' + pad2_(d.getUTCDate()),
    time: pad2_(d.getUTCHours()) + ':' + pad2_(d.getUTCMinutes()) };
}

function viewVal_(v) {
  if (v === null || v === undefined) return '';
  if (typeof v === 'object') return JSON.stringify(v);
  return v;
}

/** Remaining fields as "key: value; key: value". Never drops a field. */
function viewDetails(obj, usedKeys, keepMeta) {
  if (!obj || typeof obj !== 'object') return '';
  var out = [];
  Object.keys(obj).sort().forEach(function (k) {
    if (usedKeys.indexOf(k) >= 0 || (!keepMeta && VIEW_META.indexOf(k) >= 0)) return;
    var v = obj[k];
    if (v === null || v === undefined || v === '') return;
    out.push(k + ': ' + (typeof v === 'object' ? JSON.stringify(v) : String(v)));
  });
  return out.join('; ');
}

function scaled_(per100, key, grams) {
  var v = per100 && per100[key];
  if (v === null || v === undefined || !isFinite(Number(v)) || !isFinite(Number(grams))) return '';
  return Math.round(Number(v) * Number(grams) / 100 * 10) / 10;
}

/** Tab name + key columns per entity. Names avoid the raw tab names (sheet names are case-insensitive). */
var VIEWS = {
  intake: { tab: 'Fluid', cols: [['Intake ml', 'ml'], ['Drink', 'labelKey']] },
  weights: { tab: 'Weight', cols: [['Weight kg', 'kg']] },
  sessions: { tab: 'Dialysis', cols: [['Pre weight kg', 'preKg'], ['Post weight kg', 'postKg'], ['UF L', 'ufL'], ['BP sys', 'bpSys'], ['BP dia', 'bpDia']] },
  medications: { tab: 'Meds', cols: [['Medicine', 'name'], ['Dose', 'dose'], ['Timing', 'timing'], ['Active', 'active'], ['Hold on dialysis', 'holdOnDialysis'], ['Notes', 'notes']] },
  medLogs: { tab: 'Med log', cols: [['Medicine slot', 'slot'], ['Taken', 'taken']] },
  checklist: { tab: 'Checklist log', cols: [['Item', 'text'], ['Done', 'done']] },
  hdBp: { tab: 'BP', cols: [['Sys', 'sys'], ['Dia', 'dia'], ['Pulse', 'pulse'], ['Note', 'note']] },
  dietLog: { tab: 'Diet', cols: [['Food', 'name'], ['Grams', 'grams'], ['Sodium mg', 'na'], ['Potassium mg', 'k'], ['Phosphorus mg', 'p'], ['Protein g', 'protein'], ['Water g', 'water'], ['Source', 'source']] },
  customFoods: { tab: 'Custom foods', cols: [['Food', 'name'], ['Sodium mg/100g', 'na'], ['Potassium mg/100g', 'k'], ['Phosphorus mg/100g', 'p'], ['Protein g/100g', 'protein'], ['Water g/100g', 'water'], ['Source', 'source']] },
  labs: { tab: 'Lab results', cols: [['Lab date', 'date'], ['Values', 'values'], ['Status', 'status'], ['Approved by', 'approvedBy'], ['Approved at', 'approvedAt']] },
  limits: { tab: 'Diet limits', cols: [['Current (approved)', 'current'], ['Pending', 'pending'], ['Approved by', 'approvedBy']] },
  profile: { tab: 'Patients', cols: [['Dry weight kg', 'dryWeightKg'], ['Fluid allowance ml', 'allowanceMl'], ['IDWG limit kg', 'idwgLimitKg'], ['Session time', 'sessionTime']] }
};

function viewHeader(entity) {
  var v = VIEWS[entity];
  return ['Date', 'Time', 'Patient name', 'Patient email'].concat(v.cols.map(function (c) { return c[0]; })).concat(['Details']);
}

/** Lab values {analyte:n} + units {analyte:'u'} → "Hgb: 10.2 g/dL; K: 5.1 mmol/L". */
function labValuesText_(values, units) {
  if (!values || typeof values !== 'object') return '';
  units = units || {};
  return Object.keys(values).sort().map(function (k) {
    var v = values[k];
    return k + ': ' + (typeof v === 'object' && v !== null ? JSON.stringify(v) : String(v)) + (units[k] ? ' ' + units[k] : '');
  }).join('; ');
}

/**
 * One raw record → readable view rows (array; [] for tombstones).
 * List entities give one row; medLogs/checklist give one row per day+item.
 */
function viewRows(entity, rec, profileName, email) {
  var cfg = VIEWS[entity];
  if (!cfg || !rec || rec.deleted) return [];
  var name = profileName || email || '';
  var who = [name, email || ''];
  var fallbackDt = manilaDateTime(rec.ts || rec.updatedAt);
  function row(dt, vals, details) { return [dt.date, dt.time].concat(who).concat(vals).concat([details]); }

  if (entity === 'medLogs' || entity === 'checklist') {
    var byDay = (rec.value && typeof rec.value === 'object') ? rec.value : {};
    var out = [];
    Object.keys(byDay).sort().forEach(function (day) {
      var dt = { date: String(day), time: '' };
      var v = byDay[day];
      if (entity === 'medLogs' && v && typeof v === 'object' && !Array.isArray(v)) {
        Object.keys(v).sort().forEach(function (slot) { out.push(row(dt, [slot, v[slot] === true ? 'yes' : 'no'], '')); });
      } else if (entity === 'checklist' && Array.isArray(v)) {
        v.forEach(function (it) {
          it = it || {};
          out.push(row(dt, [viewVal_(it.text), it.done === true ? 'yes' : 'no'], viewDetails(it, ['text', 'done'], true)));
        });
      } else {
        out.push(row(dt, ['', ''], 'raw: ' + JSON.stringify(v)));
      }
    });
    var extra = viewDetails(rec, ['value']);
    if (extra) out.push(row(fallbackDt, ['', ''], extra));
    return out;
  }

  if (entity === 'limits' || entity === 'profile') {
    var val = (rec.value && typeof rec.value === 'object') ? rec.value : {};
    var used = cfg.cols.map(function (c) { return c[1]; });
    var vals;
    if (entity === 'limits') {
      var cur = val.current || {};
      vals = [val.current ? JSON.stringify(val.current) : '', val.pending ? JSON.stringify(val.pending) : '', viewVal_(cur.approvedBy)];
    } else {
      used = used.concat(['name']);
      vals = cfg.cols.map(function (c) { return viewVal_(val[c[1]]); });
    }
    var det = [viewDetails(val, used), viewDetails(rec, ['value'])].filter(function (s) { return !!s; }).join('; ');
    return [row(manilaDateTime(rec.updatedAt), vals, det)];
  }

  var dt = fallbackDt;
  if (!dt.date && rec.day) dt = { date: String(rec.day), time: '' };
  var usedKeys = cfg.cols.map(function (c) { return c[1]; }).concat(['ts', 'day']);
  var values;
  if (entity === 'dietLog') {
    values = cfg.cols.map(function (c) {
      if (NUT_LABELS[c[1]]) return scaled_(rec.per100, c[1], rec.grams);
      return viewVal_(rec[c[1]]);
    });
    usedKeys.push('per100');
  } else if (entity === 'customFoods') {
    values = cfg.cols.map(function (c) { return NUT_LABELS[c[1]] ? viewVal_(rec.per100 && rec.per100[c[1]]) : viewVal_(rec[c[1]]); });
    usedKeys.push('per100');
  } else if (entity === 'labs') {
    values = [viewVal_(rec.date), labValuesText_(rec.values, rec.units), viewVal_(rec.status), viewVal_(rec.approvedBy),
      rec.approvedAt ? (function (x) { return x.date + ' ' + x.time; })(manilaDateTime(rec.approvedAt)) : ''];
    usedKeys.push('units');
  } else {
    values = cfg.cols.map(function (c) { var v = rec[c[1]]; return typeof v === 'boolean' ? (v ? 'yes' : 'no') : viewVal_(v); });
  }
  return [row(dt, values, viewDetails(rec, usedKeys))];
}

/** Sort by Date, then Patient name (case-insensitive), then Time. Returns a new array. */
function sortViewRows(rows) {
  function cmp(a, b) { a = String(a); b = String(b); return a < b ? -1 : a > b ? 1 : 0; }
  return rows.slice().sort(function (a, b) {
    return cmp(a[0], b[0]) || cmp(String(a[2]).toLowerCase(), String(b[2]).toLowerCase()) || cmp(a[1], b[1]) || cmp(a[3], b[3]);
  });
}

/** raw [{email, rec}] + {email: name} → {tab, header, rows} sorted. Pure. */
function buildView(entity, raw, names) {
  var rows = [];
  (raw || []).forEach(function (r) {
    rows = rows.concat(viewRows(entity, r.rec, (names || {})[r.email] || '', r.email));
  });
  return { tab: VIEWS[entity].tab, header: viewHeader(entity), rows: sortViewRows(rows) };
}

if (typeof module !== 'undefined') {
  module.exports = { LIB: LIB, verifyClaims: verifyClaims, accessTokenClaims: accessTokenClaims, authorize: authorize, validatePayload: validatePayload,
    lww: lww, forcePendingLabs: forcePendingLabs, rateLimitDecision: rateLimitDecision,
    purgeWatermarkDecision: purgeWatermarkDecision, cursorTooOld: cursorTooOld, applyPush: applyPush,
    approveRecord: approveRecord, clinicianEditRecord: clinicianEditRecord, retentionExpired: retentionExpired,
    tombstonePurgeCutoff: tombstonePurgeCutoff, sheetEditStamp: sheetEditStamp, isClinician: isClinician, consentGiven: consentGiven,
    VIEWS: VIEWS, manilaDateTime: manilaDateTime, viewDetails: viewDetails, viewHeader: viewHeader,
    viewRows: viewRows, sortViewRows: sortViewRows, buildView: buildView };
}
