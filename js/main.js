/* main.js — moved from app.js (F-RESTRUCTURE-01). */

import * as S from './store.js';
import { onClick } from './events.js';
import { importBackup } from './features/backup.js';
import { setInstallPrompt, syncInstallUi, syncPersistUi } from './features/install.js';
import { setLang, t } from './i18n.js';
import { render, setView, view, VIEWS } from './router.js';
import { $ } from './ui/format.js';
import { applyTheme } from './ui/theme.js';

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

export function boot() {
  wireBadge();
  const p = S.getProfile();
  setLang(p.lang);
  applyTheme(p.theme);

  setView((location.hash || '#today').slice(1));
  if (!VIEWS[view]) setView('today');

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
  });
  addEventListener('appinstalled', () => { setInstallPrompt(null); syncInstallUi(); });

  addEventListener('hashchange', () => {
    const next = location.hash.slice(1);
    if (VIEWS[next] && next !== view) { setView(next); render(); }
  });

  S.subscribe(render);
  wireNetwork();
  render();

  // First run with no targets: drop the patient straight into settings.
  if (!p.setupDone) { setView('settings'); render(); }

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js').catch(() => { /* fine offline */ });
  }
}

// A module script can finish loading after DOMContentLoaded has already
// fired (slow network, cheap phone) — the listener would then never run.
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot);
} else {
  boot();
}
