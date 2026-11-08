/* views/session.js — moved from app.js (F-RESTRUCTURE-01). */

import * as S from '../store.js';
import { t } from '../i18n.js';
import { esc, fmtDate, fmtTime, localeTag, nf, relDay } from '../ui/format.js';
import { icon } from '../ui/icons.js';
import { emptyStatus } from './today.js';

export function hdBpCard() {
  const list = S.todayHdBp();
  return `
  <h2 class="section-title">${esc(t('hdbp.title'))}</h2>
  <div class="card">
    <p class="hint" style="margin-top:0">${esc(t('hdbp.hint'))}</p>
    ${list.length ? `<ul>${list.map(r => {
      const low = S.isLowSys(r.sys);
      return `
      <li class="row">
        <span class="row__icon">${icon('heart-pulse')}</span>
        <span class="row__body">
          <span class="row__title">
            ${r.sys}/${r.dia}${r.pulse != null ? ` · ${r.pulse} bpm` : ''}
            ${low ? `<span class="med-tag med-tag--hold">${esc(t('hdbp.low'))}</span>` : ''}
          </span>
          <span class="row__sub">${esc(fmtTime(r.ts))}${r.note ? ` · ${esc(r.note)}` : ''}</span>
        </span>
        <button type="button" class="row__btn" data-del-hdbp="${r.id}"
                aria-label="${esc(t('common.delete'))} ${r.sys}/${r.dia}">${icon('trash')}</button>
      </li>`;
    }).join('')}</ul>`
      : `<div class="empty">${icon('heart-pulse')}<p>${esc(t('hdbp.empty'))}</p></div>`}
    <button type="button" class="btn btn--ghost" id="btnLogHdBp" style="width:100%;margin-top:var(--s-3)">
      ${icon('plus')}<span>${esc(t('hdbp.addBtn'))}</span>
    </button>
  </div>`;
}

export function viewSession() {
  const list = S.getSessions();
  const next = S.nextSessionDate();
  const p = S.getProfile();
  const checklist = S.getTodayChecklist();

  return `
  <div class="view">
    ${!list.length ? emptyStatus('today.noBaseline', 'today.noBaselineMsg', 'session') : ''}
    <div class="card">
      <div class="card__head">${icon('calendar')}<h2>${esc(t('session.nextDue'))}</h2></div>
      <p class="status__num tnum" style="font-size:var(--t-xl);text-align:center">
        ${next ? esc(new Intl.DateTimeFormat(localeTag(),
            { weekday: 'long', day: 'numeric', month: 'long' }).format(next))
          : '—'}
      </p>
      <p class="stat__key" style="text-align:center">
        ${esc(p.schedule)} · Chair Time: ${esc(p.sessionTime)} ${p.stationNo ? `· Station ${esc(p.stationNo)}` : ''}
      </p>
    </div>

    <h2 class="section-title">${esc(t('checklist.title'))}</h2>
    <div class="card">
      ${checklist.map(item => `
        <div class="chk-item ${item.done ? 'chk-item--done' : ''}" data-toggle-chk="${item.id}">
          <div class="chk-box">${item.done ? icon('check') : ''}</div>
          <span>${esc(item.text)}</span>
        </div>
      `).join('')}
    </div>

    ${hdBpCard()}

    <button type="button" class="btn btn--primary" id="btnSession">
      ${icon('plus')}<span>${esc(t('session.addBtn'))}</span>
    </button>

    <h2 class="section-title">${esc(t('session.title'))}</h2>
    <div class="card">
      ${list.length ? `<ul>${list.slice(0, 20).map(s => `
        <li class="row">
          <span class="row__icon">${icon('activity')}</span>
          <span class="row__body">
            <span class="row__title">${esc(fmtDate(s.ts))} · ${esc(relDay(s.day))}</span>
            <span class="row__sub tnum">
              ${esc(t('session.postKg'))} ${nf(s.postKg, 1)} kg${
                s.ufL != null ? ` · UF ${nf(s.ufL, 1)} L` : ''}${
                s.bpSys ? ` · BP ${s.bpSys}/${s.bpDia ?? '—'}` : ''}
            </span>
          </span>
          <button type="button" class="row__btn" data-del-session="${s.id}"
                  aria-label="${esc(t('common.delete'))} ${esc(fmtDate(s.ts))}">${icon('trash')}</button>
        </li>`).join('')}</ul>`
        : `<div class="empty">${icon('activity')}<p>${esc(t('session.empty'))}</p></div>`}
    </div>
  </div>`;
}
