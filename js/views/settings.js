/* views/settings.js — moved from app.js (F-RESTRUCTURE-01). */

import * as S from '../store.js';
import { getLang, langName, LANGS, t } from '../i18n.js';
import { esc, fmtDate, localeTag, nf } from '../ui/format.js';
import { icon } from '../ui/icons.js';
import { Diet } from './diet.js';
import { syncSection } from './sync.js';

export function viewSettings() {
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

    ${syncSection()}

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
