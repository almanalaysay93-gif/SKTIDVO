/* sheets/drink.js — moved from app.js (F-RESTRUCTURE-01). */

import { t } from '../i18n.js';
import { $, esc } from '../ui/format.js';
import { icon } from '../ui/icons.js';
import { closeSheet, openSheet, readNumber } from '../ui/sheet.js';
import { addDrink } from '../views/fluid.js';

export function sheetCustomDrink() {
  openSheet({
    title: t('fluid.customTitle'),
    body: `
      <div class="field">
        <label for="dMl">${esc(t('common.ml'))} <span class="req">*</span></label>
        <input class="input input--big" id="dMl" type="number" inputmode="numeric"
               step="10" min="10" max="3000" autocomplete="off" enterkeyhint="done">
        <div class="err" id="dMl-err" role="alert" aria-live="polite"></div>
      </div>
      <button type="button" class="btn btn--primary" id="dSave">
        ${icon('check')}<span>${esc(t('common.save'))}</span>
      </button>`,
    onMount(sheet) {
      const input = $('#dMl', sheet);
      const save = () => {
        const ml = readNumber(input, { min: 10, max: 3000 });
        if (ml == null) { input.focus(); return; }
        closeSheet();
        addDrink(ml, 'fluid.other');
      };
      $('#dSave', sheet).addEventListener('click', save);
      input.addEventListener('keydown', e => { if (e.key === 'Enter') save(); });
    }
  });
}
