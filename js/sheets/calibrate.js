/* sheets/calibrate.js — moved from app.js (F-RESTRUCTURE-01). */

import * as S from '../store.js';
import { t } from '../i18n.js';
import { $, esc, fmtDate, nf } from '../ui/format.js';
import { icon } from '../ui/icons.js';
import { closeSheet, openSheet, readNumber } from '../ui/sheet.js';
import { toast } from '../ui/toast.js';

export function sheetCalibrate() {
  const last = S.lastSession();
  if (!last) { toast(t('scale.needSession')); return; }

  openSheet({
    title: t('scale.calibrate'),
    body: `
      <p class="banner">${icon('info')}<span>${esc(t('scale.why'))}</span></p>
      <div class="field">
        <label>${esc(t('scale.step1'))}</label>
        <p class="status__num tnum" style="font-size:var(--t-xl);text-align:center;margin:0">
          ${nf(last.postKg, 1)}<span class="status__unit"> ${esc(t('common.kg'))}</span>
        </p>
        <p class="hint" style="text-align:center">${esc(fmtDate(last.ts))}</p>
      </div>
      <div class="field">
        <label for="cHome">${esc(t('scale.step2'))} <span class="req">*</span></label>
        <input class="input input--big" id="cHome" type="number" inputmode="decimal"
               step="0.1" min="20" max="250" autocomplete="off" enterkeyhint="done">
        <div class="err" id="cHome-err" role="alert" aria-live="polite"></div>
      </div>
      <button type="button" class="btn btn--primary" id="cSave">
        ${icon('check')}<span>${esc(t('common.save'))}</span>
      </button>`,
    onMount(sheet) {
      const input = $('#cHome', sheet);
      const save = () => {
        const home = readNumber(input, { min: 20, max: 250 });
        if (home == null) { input.focus(); return; }
        S.setScaleOffset(home, last.postKg);
        closeSheet();
        toast(t('settings.saved'));
      };
      $('#cSave', sheet).addEventListener('click', save);
      input.addEventListener('keydown', e => { if (e.key === 'Enter') save(); });
    }
  });
}

/* ===================================================================
   View: Today
   =================================================================== */
