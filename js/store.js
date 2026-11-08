/* ===================================================================
   store.js — all state lives on the device. No server, no account.
   localStorage, namespaced and versioned so a future schema change
   can migrate instead of wiping a patient's history.
   =================================================================== */

import { contentKey, newDeviceId, stableJson, stamp, stripMeta } from './sync/meta.js';
import { enqueue, loadOutbox, saveOutbox } from './sync/queue.js';

const NS = 'skti.v1.';
const KEYS = {
  profile:     NS + 'profile',
  weights:     NS + 'weights',
  intake:      NS + 'intake',
  sessions:    NS + 'sessions',
  medications: NS + 'medications',
  medLogs:     NS + 'med_logs',
  checklists:  NS + 'checklists',
  hdBp:        NS + 'hd_bp',
  foodsCustom: NS + 'foods_custom',
  dietLog:     NS + 'diet_log',
  foodCache:   NS + 'food_cache',
  labs:        NS + 'labs',
  dietLimits:  NS + 'diet_limits',
  clinician:   NS + 'clinician',  // RETIRED (FR025): removed at boot by retirePin()
  // F-SYNC-01 (device-local, never synced, never in backups)
  deviceId:    NS + 'deviceId',
  schema:      NS + 'schema',
  recMeta:     NS + 'rec_meta',
  outbox:      NS + 'outbox',
  syncState:   NS + 'syncState',
  a2hsDismissed: NS + 'a2hsDismissed',
  lastBackupAt:  NS + 'lastBackupAt',
  welcomeDismissed: NS + 'welcomeDismissed'
};

const DEFAULT_PROFILE = {
  name: '',
  bookletNo: '',
  doctorName: '',
  nursePhone: '',
  emergencyPhone: '',
  dryWeightKg: null,      // set by the SKTI nephrologist
  allowanceMl: 1000,      // set by the SKTI nurse
  idwgLimitKg: 2.0,       // typical starting limit; editable
  schedule: 'MWF',        // 'MWF' | 'TTS' | 'CUSTOM'
  customDays: [1, 3, 5],  // Mon, Wed, Fri
  shiftName: '1st Shift',
  sessionTime: '06:00',   // chair time, used for calendar events
  stationNo: '',
  philHealthTarget: 156,
  philHealthUsed: 0,
  weighTime: '06:30',     // daily weigh-in reminder
  lang: 'en',            // default language is English
  theme: 'auto',          // 'auto' | 'light' | 'dark'
  setupDone: false,

  // Home scale minus SKTI scale, in kg.
  scaleOffsetKg: 0,
  scaleCalibratedAt: null,

  // USDA FoodData Central key. DEMO_KEY works but is heavily rate-limited.
  fdcApiKey: 'DEMO_KEY'
};

/* ---------- low level ---------- */

function readRaw(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    // Corrupt entry: don't take the whole app down with it.
    return fallback;
  }
}

function writeRaw(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;   // quota or private-mode; caller surfaces this
  }
}

/* ---------- sync metadata layer (F-SYNC-01, migration v2) ----------
   List entities keep tombstones in storage; read() hides them, so every
   getter is unchanged. write() diffs against storage: changed/new records
   are stamped (updatedAt/deviceId/deleted:false, syncedAt kept) and queued
   in the outbox; records that disappeared become tombstones. Single-record
   entities keep their shape; their metadata lives in KEYS.recMeta. */

const LIST_ENTITY = {
  [KEYS.weights]: 'weights', [KEYS.intake]: 'intake', [KEYS.sessions]: 'sessions',
  [KEYS.medications]: 'medications', [KEYS.hdBp]: 'hdBp', [KEYS.foodsCustom]: 'customFoods',
  [KEYS.dietLog]: 'dietLog', [KEYS.labs]: 'labs'
};
const SINGLE_ENTITY = {
  [KEYS.profile]: 'profile', [KEYS.medLogs]: 'medLogs',
  [KEYS.checklists]: 'checklist', [KEYS.dietLimits]: 'limits'
};
export const ENTITY_KEY = Object.fromEntries(
  [...Object.entries(LIST_ENTITY), ...Object.entries(SINGLE_ENTITY)].map(([k, e]) => [e, k]));

export function deviceId() {
  let id = readRaw(KEYS.deviceId, null);
  if (typeof id !== 'string' || !/^[0-9a-f]{32}$/.test(id)) {
    id = newDeviceId();
    writeRaw(KEYS.deviceId, id);
  }
  return id;
}

function queue(entity, id) {
  saveOutbox(enqueue(loadOutbox(localStorage), entity, id), localStorage);
}

function read(key, fallback) {
  const v = readRaw(key, fallback);
  return LIST_ENTITY[key] && Array.isArray(v) ? v.filter(r => !(r && r.deleted)) : v;
}

function write(key, value, { clearSynced = false } = {}) {
  const now = Date.now();
  if (LIST_ENTITY[key] && Array.isArray(value)) {
    const entity = LIST_ENTITY[key];
    const raw = readRaw(key, []);
    const prev = new Map((Array.isArray(raw) ? raw : []).map(r => [r && r.id, r]));
    const dev = deviceId();
    const seen = new Set();
    const out = [];
    for (const v of value) {
      const p = prev.get(v.id);
      seen.add(v.id);
      if (p && !p.deleted && p.updatedAt && contentKey(p) === contentKey(v) && !clearSynced) {
        out.push({ ...stripMeta(v), updatedAt: p.updatedAt, deviceId: p.deviceId, deleted: false,
                   ...(Number.isFinite(p.syncedAt) ? { syncedAt: p.syncedAt } : {}) });
        continue;
      }
      out.push(stamp(v, { now, deviceId: dev, prev: clearSynced ? null : p }));
      queue(entity, v.id);
    }
    for (const [id, p] of prev) {
      if (seen.has(id) || !p) continue;
      if (p.deleted) { out.push(p); continue; }
      out.push(stamp(p, { now, deviceId: dev, deleted: true, prev: p }));
      queue(entity, id);
    }
    return writeRaw(key, out);
  }
  if (SINGLE_ENTITY[key]) {
    const entity = SINGLE_ENTITY[key];
    const metas = readRaw(KEYS.recMeta, {});
    const m = metas[entity];
    const old = readRaw(key, undefined);
    if (!m || clearSynced || old === undefined || stableJson(old) !== stableJson(value)) {
      metas[entity] = { updatedAt: now, deviceId: deviceId(),
        ...(!clearSynced && m && Number.isFinite(m.syncedAt) ? { syncedAt: m.syncedAt } : {}) };
      writeRaw(KEYS.recMeta, metas);
      queue(entity, entity);
    }
  }
  return writeRaw(key, value);
}

/* ---------- sync access (used by the sync engine; no re-enqueue) ---------- */

/** All stored records of an entity, tombstones included, with metadata. */
export function syncRecords(entity) {
  const key = ENTITY_KEY[entity];
  if (!key) return [];
  if (LIST_ENTITY[key]) { const v = readRaw(key, []); return Array.isArray(v) ? v : []; }
  const m = readRaw(KEYS.recMeta, {})[entity];
  const v = readRaw(key, undefined);
  if (v === undefined || !m) return [];
  return [{ id: entity, value: v, deleted: false, ...m }];
}

/** Replace stored records from a merge result without queueing them. */
export function applySyncRecords(entity, records) {
  const key = ENTITY_KEY[entity];
  if (!key) return false;
  if (LIST_ENTITY[key]) { writeRaw(key, records); emit(); return true; }
  const r = records[0];
  if (!r) return false;
  const metas = readRaw(KEYS.recMeta, {});
  const { value, id, deleted, ...meta } = r;
  metas[entity] = meta;
  writeRaw(KEYS.recMeta, metas);
  writeRaw(key, value);
  emit();
  return true;
}

export const SCHEMA_VERSION = 2;

/**
 * Migration v2 (T048, plan §14.2). Idempotent. Stamps existing records with
 * updatedAt = ts || now, own deviceId, deleted:false and NO syncedAt (all
 * pre-sync data is never-synced and is queued for the first push). Legacy
 * approvals are reset to pending (OQ-14). Returns true if it ran.
 */
export function migrateV2(now = Date.now()) {
  if (Number(readRaw(KEYS.schema, 1)) >= SCHEMA_VERSION) return false;
  const dev = deviceId();
  for (const [key, entity] of Object.entries(LIST_ENTITY)) {
    const raw = readRaw(key, null);
    if (!Array.isArray(raw)) continue;
    const out = raw.filter(r => r && typeof r === 'object').map(r => {
      const base = entity === 'labs' && r.status === 'approved'
        ? { ...r, status: 'pending', approvedBy: null, approvedAt: null } : r;
      if (Number.isFinite(base.updatedAt) && typeof base.deviceId === 'string') return base;
      const { syncedAt, ...rest } = base;
      return { ...rest, updatedAt: Number.isFinite(r.ts) && r.ts > 0 ? r.ts : now,
               deviceId: dev, deleted: !!r.deleted };
    });
    writeRaw(key, out);
    out.forEach(r => queue(entity, r.id));
  }
  const limits = readRaw(KEYS.dietLimits, null);
  if (limits && limits.current) {
    writeRaw(KEYS.dietLimits, resetApprovals([], { pending: null, rules: {}, ...limits }).limits);
  }
  const metas = readRaw(KEYS.recMeta, {});
  for (const [key, entity] of Object.entries(SINGLE_ENTITY)) {
    if (localStorage.getItem(key) === null || metas[entity]) continue;
    metas[entity] = { updatedAt: now, deviceId: dev };
    queue(entity, entity);
  }
  writeRaw(KEYS.recMeta, metas);
  writeRaw(KEYS.schema, SCHEMA_VERSION);
  return true;
}

const listeners = new Set();
export function subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); }
function emit() { listeners.forEach(fn => fn()); }

/* ---------- dates ---------- */

/** Local calendar day, not UTC — a 7am weigh-in must land on today. */
export function dayKey(d = new Date()) {
  const p = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export function daysBetween(aKey, bKey) {
  const a = new Date(aKey + 'T00:00:00');
  const b = new Date(bKey + 'T00:00:00');
  return Math.round((b - a) / 86400000);
}

const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

/* ---------- profile ---------- */

export function getProfile() {
  return { ...DEFAULT_PROFILE, ...read(KEYS.profile, {}) };
}

export function saveProfile(patch) {
  const next = { ...getProfile(), ...patch };
  write(KEYS.profile, next);
  emit();
  return next;
}

/* ---------- weights ---------- */

export function getWeights() {
  return read(KEYS.weights, []).sort((a, b) => b.ts - a.ts);
}

/** One weight per calendar day — a second entry replaces the first. */
export function logWeight(kg, when = new Date()) {
  const key = dayKey(when);
  const list = read(KEYS.weights, []).filter(w => w.day !== key);
  list.push({ id: uid(), day: key, ts: when.getTime(), kg: Number(kg) });
  write(KEYS.weights, list);
  emit();
}

export function deleteWeight(id) {
  write(KEYS.weights, read(KEYS.weights, []).filter(w => w.id !== id));
  emit();
}

export function todayWeight() {
  return getWeights().find(w => w.day === dayKey()) || null;
}

/* ---------- fluid intake ---------- */

export function getIntake() {
  return read(KEYS.intake, []).sort((a, b) => b.ts - a.ts);
}

export function logIntake(ml, labelKey) {
  const list = read(KEYS.intake, []);
  const entry = { id: uid(), day: dayKey(), ts: Date.now(), ml: Number(ml), labelKey };
  list.push(entry);
  write(KEYS.intake, list);
  emit();
  return entry;
}

export function deleteIntake(id) {
  write(KEYS.intake, read(KEYS.intake, []).filter(i => i.id !== id));
  emit();
}

/** Undo support: put a deleted entry back exactly as it was. */
export function restoreIntake(entry) {
  const list = read(KEYS.intake, []);
  if (!list.some(i => i.id === entry.id)) list.push(entry);
  write(KEYS.intake, list);
  emit();
}

export function todayIntake() {
  const key = dayKey();
  return getIntake().filter(i => i.day === key);
}

export function todayIntakeMl() {
  return todayIntake().reduce((sum, i) => sum + i.ml, 0);
}

/* ---------- dialysis sessions ---------- */

export function getSessions() {
  return read(KEYS.sessions, []).sort((a, b) => b.ts - a.ts);
}

export function logSession(data, when = new Date()) {
  const list = read(KEYS.sessions, []);
  list.push({
    id: uid(),
    day: dayKey(when),
    ts: when.getTime(),
    preKg:  data.preKg  ?? null,
    postKg: Number(data.postKg),
    ufL:    data.ufL    ?? null,
    bpSys:  data.bpSys  ?? null,
    bpDia:  data.bpDia  ?? null
  });
  write(KEYS.sessions, list);
  emit();
}

export function deleteSession(id) {
  write(KEYS.sessions, read(KEYS.sessions, []).filter(s => s.id !== id));
  emit();
}

export function lastSession() {
  return getSessions()[0] || null;
}

/* ===================================================================
   Derived values — the actual clinical maths.

   IDWG (interdialytic weight gain) = today's weight − weight recorded
   at the END of the last dialysis. That post-session weight is the
   only honest baseline, which is why the session log exists at all.

   The limit stretches on a long gap: on MWF, Friday→Monday is two
   nights, not one, so the same daily gain adds up to more. The app
   scales the limit by the real number of days since the last session
   rather than pretending every gap is identical.
   =================================================================== */

/* The limit a nurse quotes is for the NORMAL gap between that patient's
   sessions, and on both MWF and TTS that gap is two days — Mon to Wed,
   Wed to Fri. A one-day gap barely happens. Scaling is therefore
   anchored at two days: the quoted number is used as-is on a normal
   interval, and only the long weekend gap (Fri to Mon) allows more.
   Capped at three days so a long lapse in treatment cannot quietly
   licence an unlimited gain. */
const NORMAL_GAP_DAYS = 2;
const MAX_SCALED_GAP = 3;

export function gapDays() {
  const s = lastSession();
  if (!s) return null;
  return Math.max(1, daysBetween(s.day, dayKey()));
}

export function effectiveLimitKg() {
  const p = getProfile();
  const base = p.idwgLimitKg || 2.0;
  const gap = gapDays();
  if (gap == null) return base;
  const scaled = Math.min(Math.max(gap, 1), MAX_SCALED_GAP);
  return +(base * scaled / NORMAL_GAP_DAYS).toFixed(2);
}

/**
 * Calibrate the home scale against SKTI's.
 * Both readings must be of the same body on the same evening — the patient
 * weighs at home the night of a dialysis, and we compare against the post
 * weight recorded at the centre.
 */
export function setScaleOffset(homeKg, clinicKg) {
  const offset = +(Number(homeKg) - Number(clinicKg)).toFixed(2);
  return saveProfile({ scaleOffsetKg: offset, scaleCalibratedAt: Date.now() });
}

export function isCalibrated() {
  return getProfile().scaleCalibratedAt != null;
}

export function idwgKg() {
  const s = lastSession();
  const w = todayWeight();
  if (!s || !w) return null;
  const offset = getProfile().scaleOffsetKg || 0;
  return +((w.kg - offset) - s.postKg).toFixed(2);
}

/** 'ok' below 70% of the limit, 'warn' up to the limit, 'danger' past it. */
export function band() {
  const gain = idwgKg();
  if (gain == null) return null;
  const limit = effectiveLimitKg();
  if (gain <= limit * 0.7) return 'ok';
  if (gain <= limit) return 'warn';
  return 'danger';
}

export function fluidLeftMl() {
  const p = getProfile();
  if (!p.allowanceMl) return null;
  return p.allowanceMl - todayIntakeMl();
}

/** A "glass" is 250 mL throughout the app — the number patients think in. */
export const GLASS_ML = 250;

export function glassesLeft() {
  const left = fluidLeftMl();
  if (left == null) return null;
  return Math.max(0, Math.floor(left / GLASS_ML));
}

/* ---------- schedule ---------- */

const SCHEDULE_DOW = { MWF: [1, 3, 5], TTS: [2, 4, 6] };

/** Day-of-week numbers (0=Sun) the patient dialyzes on, per their schedule. */
export function scheduleDays() {
  const p = getProfile();
  if (p.schedule === 'CUSTOM' && Array.isArray(p.customDays)) return p.customDays;
  return SCHEDULE_DOW[p.schedule] || SCHEDULE_DOW.MWF;
}

export function nextSessionDate() {
  const days = scheduleDays();
  const now = new Date();
  for (let i = 0; i <= 7; i++) {
    const d = new Date(now);
    d.setDate(now.getDate() + i);
    if (days.includes(d.getDay())) {
      // Today counts only if no session has been recorded for today yet.
      if (i === 0 && lastSession()?.day === dayKey()) continue;
      return d;
    }
  }
  return null;
}

/* ---------- medications ---------- */

const DEFAULT_MEDS = [
  {
    id: 'med-1',
    name: 'Calcium Carbonate (Phosphate Binder)',
    dose: '500mg (1 tablet)',
    timing: 'meals', // 'morning' | 'afternoon' | 'evening' | 'bedtime' | 'meals'
    notes: 'Take with first bite of meal to bind phosphate.',
    holdOnDialysis: false,
    active: true
  },
  {
    id: 'med-2',
    name: 'Amlodipine (Blood Pressure)',
    dose: '5mg (1 tablet)',
    timing: 'morning',
    notes: 'Blood pressure medication. Ask doctor if you should hold before session.',
    holdOnDialysis: true,
    active: true
  },
  {
    id: 'med-3',
    name: 'Epoetin Alfa (ESA Injection)',
    dose: '4000 IU',
    timing: 'dialysis_days',
    notes: 'Injection for blood count. Given after dialysis session.',
    holdOnDialysis: false,
    active: true
  },
  {
    id: 'med-4',
    name: 'Ferrous Sulfate (Iron)',
    dose: '320mg',
    timing: 'bedtime',
    notes: 'Iron supplement. Take at bedtime on empty stomach.',
    holdOnDialysis: false,
    active: true
  }
];

export function getMedications() {
  const list = read(KEYS.medications, null);
  if (list === null) {
    write(KEYS.medications, DEFAULT_MEDS);
    return DEFAULT_MEDS;
  }
  return list;
}

export function saveMedication(data) {
  const list = getMedications();
  if (data.id) {
    const idx = list.findIndex(m => m.id === data.id);
    if (idx !== -1) list[idx] = { ...list[idx], ...data };
    else list.push({ ...data, id: uid() });
  } else {
    list.push({ ...data, id: uid(), active: true });
  }
  write(KEYS.medications, list);
  emit();
}

export function deleteMedication(id) {
  const list = getMedications().filter(m => m.id !== id);
  write(KEYS.medications, list);
  emit();
}

export function getMedLogs() {
  return read(KEYS.medLogs, {});
}

export function todayMedLogs() {
  const logs = getMedLogs();
  const today = dayKey();
  return logs[today] || {};
}

export function toggleMedicationTaken(medId, slotKey = 'default') {
  const logs = getMedLogs();
  const today = dayKey();
  if (!logs[today]) logs[today] = {};
  const currentKey = `${medId}_${slotKey}`;
  logs[today][currentKey] = !logs[today][currentKey];
  write(KEYS.medLogs, logs);
  emit();
}

/* ---------- pre-dialysis checklist ---------- */

const DEFAULT_CHECKLIST = [
  { id: 'chk-1', text: 'Weigh morning weight on home scale & log in app', done: false },
  { id: 'chk-2', text: 'Check AV Fistula thrill (vibration) / Permcath dressing dry', done: false },
  { id: 'chk-3', text: 'Bring SPMC Dialysis Booklet & PhilHealth GL documents', done: false },
  { id: 'chk-4', text: 'Check BP meds (hold morning dose if ordered by doctor)', done: false },
  { id: 'chk-5', text: 'Bring light renal-friendly snack and water bottle', done: false }
];

export function getTodayChecklist() {
  const stored = read(KEYS.checklists, {});
  const today = dayKey();
  if (!stored[today]) {
    stored[today] = DEFAULT_CHECKLIST;
    write(KEYS.checklists, stored);
  }
  return stored[today];
}

export function toggleChecklistItem(id) {
  const stored = read(KEYS.checklists, {});
  const today = dayKey();
  const list = stored[today] || DEFAULT_CHECKLIST;
  const next = list.map(item => item.id === id ? { ...item, done: !item.done } : item);
  stored[today] = next;
  write(KEYS.checklists, stored);
  emit();
}

/* ---------- intra-dialysis blood pressure ----------
   Nurses check BP repeatedly through a run (pre, then roughly hourly)
   because intradialytic hypotension is the thing that actually happens
   mid-session — a single post-session number, which is all logSession
   captures, cannot show a dip that recovered before the chair. Readings
   are keyed by calendar day rather than by a session id: they are taken
   live, before the post-session summary exists to attach them to. */

/** Universal cuff-reading threshold, not a nurse-set target — the same
    fixed number any home BP monitor flags, unlike idwgLimitKg upstream. */
export const HD_LOW_SYS = 90;

export function isLowSys(sys) {
  return Number.isFinite(sys) && sys < HD_LOW_SYS;
}

export function getHdBp() {
  return read(KEYS.hdBp, []).sort((a, b) => b.ts - a.ts);
}

export function todayHdBp() {
  const today = dayKey();
  return getHdBp().filter(r => r.day === today);
}

export function logHdBp({ sys, dia, pulse, note }, when = new Date()) {
  const list = read(KEYS.hdBp, []);
  const entry = {
    id: uid(), day: dayKey(when), ts: when.getTime(),
    sys: Number(sys), dia: Number(dia),
    pulse: pulse != null && pulse !== '' ? Number(pulse) : null,
    note: note ? String(note) : ''
  };
  list.push(entry);
  write(KEYS.hdBp, list);
  emit();
  return entry;
}

export function deleteHdBp(id) {
  write(KEYS.hdBp, read(KEYS.hdBp, []).filter(r => r.id !== id));
  emit();
}

/** Undo support, matching restoreIntake. */
export function restoreHdBp(entry) {
  const list = read(KEYS.hdBp, []);
  if (!list.some(r => r.id === entry.id)) list.push(entry);
  write(KEYS.hdBp, list);
  emit();
}

/* ===================================================================
   Diet tracker. Units per 100 g: na/k/p mg, protein g, water g.
   null = source did not state the value; never read as zero.
   Labs and limits stay 'pending' until share@spmcdvo.net approves them
   server-side (FR023/FR024); approvals arrive here only via sync pull.
   =================================================================== */

const NUT = ['na', 'k', 'p', 'protein', 'water'];
const LIMIT_FIELDS = ['na', 'k', 'p', 'protein', 'fluid'];
const LAB_FIELDS = ['potassium', 'sodium', 'phosphorus', 'albumin', 'bun', 'creatinine', 'hemoglobin', 'calcium'];
const FOOD_CACHE_CAP = 200;

function cleanPer100(src) {
  const out = {};
  for (const k of NUT) {
    const v = src && src[k];
    out[k] = v === null || v === undefined || v === '' || !Number.isFinite(Number(v)) || Number(v) < 0 ? null : Number(v);
  }
  return out;
}

/* ---------- custom foods ---------- */

export function getCustomFoods() {
  return read(KEYS.foodsCustom, []).sort((a, b) => a.name.localeCompare(b.name));
}

export function saveCustomFood({ id, name, per100 }) {
  const list = read(KEYS.foodsCustom, []);
  const entry = { id: id || uid(), name: String(name).trim().slice(0, 120), per100: cleanPer100(per100), source: 'custom' };
  const i = list.findIndex(f => f.id === entry.id);
  if (i === -1) list.push(entry); else list[i] = entry;
  write(KEYS.foodsCustom, list);
  emit();
  return entry;
}

export function addCustomFoods(foods) {
  const list = read(KEYS.foodsCustom, []);
  for (const f of foods) list.push({ id: uid(), name: String(f.name).slice(0, 120), per100: cleanPer100(f.per100), source: 'custom' });
  write(KEYS.foodsCustom, list);
  emit();
  return foods.length;
}

export function deleteCustomFood(id) {
  write(KEYS.foodsCustom, read(KEYS.foodsCustom, []).filter(f => f.id !== id));
  emit();
}

/* ---------- diet log ---------- */

export function getDietLog(day = dayKey()) {
  return read(KEYS.dietLog, []).filter(e => e.day === day).sort((a, b) => b.ts - a.ts);
}

export function logFood({ name, grams, source, ref, per100 }, when = new Date()) {
  const list = read(KEYS.dietLog, []);
  const entry = {
    id: uid(), day: dayKey(when), ts: when.getTime(),
    name: String(name).slice(0, 160), grams: Number(grams),
    source: ['fdc', 'off', 'custom'].includes(source) ? source : 'custom',
    ref: ref == null ? null : String(ref), per100: cleanPer100(per100)
  };
  list.push(entry);
  write(KEYS.dietLog, list);
  emit();
  return entry;
}

export function deleteFood(id) {
  write(KEYS.dietLog, read(KEYS.dietLog, []).filter(e => e.id !== id));
  emit();
}

export function restoreFood(entry) {
  const list = read(KEYS.dietLog, []);
  if (!list.some(e => e.id === entry.id)) list.push(entry);
  write(KEYS.dietLog, list);
  emit();
}

/* ---------- lookup cache (offline) ---------- */

export function getFoodCache() { return read(KEYS.foodCache, []); }

/** Newest first, de-duplicated by source+ref (or name), capped. */
export function cacheFoods(items) {
  const keyOf = f => `${f.source}:${f.ref ?? f.name}`;
  const fresh = items.map(f => ({ name: f.name, source: f.source, ref: f.ref ?? null, per100: cleanPer100(f.per100), ts: Date.now() }));
  const seen = new Set(fresh.map(keyOf));
  const rest = getFoodCache().filter(f => !seen.has(keyOf(f)));
  write(KEYS.foodCache, [...fresh, ...rest].slice(0, FOOD_CACHE_CAP));
}

export function searchFoodCache(q) {
  const words = String(q).toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return [];
  return getFoodCache().filter(f => words.every(w => f.name.toLowerCase().includes(w))).slice(0, 15);
}

export function cachedBarcode(code) {
  return getFoodCache().find(f => f.source === 'off' && f.ref === code) || null;
}

/* ---------- labs ---------- */

export function getLabs() {
  return read(KEYS.labs, []).sort((a, b) => String(b.date).localeCompare(String(a.date)) || b.ts - a.ts);
}

export function addLab({ date, values, units, origin }) {
  const list = read(KEYS.labs, []);
  const entry = { id: uid(), ts: Date.now(), date, values, units: units || {},
                  status: 'pending', approvedBy: null, approvedAt: null,
                  origin: origin === 'manual' ? 'manual' : 'ocr' };
  list.push(entry);
  write(KEYS.labs, list);
  emit();
  return entry;
}

export function deleteLab(id) {
  write(KEYS.labs, read(KEYS.labs, []).filter(l => l.id !== id));
  emit();
}

/* ---------- limits ---------- */

export function getDietLimits() {
  return { current: null, pending: null, rules: {}, ...read(KEYS.dietLimits, {}) };
}

/** Only these numbers may drive the diet bars. */
export function approvedLimits() {
  return getDietLimits().current;
}

export function saveDietRules(rules) {
  write(KEYS.dietLimits, { ...getDietLimits(), rules });
  emit();
}

export function setPendingLimits(limits) {
  const pending = { computedAt: Date.now(), labId: limits.labId ?? null };
  for (const k of LIMIT_FIELDS) pending[k] = Number.isFinite(limits[k]) ? limits[k] : null;
  write(KEYS.dietLimits, { ...getDietLimits(), pending });
  emit();
}

/* ---------- PIN retired (FR025, A027) ---------- */

/** Deletes the legacy clinician PIN record. Idempotent; run at every boot. */
export function retirePin() {
  if (localStorage.getItem(KEYS.clinician) === null) return false;
  localStorage.removeItem(KEYS.clinician);
  return true;
}

/* ---------- sync state (device-local, never synced, never in backups) ----------
   {email, boundEmail, consentVersion, consentAt, consentEmail, cursor, lastSyncAt,
    pendingWithdraw} — no token, ever. */

export function getSyncState() {
  const v = readRaw(KEYS.syncState, {});
  return v && typeof v === 'object' && !Array.isArray(v) ? v : {};
}

export function setSyncState(patch) {
  const next = { ...getSyncState(), ...patch };
  for (const k of Object.keys(next)) if (next[k] === undefined) delete next[k];
  writeRaw(KEYS.syncState, next);
  return next;
}

/** After "delete my cloud data": every local record counts as never-synced
    again and is queued, so a later re-consent re-uploads it (C005). */
export function markAllUnsynced() {
  const metas = readRaw(KEYS.recMeta, {});
  for (const [key, entity] of Object.entries(LIST_ENTITY)) {
    const raw = readRaw(key, null);
    if (!Array.isArray(raw)) continue;
    writeRaw(key, raw.map(r => { const { syncedAt, ...rest } = r || {}; return rest; }));
    raw.forEach(r => r && !r.deleted && queue(entity, r.id));
  }
  for (const entity of Object.values(SINGLE_ENTITY)) {
    if (!metas[entity]) continue;
    delete metas[entity].syncedAt;
    queue(entity, entity);
  }
  writeRaw(KEYS.recMeta, metas);
}

/* ---------- restore cleaners ---------- */

const isDay = d => /^\d{4}-\d{2}-\d{2}$/.test(d);
/* null/blank stays null (Number(null) is 0, which would invent a limit). */
const numOrNull = v => (v === null || v === undefined || v === '' ? null : num(v));

function cleanCustomFoods(list) {
  return (Array.isArray(list) ? list : [])
    .map(f => ({ id: str(f.id) || uid(), name: str(f.name).slice(0, 120), per100: cleanPer100(f.per100), source: 'custom' }))
    .filter(f => f.name);
}

function cleanDietLog(list) {
  return (Array.isArray(list) ? list : [])
    .map(e => ({ id: str(e.id) || uid(), day: str(e.day), ts: num(e.ts, 0), name: str(e.name).slice(0, 160),
                 grams: num(e.grams), source: ['fdc', 'off', 'custom'].includes(e.source) ? e.source : 'custom',
                 ref: e.ref == null ? null : String(e.ref), per100: cleanPer100(e.per100) }))
    .filter(e => isDay(e.day) && e.name && e.grams > 0 && e.grams <= 5000);
}

function cleanFoodCache(list) {
  return (Array.isArray(list) ? list : [])
    .map(f => ({ name: str(f.name).slice(0, 160), source: ['fdc', 'off'].includes(f.source) ? f.source : 'fdc',
                 ref: f.ref == null ? null : String(f.ref), per100: cleanPer100(f.per100), ts: num(f.ts, 0) }))
    .filter(f => f.name).slice(0, FOOD_CACHE_CAP);
}

function cleanLabs(list) {
  return (Array.isArray(list) ? list : []).map(l => {
    const values = {};
    for (const k of LAB_FIELDS) values[k] = l.values ? numOrNull(l.values[k]) : null;
    return { id: str(l.id) || uid(), ts: num(l.ts, 0), date: str(l.date), values,
             units: l.units && typeof l.units === 'object' ? l.units : {},
             status: ['pending', 'approved', 'rejected'].includes(l.status) ? l.status : 'pending',
             approvedBy: l.approvedBy ? str(l.approvedBy) : null, approvedAt: num(l.approvedAt),
             origin: l.origin === 'manual' ? 'manual' : 'ocr' };
  }).filter(l => isDay(l.date));
}

function cleanLimitSet(src, extra) {
  if (!src || typeof src !== 'object') return null;
  const out = {};
  for (const k of LIMIT_FIELDS) out[k] = numOrNull(src[k]);
  for (const k of extra) out[k] = src[k] ?? null;
  return out;
}

function cleanDietLimits(d) {
  const src = d && typeof d === 'object' ? d : {};
  return {
    current: cleanLimitSet(src.current, ['approvedBy', 'approvedAt', 'computedAt', 'labId']),
    pending: cleanLimitSet(src.pending, ['computedAt', 'labId']),
    rules:   cleanRules(src.rules)
  };
}

/* FR008 / OQ-03: a restored file must never carry approval with it.
   Every lab goes back to 'pending' and any approved limit set becomes the
   pending set (an already-pending set wins), so the clinic re-approves. */
export function resetApprovals(labs, limits) {
  const outLabs = labs.map(l => ({ ...l, status: 'pending', approvedBy: null, approvedAt: null }));
  const demoted = limits.current
    ? (({ approvedBy, approvedAt, ...rest }) => rest)(limits.current) : null;
  return { labs: outLabs, limits: { ...limits, current: null, pending: limits.pending || demoted } };
}


function cleanMedications(list) {
  if (!Array.isArray(list)) return DEFAULT_MEDS;
  return list.filter(m => m && typeof m === 'object').map(m => ({
    ...m,
    id: str(m.id).slice(0, 64) || uid(),
    name: str(m.name).slice(0, 120),
    dose: str(m.dose).slice(0, 80),
    timing: str(m.timing).slice(0, 40),
    notes: str(m.notes).slice(0, 300),
    holdOnDialysis: !!m.holdOnDialysis,
    active: m.active !== false
  })).filter(m => m.name);
}

function cleanMedLogs(src) {
  const out = {};
  if (!src || typeof src !== 'object' || Array.isArray(src)) return out;
  for (const [day, slots] of Object.entries(src)) {
    if (!isDay(day) || !slots || typeof slots !== 'object') continue;
    out[day] = {};
    for (const [k, v] of Object.entries(slots)) out[day][String(k).slice(0, 100)] = v === true;
  }
  return out;
}

/* Rules arrive from a backup file: keep only known keys, numbers and a
   known lab key, so nothing else reaches the rules form. */
function cleanRules(src) {
  const r = src && typeof src === 'object' ? src : {};
  const out = {};
  for (const k of ['na', 'k', 'p']) {
    const x = r[k] && typeof r[k] === 'object' ? r[k] : null;
    if (!x) continue;
    out[k] = { base: numOrNull(x.base), lab: LAB_FIELDS.includes(x.lab) ? x.lab : '',
               threshold: numOrNull(x.threshold), then: numOrNull(x.then) };
  }
  if (r.protein && typeof r.protein === 'object') out.protein = { gPerKg: numOrNull(r.protein.gPerKg) };
  return out;
}

/* ---------- export ---------- */

export function buildSummary() {
  const p = getProfile();
  const weights = getWeights().slice(0, 14);
  const sessions = getSessions().slice(0, 6);
  return {
    profile: p,
    generatedAt: new Date().toISOString(),
    idwgKg: idwgKg(),
    limitKg: effectiveLimitKg(),
    gapDays: gapDays(),
    todayIntakeMl: todayIntakeMl(),
    weights,
    sessions
  };
}

/* ---------- device-local reminders (T033; never synced, never in backups) ---------- */

export function getLastBackupAt() { const v = readRaw(KEYS.lastBackupAt, null); return Number.isFinite(v) ? v : null; }
export function setLastBackupAt(ms = Date.now()) { writeRaw(KEYS.lastBackupAt, ms); }
export function isA2hsDismissed() { return readRaw(KEYS.a2hsDismissed, false) === true; }
export function dismissA2hs() { writeRaw(KEYS.a2hsDismissed, true); emit(); }

export function isWelcomeDismissed() { return readRaw(KEYS.welcomeDismissed, false) === true; }
export function setWelcomeDismissed(v = true) { writeRaw(KEYS.welcomeDismissed, !!v); }

export function wipeAll() {
  Object.values(KEYS).forEach(k => localStorage.removeItem(k));
  emit();
}

/* ===================================================================
   Backup / restore.
   Device-only storage means a lost, reset or wiped phone takes years of
   history with it, and Android's "clear browsing data" erases
   localStorage without warning. A file the patient owns is the only
   safety net that does not require a server.
   =================================================================== */

export const EXPORT_APP = 'sktidvo';
export const EXPORT_VERSION = 1;

export function exportAll() {
  return {
    app: EXPORT_APP,
    version: EXPORT_VERSION,
    exportedAt: new Date().toISOString(),
    profile: getProfile(),
    weights: getWeights(),
    intake: getIntake(),
    sessions: getSessions(),
    medications: getMedications(),
    medLogs: getMedLogs(),
    hdBp: getHdBp(),
    foodsCustom: getCustomFoods(),
    dietLog: read(KEYS.dietLog, []),
    foodCache: getFoodCache(),
    labs: getLabs(),
    dietLimits: getDietLimits()
  };
}

export function exportFilename() {
  return `sktidvo-backup-${dayKey()}.json`;
}

const num = (v, fallback = null) => (Number.isFinite(Number(v)) ? Number(v) : fallback);
const str = v => (typeof v === 'string' ? v : '');

/** A restore file is untrusted input: keep only fields we recognise. */
function cleanWeights(list) {
  return (Array.isArray(list) ? list : [])
    .map(w => ({ id: str(w.id) || uid(), day: str(w.day), ts: num(w.ts, 0), kg: num(w.kg) }))
    .filter(w => /^\d{4}-\d{2}-\d{2}$/.test(w.day) && w.kg > 0 && w.kg < 500);
}

function cleanIntake(list) {
  return (Array.isArray(list) ? list : [])
    .map(i => ({ id: str(i.id) || uid(), day: str(i.day), ts: num(i.ts, 0),
                 ml: num(i.ml), labelKey: str(i.labelKey) || 'fluid.other' }))
    .filter(i => /^\d{4}-\d{2}-\d{2}$/.test(i.day) && i.ml > 0 && i.ml <= 5000);
}

function cleanSessions(list) {
  return (Array.isArray(list) ? list : [])
    .map(s => ({ id: str(s.id) || uid(), day: str(s.day), ts: num(s.ts, 0),
                 preKg: num(s.preKg), postKg: num(s.postKg), ufL: num(s.ufL),
                 bpSys: num(s.bpSys), bpDia: num(s.bpDia) }))
    .filter(s => /^\d{4}-\d{2}-\d{2}$/.test(s.day) && s.postKg > 0 && s.postKg < 500);
}

function cleanHdBp(list) {
  return (Array.isArray(list) ? list : [])
    .map(r => ({ id: str(r.id) || uid(), day: str(r.day), ts: num(r.ts, 0),
                 sys: num(r.sys), dia: num(r.dia),
                 pulse: r.pulse != null ? num(r.pulse) : null,
                 note: str(r.note).slice(0, 200) }))
    .filter(r => /^\d{4}-\d{2}-\d{2}$/.test(r.day) &&
                  r.sys > 0 && r.sys < 300 && r.dia > 0 && r.dia < 200);
}

function cleanProfile(p) {
  const src = p && typeof p === 'object' ? p : {};
  return {
    ...DEFAULT_PROFILE,
    name:             str(src.name),
    bookletNo:        str(src.bookletNo),
    doctorName:       str(src.doctorName),
    nursePhone:       str(src.nursePhone),
    emergencyPhone:   str(src.emergencyPhone),
    dryWeightKg:      num(src.dryWeightKg),
    allowanceMl:      num(src.allowanceMl, 1000),
    idwgLimitKg:      num(src.idwgLimitKg, 2.0),
    schedule:         ['MWF', 'TTS', 'CUSTOM'].includes(src.schedule) ? src.schedule : 'MWF',
    customDays:       Array.isArray(src.customDays) ? src.customDays : [1, 3, 5],
    shiftName:        str(src.shiftName) || '1st Shift',
    sessionTime:      /^\d{2}:\d{2}$/.test(src.sessionTime) ? src.sessionTime : '06:00',
    stationNo:        str(src.stationNo),
    philHealthTarget: num(src.philHealthTarget, 156),
    philHealthUsed:   num(src.philHealthUsed, 0),
    weighTime:        /^\d{2}:\d{2}$/.test(src.weighTime)   ? src.weighTime   : '06:30',
    lang:             ['en', 'ceb', 'tl'].includes(src.lang) ? src.lang : 'en',
    theme:            ['auto', 'light', 'dark'].includes(src.theme) ? src.theme : 'auto',
    setupDone:        !!src.setupDone,
    scaleOffsetKg:    num(src.scaleOffsetKg, 0),
    scaleCalibratedAt: num(src.scaleCalibratedAt),
    fdcApiKey:        str(src.fdcApiKey).trim() || 'DEMO_KEY'
  };
}

/** Throws on a file that is not one of ours. Replaces everything on success. */
export function importAll(data) {
  if (!data || typeof data !== 'object' || data.app !== EXPORT_APP) {
    throw new Error('not a SKTIDVO backup');
  }
  if (!Number.isFinite(Number(data.version)) || Number(data.version) > EXPORT_VERSION) {
    throw new Error('backup made by a newer version');
  }
  const next = {
    profile:     cleanProfile(data.profile),
    weights:     cleanWeights(data.weights),
    intake:      cleanIntake(data.intake),
    sessions:    cleanSessions(data.sessions),
    medications: cleanMedications(data.medications),
    medLogs:     cleanMedLogs(data.medLogs),
    hdBp:        cleanHdBp(data.hdBp),
    foodsCustom: cleanCustomFoods(data.foodsCustom),
    dietLog:     cleanDietLog(data.dietLog),
    foodCache:   cleanFoodCache(data.foodCache),
    labs:        cleanLabs(data.labs),
    dietLimits:  cleanDietLimits(data.dietLimits)
  };
  const reset = resetApprovals(next.labs, next.dietLimits);
  next.labs = reset.labs;
  next.dietLimits = reset.limits;
  write(KEYS.profile,     next.profile, { clearSynced: true });
  write(KEYS.weights,     next.weights, { clearSynced: true });
  write(KEYS.intake,      next.intake, { clearSynced: true });
  write(KEYS.sessions,    next.sessions, { clearSynced: true });
  write(KEYS.medications, next.medications, { clearSynced: true });
  write(KEYS.medLogs,     next.medLogs, { clearSynced: true });
  write(KEYS.hdBp,        next.hdBp, { clearSynced: true });
  write(KEYS.foodsCustom, next.foodsCustom, { clearSynced: true });
  write(KEYS.dietLog,     next.dietLog, { clearSynced: true });
  write(KEYS.foodCache,   next.foodCache, { clearSynced: true });
  write(KEYS.labs,        next.labs, { clearSynced: true });
  write(KEYS.dietLimits,  next.dietLimits, { clearSynced: true });
  emit();
  return {
    weights: next.weights.length,
    intake: next.intake.length,
    sessions: next.sessions.length,
    medications: next.medications.length,
    hdBp: next.hdBp.length,
    dietLog: next.dietLog.length,
    labs: next.labs.length
  };
}

/* ---------- storage durability ----------
   Without this the browser treats our data as evictable cache. */

export async function requestPersistence() {
  if (!navigator.storage?.persist) return null;
  try {
    if (await navigator.storage.persisted()) return true;
    return await navigator.storage.persist();
  } catch {
    return null;
  }
}

export async function isPersisted() {
  if (!navigator.storage?.persisted) return null;
  try { return await navigator.storage.persisted(); } catch { return null; }
}
