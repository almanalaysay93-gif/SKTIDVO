/* ===================================================================
   views/sync.js — F-SYNC-01 UI: account/sync card in Settings, header
   status badge, consent sheet + gate, withdraw, delete-my-cloud-data,
   sign-out, privacy notice, clinician approval panel (T059–T061).
   Sync is optional: nothing here runs a Google request until the user
   taps "Sign in with Google" (or was signed in before).
   =================================================================== */

import * as S from '../store.js';
import { t } from '../i18n.js';
import { configured, engine, getRole, gis, signOut } from '../sync/client.js';
import { CONSENT_VERSION } from '../sync/config.js';
import { $, esc, fmtDate, fmtTime } from '../ui/format.js';
import { icon } from '../ui/icons.js';
import { closeSheet, openSheet } from '../ui/sheet.js';
import { toast } from '../ui/toast.js';

const consentGiven = () => { const u = gis.currentUser(); const st = S.getSyncState(); return !!u && st.consentVersion === CONSENT_VERSION && st.consentEmail === u.email; };
const fill = (s, o) => String(s).replace(/\{(\w+)\}/g, (_, k) => (o[k] ?? ''));

/** Pure: status → {icon, text, tone}. Icon + text always (A034, C008). */
export function statusLabel(s, tr = t, time = fmtTime) {
  switch (s.state) {
    case 'signin':  return { icon: 'alert', text: tr('sync.state.signin'), tone: 'warn' };
    case 'consent': return { icon: 'shield', text: tr('sync.state.consent'), tone: 'info' };
    case 'offline': return { icon: 'info', text: fill(tr('sync.state.offline'), { n: s.pending }), tone: 'info' };
    case 'syncing': return { icon: 'upload', text: tr('sync.state.syncing'), tone: 'info' };
    case 'pending': return { icon: 'upload', text: fill(tr('sync.state.pending'), { n: s.pending }), tone: 'info' };
    case 'synced':  return { icon: 'check-circle', text: fill(tr('sync.state.synced'), { time: time(s.lastSyncAt) }), tone: 'ok' };
    case 'error':   return { icon: 'alert', text: tr('sync.state.error'), tone: 'warn' };
    default:        return { icon: 'info', text: tr('sync.state.off'), tone: 'off' };
  }
}

/* ---------- header badge (lives outside #main, survives render) ---------- */

export function paintHeader(s = engine.status()) {
  const b = $('#syncBadge');
  if (!b) return;
  const l = statusLabel(s);
  b.dataset.tone = l.tone;
  b.innerHTML = `${icon(l.icon)}<span>${esc(l.text)}</span>`;
  b.setAttribute('aria-label', `${t('sync.title')}: ${l.text}`);
}

/** Settings card status line, refreshed in place on status events. */
export function paintSettings(s = engine.status()) {
  const el = $('#syncStatusLine');
  if (!el) return;
  const l = statusLabel(s);
  el.innerHTML = `${icon(l.icon)}<span>${esc(l.text)}</span>`;
  el.dataset.tone = l.tone;
}

/* ---------- signed-out note (Today + Settings; persistent, not a popup) ---------- */

/** Pure: show "data only on this phone" when sync is available but this device
    is not signed in + consented. */
export function shouldShowLocalOnlyNote({ configured: cfg, signedIn, consented }) {
  return !!cfg && !(signedIn && consented);
}

export function localOnlyNote() {
  const u = gis.currentUser();
  const consented = !!u && S.getSyncState().consentVersion === CONSENT_VERSION && S.getSyncState().consentEmail === u.email;
  if (!shouldShowLocalOnlyNote({ configured, signedIn: !!u, consented })) return '';
  return `<p class="banner" id="localOnlyNote">${icon('info')}<span>${esc(t('sync.localOnly'))}</span>
    <button type="button" class="btn btn--ghost" data-sync="${u ? 'consent' : 'goSignin'}">${esc(u ? t('consent.review') : t('sync.signIn'))}</button></p>`;
}

/* ---------- Settings section ---------- */

export function syncSection() {
  const user = gis.currentUser();
  const st = S.getSyncState();
  const s = engine.status();
  const l = statusLabel(s);
  const role = getRole();
  if (!configured) return '';
  return `
    <h2 class="section-title">${esc(t('sync.title'))}</h2>
    <div class="card" id="syncCard">
      <p class="hint" style="margin-top:0">${esc(t('sync.hint'))}</p>
      ${user && consentGiven() ? '' : `<p class="banner">${icon('info')}<span>${esc(t('sync.localOnly'))}</span></p>`}
      <p class="banner sync-line" id="syncStatusLine" role="status" aria-live="polite" data-tone="${l.tone}">${icon(l.icon)}<span>${esc(l.text)}</span></p>
      ${user ? `
        <p class="row__sub">${esc(fill(t('sync.signedInAs'), { email: user.email }))}</p>
        ${s.state === 'consent' ? `
          <button type="button" class="btn btn--primary" data-sync="consent" style="width:100%">${icon('shield')}<span>${esc(t('consent.review'))}</span></button>` : `
          <button type="button" class="btn btn--primary" data-sync="now" style="width:100%">${icon('upload')}<span>${esc(t('sync.now'))}</span></button>`}
        <div style="height:var(--s-3)"></div>
        <button type="button" class="btn btn--ghost" data-sync="signout" style="width:100%">${icon('x')}<span>${esc(t('sync.signOut'))}</span></button>
        ${st.consentVersion ? `<div style="height:var(--s-3)"></div>
        <button type="button" class="btn btn--ghost" data-sync="withdraw" style="width:100%">${icon('shield')}<span>${esc(t('consent.withdraw'))}</span></button>` : ''}
        <div style="height:var(--s-3)"></div>
        <button type="button" class="btn btn--danger" data-sync="deleteme" style="width:100%">${icon('trash')}<span>${esc(t('sync.deleteCloud'))}</span></button>
      ` : `
        ${st.email ? `<p class="row__sub">${esc(fill(t('sync.signInAgain'), { email: st.email }))}</p>` : ''}
        <p class="row__sub">${esc(t('welcome.signIn'))}</p>
        <div id="gisButton" class="gis-slot" data-gis-auto></div>
      `}
      <div style="height:var(--s-3)"></div>
      <button type="button" class="btn btn--ghost" data-sync="privacy" style="width:100%">${icon('info')}<span>${esc(t('privacy.open'))}</span></button>
    </div>
    ${role && role.clinician ? clinicianSection() : ''}`;
}

/* ---------- consent + privacy notice (T061) ---------- */

export function privacyNoticeHtml() {
  const items = ['purpose', 'data', 'recipients', 'developer', 'sheetEdit', 'retention', 'rights', 'deletion', 'withdraw', 'contact'];
  return `
    <p class="banner" data-tone="warn">${icon('alert')}<span>${esc(t('privacy.draft'))}</span></p>
    ${items.map(k => `<h3 class="sub-title">${esc(t('privacy.' + k + '.h'))}</h3><p class="hint">${esc(t('privacy.' + k))}</p>`).join('')}
    <p class="hint">${esc(fill(t('privacy.version'), { v: CONSENT_VERSION }))}</p>`;
}

function sheetPrivacy() {
  openSheet({ title: t('privacy.title'), body: `<div class="privacy">${privacyNoticeHtml()}</div>` });
}

/** Consent gate (FR016): sync starts only after "I agree" is recorded server-side. */
export function sheetConsent() {
  openSheet({
    title: t('consent.title'),
    body: `
      <p class="hint" style="margin-top:0">${esc(t('consent.intro'))}</p>
      <div class="privacy">${privacyNoticeHtml()}</div>
      <div class="err" id="consentErr" role="alert" aria-live="polite"></div>
      <button type="button" class="btn btn--primary" id="consentYes" style="width:100%">${icon('check')}<span>${esc(t('consent.agree'))}</span></button>
      <div style="height:var(--s-3)"></div>
      <button type="button" class="btn btn--ghost" id="consentNo" style="width:100%">${esc(t('consent.notNow'))}</button>`,
    onMount: sheet => {
      sheet.querySelector('#consentNo').addEventListener('click', closeSheet);
      sheet.querySelector('#consentYes').addEventListener('click', async e => {
        const btn = e.currentTarget;
        if (!navigator.onLine) { $('#consentErr').innerHTML = `${icon('alert')}<span>${esc(t('sync.needOnline'))}</span>`; return; }
        btn.disabled = true;
        try {
          await engine.giveConsent();
          closeSheet();
          toast(t('consent.saved'));
          if (location.hash === '#welcome') location.hash = '#today';
        } catch {
          btn.disabled = false;
          $('#consentErr').innerHTML = `${icon('alert')}<span>${esc(t('sync.failed'))}</span>`;
        }
      });
    }
  });
}

async function withdrawFlow() {
  if (!confirm(t('consent.withdrawConfirm'))) return;
  const r = await engine.withdraw();
  toast(r.recorded ? t('consent.withdrawn') : t('consent.withdrawnLater'));
  offerDelete();
}

function offerDelete() {
  openSheet({
    title: t('sync.deleteCloud'),
    body: `
      <p class="hint" style="margin-top:0">${esc(t('sync.deleteOffer'))}</p>
      <button type="button" class="btn btn--danger" id="delYes" style="width:100%">${icon('trash')}<span>${esc(t('sync.deleteCloud'))}</span></button>
      <div style="height:var(--s-3)"></div>
      <button type="button" class="btn btn--ghost" id="delNo" style="width:100%">${esc(t('sync.keepCloud'))}</button>`,
    onMount: sheet => {
      sheet.querySelector('#delNo').addEventListener('click', closeSheet);
      sheet.querySelector('#delYes').addEventListener('click', () => { closeSheet(); deleteFlow(true); });
    }
  });
}

/** FR027: confirm → server deletes all rows for this Google account; local data stays. */
async function deleteFlow(confirmed = false) {
  if (!gis.getToken()) { toast(t('sync.state.signin')); return; }
  if (!navigator.onLine) { toast(t('sync.needOnline')); return; }
  if (!confirmed && !confirm(t('sync.deleteConfirm'))) return;
  try {
    await engine.deleteMe();
    toast(t('sync.deleted'));
  } catch {
    toast(t('sync.failed'));
  }
}

/** Mount Google's own button into every [data-gis-auto] slot after a render.
    One button only: our styled button cannot start the ID-token popup itself. */
export async function mountGoogleButtons() {
  if (!navigator.onLine) return;
  for (const slot of document.querySelectorAll('[data-gis-auto]')) {
    if (slot.dataset.mounted) continue;
    slot.dataset.mounted = '1';
    try {
      await gis.renderButton(slot, { locale: { ceb: 'ceb', tl: 'fil', en: 'en' }[S.getProfile().lang] });
    } catch { slot.innerHTML = ''; toast(t('sync.signInFailed')); }
  }
}
globalThis.addEventListener?.('view:rendered', () => { mountGoogleButtons(); });

export async function signInFlow(slotSel = '#gisButton') {
  if (!navigator.onLine) { toast(t('sync.needOnline')); return; }
  const slot = $(slotSel);
  try {
    if (slot) { slot.innerHTML = `<p class="hint">${esc(t('sync.loading'))}</p>`; }
    await gis.renderButton(slot || document.body, { locale: { ceb: 'ceb', tl: 'fil', en: 'en' }[S.getProfile().lang] });
    const ok = await gis.silentSignIn(4000);
    if (!ok && slot) slot.insertAdjacentHTML('afterbegin', `<p class="hint">${esc(t('sync.tapGoogle'))}</p>`);
  } catch {
    if (slot) slot.innerHTML = '';
    toast(t('sync.signInFailed'));
  }
}

/* ---------- clinician panel (T060, FR024/FR031) ---------- */

let patients = null;

function clinicianSection() {
  return `
    <h2 class="section-title">${esc(t('clin.title'))}</h2>
    <div class="card" id="clinCard">
      <p class="hint" style="margin-top:0">${esc(t('clin.hint'))}</p>
      <button type="button" class="btn btn--primary" data-sync="clin-load" style="width:100%">${icon('download')}<span>${esc(t('clin.load'))}</span></button>
      <div id="clinList">${patients ? patientList() : ''}</div>
    </div>`;
}

function patientList() {
  if (!patients.length) return `<p class="hint">${esc(t('clin.none'))}</p>`;
  return patients.map(p => `
    <button type="button" class="row" data-sync="clin-open" data-email="${esc(p.email)}" style="width:100%;text-align:left">
      <span class="row__icon">${icon('heart-pulse')}</span>
      <span class="row__body"><span class="row__title">${esc(p.name || p.email)}</span><span class="row__sub">${esc(p.email)}</span></span>
      ${icon('chevron-right')}
    </button>`).join('');
}

async function loadPatients() {
  if (!navigator.onLine) { toast(t('clin.needOnline')); return; }
  try {
    const d = await engine.call('patients', {});
    patients = (d.patients || []).sort((a, b) => String(a.name || a.email).localeCompare(String(b.name || b.email)));
    const el = $('#clinList');
    if (el) el.innerHTML = patientList();
  } catch (e) {
    toast(e && e.status === 403 ? t('clin.forbidden') : t('sync.failed'));
  }
}

const LIMIT_KEYS = [['na', 'mg'], ['k', 'mg'], ['p', 'mg'], ['protein', 'g'], ['fluid', 'ml']];

async function openPatient(email) {
  if (!navigator.onLine) { toast(t('clin.needOnline')); return; }
  let recs;
  try { recs = (await engine.call('patientRecords', { email })).records || []; }
  catch (e) { toast(e && e.status === 403 ? t('clin.forbidden') : t('sync.failed')); return; }
  const labs = recs.filter(r => r.entity === 'labs').map(r => r.record).sort((a, b) => String(b.date).localeCompare(String(a.date)));
  const lim = (recs.find(r => r.entity === 'limits') || {}).record || { id: 'limits', value: {} };
  const v = lim.value || {};
  const set = v.pending || v.current || {};
  const num = x => (x == null ? '' : esc(x));
  openSheet({
    title: email,
    body: `
      <h3 class="sub-title">${esc(t('diet.labs'))}</h3>
      ${labs.length ? labs.map(l => `
        <div class="lab">
          <div class="lab__head"><strong class="tnum">${esc(l.date)}</strong><span class="chip chip--${esc(l.status)}">${esc(t('lab.' + l.status))}</span></div>
          <p class="lab__vals">${Object.entries(l.values || {}).filter(([, x]) => x != null).map(([k, x]) => `${esc(t('lab.' + k))} <b class="tnum">${esc(x)}</b>`).join(' · ')}</p>
          ${l.status === 'pending' ? `<div class="btn-pair">
            <button type="button" class="btn btn--ghost" data-clin="approve" data-entity="labs" data-id="${esc(l.id)}">${icon('check')}<span>${esc(t('clinic.approve'))}</span></button>
            <button type="button" class="btn btn--danger" data-clin="reject" data-entity="labs" data-id="${esc(l.id)}">${icon('x')}<span>${esc(t('clinic.reject'))}</span></button></div>` : ''}
        </div>`).join('') : `<p class="hint">${esc(t('diet.labsEmpty'))}</p>`}
      <h3 class="sub-title">${esc(t('rules.current'))}</h3>
      <p class="hint">${v.current ? esc(fill(t('diet.approvedBy'), { name: v.current.approvedBy || '—', date: v.current.approvedAt ? fmtDate(v.current.approvedAt) : '—' })) : esc(t('rules.none2'))}</p>
      ${v.pending ? `<p class="banner">${icon('info')}<span>${esc(t('rules.pendingTitle'))}</span></p>
        <div class="btn-pair">
          <button type="button" class="btn btn--ghost" data-clin="approve" data-entity="limits" data-id="limits">${icon('check')}<span>${esc(t('clinic.approve'))}</span></button>
          <button type="button" class="btn btn--danger" data-clin="reject" data-entity="limits" data-id="limits">${icon('x')}<span>${esc(t('clinic.reject'))}</span></button></div>` : ''}
      <h3 class="sub-title">${esc(t('clin.editLimits'))}</h3>
      ${LIMIT_KEYS.map(([k, u]) => `<div class="field"><label for="cl_${k}">${esc(t('diet.' + k))} (${u})</label>
        <input class="input" id="cl_${k}" type="number" inputmode="decimal" min="0" step="any" value="${num(set[k])}"></div>`).join('')}
      <div class="err" id="clinErr" role="alert" aria-live="polite"></div>
      <button type="button" class="btn btn--primary" data-clin="saveLimits" style="width:100%">${icon('check')}<span>${esc(t('clin.saveLimits'))}</span></button>`,
    onMount: sheet => sheet.addEventListener('click', async e => {
      const b = e.target.closest('[data-clin]');
      if (!b || b.disabled) return;
      b.disabled = true;
      try {
        if (b.dataset.clin === 'saveLimits') {
          const next = {};
          for (const [k] of LIMIT_KEYS) {
            const raw = sheet.querySelector('#cl_' + k).value.trim();
            const n = raw === '' ? null : Number(raw);
            if (n !== null && (!Number.isFinite(n) || n < 0)) { $('#clinErr').innerHTML = `${icon('alert')}<span>${esc(t('common.required'))}</span>`; b.disabled = false; return; }
            next[k] = n;
          }
          const rec = { ...lim, value: { ...v, current: { ...next, computedAt: Date.now() }, pending: null, rules: v.rules || {} },
            updatedAt: Date.now(), deviceId: 'clinician', deleted: false };
          await engine.call('clinicianEdit', { email, entity: 'limits', record: rec });
        } else {
          await engine.call('approve', { email, entity: b.dataset.entity, id: b.dataset.id, status: b.dataset.clin === 'approve' ? 'approved' : 'rejected' });
        }
        toast(t('clinic.done'));
        openPatient(email);
      } catch (err) {
        b.disabled = false;
        toast(err && err.status === 403 ? t('clin.forbidden') : t('sync.failed'));
      }
    })
  });
}

/* ---------- events (delegated from events.js) ---------- */

export function onSyncClick(e) {
  const el = e.target.closest('[data-sync],#syncBadge');
  if (!el) return false;
  if (el.id === 'syncBadge') return gis.currentUser() ? 'settings' : 'welcome';
  switch (el.dataset.sync) {
    case 'goSignin': return 'welcome';
    case 'signin': signInFlow(el.dataset.slot || '#gisButton'); break;
    case 'now': engine.run(); break;
    case 'consent': sheetConsent(); break;
    case 'signout': signOut(); toast(t('sync.signedOut')); break;
    case 'withdraw': withdrawFlow(); break;
    case 'deleteme': deleteFlow(false); break;
    case 'privacy': sheetPrivacy(); break;
    case 'clin-load': loadPatients(); break;
    case 'clin-open': openPatient(el.dataset.email); break;
  }
  return true;
}

/** When a token arrives and consent is missing, show the consent sheet once. */
export function maybePromptConsent(s) {
  if (s.state === 'consent' && !document.getElementById('sheet')) sheetConsent();
}
