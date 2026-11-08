/* sheets/hdbp.js — moved from app.js (F-RESTRUCTURE-01). */

import * as S from '../store.js';
import { t } from '../i18n.js';
import { $, esc } from '../ui/format.js';
import { icon } from '../ui/icons.js';
import { closeSheet, openSheet, readNumber } from '../ui/sheet.js';
import { toast } from '../ui/toast.js';

export function sheetHdBp() {
  openSheet({
    title: t('hdbp.sheetTitle'),
    body: `
      <div class="field-row">
        <div class="field">
          <label for="hSys">${esc(t('hdbp.sys'))} <span class="req">*</span></label>
          <input class="input input--big" id="hSys" type="number" inputmode="numeric"
                 placeholder="120" min="50" max="260" autocomplete="off">
          <div class="err" id="hSys-err" role="alert" aria-live="polite"></div>
        </div>
        <div class="field">
          <label for="hDia">${esc(t('hdbp.dia'))} <span class="req">*</span></label>
          <input class="input input--big" id="hDia" type="number" inputmode="numeric"
                 placeholder="80" min="30" max="180" autocomplete="off">
          <div class="err" id="hDia-err" role="alert" aria-live="polite"></div>
        </div>
      </div>
      <div class="field">
        <label for="hPulse">${esc(t('hdbp.pulse'))}</label>
        <input class="input" id="hPulse" type="number" inputmode="numeric"
               placeholder="72" min="30" max="220" autocomplete="off">
        <div class="err" id="hPulse-err" role="alert" aria-live="polite"></div>
      </div>
      <div class="field">
        <label for="hNote">${esc(t('hdbp.note'))}</label>
        <input class="input" id="hNote" type="text" maxlength="200" autocomplete="off">
      </div>
      <button type="button" class="btn btn--primary" id="hSave">
        ${icon('check')}<span>${esc(t('common.save'))}</span>
      </button>`,
    onMount(sheet) {
      const save = () => {
        const sys = readNumber($('#hSys', sheet), { min: 50, max: 260 });
        if (sys == null) { $('#hSys', sheet).focus(); return; }
        const dia = readNumber($('#hDia', sheet), { min: 30, max: 180 });
        if (dia == null) { $('#hDia', sheet).focus(); return; }
        const pulse = readNumber($('#hPulse', sheet), { min: 30, max: 220, required: false });
        if (pulse === null) { $('#hPulse', sheet).focus(); return; }
        const note = $('#hNote', sheet).value.trim();

        const entry = S.logHdBp({ sys, dia, pulse: pulse ?? null, note });
        closeSheet();
        if (S.isLowSys(entry.sys)) toast(t('hdbp.lowAdvice'));
        else toast(t('hdbp.saved'));
      };
      $('#hSave', sheet).addEventListener('click', save);
      sheet.addEventListener('keydown', e => { if (e.key === 'Enter') save(); });
    }
  });
}
