/* ui/format.js — moved from app.js (F-RESTRUCTURE-01). */

import * as S from '../store.js';
import { getLang, t } from '../i18n.js';

export const $  = (sel, root = document) => root.querySelector(sel);

export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

/** Escape anything that reaches innerHTML. Patient-entered names go here. */
export const esc = s => String(s ?? '').replace(/[&<>"']/g, c =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export const nf = (n, d = 1) => Number(n).toFixed(d);

export const localeTag = () => ({ ceb: 'fil-PH', tl: 'fil-PH', en: 'en-PH' }[getLang()]);

export function fmtDate(ts) {
  return new Date(ts).toLocaleDateString(localeTag(), { day: 'numeric', month: 'short' });
}

export function fmtTime(ts) {
  return new Date(ts).toLocaleTimeString(localeTag(), { hour: 'numeric', minute: '2-digit' });
}



export function relDay(day) {
  const d = S.daysBetween(day, S.dayKey());
  if (d === 0) return t('session.today');
  if (d === 1) return t('session.yesterday');
  return `${d} ${t('session.daysAgo')}`;
}
