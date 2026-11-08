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

/* ---------- T033: iOS A2HS prompt + backup reminder (FR014, OQ-09) ---------- */

export const BACKUP_REMINDER_MS = 14 * 24 * 60 * 60 * 1000;   // plan §14.3a

export function isIos(ua = navigator.userAgent) {
  return /iphone|ipad|ipod/i.test(String(ua));
}

/** iOS never fires beforeinstallprompt, so Safari users get a one-time hint. */
export function shouldShowA2hs({ ios, standalone, dismissed }) {
  return !!ios && !standalone && !dismissed;
}

/** Shown only when NOT signed in to sync (T059 passes the real signed-in state). */
export function shouldShowBackupReminder({ lastBackupAt, now, signedIn = false, hasData }) {
  if (signedIn || !hasData) return false;
  return !Number.isFinite(lastBackupAt) || now - lastBackupAt >= BACKUP_REMINDER_MS;
}