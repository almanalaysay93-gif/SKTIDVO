/* ui/toast.js — moved from app.js (F-RESTRUCTURE-01). */

import { $, esc } from './format.js';
import { icon } from './icons.js';

export function toast(msg, actionLabel, onAction) {
  const wrap = $('#toasts');
  const el = document.createElement('div');
  el.className = 'toast';
  el.setAttribute('role', 'status');          // polite; must not steal focus
  el.innerHTML = `${icon('check')}<span>${esc(msg)}</span>`;
  if (actionLabel) {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = actionLabel;
    b.addEventListener('click', () => { onAction?.(); el.remove(); });
    el.appendChild(b);
  }
  wrap.appendChild(el);
  setTimeout(() => el.remove(), 5000);
}

/* ===================================================================
   Sheet (bottom modal)
   =================================================================== */
