/* ===================================================================
   app.js — views, rendering, interaction.
   No framework: this has to boot fast on a cheap Android and work
   with the radio off.
   =================================================================== */

import * as S from './store.js';
import * as Cal from './calendar.js';
import { initDiet } from './diet-view.js';
import { getLang, langName, LANGS, setLang, t } from './i18n.js';
import { sheetCalibrate } from './sheets/calibrate.js';
import { sheetCustomDrink } from './sheets/drink.js';
import { sheetHdBp } from './sheets/hdbp.js';
import { sheetMedication } from './sheets/medication.js';
import { sheetSession } from './sheets/session.js';
import { sheetWeight } from './sheets/weight.js';
import { $, $$, esc, fmtDate, fmtTime, localeTag, nf } from './ui/format.js';
import { icon } from './ui/icons.js';
import { closeSheet, openSheet, readNumber } from './ui/sheet.js';
import { toast } from './ui/toast.js';
import { addDrink, viewFluid } from './views/fluid.js';
import { viewMeds } from './views/meds.js';
import { viewSession } from './views/session.js';
import { calCursor, setCalCursor, viewToday } from './views/today.js';
import { viewWeight } from './views/weight.js';

/* ---------- tiny helpers ---------- */

export let view = 'today';
function viewSettings() {
  const p = S.getProfile();
  return `
  <div class="view">
    <p class="settings-intro">SKTI — SPMC Kidney and Transplant Institute, Davao City</p>

    <h2 class="section-title">${esc(t('settings.language'))}</h2>
    <div class="seg" role="group" aria-label="${esc(t('settings.language'))}">
      ${LANGS.map(c => `
        <button type="button" data-lang="${c}"
                aria-pressed="${c === getLang()}">${esc(langName(c))}</button>`).join('')}
    </div>

    <h2 class="section-title">Patient Profile Customization</h2>
    <div class="card">
      <div class="field">
        <label for="pName">Patient Name</label>
        <input class="input" id="pName" type="text" value="${esc(p.name)}" placeholder="e.g. Juan dela Cruz">
      </div>
      <div class="field">
        <label for="pBooklet">SPMC Booklet / Reg #</label>
        <input class="input" id="pBooklet" type="text" value="${esc(p.bookletNo)}" placeholder="e.g. SPMC-12345">
      </div>
      <div class="field-row">
        <div class="field">
          <label for="pDoctor">Nephrologist Doctor</label>
          <input class="input" id="pDoctor" type="text" value="${esc(p.doctorName)}" placeholder="Dr. Santos">
        </div>
        <div class="field">
          <label for="pStation">Station / Machine #</label>
          <input class="input" id="pStation" type="text" value="${esc(p.stationNo)}" placeholder="Machine 8">
        </div>
      </div>
      <div class="field-row">
        <div class="field">
          <label for="pNurse">Nurse Contact #</label>
          <input class="input" id="pNurse" type="tel" value="${esc(p.nursePhone)}" placeholder="0917...">
        </div>
        <div class="field">
          <label for="pEmerg">Emergency Phone</label>
          <input class="input" id="pEmerg" type="tel" value="${esc(p.emergencyPhone)}" placeholder="0918...">
        </div>
      </div>
    </div>

    <h2 class="section-title">${esc(t('settings.targets'))}</h2>
    <div class="card">
      <div class="field">
        <label for="pDry">${esc(t('settings.dryWeight'))}</label>
        <input class="input" id="pDry" type="number" inputmode="decimal" step="0.1"
               min="20" max="250" value="${p.dryWeightKg ?? ''}">
        <div class="err" id="pDry-err" role="alert" aria-live="polite"></div>
        <p class="hint">${esc(t('settings.dryWeightHint'))}</p>
      </div>
      <div class="field">
        <label for="pAllow">${esc(t('settings.allowance'))}</label>
        <input class="input" id="pAllow" type="number" inputmode="numeric" step="50"
               min="200" max="3000" value="${p.allowanceMl ?? ''}">
        <div class="err" id="pAllow-err" role="alert" aria-live="polite"></div>
        <p class="hint">${esc(t('settings.allowanceHint'))}</p>
      </div>
      <div class="field">
        <label for="pIdwg">${esc(t('settings.idwg'))}</label>
        <input class="input" id="pIdwg" type="number" inputmode="decimal" step="0.1"
               min="0.5" max="6" value="${p.idwgLimitKg ?? 2}">
        <div class="err" id="pIdwg-err" role="alert" aria-live="polite"></div>
        <p class="hint">${esc(t('settings.idwgHint'))}</p>
      </div>
      <div class="field">
        <label>${esc(t('settings.schedule'))}</label>
        <div class="seg" role="group" aria-label="${esc(t('settings.schedule'))}">
          <button type="button" data-sched="MWF" aria-pressed="${p.schedule === 'MWF'}">MWF</button>
          <button type="button" data-sched="TTS" aria-pressed="${p.schedule === 'TTS'}">TTS</button>
          <button type="button" data-sched="CUSTOM" aria-pressed="${p.schedule === 'CUSTOM'}">${esc(t('settings.scheduleCustom'))}</button>
        </div>
        ${p.schedule === 'CUSTOM' ? `
        <p class="hint">${esc(t('settings.scheduleCustomHint'))}</p>
        <div class="seg" role="group" aria-label="${esc(t('settings.scheduleCustom'))}">
          ${[0, 1, 2, 3, 4, 5, 6].map(dow => `
            <button type="button" data-custom-day="${dow}"
                    aria-pressed="${(p.customDays || []).includes(dow)}">${
              esc(new Intl.DateTimeFormat(localeTag(), { weekday: 'narrow' }).format(new Date(2023, 0, 1 + dow)))
            }</button>`).join('')}
        </div>` : ''}
      </div>
      <button type="button" class="btn btn--primary" id="pSave">
        ${icon('check')}<span>${esc(t('common.save'))}</span>
      </button>
    </div>

    <h2 class="section-title">${esc(t('scale.title'))}</h2>
    <div class="card">
      <p class="hint" style="margin-top:0">${esc(t('scale.why'))}</p>
      <div class="stats" style="margin-bottom:var(--s-3)">
        <div class="stat">
          <span class="stat__val tnum">${
            p.scaleCalibratedAt
              ? (p.scaleOffsetKg > 0 ? '+' : '') + nf(p.scaleOffsetKg, 1) + '<small> kg</small>'
              : '—'}</span>
          <p class="stat__key">${esc(t('scale.offset'))}</p>
        </div>
        <div class="stat">
          <span class="stat__val" style="font-size:var(--t-md);font-weight:600">${
            p.scaleCalibratedAt ? esc(fmtDate(p.scaleCalibratedAt)) : esc(t('scale.notSet'))}</span>
          <p class="stat__key">${esc(t('scale.title'))}</p>
        </div>
      </div>
      <button type="button" class="btn btn--ghost" id="btnCalibrate" style="width:100%">
        ${icon('scale')}<span>${esc(p.scaleCalibratedAt ? t('scale.recalibrate') : t('scale.calibrate'))}</span>
      </button>
    </div>

    <h2 class="section-title">${esc(t('cal.title'))}</h2>
    <div class="card">
      <p class="hint" style="margin-top:0">${esc(t('cal.hint'))}</p>
      <div class="field-row">
        <div class="field">
          <label for="pSessionTime">${esc(t('cal.sessionTime'))}</label>
          <input class="input" id="pSessionTime" type="time" value="${esc(p.sessionTime)}">
        </div>
        <div class="field">
          <label for="pWeighTime">${esc(t('cal.weighTime'))}</label>
          <input class="input" id="pWeighTime" type="time" value="${esc(p.weighTime)}">
        </div>
      </div>
      <button type="button" class="btn btn--primary" id="btnCalSchedule" style="width:100%">
        ${icon('calendar')}<span>${esc(t('cal.addSchedule'))}</span>
      </button>
      <div style="height:var(--s-3)"></div>
      <button type="button" class="btn btn--ghost" id="btnCalWeigh" style="width:100%">
        ${icon('scale')}<span>${esc(t('cal.addWeighIn'))}</span>
      </button>
      <div style="height:var(--s-3)"></div>
      <button type="button" class="btn btn--ghost" id="btnCalGoogle" style="width:100%">
        ${icon('calendar')}<span>${esc(t('cal.openGoogle'))}</span>
      </button>
      <p class="banner" style="margin-top:var(--s-4)">
        ${icon('info')}<span>${esc(t('cal.howto'))}</span>
      </p>

      <div style="height:var(--s-2)"></div>
      <button type="button" class="btn btn--ghost" id="btnCalSessions" style="width:100%">
        ${icon('download')}<span>${esc(t('cal.addSessions'))}</span>
      </button>
      <p class="banner">${icon('alert')}<span>${esc(t('cal.warnHealth'))}</span></p>
    </div>

    ${Diet.settingsSection()}

    <h2 class="section-title">${esc(t('install.title'))}</h2>
    <div class="card" id="installCard">
      <p class="hint" style="margin-top:0">${esc(t('install.hint'))}</p>
      <button type="button" class="btn btn--primary" id="btnInstall" hidden>
        ${icon('phone')}<span>${esc(t('install.btn'))}</span>
      </button>
      <p class="banner" id="installIos" hidden>
        ${icon('info')}<span>${esc(t('install.ios'))}</span>
      </p>
      <p class="banner" id="installManual" hidden>
        ${icon('info')}<span>${esc(t('install.manual'))}</span>
      </p>
      <p class="banner" id="installDone" hidden>
        ${icon('check-circle')}<span>${esc(t('install.done'))}</span>
      </p>
    </div>

    <h2 class="section-title">${esc(t('settings.data'))}</h2>
    <div class="card">
      <p class="hint" style="margin-top:0">${esc(t('data.backupHint'))}</p>
      <button type="button" class="btn btn--primary" id="btnExport" style="width:100%">
        ${icon('download')}<span>${esc(t('data.backup'))}</span>
      </button>
      <div style="height:var(--s-3)"></div>
      <button type="button" class="btn btn--ghost" id="btnImport" style="width:100%">
        ${icon('upload')}<span>${esc(t('data.restore'))}</span>
      </button>
      <input type="file" id="importFile" accept="application/json,.json" hidden>

      <div class="row" style="margin-top:var(--s-3)">
        <span class="row__icon">${icon('shield')}</span>
        <span class="row__body">
          <span class="row__title">${esc(t('data.persist'))}</span>
          <span class="row__sub" id="persistState">…</span>
        </span>
      </div>
    </div>

    <div class="card">
      <p class="hint" style="margin-top:0">${esc(t('settings.exportHint'))}</p>
      <button type="button" class="btn btn--ghost" id="btnPrint" style="width:100%">
        ${icon('printer')}<span>${esc(t('settings.export'))}</span>
      </button>
      <div style="height:var(--s-3)"></div>
      <button type="button" class="btn btn--danger" id="btnWipe" style="width:100%">
        ${icon('trash')}<span>${esc(t('settings.wipe'))}</span>
      </button>
    </div>

    <p class="banner">${icon('shield')}<span>${esc(t('legal.privacy'))}</span></p>
    <p class="banner">${icon('info')}<span>${esc(t('legal.disclaimer'))}</span></p>
  </div>`;
}

/* ===================================================================
   Nurse summary — printable, no network
   =================================================================== */

function printSummary() {
  const s = S.buildSummary();
  const p = s.profile;
  const w = document.createElement('div');
  w.id = 'printOnly';
  w.innerHTML = `
    <div class="card">
      <h2>${esc(t('settings.export'))} — ${esc(t('app.sub'))}</h2>
      <p class="hint">${esc(new Date().toLocaleString())}</p>
      <ul>
        <li class="row"><span class="row__body">Dry weight</span>
            <span class="row__val tnum">${p.dryWeightKg ?? '—'} kg</span></li>
        <li class="row"><span class="row__body">Daily fluid allowance</span>
            <span class="row__val tnum">${p.allowanceMl ?? '—'} mL</span></li>
        <li class="row"><span class="row__body">Schedule</span>
            <span class="row__val">${esc(p.schedule)}</span></li>
        <li class="row"><span class="row__body">IDWG now (gap ${s.gapDays ?? '—'}d)</span>
            <span class="row__val tnum">${s.idwgKg != null ? nf(s.idwgKg, 1) + ' kg' : '—'}
              / limit ${nf(s.limitKg, 1)} kg</span></li>
        <li class="row"><span class="row__body">Fluid today</span>
            <span class="row__val tnum">${s.todayIntakeMl} mL</span></li>
      </ul>
      <h3 style="margin-top:16px">Weights (last 14)</h3>
      <ul>${s.weights.map(x => `<li class="row"><span class="row__body">${esc(x.day)}</span>
             <span class="row__val tnum">${nf(x.kg, 1)} kg</span></li>`).join('') || '<li>—</li>'}</ul>
      <h3 style="margin-top:16px">Dialysis (last 6)</h3>
      <ul>${s.sessions.map(x => `<li class="row"><span class="row__body">${esc(x.day)}</span>
             <span class="row__val tnum">post ${nf(x.postKg, 1)} kg${
               x.ufL != null ? ` · UF ${nf(x.ufL, 1)} L` : ''}${
               x.bpSys ? ` · BP ${x.bpSys}/${x.bpDia ?? '—'}` : ''}</span></li>`).join('') || '<li>—</li>'}</ul>
      <p class="hint" style="margin-top:16px">${esc(t('legal.disclaimer'))}</p>
    </div>`;
  document.body.appendChild(w);
  window.print();
  setTimeout(() => w.remove(), 500);
}

/* ===================================================================
   Backup / restore / install
   =================================================================== */

function downloadFile(filename, mime, text) {
  const url = URL.createObjectURL(new Blob([text], { type: mime }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function exportBackup() {
  downloadFile(S.exportFilename(), 'application/json',
               JSON.stringify(S.exportAll(), null, 2));
  toast(t('data.exported'));
}

/* ---------- Google Calendar ----------
   An .ics file rather than the Calendar API: no OAuth, no Cloud
   project, and nothing leaves the phone until the patient imports it.
   The VALARM in these events is also the only reminder this app can
   produce that survives the app being closed. */

function calFile(name, text) {
  downloadFile(name, 'text/calendar;charset=utf-8', text);
  toast(t('cal.downloaded'));
}

function calSchedule() {
  const p = S.getProfile();
  calFile('sktidvo-dialysis-schedule.ics', Cal.scheduleIcs({
    schedule: p.schedule,
    customDays: p.customDays,
    sessionTime: p.sessionTime,
    summary: t('cal.evDialysis'),
    alarmMinutesBefore: 120,
    alarmText: t('cal.alarmDialysis'),
    from: S.nextSessionDate() || new Date()
  }));
}

function calWeighIn() {
  const p = S.getProfile();
  calFile('sktidvo-weigh-in.ics', Cal.weighInIcs({
    weighTime: p.weighTime,
    summary: t('cal.evWeigh'),
    description: t('cal.evWeighNote'),
    alarmMinutesBefore: 0,
    alarmText: t('cal.evWeigh')
  }));
}

function calSessions() {
  const sessions = S.getSessions();
  if (!sessions.length) { toast(t('cal.noSessions')); return; }
  const p = S.getProfile();
  calFile('sktidvo-dialysis-log.ics', Cal.sessionsIcs({
    sessions,
    sessionTime: p.sessionTime,
    summary: t('cal.evDialysis'),
    labels: { post: t('cal.labelPost'), uf: t('cal.labelUf'), bp: t('cal.labelBp') }
  }));
}

function calOpenGoogle() {
  const p = S.getProfile();
  const next = S.nextSessionDate();
  if (!next) return;
  // Title and time only — this query string travels to Google and lands
  // in browser history, so no weights or blood pressure go in it.
  const url = Cal.googleTemplateUrl({
    title: t('cal.evDialysis'),
    start: Cal.atTime(next, p.sessionTime),
    schedule: p.schedule,
    customDays: p.customDays
  });
  window.open(url, '_blank', 'noopener');
}

function importBackup(file) {
  const reader = new FileReader();
  reader.onload = () => {
    let parsed;
    try {
      parsed = JSON.parse(reader.result);
    } catch {
      toast(t('data.badFile'));
      return;
    }
    // Restore overwrites everything, so confirm before touching stored data.
    if (!confirm(t('data.restoreConfirm'))) return;
    try {
      const counts = S.importAll(parsed);
      setLang(S.getProfile().lang);
      applyTheme(S.getProfile().theme);
      render();
      toast(`${t('data.restored')} · ${counts.weights}/${counts.intake}/${counts.sessions}`);
    } catch {
      toast(t('data.badFile'));
    }
  };
  reader.onerror = () => toast(t('data.badFile'));
  reader.readAsText(file);
}

/* Chrome fires beforeinstallprompt once and only if the app is installable.
   Stash it — the button can only be shown while we hold a live event. */
let installPrompt = null;

function isStandalone() {
  return matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
}

function syncInstallUi() {
  const btn = $('#btnInstall');
  if (!btn) return;                       // not on the settings view
  const ios = /iphone|ipad|ipod/i.test(navigator.userAgent);
  const done = isStandalone();
  btn.hidden = done || !installPrompt;
  $('#installDone').hidden = !done;
  // iOS never fires beforeinstallprompt; Chrome may not have fired it yet.
  // Always leave one usable route on screen rather than an empty card.
  $('#installIos').hidden = done || !ios || !!installPrompt;
  $('#installManual').hidden = done || ios || !!installPrompt;
}

async function syncPersistUi() {
  const el = $('#persistState');
  if (!el) return;
  const ok = await S.isPersisted();
  el.textContent = ok === true ? t('data.persistOn')
                 : ok === false ? t('data.persistOff')
                 : '—';
}

/* ===================================================================
   Router + delegated events
   =================================================================== */

const VIEWS = {
  today:    { render: viewToday,    title: 'today.title'    },
  fluid:    { render: viewFluid,    title: 'fluid.title'    },
  weight:   { render: viewWeight,   title: 'weight.title'   },
  meds:     { render: viewMeds,     title: 'meds.title'     },
  session:  { render: viewSession,  title: 'session.title'  },
  diet:     { render: () => Diet.viewDiet(), title: 'diet.title' },
  settings: { render: viewSettings, title: 'settings.title' }
};

export function go(name) {
  view = VIEWS[name] ? name : 'today';
  location.hash = '#' + view;
  render();
  // Move SR focus to content on route change, but don't let the browser's
  // default focus-scroll shove the new view under the sticky gear button —
  // main always starts the view at the top already.
  $('#main').focus({ preventScroll: true });
  scrollTo(0, 0);
}

function render() {
  const v = VIEWS[view];
  $('#main').innerHTML = v.render();
  // No app bar to retitle — the document title carries the view name for
  // tab labels and screen-reader announcements instead.
  document.title = `${t(v.title)} — ${t('app.name')}`;

  $$('.nav__item').forEach(b => {
    const active = b.dataset.go === view;
    b.setAttribute('aria-current', active ? 'page' : 'false');
    b.querySelector('span').textContent = t('nav.' + b.dataset.go);
  });
  $('#btnSettings').setAttribute('aria-label', t('settings.title'));

  // Settings-only widgets; both no-op on other views.
  syncInstallUi();
  syncPersistUi();
}

function onClick(e) {
  const el = e.target.closest('[data-go],[data-ml],[data-lang],[data-sched],[data-custom-day],' +
    '[data-del-intake],[data-del-weight],[data-del-session],[data-empty-action],' +
    '[data-toggle-med],[data-edit-med],[data-toggle-chk],[data-del-hdbp],[data-cal-nav],' +
    '#btnWeigh,#btnSession,#btnSettings,#btnAddMed,#btnLogHdBp,#pSave,#btnPrint,#btnWipe,' +
    '#btnCalibrate,#btnExport,#btnImport,#btnInstall,' +
    '#btnCalSchedule,#btnCalWeigh,#btnCalSessions,#btnCalGoogle');
  if (!el) return;

  if (el.id === 'btnCalSchedule') return calSchedule();
  if (el.id === 'btnCalWeigh')    return calWeighIn();
  if (el.id === 'btnCalSessions') return calSessions();
  if (el.id === 'btnCalGoogle')   return calOpenGoogle();

  if (el.dataset.calNav) {
    setCalCursor(new Date(calCursor.getFullYear(), calCursor.getMonth() + Number(el.dataset.calNav), 1));
    return render();
  }

  if (el.dataset.go)         return go(el.dataset.go);
  if (el.id === 'btnSettings') return go('settings');
  if (el.id === 'btnWeigh')  return sheetWeight();
  if (el.id === 'btnSession') return sheetSession();
  if (el.id === 'btnAddMed') return sheetMedication();
  if (el.dataset.toggleMed)  return S.toggleMedicationTaken(el.dataset.toggleMed);
  if (el.dataset.editMed)    return sheetMedication(el.dataset.editMed);
  if (el.dataset.toggleChk)  return S.toggleChecklistItem(el.dataset.toggleChk);
  if (el.id === 'btnLogHdBp') return sheetHdBp();
  if (el.dataset.delHdbp) {
    const entry = S.getHdBp().find(r => r.id === el.dataset.delHdbp);
    S.deleteHdBp(entry.id);
    return toast(t('common.delete'), t('common.undo'), () => S.restoreHdBp(entry));
  }
  if (el.id === 'btnCalibrate') return sheetCalibrate();
  if (el.id === 'btnExport') return exportBackup();
  if (el.id === 'btnImport') return $('#importFile').click();

  if (el.id === 'btnInstall') {
    if (!installPrompt) return;
    installPrompt.prompt();
    installPrompt.userChoice.finally(() => { installPrompt = null; syncInstallUi(); });
    return;
  }

  if (el.dataset.emptyAction) {
    return el.dataset.emptyAction === 'session' ? sheetSession() : sheetWeight();
  }

  if (el.dataset.ml !== undefined) {
    const ml = Number(el.dataset.ml);
    return ml ? addDrink(ml, el.dataset.key) : sheetCustomDrink();
  }

  if (el.dataset.lang) {
    setLang(el.dataset.lang);
    S.saveProfile({ lang: el.dataset.lang });
    return;                                   // store emit() triggers render
  }

  if (el.dataset.sched)     return S.saveProfile({ schedule: el.dataset.sched });
  if (el.dataset.customDay !== undefined) {
    const dow = Number(el.dataset.customDay);
    const days = new Set(S.getProfile().customDays || []);
    days.has(dow) ? days.delete(dow) : days.add(dow);
    return S.saveProfile({ schedule: 'CUSTOM', customDays: [...days].sort() });
  }

  if (el.dataset.delIntake) {
    const entry = S.getIntake().find(i => i.id === el.dataset.delIntake);
    S.deleteIntake(entry.id);
    return toast(t('fluid.removed'), t('common.undo'), () => S.restoreIntake(entry));
  }
  if (el.dataset.delWeight)  return S.deleteWeight(el.dataset.delWeight);
  if (el.dataset.delSession) return S.deleteSession(el.dataset.delSession);

  if (el.id === 'pSave') {
    const dry   = readNumber($('#pDry'),   { min: 20,  max: 250,  required: false });
    if (dry === null) return $('#pDry').focus();
    const allow = readNumber($('#pAllow'), { min: 200, max: 3000, required: false });
    if (allow === null) return $('#pAllow').focus();
    const idwg  = readNumber($('#pIdwg'),  { min: 0.5, max: 6,    required: false });
    if (idwg === null) return $('#pIdwg').focus();
    
    const name    = $('#pName')?.value.trim() ?? '';
    const booklet = $('#pBooklet')?.value.trim() ?? '';
    const doctor  = $('#pDoctor')?.value.trim() ?? '';
    const station = $('#pStation')?.value.trim() ?? '';
    const nurse   = $('#pNurse')?.value.trim() ?? '';
    const emerg   = $('#pEmerg')?.value.trim() ?? '';

    S.saveProfile({
      name,
      bookletNo: booklet,
      doctorName: doctor,
      stationNo: station,
      nursePhone: nurse,
      emergencyPhone: emerg,
      dryWeightKg: dry ?? null,
      allowanceMl: allow ?? null,
      idwgLimitKg: idwg ?? 2.0,
      setupDone: true
    });
    return toast(t('settings.saved'));
  }

  if (el.id === 'btnPrint') return printSummary();
  if (el.id === 'btnWipe') {
    if (confirm(t('settings.wipeConfirm'))) { S.wipeAll(); go('today'); }
    return;
  }
}

/* ---------- theme ---------- */

// Light-only theme: any stored profile.theme value is ignored (kept in the
// profile so old backups still validate).
function applyTheme() {
  document.documentElement.removeAttribute('data-theme');
}

/* ---------- offline banner ---------- */

function wireNetwork() {
  const show = () => {
    const b = $('#offline');
    b.hidden = navigator.onLine;
    b.querySelector('span').textContent = t('common.offline');
  };
  addEventListener('online', show);
  addEventListener('offline', show);
  show();
}

/* ---------- diet feature (js/diet-view.js) ---------- */

export const Diet = initDiet({ $, $$, esc, icon, t, toast, openSheet, closeSheet, readNumber, fmtDate, fmtTime });

/* ---------- boot ---------- */

function boot() {
  const p = S.getProfile();
  setLang(p.lang);
  applyTheme(p.theme);

  view = (location.hash || '#today').slice(1);
  if (!VIEWS[view]) view = 'today';

  document.addEventListener('click', onClick);

  // The file input is re-created on every render, so listen at document level.
  document.addEventListener('change', e => {
    if (e.target.id === 'pSessionTime' && e.target.value) {
      return void S.saveProfile({ sessionTime: e.target.value });
    }
    if (e.target.id === 'pWeighTime' && e.target.value) {
      return void S.saveProfile({ weighTime: e.target.value });
    }
    if (e.target.id !== 'importFile') return;
    const file = e.target.files?.[0];
    e.target.value = '';                 // allow re-picking the same file
    if (file) importBackup(file);
  });

  // Ask the browser to stop treating our data as evictable cache.
  S.requestPersistence().then(syncPersistUi);

  addEventListener('beforeinstallprompt', e => {
    e.preventDefault();                  // keep the mini-infobar off; we have our own button
    installPrompt = e;
    syncInstallUi();
  });
  addEventListener('appinstalled', () => { installPrompt = null; syncInstallUi(); });

  addEventListener('hashchange', () => {
    const next = location.hash.slice(1);
    if (VIEWS[next] && next !== view) { view = next; render(); }
  });

  S.subscribe(render);
  wireNetwork();
  render();

  // First run with no targets: drop the patient straight into settings.
  if (!p.setupDone) { view = 'settings'; render(); }

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js').catch(() => { /* fine offline */ });
  }
}

// A module script can finish loading after DOMContentLoaded has already
// fired (slow network, cheap phone) — the listener would then never run.
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot);
} else {
  boot();
}
