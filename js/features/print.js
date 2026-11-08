/* features/print.js — moved from app.js (F-RESTRUCTURE-01). */

import * as S from '../store.js';
import { t } from '../i18n.js';
import { esc, nf } from '../ui/format.js';

export function printSummary() {
  const s = S.buildSummary();
  const p = s.profile;
  const w = document.createElement('div');
  w.id = 'printOnly';
  w.innerHTML = `
    <div class="card">
      <h2>${esc(t('settings.export'))} — ${esc(t('app.sub'))}</h2>
      <p class="hint">${esc(new Date().toLocaleString())}</p>
      <ul>
        <li class="row"><span class="row__body">Dry weight</span>
            <span class="row__val tnum">${p.dryWeightKg ?? '—'} kg</span></li>
        <li class="row"><span class="row__body">Daily fluid allowance</span>
            <span class="row__val tnum">${p.allowanceMl ?? '—'} mL</span></li>
        <li class="row"><span class="row__body">Schedule</span>
            <span class="row__val">${esc(p.schedule)}</span></li>
        <li class="row"><span class="row__body">IDWG now (gap ${s.gapDays ?? '—'}d)</span>
            <span class="row__val tnum">${s.idwgKg != null ? nf(s.idwgKg, 1) + ' kg' : '—'}
              / limit ${nf(s.limitKg, 1)} kg</span></li>
        <li class="row"><span class="row__body">Fluid today</span>
            <span class="row__val tnum">${s.todayIntakeMl} mL</span></li>
      </ul>
      <h3 style="margin-top:16px">Weights (last 14)</h3>
      <ul>${s.weights.map(x => `<li class="row"><span class="row__body">${esc(x.day)}</span>
             <span class="row__val tnum">${nf(x.kg, 1)} kg</span></li>`).join('') || '<li>—</li>'}</ul>
      <h3 style="margin-top:16px">Dialysis (last 6)</h3>
      <ul>${s.sessions.map(x => `<li class="row"><span class="row__body">${esc(x.day)}</span>
             <span class="row__val tnum">post ${nf(x.postKg, 1)} kg${
               x.ufL != null ? ` · UF ${nf(x.ufL, 1)} L` : ''}${
               x.bpSys ? ` · BP ${x.bpSys}/${x.bpDia ?? '—'}` : ''}</span></li>`).join('') || '<li>—</li>'}</ul>
      <p class="hint" style="margin-top:16px">${esc(t('legal.disclaimer'))}</p>
    </div>`;
  document.body.appendChild(w);
  window.print();
  setTimeout(() => w.remove(), 500);
}

/* ===================================================================
   Backup / restore / install
   =================================================================== */
