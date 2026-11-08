/* features/installPopup.js — one-time "Install SKTIDVO" popup on open.
   Shows when the app is not installed and the sign-in page is not up.
   "Not now" hides it for 7 days (per device). */

import { t } from '../i18n.js';
import { openSheet, closeSheet } from '../ui/sheet.js';
import { esc } from '../ui/format.js';
import { installPrompt, setInstallPrompt, syncInstallUi, isStandalone, isIos } from './install.js';

const KEY = 'skti.install.laterUntil';
const DAY_MS = 24 * 60 * 60 * 1000;
let shownThisSession = false;

/** Pure: is the "later" choice still in force? */
export function installLaterActive(now = Date.now(), stored = null) {
  return now < Number(stored || 0);
}

function readLater() { try { return localStorage.getItem(KEY); } catch { return null; } }
function writeLater(now = Date.now()) { try { localStorage.setItem(KEY, String(now + 7 * DAY_MS)); } catch { /* private mode */ } }

/** Show the popup once per session unless installed, on the sign-in page, or postponed. */
export function maybeShowInstallPopup({ view }) {
  if (shownThisSession || view === 'welcome') return;
  if (isStandalone() || installLaterActive(Date.now(), readLater())) return;
  shownThisSession = true;
  const how = installPrompt ? `<button type="button" class="btn btn--primary" id="btnInstallNow" style="width:100%">${esc(t('install.now'))}</button>`
    : isIos() ? `<p class="hint">${esc(t('install.ios'))}</p>`
    : `<p class="hint">${esc(t('install.manual'))}</p>`;
  openSheet({
    title: t('install.title'),
    body: `<p>${esc(t('install.body'))}</p>${how}
      <button type="button" class="btn btn--ghost" id="btnInstallLater" style="width:100%">${esc(t('install.later'))}</button>`,
    onMount(sheet) {
      sheet.querySelector('#btnInstallLater')?.addEventListener('click', () => { writeLater(); closeSheet(); });
      sheet.querySelector('#btnInstallNow')?.addEventListener('click', async () => {
        if (!installPrompt) return;
        installPrompt.prompt();
        try { await installPrompt.userChoice; } finally { setInstallPrompt(null); syncInstallUi(); closeSheet(); }
      });
    }
  });
}
