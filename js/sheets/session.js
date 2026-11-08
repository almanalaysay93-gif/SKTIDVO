/* sheets/session.js — moved from app.js (F-RESTRUCTURE-01). */

import * as S from '../store.js';
import { t } from '../i18n.js';
import { $, esc } from '../ui/format.js';
import { icon } from '../ui/icons.js';
import { closeSheet, openSheet, readNumber } from '../ui/sheet.js';
import { toast } from '../ui/toast.js';

export function sheetSession() {
  openSheet({
    title: t('session.sheetTitle'),
    body: `
      <div class="field">
        <label for="sPost">${esc(t('session.postKg'))} <span class="req">*</span></label>
        <input class="input input--big" id="sPost" type="number" inputmode="decimal"
               step="0.1" min="20" max="250" autocomplete="off">
        <div class="err" id="sPost-err" role="alert" aria-live="polite"></div>
      </div>
      <div class="field">
        <label for="sPre">${esc(t('session.preKg'))}</label>
        <input class="input" id="sPre" type="number" inputmode="decimal"
               step="0.1" min="20" max="250" autocomplete="off">
        <div class="err" id="sPre-err" role="alert" aria-live="polite"></div>
      </div>
      <div class="field">
        <label for="sUf">${esc(t('session.uf'))}</label>
        <input class="input" id="sUf" type="number" inputmode="decimal"
               step="0.1" min="0" max="8" autocomplete="off">
        <div class="err" id="sUf-err" role="alert" aria-live="polite"></div>
      </div>
      <div class="field">
        <label for="sSys">${esc(t('session.bp'))}</label>
        <div class="field-row">
          <input class="input" id="sSys" type="number" inputmode="numeric"
                 placeholder="120" min="50" max="260" autocomplete="off"
                 aria-label="Systolic">
          <input class="input" id="sDia" type="number" inputmode="numeric"
                 placeholder="80" min="30" max="180" autocomplete="off"
                 aria-label="Diastolic">
        </div>
        <div class="err" id="sSys-err" role="alert" aria-live="polite"></div>
      </div>
      <button type="button" class="btn btn--primary" id="sSave">
        ${icon('check')}<span>${esc(t('common.save'))}</span>
      </button>`,
    onMount(sheet) {
      $('#sSave', sheet).addEventListener('click', () => {
        const post = readNumber($('#sPost', sheet), { min: 20, max: 250 });
        if (post == null) { $('#sPost', sheet).focus(); return; }
        const pre = readNumber($('#sPre', sheet), { min: 20, max: 250, required: false });
        if (pre === null) { $('#sPre', sheet).focus(); return; }
        const uf  = readNumber($('#sUf', sheet),  { min: 0,  max: 8,   required: false });
        if (uf === null) { $('#sUf', sheet).focus(); return; }
        const sys = readNumber($('#sSys', sheet), { min: 50, max: 260, required: false });
        if (sys === null) { $('#sSys', sheet).focus(); return; }
        const dia = readNumber($('#sDia', sheet), { min: 30, max: 180, required: false });
        if (dia === null) { $('#sDia', sheet).focus(); return; }

        S.logSession({ postKg: post, preKg: pre ?? null, ufL: uf ?? null,
                       bpSys: sys ?? null, bpDia: dia ?? null });
        closeSheet();
        toast(t('session.saved'));
      });
    }
  });
}
