/* ===================================================================
   diet-view.js — Diet tab, Add-food sheet, custom foods, labs and the
   clinician-approval / limit-rule settings.

   Shares app.js helpers through initDiet() so the sheet, toast and
   escaping behave exactly like the rest of the app. Events are handled
   by delegation on [data-diet] so re-renders need no rewiring.

   Clinical rule: only APPROVED limits drive bars and warnings. Nothing
   here invents a limit; blank rule = no limit.
   =================================================================== */

import * as S from '../store.js';
import * as F from '../food.js';
import * as L from '../limits.js';
import { t } from '../i18n.js';
import { $, $$, esc, fmtDate, fmtTime } from '../ui/format.js';
import { icon } from '../ui/icons.js';
import { closeSheet, openSheet, readNumber } from '../ui/sheet.js';
import { toast } from '../ui/toast.js';

const NUTS = [
  { key: 'na',      label: 'diet.na',      unit: 'mg', d: 0 },
  { key: 'k',       label: 'diet.k',       unit: 'mg', d: 0 },
  { key: 'p',       label: 'diet.p',       unit: 'mg', d: 0 },
  { key: 'protein', label: 'diet.protein', unit: 'g',  d: 1 },
  { key: 'fluid',   label: 'diet.fluid',   unit: 'mL', d: 0, from: 'water' }   // water g ≈ mL
];
const PER100 = [
  { key: 'na', label: 'diet.na', unit: 'mg', max: 100000 },
  { key: 'k', label: 'diet.k', unit: 'mg', max: 100000 },
  { key: 'p', label: 'diet.p', unit: 'mg', max: 100000 },
  { key: 'protein', label: 'diet.protein', unit: 'g', max: 100 },
  { key: 'water', label: 'diet.fluid', unit: 'g', max: 100 }
];
const DEBOUNCE_MS = 450;

let H;   // helpers from app.js

const fill = (str, vars) => String(str).replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? '');
const fmt = (v, d) => v == null ? '—' : Number(v).toLocaleString(undefined, { maximumFractionDigits: d, minimumFractionDigits: 0 });
const isNum = v => typeof v === 'number' && Number.isFinite(v);

export function initDiet(helpers) {
  H = helpers;
  document.addEventListener('click', onClick);
  document.addEventListener('change', onChange);
  return { viewDiet, todayCard, settingsSection };
}

/* ===================================================================
   Totals
   =================================================================== */

function dayStatus() {
  const entries = S.getDietLog();
  const { totals, missing } = F.sumDay(entries);
  const limits = S.approvedLimits();
  const rows = NUTS.map(n => {
    const src = n.from || n.key;
    const total = totals[src];
    const limit = limits && isNum(limits[n.key]) ? limits[n.key] : null;
    const over = limit != null && isNum(total) && total > limit;
    return { ...n, total, limit, over, missing: missing[src] };
  });
  return { entries, rows, limits };
}

function bar(r) {
  const { t, esc } = H;
  const pct = r.limit ? Math.min(100, ((r.total || 0) / r.limit) * 100) : 0;
  const tone = r.over ? 'danger' : pct >= 90 ? 'warn' : 'ok';
  const totalText = r.total == null && r.missing ? t('diet.unknown') : fmt(r.total ?? 0, r.d);
  const valText = r.limit != null ? `${totalText} / ${fmt(r.limit, r.d)} ${r.unit}`
                : r.total == null && r.missing ? totalText : `${totalText} ${r.unit}`;
  return `
  <div class="dnut">
    <div class="dnut__head">
      <span class="dnut__name">${esc(t(r.label))}</span>
      <span class="dnut__val tnum">${esc(valText)}</span>
    </div>
    ${r.limit != null ? `
    <div class="dbar dbar--${tone}" role="meter" aria-valuemin="0" aria-valuemax="${r.limit}"
         aria-valuenow="${Math.round(r.total || 0)}" aria-label="${esc(t(r.label))}">
      <span style="width:${pct.toFixed(1)}%"></span>
    </div>` : `<p class="dnut__sub">${esc(t('diet.noLimitFor'))}</p>`}
    ${r.missing ? `<p class="dnut__sub">${H.icon('info')}<span>${esc(fill(t('diet.missing'), { n: r.missing }))}</span></p>` : ''}
    ${r.over ? `<p class="dnut__warn">${H.icon('alert')}<span>${esc(t('diet.warn.' + r.key))}</span></p>` : ''}
  </div>`;
}

/* ===================================================================
   Diet view
   =================================================================== */

function viewDiet() {
  const { t, esc, icon } = H;
  const { entries, rows, limits } = dayStatus();
  const d = S.getDietLimits();
  const banners = [];
  if (!limits) banners.push(`<p class="banner">${icon('info')}<span>${esc(t('diet.noLimits'))}</span></p>`);
  if (d.pending) banners.push(`<p class="banner">${icon('shield')}<span>${esc(t('diet.limitsPending'))}</span></p>`);

  return `
  <div class="view view--diet">
    ${banners.join('')}
    <div class="card">
      <div class="card__head">${icon('bowl')}<h2>${esc(t('diet.today'))}</h2></div>
      <div class="dnuts">${rows.map(bar).join('')}</div>
      ${limits ? `<p class="hint">${esc(fill(t('diet.approvedBy'), { name: limits.approvedBy || '—', date: limits.approvedAt ? H.fmtDate(limits.approvedAt) : '—' }))}</p>` : ''}
    </div>

    <button type="button" class="btn btn--primary" data-diet="add">${icon('plus')}<span>${esc(t('diet.add'))}</span></button>

    <div class="card" style="margin-top:var(--s-4)">
      ${entries.length ? entries.map(e => `
        <div class="row">
          <span class="row__icon">${icon('bowl')}</span>
          <span class="row__body">
            <span class="row__title">${esc(e.name)}</span>
            <span class="row__sub">${esc(fmt(e.grams, 0))} g · ${esc(srcLabel(e.source))} · ${esc(H.fmtTime(e.ts))}</span>
          </span>
          <button type="button" class="row__btn" data-diet="del-food" data-id="${esc(e.id)}"
                  aria-label="${esc(t('common.delete'))}: ${esc(e.name)}">${icon('trash')}</button>
        </div>`).join('') : `<p class="empty" style="padding:var(--s-4)">${esc(t('diet.empty'))}</p>`}
    </div>

    ${customFoodsSection()}
    ${labsSection()}
  </div>`;
}

function srcLabel(src) {
  return H.t(src === 'fdc' ? 'food.srcFdc' : src === 'off' ? 'food.srcOff' : 'food.srcCustom');
}

function customFoodsSection() {
  const { t, esc, icon } = H;
  const list = S.getCustomFoods();
  return `
  <h2 class="section-title">${esc(t('diet.custom'))}</h2>
  <div class="card">
    ${list.length ? list.map(f => `
      <div class="row">
        <span class="row__body">
          <span class="row__title">${esc(f.name)}</span>
          <span class="row__sub">${esc(per100Line(f.per100))}</span>
        </span>
        <button type="button" class="row__btn" data-diet="edit-custom" data-id="${esc(f.id)}"
                aria-label="${esc(t('diet.edit'))}: ${esc(f.name)}">${icon('edit')}</button>
        <button type="button" class="row__btn" data-diet="del-custom" data-id="${esc(f.id)}"
                aria-label="${esc(t('common.delete'))}: ${esc(f.name)}">${icon('trash')}</button>
      </div>`).join('') : `<p class="hint" style="margin-top:0">${esc(t('diet.customEmpty'))}</p>`}
    <div class="btn-pair">
      <button type="button" class="btn btn--ghost" data-diet="new-custom">${icon('plus')}<span>${esc(t('diet.customAdd'))}</span></button>
      <button type="button" class="btn btn--ghost" data-diet="csv">${icon('upload')}<span>${esc(t('diet.csvImport'))}</span></button>
    </div>
    <input type="file" id="dietCsvFile" accept=".csv,text/csv" hidden>
    <p class="hint">${esc(t('diet.csvHint'))}</p>
    <div id="csvReport" aria-live="polite"></div>
  </div>`;
}

function per100Line(p) {
  const { t } = H;
  return PER100.map(n => `${t(n.label)} ${p[n.key] == null ? '—' : fmt(p[n.key], 1)}`).join(' · ') + ` (${t('food.per100')})`;
}

function labsSection() {
  const { t, esc, icon } = H;
  const labs = S.getLabs();
  return `
  <h2 class="section-title">${esc(t('diet.labs'))}</h2>
  <div class="card">
    <p class="hint" style="margin-top:0">${esc(t('diet.labsHint'))}</p>
    ${labs.length ? labs.map(l => `
      <div class="lab">
        <div class="lab__head">
          <strong class="tnum">${esc(l.date)}</strong>
          <span class="chip chip--${l.status}">${esc(t('lab.' + l.status))}</span>
          <button type="button" class="row__btn" data-diet="del-lab" data-id="${esc(l.id)}"
                  aria-label="${esc(t('common.delete'))}: ${esc(l.date)}">${icon('trash')}</button>
        </div>
        <p class="lab__vals">${L.LAB_KEYS.filter(k => l.values[k] != null)
          .map(k => `${esc(t('lab.' + k))} <b class="tnum">${esc(l.values[k])}</b>${l.units?.[k] ? ' ' + esc(l.units[k]) : ''}`).join(' · ')}</p>
        ${l.status !== 'pending' && l.approvedBy ? `<p class="hint" style="margin:0">${esc(l.approvedBy)} · ${esc(H.fmtDate(l.approvedAt))}</p>` : ''}
        ${l.status === 'pending' ? `
        <div class="btn-pair">
          <button type="button" class="btn btn--ghost" data-diet="lab-approve" data-id="${esc(l.id)}">${icon('check')}<span>${esc(t('clinic.approve'))}</span></button>
          <button type="button" class="btn btn--danger" data-diet="lab-reject" data-id="${esc(l.id)}">${icon('x')}<span>${esc(t('clinic.reject'))}</span></button>
        </div>` : ''}
      </div>`).join('') : `<p class="hint">${esc(t('diet.labsEmpty'))}</p>`}
    <div class="btn-pair">
      <button type="button" class="btn btn--ghost" data-diet="lab-import">${icon('upload')}<span>${esc(t('diet.labsImport'))}</span></button>
      <button type="button" class="btn btn--ghost" data-diet="lab-manual">${icon('edit')}<span>${esc(t('diet.labsManual'))}</span></button>
    </div>
    <input type="file" id="dietLabFile" accept="application/json,.json" hidden>
  </div>`;
}

/* ---------- Today dashboard card ---------- */

function todayCard() {
  const { t, esc, icon } = H;
  const { entries, rows, limits } = dayStatus();
  const over = rows.filter(r => r.over).length;
  const tone = over ? 'danger' : '';
  const big = fill(t('diet.cardItems'), { n: entries.length });
  const sub = !limits ? t('diet.noLimits') : over ? fill(t('diet.cardOver'), { n: over }) : t('diet.cardOk');
  return `
  <button type="button" class="reminder" data-go="diet">
    <span class="reminder__icon${tone ? ' reminder__icon--' + tone : ''}">${icon(over ? 'alert' : 'bowl')}</span>
    <span class="reminder__body">
      <span class="reminder__title">${esc(t('diet.cardTitle'))}</span>
      <span class="reminder__big">${esc(big)}</span>
      <span class="reminder__sub">${esc(sub)}</span>
    </span>
    ${icon('chevron-right', 'reminder__chev')}
  </button>`;
}

/* ===================================================================
   Add-food sheet
   =================================================================== */

let chosen = null;          // normalized food awaiting a gram amount
let searchTimer = 0;
let searchCtrl = null;
let barcodeCtrl = null;
let stream = null;
let scanTimer = 0;

function cleanupSheet() {
  clearTimeout(searchTimer);
  searchCtrl?.abort(); searchCtrl = null;
  barcodeCtrl?.abort(); barcodeCtrl = null;
  stopCamera();
}

function sheetAddFood() {
  const { t, esc, icon } = H;
  chosen = null;
  const tabs = [['search', 'food.tabSearch'], ['barcode', 'food.tabBarcode'], ['custom', 'food.tabCustom']];
  H.openSheet({
    title: t('diet.add'),
    onClose: cleanupSheet,
    body: `
    <div class="seg" role="tablist" aria-label="${esc(t('diet.add'))}">
      ${tabs.map(([k, l], i) => `<button type="button" role="tab" id="ftab-${k}" aria-controls="fpanel-${k}"
          aria-selected="${i === 0}" aria-pressed="${i === 0}" tabindex="${i === 0 ? 0 : -1}" data-diet="tab" data-tab="${k}">${esc(t(l))}</button>`).join('')}
    </div>

    <div role="tabpanel" id="fpanel-search" aria-labelledby="ftab-search" class="fpanel">
      <div class="field">
        <label for="foodQ">${esc(t('food.searchLabel'))}</label>
        <input class="input" id="foodQ" type="search" autocomplete="off" enterkeyhint="search">
      </div>
      <p class="fstatus" id="foodStatus" aria-live="polite"></p>
      <div class="flist" id="foodResults"></div>
    </div>

    <div role="tabpanel" id="fpanel-barcode" aria-labelledby="ftab-barcode" class="fpanel" hidden>
      <div id="scanWrap" hidden>
        <video id="scanVideo" class="scan" playsinline muted aria-hidden="true"></video>
        <button type="button" class="btn btn--ghost" data-diet="scan-stop" style="width:100%">${icon('x')}<span>${esc(t('food.stopScan'))}</span></button>
      </div>
      <button type="button" class="btn btn--ghost" data-diet="scan" id="btnScan" style="width:100%" hidden>${icon('activity')}<span>${esc(t('food.scan'))}</span></button>
      <div class="field" style="margin-top:var(--s-3)">
        <label for="barcodeIn">${esc(t('food.barcodeLabel'))}</label>
        <input class="input" id="barcodeIn" type="text" inputmode="numeric" pattern="[0-9]*" autocomplete="off" maxlength="14">
      </div>
      <button type="button" class="btn btn--ghost" data-diet="barcode-go" style="width:100%">${esc(t('food.lookup'))}</button>
      <p class="fstatus" id="barcodeStatus" aria-live="polite"></p>
      <div class="flist" id="barcodeResult"></div>
    </div>

    <div role="tabpanel" id="fpanel-custom" aria-labelledby="ftab-custom" class="fpanel" hidden>
      <div class="flist" id="customList">${customChoices()}</div>
      <details class="fnew">
        <summary>${icon('plus')}<span>${esc(t('diet.customAdd'))}</span></summary>
        ${customFields('nf', null)}
        <button type="button" class="btn btn--ghost" data-diet="custom-save-pick" style="width:100%">${icon('check')}<span>${esc(t('food.saveFood'))}</span></button>
      </details>
    </div>

    <div class="fchosen" id="fChosen" aria-live="polite"></div>
    <div class="field">
      <label for="foodGrams">${esc(t('food.grams'))}</label>
      <input class="input" id="foodGrams" type="number" inputmode="decimal" min="1" max="5000" step="1">
      <div class="err" id="foodGrams-err" role="alert" aria-live="polite"></div>
    </div>
    <button type="button" class="btn btn--primary" data-diet="log">${icon('plus')}<span>${esc(t('food.add'))}</span></button>`,
    onMount: sheet => {
      $id('foodQ').addEventListener('input', onSearchInput);
      if ('BarcodeDetector' in window && navigator.mediaDevices?.getUserMedia) $id('btnScan').hidden = false;
      else $id('barcodeStatus').textContent = t('food.noCamera');
      sheet.addEventListener('keydown', onTabKey);
    }
  });
}

const $id = id => document.getElementById(id);

function onTabKey(e) {
  const tab = e.target.closest('[role="tab"]');
  if (!tab || !['ArrowLeft', 'ArrowRight'].includes(e.key)) return;
  const all = [...tab.parentElement.querySelectorAll('[role="tab"]')];
  const next = all[(all.indexOf(tab) + (e.key === 'ArrowRight' ? 1 : all.length - 1)) % all.length];
  selectTab(next.dataset.tab);
  next.focus();
}

function selectTab(name) {
  document.querySelectorAll('#sheet [role="tab"]').forEach(b => {
    const on = b.dataset.tab === name;
    b.setAttribute('aria-selected', on); b.setAttribute('aria-pressed', on); b.tabIndex = on ? 0 : -1;
  });
  document.querySelectorAll('#sheet .fpanel').forEach(p => { p.hidden = p.id !== 'fpanel-' + name; });
  if (name !== 'barcode') stopCamera();
}

function resultButton(f, i, extra = '') {
  const { esc } = H;
  return `<button type="button" class="fitem" data-diet="pick" data-i="${i}">
      <span class="fitem__name">${esc(f.name)}</span>
      <span class="fitem__sub">${esc(srcLabel(f.source))}${extra} · ${esc(per100Line(f.per100))}</span>
    </button>`;
}

let shown = [];     // items currently rendered as pick buttons

function renderResults(targetId, items, extra = '') {
  shown = items;
  $id(targetId).innerHTML = items.map((f, i) => resultButton(f, i, extra)).join('');
}

function setStatus(id, msg, busy = false, iconName = '') {
  const el = $id(id);
  if (!el) return;
  // FR009: the offline state carries an icon as well as text (theme rule 5).
  if (iconName && msg) el.innerHTML = `${H.icon(iconName)}<span>${H.esc(msg)}</span>`;
  else el.textContent = msg;
  el.classList.toggle('fstatus--busy', busy);
}

/* Custom foods live on the device, so they stay searchable offline. */
function matchCustom(q) {
  const needle = q.toLowerCase();
  return S.getCustomFoods().filter(f => f.name.toLowerCase().includes(needle));
}

function onSearchInput(e) {
  const q = e.target.value.trim();
  clearTimeout(searchTimer);
  searchCtrl?.abort();
  if (q.length < 2) { setStatus('foodStatus', ''); renderResults('foodResults', []); return; }
  searchTimer = setTimeout(() => runSearch(q), DEBOUNCE_MS);
}

async function runSearch(q) {
  const { t } = H;
  const cached = S.searchFoodCache(q);
  if (!navigator.onLine) {
    const local = [...matchCustom(q), ...cached];
    setStatus('foodStatus', t('food.offline') + (local.length ? '' : ' ' + t('food.noResults')), false, 'info');
    renderResults('foodResults', local, ` · ${t('food.srcCache')}`);
    return;
  }
  searchCtrl = new AbortController();
  const { signal } = searchCtrl;
  setStatus('foodStatus', t('food.searching'), true);
  const key = S.getProfile().fdcApiKey || 'DEMO_KEY';
  const [fdc, off] = await Promise.allSettled([F.searchFdc(q, key, { signal }), F.searchOff(q, { signal })]);
  if (signal.aborted) return;
  const items = [...(fdc.value || []), ...(off.value || [])];
  if (items.length) {
    S.cacheFoods(items);
    renderResults('foodResults', items);
    const rl = [fdc, off].some(r => r.reason?.code === 'RATE_LIMITED');
    setStatus('foodStatus', rl ? t('food.rateLimited') : `${items.length}`);
    return;
  }
  const errs = [fdc, off].map(r => r.reason).filter(Boolean);
  const code = errs.find(e => e.code === 'RATE_LIMITED') ? 'RATE_LIMITED'
             : errs.length === 2 && errs.every(e => e.code === 'OFFLINE') ? 'OFFLINE'
             : errs.length === 2 ? 'HTTP' : null;
  if (code === 'OFFLINE') {
    setStatus('foodStatus', t('food.offline'));
    renderResults('foodResults', cached, ` · ${t('food.srcCache')}`);
  } else if (code === 'RATE_LIMITED') {
    setStatus('foodStatus', t('food.rateLimited'));
    renderResults('foodResults', cached, ` · ${t('food.srcCache')}`);
  } else if (code === 'HTTP') {
    setStatus('foodStatus', t('food.error'));
    renderResults('foodResults', cached, ` · ${t('food.srcCache')}`);
  } else {
    setStatus('foodStatus', t('food.noResults'));
    renderResults('foodResults', []);
  }
}

async function runBarcode(raw) {
  const { t } = H;
  const code = String(raw).replace(/\D/g, '');
  if (code.length < 6) { setStatus('barcodeStatus', t('food.barcodeNone')); return; }
  const cached = S.cachedBarcode(code);
  if (!navigator.onLine) {
    setStatus('barcodeStatus', cached ? t('food.offline') : t('food.offline') + ' ' + t('food.barcodeNone'));
    renderResults('barcodeResult', cached ? [cached] : []);
    if (cached) choose(cached);
    return;
  }
  barcodeCtrl?.abort();
  barcodeCtrl = new AbortController();
  setStatus('barcodeStatus', t('food.searching'), true);
  try {
    const item = await F.lookupBarcode(code, { signal: barcodeCtrl.signal });
    if (!item) { setStatus('barcodeStatus', t('food.barcodeNone')); renderResults('barcodeResult', []); return; }
    S.cacheFoods([item]);
    setStatus('barcodeStatus', '');
    renderResults('barcodeResult', [item]);
    choose(item);
  } catch (e) {
    if (e.name === 'AbortError') return;
    const msg = e.code === 'OFFLINE' ? t('food.offline') : e.code === 'RATE_LIMITED' ? t('food.rateLimited') : t('food.error');
    setStatus('barcodeStatus', msg);
    renderResults('barcodeResult', cached ? [cached] : []);
  }
}

async function startCamera() {
  const { t } = H;
  try {
    const detector = new window.BarcodeDetector({ formats: ['ean_13', 'ean_8', 'upc_a', 'upc_e'] });
    stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
    const video = $id('scanVideo');
    video.srcObject = stream;
    await video.play();
    $id('scanWrap').hidden = false;
    $id('btnScan').hidden = true;
    const tick = async () => {
      if (!stream) return;
      try {
        const codes = await detector.detect(video);
        if (codes.length) {
          const val = codes[0].rawValue;
          stopCamera();
          $id('barcodeIn').value = val;
          return runBarcode(val);
        }
      } catch { /* frame not ready */ }
      scanTimer = setTimeout(tick, 300);
    };
    tick();
  } catch {
    stopCamera();
    setStatus('barcodeStatus', t('food.noCamera'));
  }
}

function stopCamera() {
  clearTimeout(scanTimer);
  stream?.getTracks().forEach(tr => tr.stop());
  stream = null;
  const w = $id('scanWrap'); if (w) w.hidden = true;
  const b = $id('btnScan');
  if (b && 'BarcodeDetector' in window) b.hidden = false;
}

function customChoices() {
  const list = S.getCustomFoods();
  shownCustom = list;
  if (!list.length) return `<p class="hint">${H.esc(H.t('diet.customEmpty'))}</p>`;
  return list.map((f, i) => `<button type="button" class="fitem" data-diet="pick-custom" data-i="${i}">
      <span class="fitem__name">${H.esc(f.name)}</span>
      <span class="fitem__sub">${H.esc(per100Line(f.per100))}</span></button>`).join('');
}
let shownCustom = [];

function choose(f) {
  const { t, esc } = H;
  chosen = f;
  document.querySelectorAll('#sheet .fitem').forEach(b => b.removeAttribute('aria-current'));
  $id('fChosen').innerHTML = `<span class="fchosen__k">${esc(t('food.chosen'))}</span> <strong>${esc(f.name)}</strong>`;
  $id('foodGrams').focus();
}

function logChosen() {
  const { t } = H;
  if (!chosen) { $id('fChosen').textContent = t('food.pickFirst'); return; }
  const g = H.readNumber($id('foodGrams'), { min: 1, max: 5000 });
  if (g == null) return $id('foodGrams').focus();
  S.logFood({ name: chosen.name, grams: g, source: chosen.source, ref: chosen.ref, per100: chosen.per100 });
  H.closeSheet();
  H.toast(t('food.added'));
}

/* ---------- custom-food form ---------- */

function customFields(prefix, food) {
  const { t, esc } = H;
  return `
  <div class="field">
    <label for="${prefix}Name">${esc(t('food.name'))}</label>
    <input class="input" id="${prefix}Name" type="text" maxlength="120" value="${esc(food?.name || '')}">
    <div class="err" id="${prefix}Name-err" role="alert" aria-live="polite"></div>
  </div>
  <p class="hint" style="margin-top:0">${esc(t('food.per100Title'))}</p>
  <div class="field-row">
    ${PER100.map(n => `
    <div class="field">
      <label for="${prefix}-${n.key}">${esc(t(n.label))} (${n.unit})</label>
      <input class="input" id="${prefix}-${n.key}" type="number" inputmode="decimal" min="0" max="${n.max}" step="any"
             value="${food?.per100?.[n.key] ?? ''}">
      <div class="err" id="${prefix}-${n.key}-err" role="alert" aria-live="polite"></div>
    </div>`).join('')}
  </div>`;
}

function readCustom(prefix, id) {
  const { t, icon, esc } = H;
  const nameEl = $id(prefix + 'Name');
  const name = nameEl.value.trim();
  if (!name) {
    nameEl.setAttribute('aria-invalid', 'true');
    $id(prefix + 'Name-err').innerHTML = `${icon('alert')}<span>${esc(t('common.required'))}</span>`;
    nameEl.focus();
    return null;
  }
  nameEl.removeAttribute('aria-invalid');
  $id(prefix + 'Name-err').innerHTML = '';
  const per100 = {};
  for (const n of PER100) {
    const el = $id(`${prefix}-${n.key}`);
    const v = H.readNumber(el, { min: 0, max: n.max, required: false });
    if (v === null) { el.focus(); return null; }
    per100[n.key] = v === undefined ? null : v;
  }
  return S.saveCustomFood({ id, name, per100 });
}

function sheetCustomFood(id) {
  const { t, esc, icon } = H;
  const food = id ? S.getCustomFoods().find(f => f.id === id) : null;
  H.openSheet({
    title: t('diet.customAdd'),
    body: `${customFields('cf', food)}
      <button type="button" class="btn btn--primary" data-diet="custom-save" data-id="${esc(id || '')}">${icon('check')}<span>${esc(t('food.saveFood'))}</span></button>`
  });
}

/* ===================================================================
   Labs
   =================================================================== */

function sheetLabManual() {
  const { t, esc, icon } = H;
  H.openSheet({
    title: t('diet.labsManual'),
    body: `
    <div class="field">
      <label for="labDate">${esc(t('diet.labDate'))}</label>
      <input class="input" id="labDate" type="date" value="${S.dayKey()}" max="${S.dayKey()}">
    </div>
    <div class="field-row">
      ${L.LAB_KEYS.map(k => `
      <div class="field">
        <label for="lab-${k}">${esc(t('lab.' + k))}</label>
        <input class="input" id="lab-${k}" type="number" inputmode="decimal" min="0" max="10000" step="any">
        <div class="err" id="lab-${k}-err" role="alert" aria-live="polite"></div>
      </div>`).join('')}
    </div>
    <p class="err" id="labErr" role="alert" aria-live="polite"></p>
    <button type="button" class="btn btn--primary" data-diet="lab-save">${icon('check')}<span>${esc(t('common.save'))}</span></button>`
  });
}

function saveManualLab() {
  const { t } = H;
  const values = {};
  for (const k of L.LAB_KEYS) {
    const v = H.readNumber($id('lab-' + k), { min: 0, max: 10000, required: false });
    if (v === null) return $id('lab-' + k).focus();
    values[k] = v ?? null;
  }
  try {
    const lab = L.normalizeLabImport({ date: $id('labDate').value, values }, 'manual');
    S.addLab(lab);
    H.closeSheet();
    H.toast(t('diet.labImported'));
  } catch {
    $id('labErr').textContent = t('diet.labNeedOne');
  }
}

function importLabFile(file) {
  const { t } = H;
  const r = new FileReader();
  r.onload = () => {
    try {
      const lab = L.normalizeLabImport(JSON.parse(r.result), 'ocr');
      S.addLab(lab);
      H.toast(t('diet.labImported'));
    } catch {
      H.toast(t('diet.labBad'));
    }
  };
  r.onerror = () => H.toast(t('diet.labBad'));
  r.readAsText(file);
}

function importCsvFile(file) {
  const { t, esc } = H;
  const r = new FileReader();
  r.onload = () => {
    let res;
    try { res = L.parseFoodsCsv(r.result); }
    catch { H.toast(t('diet.csvBadHeader')); return; }
    if (res.foods.length) S.addCustomFoods(res.foods);
    const summary = fill(t('diet.csvResult'), { ok: res.foods.length, bad: res.errors.length });
    H.toast(summary);
    // Re-render happened on save; write the per-line report into the fresh DOM.
    const box = $id('csvReport');
    if (box) box.innerHTML = `<p class="hint">${esc(summary)}</p>` + (res.errors.length
      ? `<ul class="csv-errs">${res.errors.slice(0, 20).map(e => `<li>${esc(fill(t('diet.csvLine'), e))}</li>`).join('')}</ul>` : '');
  };
  r.readAsText(file);
}

/* ===================================================================
   Clinician PIN
   =================================================================== */

async function verifyPin(pin) {
  const c = S.getClinician();
  if (!c) return false;
  return (await L.hashPin(pin, c.salt)) === c.hash;
}

/** Ask for the clinician PIN, then run onOk(approverName). */
function withPin(title, onOk) {
  const { t, esc, icon } = H;
  const c = S.getClinician();
  if (!c) { H.toast(t('clinic.noPin')); return; }
  H.openSheet({
    title,
    body: `
    <div class="field">
      <label for="pinIn">${esc(t('clinic.enterPin'))}</label>
      <input class="input" id="pinIn" type="password" inputmode="numeric" autocomplete="off" maxlength="8">
      <div class="err" id="pinIn-err" role="alert" aria-live="polite"></div>
    </div>
    <p class="hint">${esc(fill(t('clinic.isSet'), { name: c.name }))}</p>
    <button type="button" class="btn btn--primary" id="pinGo">${icon('shield')}<span>${esc(t('clinic.confirm'))}</span></button>`,
    onMount: sheet => {
      const go = async () => {
        const ok = await verifyPin($id('pinIn').value);
        if (!ok) {
          $id('pinIn').setAttribute('aria-invalid', 'true');
          $id('pinIn-err').innerHTML = `${icon('alert')}<span>${esc(t('clinic.wrong'))}</span>`;
          $id('pinIn').select();
          return;
        }
        H.closeSheet();
        onOk(c.name);
      };
      sheet.querySelector('#pinGo').addEventListener('click', go);
      sheet.querySelector('#pinIn').addEventListener('keydown', e => { if (e.key === 'Enter') go(); });
    }
  });
}

function sheetSetPin() {
  const { t, esc, icon } = H;
  const c = S.getClinician();
  H.openSheet({
    title: c ? t('clinic.change') : t('clinic.set'),
    body: `
    ${c ? `<div class="field"><label for="pinOld">${esc(t('clinic.oldPin'))}</label>
      <input class="input" id="pinOld" type="password" inputmode="numeric" autocomplete="off" maxlength="8">
      <div class="err" id="pinOld-err" role="alert" aria-live="polite"></div></div>` : ''}
    <div class="field"><label for="pinName">${esc(t('clinic.name'))}</label>
      <input class="input" id="pinName" type="text" maxlength="80" value="${esc(c?.name || '')}">
      <div class="err" id="pinName-err" role="alert" aria-live="polite"></div></div>
    <div class="field"><label for="pinNew">${esc(t('clinic.pin'))}</label>
      <input class="input" id="pinNew" type="password" inputmode="numeric" autocomplete="new-password" maxlength="8">
      <div class="err" id="pinNew-err" role="alert" aria-live="polite"></div></div>
    <div class="field"><label for="pinNew2">${esc(t('clinic.pin2'))}</label>
      <input class="input" id="pinNew2" type="password" inputmode="numeric" autocomplete="new-password" maxlength="8">
      <div class="err" id="pinNew2-err" role="alert" aria-live="polite"></div></div>
    <button type="button" class="btn btn--primary" id="pinSave">${icon('shield')}<span>${esc(t('common.save'))}</span></button>`,
    onMount: sheet => sheet.querySelector('#pinSave').addEventListener('click', async () => {
      const err = (id, key) => {
        $id(id).setAttribute('aria-invalid', 'true');
        $id(id + '-err').innerHTML = `${icon('alert')}<span>${esc(t(key))}</span>`;
        $id(id).focus();
      };
      sheet.querySelectorAll('.err').forEach(e => { e.innerHTML = ''; });
      if (c && !(await verifyPin($id('pinOld').value))) return err('pinOld', 'clinic.wrong');
      const name = $id('pinName').value.trim();
      if (!name) return err('pinName', 'common.required');
      const pin = $id('pinNew').value;
      if (!/^\d{4,8}$/.test(pin)) return err('pinNew', 'clinic.pinBad');
      if (pin !== $id('pinNew2').value) return err('pinNew2', 'clinic.mismatch');
      const salt = L.newSalt();
      S.setClinician({ salt, hash: await L.hashPin(pin, salt), name });
      H.closeSheet();
      H.toast(t('clinic.saved'));
    })
  });
}

/* ===================================================================
   Limit rules (clinician)
   =================================================================== */

function sheetRules() {
  const { t, esc, icon } = H;
  const rules = S.getDietLimits().rules || {};
  const v = x => esc(x ?? '');
  H.openSheet({
    title: t('rules.title'),
    body: `
    <p class="hint" style="margin-top:0">${esc(t('rules.hint'))}</p>
    ${L.MINERALS.map(k => {
      const r = rules[k] || {};
      return `
      <fieldset class="rule">
        <legend>${esc(t('diet.' + k))}</legend>
        <div class="field">
          <label for="r-${k}-base">${esc(t('rules.base'))}</label>
          <input class="input" id="r-${k}-base" type="number" inputmode="numeric" min="0" max="100000" value="${v(r.base)}">
          <div class="err" id="r-${k}-base-err" role="alert" aria-live="polite"></div>
        </div>
        <div class="field">
          <label for="r-${k}-lab">${esc(t('rules.ifLab'))}</label>
          <select class="input" id="r-${k}-lab">
            <option value="">${esc(t('rules.none'))}</option>
            ${L.LAB_KEYS.map(l => `<option value="${l}" ${r.lab === l ? 'selected' : ''}>${esc(t('lab.' + l))}</option>`).join('')}
          </select>
        </div>
        <div class="field-row">
          <div class="field">
            <label for="r-${k}-thr">${esc(t('rules.over'))}</label>
            <input class="input" id="r-${k}-thr" type="number" inputmode="decimal" step="any" min="0" max="10000" value="${v(r.threshold)}">
            <div class="err" id="r-${k}-thr-err" role="alert" aria-live="polite"></div>
          </div>
          <div class="field">
            <label for="r-${k}-then">${esc(t('rules.then'))}</label>
            <input class="input" id="r-${k}-then" type="number" inputmode="numeric" min="0" max="100000" value="${v(r.then)}">
            <div class="err" id="r-${k}-then-err" role="alert" aria-live="polite"></div>
          </div>
        </div>
      </fieldset>`;
    }).join('')}
    <div class="field">
      <label for="r-gpk">${esc(t('rules.gPerKg'))}</label>
      <input class="input" id="r-gpk" type="number" inputmode="decimal" step="0.1" min="0" max="5" value="${v(rules.protein?.gPerKg)}">
      <div class="err" id="r-gpk-err" role="alert" aria-live="polite"></div>
    </div>
    <p class="hint">${esc(t('rules.fluidNote'))}</p>
    <button type="button" class="btn btn--primary" data-diet="rules-save">${icon('check')}<span>${esc(t('common.save'))}</span></button>`
  });
}

function saveRules() {
  const rd = (id, max) => {
    const v = H.readNumber($id(id), { min: 0, max, required: false });
    return v === null ? NaN : v ?? null;
  };
  const rules = {};
  for (const k of L.MINERALS) {
    const base = rd(`r-${k}-base`, 100000), threshold = rd(`r-${k}-thr`, 10000), then = rd(`r-${k}-then`, 100000);
    if ([base, threshold, then].some(Number.isNaN)) return;
    rules[k] = { base, lab: $id(`r-${k}-lab`).value, threshold, then };
  }
  const gPerKg = rd('r-gpk', 5);
  if (Number.isNaN(gPerKg)) return;
  rules.protein = { gPerKg };
  S.saveDietRules(rules);
  H.closeSheet();
  H.toast(H.t('clinic.done'));
}

function computeLimits() {
  const { t } = H;
  const d = S.getDietLimits();
  const res = L.computeSuggestedLimits(S.getLabs(), d.rules, S.getProfile());
  if (!L.hasAnyLimit(res)) { H.toast(t('rules.nothing')); return; }
  S.setPendingLimits(res);
  lastNotes = res.notes;
  H.toast(t('clinic.pending'));
}
let lastNotes = [];

function limitTable(set) {
  const { t, esc } = H;
  return `<dl class="limits">${NUTS.map(n => `
    <div><dt>${esc(t(n.label))}</dt><dd class="tnum">${set[n.key] == null ? esc(t('diet.noLimitFor')) : esc(fmt(set[n.key], n.d) + ' ' + n.unit)}</dd></div>`).join('')}</dl>`;
}

function settingsSection() {
  const { t, esc, icon } = H;
  const p = S.getProfile();
  const c = S.getClinician();
  const d = S.getDietLimits();
  return `
    <h2 class="section-title">${esc(t('fdc.title'))}</h2>
    <div class="card">
      <div class="field">
        <label for="pFdcKey">${esc(t('fdc.key'))}</label>
        <input class="input" id="pFdcKey" type="text" autocomplete="off" spellcheck="false" value="${esc(p.fdcApiKey || 'DEMO_KEY')}">
        <p class="hint">${esc(t('fdc.hint'))}</p>
      </div>
      <p class="hint" style="margin:0">${esc(t('off.credit'))}</p>
    </div>

    <h2 class="section-title">${esc(t('clinic.title'))}</h2>
    <div class="card">
      <p class="hint" style="margin-top:0">${esc(t('clinic.hint'))}</p>
      ${c ? `<p class="row__sub">${esc(fill(t('clinic.isSet'), { name: c.name }))}</p>` : ''}
      <button type="button" class="btn btn--ghost" data-diet="pin-set" style="width:100%">${icon('shield')}<span>${esc(c ? t('clinic.change') : t('clinic.set'))}</span></button>
    </div>

    <h2 class="section-title">${esc(t('rules.title'))}</h2>
    <div class="card">
      <p class="hint" style="margin-top:0">${esc(t('rules.hint'))}</p>
      <h3 class="sub-title">${esc(t('rules.current'))}</h3>
      ${d.current ? limitTable(d.current) + `<p class="hint">${esc(fill(t('diet.approvedBy'), { name: d.current.approvedBy || '—', date: d.current.approvedAt ? H.fmtDate(d.current.approvedAt) : '—' }))}</p>`
                  : `<p class="hint">${esc(t('rules.none2'))}</p>`}
      ${d.pending ? `
      <div class="pending">
        <h3 class="sub-title">${esc(t('rules.pendingTitle'))}</h3>
        ${limitTable(d.pending)}
        ${lastNotes.map(n => `<p class="hint">${icon('info')} ${esc(fill(t('rules.missingLab'), { lab: t('lab.' + n.lab) }))} (${esc(t('diet.' + n.key))})</p>`).join('')}
        <div class="btn-pair">
          <button type="button" class="btn btn--ghost" data-diet="limits-approve">${icon('check')}<span>${esc(t('clinic.approve'))}</span></button>
          <button type="button" class="btn btn--danger" data-diet="limits-reject">${icon('x')}<span>${esc(t('clinic.reject'))}</span></button>
        </div>
      </div>` : ''}
      <div class="btn-pair">
        <button type="button" class="btn btn--ghost" data-diet="rules-edit">${icon('edit')}<span>${esc(t('rules.edit'))}</span></button>
        <button type="button" class="btn btn--ghost" data-diet="compute">${icon('activity')}<span>${esc(t('rules.compute'))}</span></button>
      </div>
    </div>`;
}

/* ===================================================================
   Events
   =================================================================== */

function onClick(e) {
  const el = e.target.closest('[data-diet]');
  if (!el) return;
  const { t } = H;
  const id = el.dataset.id;
  switch (el.dataset.diet) {
    case 'add': return sheetAddFood();
    case 'tab': return selectTab(el.dataset.tab);
    case 'pick': el.setAttribute('aria-current', 'true'); return choose(shown[Number(el.dataset.i)]);
    case 'pick-custom': return choose(shownCustom[Number(el.dataset.i)]);
    case 'log': return logChosen();
    case 'scan': return startCamera();
    case 'scan-stop': return stopCamera();
    case 'barcode-go': return runBarcode($id('barcodeIn').value);
    case 'custom-save-pick': {
      const f = readCustom('nf');
      if (!f) return;
      $id('customList').innerHTML = customChoices();
      el.closest('details').open = false;
      return choose(f);
    }
    case 'del-food': {
      const entry = S.getDietLog().find(x => x.id === id);
      if (!entry) return;
      S.deleteFood(id);
      return H.toast(t('diet.removed'), t('common.undo'), () => S.restoreFood(entry));
    }
    case 'new-custom': return sheetCustomFood(null);
    case 'edit-custom': return sheetCustomFood(id);
    case 'custom-save': if (readCustom('cf', id || null)) { H.closeSheet(); H.toast(t('settings.saved')); } return;
    case 'del-custom': {
      const f = S.getCustomFoods().find(x => x.id === id);
      if (f && confirm(`${t('common.delete')}: ${f.name}?`)) S.deleteCustomFood(id);
      return;
    }
    case 'csv': return $id('dietCsvFile').click();
    case 'lab-import': return $id('dietLabFile').click();
    case 'lab-manual': return sheetLabManual();
    case 'lab-save': return saveManualLab();
    case 'del-lab': if (confirm(t('common.delete') + '?')) S.deleteLab(id); return;
    case 'lab-approve': return withPin(t('clinic.approve'), name => { S.decideLab(id, 'approved', name); H.toast(t('clinic.done')); });
    case 'lab-reject':  return withPin(t('clinic.reject'),  name => { S.decideLab(id, 'rejected', name); H.toast(t('clinic.done')); });
    case 'pin-set': return sheetSetPin();
    case 'rules-edit': return withPin(t('rules.edit'), () => sheetRules());
    case 'rules-save': return saveRules();
    case 'compute': return computeLimits();
    case 'limits-approve': return withPin(t('clinic.approve'), name => { S.decidePendingLimits(true, name); lastNotes = []; H.toast(t('clinic.done')); });
    case 'limits-reject':  return withPin(t('clinic.reject'),  name => { S.decidePendingLimits(false, name); lastNotes = []; H.toast(t('clinic.done')); });
  }
}

function onChange(e) {
  const tg = e.target;
  if (tg.id === 'pFdcKey') {
    S.saveProfile({ fdcApiKey: tg.value.trim() || 'DEMO_KEY' });
    return H.toast(H.t('settings.saved'));
  }
  if (tg.id !== 'dietLabFile' && tg.id !== 'dietCsvFile') return;
  const file = tg.files?.[0];
  tg.value = '';
  if (!file) return;
  if (tg.id === 'dietLabFile') importLabFile(file); else importCsvFile(file);
}

/* Shared instance (was app.js:1659). */
export const Diet = initDiet({ $, $$, esc, icon, t, toast, openSheet, closeSheet, readNumber, fmtDate, fmtTime });
