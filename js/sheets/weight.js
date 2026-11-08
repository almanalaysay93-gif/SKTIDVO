/* sheets/weight.js — moved from app.js (F-RESTRUCTURE-01). */

import * as S from '../store.js';
import { t } from '../i18n.js';
import { $, esc } from '../ui/format.js';
import { icon } from '../ui/icons.js';
import { closeSheet, openSheet, readNumber } from '../ui/sheet.js';
import { toast } from '../ui/toast.js';

export function sheetWeight() {
  const cur = S.todayWeight();
  openSheet({
    title: t('weight.entryTitle'),
    body: `
      <div class="field">
        <label for="wKg">${esc(t('weight.entryTitle'))} <span class="req">*</span></label>
        <input class="input input--big" id="wKg" type="number" inputmode="decimal"
               step="0.1" min="20" max="250" value="${cur ? cur.kg : ''}"
               autocomplete="off" enterkeyhint="done">
        <div class="err" id="wKg-err" role="alert" aria-live="polite"></div>
        <p class="hint">${esc(t('weight.hint'))}</p>
      </div>
      <button type="button" class="btn btn--primary" id="wSave">
        ${icon('check')}<span>${esc(t('common.save'))}</span>
      </button>`,
    onMount(sheet) {
      const input = $('#wKg', sheet);
      const save = () => {
        const kg = readNumber(input, { min: 20, max: 250 });
        if (kg == null) { input.focus(); return; }
        S.logWeight(kg);
        closeSheet();
        toast(t('settings.saved'));
      };
      $('#wSave', sheet).addEventListener('click', save);
      input.addEventListener('keydown', e => { if (e.key === 'Enter') save(); });
    }
  });
}
