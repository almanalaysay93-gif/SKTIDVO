/* views/meds.js — moved from app.js (F-RESTRUCTURE-01). */

import * as S from '../store.js';
import { t } from '../i18n.js';
import { esc } from '../ui/format.js';
import { icon } from '../ui/icons.js';

export function viewMeds() {
  const meds = S.getMedications();
  const logs = S.todayMedLogs();
  const activeMeds = meds.filter(m => m.active !== false);

  const categories = [
    { id: 'meals', title: t('meds.meals'), icon: 'cup' },
    { id: 'morning', title: t('meds.morning'), icon: 'sun' },
    { id: 'afternoon', title: t('meds.afternoon'), icon: 'sun' },
    { id: 'evening', title: t('meds.evening'), icon: 'pill' },
    { id: 'bedtime', title: t('meds.bedtime'), icon: 'pill' },
    { id: 'dialysis_days', title: t('meds.dialysisDays'), icon: 'activity' }
  ];

  return `
  <div class="view">
    <div style="display:flex;flex-wrap:wrap;gap:var(--s-2);justify-content:space-between;align-items:center;margin-bottom:var(--s-4)">
      <h2 style="font-size:var(--t-xl);margin:0">${esc(t('meds.title'))}</h2>
      <button type="button" class="btn btn--primary" id="btnAddMed">
        ${icon('plus')}<span>${esc(t('meds.addBtn'))}</span>
      </button>
    </div>

    ${activeMeds.length ? categories.map(cat => {
      const catMeds = activeMeds.filter(m => m.timing === cat.id);
      if (!catMeds.length) return '';
      return `
        <h3 class="section-title">${esc(cat.title)}</h3>
        ${catMeds.map(m => {
          const takenKey = `${m.id}_default`;
          const taken = !!logs[takenKey];
          return `
          <div class="med-row ${taken ? 'med-row--taken' : ''}">
            <div class="med-row__info">
              <div class="med-row__title">${esc(m.name)}</div>
              <div class="med-row__dose">${esc(m.dose)}</div>
              ${m.notes ? `<div class="med-row__notes">${esc(m.notes)}</div>` : ''}
              ${m.holdOnDialysis ? `<span class="med-tag med-tag--hold">${esc(t('meds.holdAlert'))}</span>` : ''}
            </div>
            <button type="button" class="med-check-btn" data-toggle-med="${esc(m.id)}" aria-label="Toggle taken">
              ${taken ? icon('check') : ''}
            </button>
            <button type="button" class="row__btn" data-edit-med="${esc(m.id)}" aria-label="Edit medication">
              ${icon('edit')}
            </button>
          </div>`;
        }).join('')}`;
    }).join('') : `<div class="empty">${icon('pill')}<p>${esc(t('meds.empty'))}</p></div>`}
  </div>`;
}
