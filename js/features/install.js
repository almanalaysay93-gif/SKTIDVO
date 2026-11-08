/* features/install.js — moved from app.js (F-RESTRUCTURE-01). */

import * as S from '../store.js';
import { t } from '../i18n.js';
import { $ } from '../ui/format.js';

/* Chrome fires beforeinstallprompt once and only if the app is installable.
   Stash it — the button can only be shown while we hold a live event. */
export let installPrompt = null;
export function setInstallPrompt(p) { installPrompt = p; }

export function isStandalone() {
  return matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
}

export function syncInstallUi() {
  const btn = $('#btnInstall');
  if (!btn) return;                       // not on the settings view
  const ios = /iphone|ipad|ipod/i.test(navigator.userAgent);
  const done = isStandalone();
  btn.hidden = done || !installPrompt;
  $('#installDone').hidden = !done;
  // iOS never fires beforeinstallprompt; Chrome may not have fired it yet.
  // Always leave one usable route on screen rather than an empty card.
  $('#installIos').hidden = done || !ios || !!installPrompt;
  $('#installManual').hidden = done || ios || !!installPrompt;
}

export async function syncPersistUi() {
  const el = $('#persistState');
  if (!el) return;
  const ok = await S.isPersisted();
  el.textContent = ok === true ? t('data.persistOn')
                 : ok === false ? t('data.persistOff')
                 : '—';
}

/* ===================================================================
   Router + delegated events
   =================================================================== */
