/* ui/sheet.js — moved from app.js (F-RESTRUCTURE-01). */

import { t } from '../i18n.js';
import { $, $$, esc } from './format.js';
import { icon } from './icons.js';

export let lastFocused = null;

export let sheetOnClose = null;

export function openSheet({ title, body, onMount, onClose }) {
  closeSheet();
  sheetOnClose = onClose || null;
  lastFocused = document.activeElement;

  const scrim = document.createElement('div');
  scrim.className = 'scrim';
  scrim.id = 'scrim';
  scrim.addEventListener('click', closeSheet);

  const sheet = document.createElement('div');
  sheet.className = 'sheet';
  sheet.id = 'sheet';
  sheet.setAttribute('role', 'dialog');
  sheet.setAttribute('aria-modal', 'true');
  sheet.setAttribute('aria-label', title);
  sheet.innerHTML = `
    <div class="sheet__grip"></div>
    <div class="sheet__head">
      <h2>${esc(title)}</h2>
      <button type="button" class="row__btn" id="sheetClose"
              aria-label="${esc(t('common.close'))}">${icon('x')}</button>
    </div>
    ${body}`;

  document.body.append(scrim, sheet);
  document.body.style.overflow = 'hidden';
  $('#sheetClose').addEventListener('click', closeSheet);
  document.addEventListener('keydown', onSheetKey);

  onMount?.(sheet);
  // Focus the first real control, not the close button.
  (sheet.querySelector('input, select, button:not(#sheetClose)') || sheet).focus();
}

export function onSheetKey(e) {
  if (e.key === 'Escape') { closeSheet(); return; }
  if (e.key !== 'Tab') return;
  // Keep tab focus inside the dialog.
  const f = $$('button, input, select, summary, [href], [tabindex]:not([tabindex="-1"])', $('#sheet'))
            .filter(el => !el.disabled && el.offsetParent !== null);
  if (!f.length) return;
  const first = f[0], last = f[f.length - 1];
  if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
  else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
}

export function closeSheet() {
  const cb = sheetOnClose;
  sheetOnClose = null;
  cb?.();
  $('#sheet')?.remove();
  $('#scrim')?.remove();
  document.body.style.overflow = '';
  document.removeEventListener('keydown', onSheetKey);
  lastFocused?.focus();
  lastFocused = null;
}

/** Shared numeric-field validator. Shows the error under the field. */
export function readNumber(input, { min, max, required = true }) {
  const errEl = $(`#${input.id}-err`);
  const raw = input.value.trim();
  const fail = msg => {
    input.setAttribute('aria-invalid', 'true');
    if (errEl) errEl.innerHTML = `${icon('alert')}<span>${esc(msg)}</span>`;
    return null;
  };
  if (!raw) return required ? fail(t('common.required')) : undefined;
  const n = Number(raw);
  if (!Number.isFinite(n)) return fail(t('common.errNumber'));
  if (n < min || n > max) return fail(t('common.errRange'));
  input.removeAttribute('aria-invalid');
  if (errEl) errEl.innerHTML = '';
  return n;
}

/* ===================================================================
   Sheets: weight, drink, session
   =================================================================== */
