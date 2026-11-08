/* ===================================================================
   views/welcome.js — optional sign-in page (FR032, T070). Shown on first
   launch and whenever signed out and not dismissed. Login stays optional
   (C015): "Continue without signing in" dismisses it for this device.
   GIS loads only when the user taps "Sign in with Google".
   =================================================================== */

import * as S from '../store.js';
import { getLang, langName, LANGS, t } from '../i18n.js';
import { configured, gis, wasSignedIn } from '../sync/client.js';
import { esc } from '../ui/format.js';
import { icon } from '../ui/icons.js';

/** Pure: show the page? Never when signed in, sync unconfigured, or dismissed. */
export function shouldShowWelcome({ configured: cfg, signedIn, dismissed }) {
  return !!cfg && !signedIn && !dismissed;
}

export function welcomeDue() {
  return shouldShowWelcome({ configured, signedIn: !!gis.currentUser() || wasSignedIn(), dismissed: S.isWelcomeDismissed() });
}

export function viewWelcome() {
  const online = navigator.onLine !== false;
  const user = gis.currentUser();
  return `
  <div class="view welcome">
    <img class="welcome__seal" src="assets/logo.png" alt="" width="96" height="96">
    <h2 class="welcome__title">SKTIDVO</h2>
    <p class="welcome__value">${esc(t('welcome.value'))}</p>
    <div class="seg" role="group" aria-label="${esc(t('settings.language'))}">
      ${LANGS.map(c => `<button type="button" data-lang="${c}" aria-pressed="${c === getLang()}">${esc(langName(c))}</button>`).join('')}
    </div>
    ${user ? `<p class="banner">${icon('check-circle')}<span>${esc(t('sync.signedInAs').replace('{email}', user.email))}</span></p>
      <button type="button" class="btn btn--primary" data-go="today" style="width:100%">${esc(t('welcome.continue'))}</button>` : `
    <button type="button" class="btn btn--primary" data-sync="signin" data-slot="#welcomeGis" style="width:100%" ${online ? '' : 'disabled aria-disabled="true"'}>
      ${icon('shield')}<span>${esc(online ? t('welcome.signIn') : t('welcome.needsInternet'))}</span></button>
    <div id="welcomeGis" class="gis-slot"></div>
    <button type="button" class="btn btn--ghost" id="btnWelcomeSkip" style="width:100%">${esc(t('welcome.skip'))}</button>`}
    <p class="hint welcome__privacy">${esc(t('welcome.privacy'))}
      <button type="button" class="linklike" data-sync="privacy">${esc(t('privacy.open'))}</button></p>
  </div>`;
}

/** "Continue without signing in": remember, then first-run setup or Today. */
export function welcomeSkip(go = n => { location.hash = '#' + n; }) {
  S.setWelcomeDismissed(true);
  go(S.getProfile().setupDone ? 'today' : 'settings');
}
