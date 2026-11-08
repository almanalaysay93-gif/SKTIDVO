/* ui/charts.js — moved from app.js (F-RESTRUCTURE-01). */

import * as S from '../store.js';
import { t } from '../i18n.js';
import { esc, nf } from './format.js';
import { icon } from './icons.js';

export function miniBars(values, { refValue, dangerAbove } = {}) {
  const n = values.length;
  if (n < 2) return '';
  const W = 320, H = 96, PAD = 8, gap = 6;
  const top = Math.max(...values, refValue || 0, 1) * 1.08;
  const barW = (W - PAD * 2 - gap * (n - 1)) / n;
  const y = v => H - PAD - (v / top) * (H - PAD * 2);
  const bars = values.map((v, i) => {
    const yTop = y(v);
    const h = Math.max(2, (H - PAD) - yTop);
    const x = PAD + i * (barW + gap);
    const over = dangerAbove != null && v > dangerAbove;
    return `<rect class="bar${over ? ' bar--danger' : ''}"
              x="${x.toFixed(1)}" y="${yTop.toFixed(1)}"
              width="${barW.toFixed(1)}" height="${h.toFixed(1)}" rx="3"/>`;
  }).join('');
  const ref = refValue != null
    ? `<line class="spark__dry" x1="${PAD}" y1="${y(refValue).toFixed(1)}"
             x2="${W - PAD}" y2="${y(refValue).toFixed(1)}"/>`
    : '';
  return `<svg class="minibars" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none"
       role="img" aria-label="${n} bars, most recent ${nf(values[values.length - 1], 0)}">
    ${ref}${bars}
  </svg>`;
}

export function fluidWeekChart() {
  const p = S.getProfile();
  const all = S.getIntake();
  const days = [...Array(7)].map((_, i) => {
    const d = new Date(); d.setDate(d.getDate() - (6 - i)); return S.dayKey(d);
  });
  const totals = days.map(key => all.filter(x => x.day === key).reduce((sum, x) => sum + x.ml, 0));
  if (totals.filter(v => v > 0).length < 2) return '';
  return `
  <button type="button" class="card chart-card" data-go="fluid">
    <div class="card__head">${icon('droplet')}<h2>${esc(t('fluid.title'))}</h2></div>
    ${miniBars(totals, { refValue: p.allowanceMl, dangerAbove: p.allowanceMl })}
    <div class="chart-legend">
      <span><i style="background:var(--brand)"></i>${esc(t('fluid.logTitle'))}</span>
      <span><i style="background:var(--fg-muted)"></i>${esc(t('today.limitLabel'))}: ${p.allowanceMl} ${esc(t('common.ml'))}</span>
    </div>
  </button>`;
}

export function weightTrendChart() {
  const p = S.getProfile();
  const recent = S.getWeights().slice(0, 14);
  if (recent.length < 2) return '';
  return `
  <button type="button" class="card chart-card" data-go="weight">
    <div class="card__head">${icon('trending')}<h2>${esc(t('weight.chartTitle'))}</h2></div>
    ${sparkline(recent, p.dryWeightKg)}
  </button>`;
}

export function medsTodayChart() {
  const meds = S.getMedications().filter(m => m.active !== false);
  if (!meds.length) return '';
  const logs = S.todayMedLogs();
  const taken = meds.filter(m => logs[`${m.id}_default`]).length;
  const pct = Math.round((taken / meds.length) * 100);
  return `
  <button type="button" class="card chart-card" data-go="meds">
    <div class="card__head">${icon('pill')}<h2>${esc(t('meds.title'))}</h2></div>
    <div class="meter meter--brand">
      <div class="meter__track">
        <div class="meter__fill" style="width:${pct}%" role="progressbar"
             aria-valuenow="${taken}" aria-valuemin="0" aria-valuemax="${meds.length}"
             aria-label="${esc(t('meds.title'))}"></div>
      </div>
      <p class="meter__scale">
        <span class="tnum">${taken} / ${meds.length} ${esc(t('meds.taken'))}</span>
        <span class="tnum">${pct}%</span>
      </p>
    </div>
  </button>`;
}

export function sessionUfChart() {
  const values = S.getSessions().slice(0, 6).reverse()
    .map(s => s.ufL).filter(v => v != null);
  if (values.length < 2) return '';
  return `
  <button type="button" class="card chart-card" data-go="session">
    <div class="card__head">${icon('activity')}<h2>${esc(t('session.title'))}</h2></div>
    ${miniBars(values, {})}
    <div class="chart-legend">
      <span><i style="background:var(--brand)"></i>${esc(t('session.uf'))}</span>
    </div>
  </button>`;
}

export function sparkline(weights, dryKg) {
  if (weights.length < 2) return '';
  const pts = [...weights].reverse();               // oldest → newest
  const W = 320, H = 120, PAD = 8;
  const vals = pts.map(p => p.kg).concat(dryKg ? [dryKg] : []);
  const min = Math.min(...vals) - 0.5;
  const max = Math.max(...vals) + 0.5;
  const span = (max - min) || 1;

  const x = i => PAD + (i * (W - PAD * 2)) / (pts.length - 1);
  const y = v => PAD + (H - PAD * 2) * (1 - (v - min) / span);

  const line = pts.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(p.kg).toFixed(1)}`).join(' ');
  const dots = pts.map((p, i) =>
    `<circle class="spark__dot" cx="${x(i).toFixed(1)}" cy="${y(p.kg).toFixed(1)}" r="3.5"/>`).join('');
  const dry = dryKg
    ? `<line class="spark__dry" x1="${PAD}" y1="${y(dryKg).toFixed(1)}"
             x2="${W - PAD}" y2="${y(dryKg).toFixed(1)}"/>` : '';

  return `
  <svg class="spark" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none"
       role="img" aria-label="${esc(t('weight.chartTitle'))}: ${pts.length} points,
       ${nf(min + 0.5, 1)}–${nf(max - 0.5, 1)} kg">
    <line class="spark__grid" x1="${PAD}" y1="${H - PAD}" x2="${W - PAD}" y2="${H - PAD}"/>
    ${dry}
    <path class="spark__line" d="${line}"/>
    ${dots}
  </svg>
  <div class="chart-legend">
    <span><i style="background:var(--brand)"></i>${esc(t('weight.title'))}</span>
    ${dryKg ? `<span><i style="background:var(--fg-muted)"></i>${esc(t('weight.dryLine'))} ${nf(dryKg, 1)} kg</span>` : ''}
  </div>`;
}
