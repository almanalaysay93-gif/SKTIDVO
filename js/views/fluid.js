/* views/fluid.js — moved from app.js (F-RESTRUCTURE-01). */

import * as S from '../store.js';
import { t } from '../i18n.js';
import { esc, fmtTime } from '../ui/format.js';
import { icon } from '../ui/icons.js';
import { toast } from '../ui/toast.js';
import { fluidLine } from './today.js';

export const DRINKS = [
  { key: 'fluid.glass',  ml: 250, icon: 'glass'  },
  { key: 'fluid.cup',    ml: 200, icon: 'cup'    },
  { key: 'fluid.bottle', ml: 500, icon: 'bottle' },
  { key: 'fluid.other',  ml: 0,   icon: 'plus'   }
];

/* Fluid that arrives as food. Patients log drinks honestly and still turn up
   overloaded because sabaw, lugaw and ice never felt like "drinking".
   Volumes are per typical serving. */
export const FOODS = [
  { key: 'fluid.sabaw', ml: 240, icon: 'bowl'  },   // 1 cup of soup
  { key: 'fluid.lugaw', ml: 300, icon: 'bowl'  },   // 1 bowl
  { key: 'fluid.kape',  ml: 150, icon: 'cup'   },   // 1 cup
  { key: 'fluid.yelo',  ml: 120, icon: 'ice'   }    // 1 cup of ice, melted
];

export function addDrink(ml, labelKey) {
  const entry = S.logIntake(ml, labelKey);
  toast(`${t('fluid.added')} ${ml} ${t('common.ml')}`, t('common.undo'), () => {
    S.deleteIntake(entry.id);
    toast(t('fluid.removed'));
  });
}

export function tiles(list) {
  return `<div class="drinks">
    ${list.map(d => `
      <button type="button" class="drink" data-ml="${d.ml}" data-key="${d.key}">
        ${icon(d.icon)}
        <span class="drink__name">${esc(t(d.key))}</span>
        <span class="drink__ml tnum">${d.ml ? d.ml + ' ' + t('common.ml') : '—'}</span>
      </button>`).join('')}
  </div>`;
}

export function drinkGrid() {
  return `
  <h2 class="section-title">${esc(t('fluid.drinkTitle'))}</h2>
  ${tiles(DRINKS)}
  <h2 class="section-title">${esc(t('fluid.foodTitle'))}</h2>
  <p class="banner">${icon('info')}<span>${esc(t('fluid.foodHint'))}</span></p>
  ${tiles(FOODS)}`;
}

export function viewFluid() {
  const list = S.todayIntake();
  return `
  <div class="view">
    ${fluidLine()}
    ${drinkGrid()}
    <h2 class="section-title">${esc(t('fluid.logTitle'))}</h2>
    <div class="card">
      ${list.length ? `<ul>${list.map(i => `
        <li class="row">
          <span class="row__icon">${icon('droplet')}</span>
          <span class="row__body">
            <span class="row__title">${esc(t(i.labelKey))}</span>
            <span class="row__sub">${esc(fmtTime(i.ts))}</span>
          </span>
          <span class="row__val tnum">${i.ml} ${esc(t('common.ml'))}</span>
          <button type="button" class="row__btn" data-del-intake="${i.id}"
                  aria-label="${esc(t('common.delete'))} ${i.ml} ${esc(t('common.ml'))}">
            ${icon('trash')}
          </button>
        </li>`).join('')}</ul>`
        : `<div class="empty">${icon('droplet')}<p>${esc(t('fluid.empty'))}</p></div>`}
    </div>
  </div>`;
}

/* ===================================================================
   View: Weight  (SVG sparkline, no chart library — must work offline)
   =================================================================== */
