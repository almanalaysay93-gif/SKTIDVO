/* main.js — moved from app.js (F-RESTRUCTURE-01). */

import * as S from './store.js';
import { onClick } from './events.js';
import { importBackup } from './features/backup.js';
import { setInstallPrompt, syncInstallUi, syncPersistUi } from './features/install.js';
import { maybeShowInstallPopup } from './features/installPopup.js';
import { setLang, t } from './i18n.js';
import { render, setView, view, VIEWS } from './router.js';
import { $ } from './ui/format.js';
import { applyTheme } from './ui/theme.js';
import { toast } from './ui/toast.js';
import { engine, getRole, setSwitchConfirm, startSync } from './sync/client.js';
import { maybePromptConsent, paintHeader, paintSettings } from './views/sync.js';
import { welcomeDue, welcomeSkip } from './views/welcome.js';

export function wireNetwork() {
  const show = () => {
    const b = $('#offline');
    if (!b) return;   // banner lives in #main and is replaced by render() (pre-existing; see T026 notes)
    b.hidden = navigator.onLine;
    b.querySelector('span').textContent = t('common.offline');
  };
  addEventListener('online', show);
  addEventListener('offline', show);
  show();
}

/* ---------- boot ---------- */

/* Seal is optional: drop the badge if the image is missing (was an inline
   onerror attribute, which CSP script-src 'self' blocks). */
function wireBadge() {
  const img = $('.app-header__badge img');
  if (!img) return;
  const drop = () => img.parentNode?.remove();
  if (img.complete && !img.naturalWidth) drop();
  else img.addEventListener('error', drop, { once: true });
}

const SPLASH_MIN_MS = 700;   // keep the logo on screen long enough to be seen
const splashStart = Date.now();
function hideSplash() {
  const el = document.getElementById('splash');
  if (!el) return;
  const wait = Math.max(0, SPLASH_MIN_MS - (Date.now() - splashStart));
  setTimeout(() => {
    el.classList.add('is-done');
    el.addEventListener('transitionend', () => el.remove(), { once: true });
    setTimeout(() => el.remove(), 600);   // fallback if no transition runs
  }, wait);
}

export function boot() {
  S.migrateV2();   // F-SYNC-01 schema v2 (idempotent)
  S.retirePin();   // FR025: PIN retired, legacy hash deleted
  wireBadge();
  const p = S.getProfile();
  setLang(p.lang);
  applyTheme(p.theme);

  setView((location.hash || '#today').slice(1));
  if (!VIEWS[view]) setView('today');
  hideSplash();

  document.addEventListener('click', onClick);

  // The file input is re-created on every render, so listen at document level.
  document.addEventListener('change', e => {
    if (e.target.id === 'pSessionTime' && e.target.value) {
      return void S.saveProfile({ sessionTime: e.target.value });
    }
    if (e.target.id === 'pWeighTime' && e.target.value) {
      return void S.saveProfile({ weighTime: e.target.value });
    }
    if (e.target.id !== 'importFile') return;
    const file = e.target.files?.[0];
    e.target.value = '';                 // allow re-picking the same file
    if (file) importBackup(file);
  });

  // Ask the browser to stop treating our data as evictable cache.
  S.requestPersistence().then(syncPersistUi);

  addEventListener('beforeinstallprompt', e => {
    e.preventDefault();                  // keep the mini-infobar off; we have our own button
    setInstallPrompt(e);
    syncInstallUi();
    maybeShowInstallPopup({ view });
  });
  // One-time install popup on open (not on the sign-in page; once per session).
  setTimeout(() => maybeShowInstallPopup({ view }), 2500);
  addEventListener('appinstalled', () => { setInstallPrompt(null); syncInstallUi(); });

  addEventListener('hashchange', () => {
    const next = location.hash.slice(1);
    if (VIEWS[next] && next !== view) { setView(next); render(); }
  });

  S.subscribe(render);
  S.subscribe(() => paintHeader());
  wireNetwork();
  render();

  // F-SYNC-01: status in header + Settings; re-render Settings when the state changes.
  let lastState = null;
  setSwitchConfirm((from, to) => confirm(t('sync.switchAccount').replace('{from}', from).replace('{to}', to)));
  engine.onStatus(s => {
    paintHeader(s);
    paintSettings(s);
    const key = s.state + (getRole()?.clinician ? ':clin' : '');
    if (key !== lastState) {
      const prev = lastState;
      lastState = key;
      // Signed in while on the sign-in page: go straight into the app (no extra page).
      if (view === 'welcome' && prev !== null && !s.state.startsWith('signin') && !s.state.startsWith('off')) {
        welcomeSkip((n) => { setView(n); render(); });
      } else if ((view === 'settings' || view === 'welcome' || view === 'today') && prev !== null && !document.getElementById('sheet')) render();
      if (prev && (prev.startsWith('signin') || prev.startsWith('off'))) maybePromptConsent(s);
    }
  });
  startSync();

  // First run with no targets: drop the patient straight into settings.
  if (welcomeDue()) { setView('welcome'); render(); }
  else if (!p.setupDone) { setView('settings'); render(); }
  const reWelcome = () => { if (view === 'welcome') render(); };
  addEventListener('online', reWelcome);
  addEventListener('offline', reWelcome);

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js').catch(() => { /* fine offline */ });
    // FR012: a new version took over. Only announce it when an old worker was
    // already in control — the first install also fires controllerchange
    // (clients.claim) and must stay silent.
    const hadController = !!navigator.serviceWorker.controller;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (hadController) toast(t('app.updated'));
    }, { once: true });
  }
}

// A module script can finish loading after DOMContentLoaded has already
// fired (slow network, cheap phone) — the listener would then never run.
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot);
} else {
  boot();
}
