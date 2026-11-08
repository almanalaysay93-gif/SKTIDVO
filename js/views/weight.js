/* views/weight.js — moved from app.js (F-RESTRUCTURE-01). */

import * as S from '../store.js';
import { t } from '../i18n.js';
import { sparkline } from '../ui/charts.js';
import { esc, fmtDate, nf } from '../ui/format.js';
import { icon } from '../ui/icons.js';

export function viewWeight() {
  const p = S.getProfile();
  const all = S.getWeights();
  const recent = all.slice(0, 14);
  return `
  <div class="view">
    <div class="card">
      <div class="card__head">${icon('trending')}<h2>${esc(t('weight.chartTitle'))}</h2></div>
      ${recent.length >= 2
        ? sparkline(recent, p.dryWeightKg)
        : `<div class="empty">${icon('trending')}<p>${esc(t('weight.empty'))}</p></div>`}
    </div>

    <button type="button" class="btn btn--primary" id="btnWeigh">
      ${icon('plus')}<span>${esc(t('today.weighBtn'))}</span>
    </button>

    <h2 class="section-title">${esc(t('weight.tableTitle'))}</h2>
    <div class="card">
      ${all.length ? `<ul>${all.slice(0, 30).map(w => {
        const diff = p.dryWeightKg ? w.kg - p.dryWeightKg : null;
        return `
        <li class="row">
          <span class="row__icon">${icon('scale')}</span>
          <span class="row__body">
            <span class="row__title">${esc(fmtDate(w.ts))}</span>
            ${diff != null ? `<span class="row__sub tnum">${diff > 0 ? '+' : ''}${nf(diff, 1)} kg vs dry weight</span>` : ''}
          </span>
          <span class="row__val tnum">${nf(w.kg, 1)} ${esc(t('common.kg'))}</span>
          <button type="button" class="row__btn" data-del-weight="${w.id}"
                  aria-label="${esc(t('common.delete'))} ${esc(fmtDate(w.ts))}">${icon('trash')}</button>
        </li>`; }).join('')}</ul>`
        : `<div class="empty">${icon('scale')}<p>${esc(t('weight.empty'))}</p></div>`}
    </div>
  </div>`;
}
