/* ===================================================================
   auth/gis.js — Google Identity Services sign-in, web + iOS PWA
   (plan §14.5). Popup mode only. The GIS script is loaded ON DEMAND
   (first tap on "Sign in with Google", or at boot only if this device
   was signed in before) so a never-signed-in user makes no Google
   requests (A018). The ID token lives in this module's memory only:
   never localStorage, never logged, never in backups.
   =================================================================== */

import { WEB_CLIENT_ID } from '../sync/config.js';

export const GIS_SRC = 'https://accounts.google.com/gsi/client';
const EXP_MARGIN_MS = 60 * 1000;

let token = null;          // raw JWT (memory only)
let claims = null;         // decoded payload, UX only — the server re-verifies
let loading = null;
let initialized = false;
const listeners = new Set();

export function onAuthChange(fn) { listeners.add(fn); return () => listeners.delete(fn); }
const notify = () => listeners.forEach(fn => { try { fn(currentUser()); } catch { /* listener bug must not break auth */ } });

/** Decode the JWT payload (no verification; the server does that). Pure. */
export function decodeJwt(jwt) {
  try {
    const part = String(jwt).split('.')[1];
    if (!part) return null;
    const b64 = part.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(part.length / 4) * 4, '=');
    const bin = atob(b64);
    const bytes = Uint8Array.from(bin, c => c.charCodeAt(0));
    return JSON.parse(new TextDecoder().decode(bytes));
  } catch { return null; }
}

/** True when the token is present and not within a minute of expiry. Pure. */
export function tokenFresh(c, now = Date.now()) {
  return !!c && Number.isFinite(Number(c.exp)) && Number(c.exp) * 1000 - EXP_MARGIN_MS > now;
}

export function currentUser() {
  return claims ? { email: String(claims.email || '').toLowerCase(), name: claims.name || '', exp: Number(claims.exp) * 1000 } : null;
}

/** Fresh token or null. Never returns an expired token. */
export function getToken(now = Date.now()) {
  return token && tokenFresh(claims, now) ? token : null;
}

/** Test hook + used by the GIS callback. */
export function setCredential(jwt) {
  const c = decodeJwt(jwt);
  if (!c || !c.email) return false;
  token = jwt;
  claims = c;
  notify();
  return true;
}

export function clearToken() {
  token = null;
  claims = null;
  notify();
}

function loadScript() {
  if (globalThis.google?.accounts?.id) return Promise.resolve();
  if (loading) return loading;
  loading = new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = GIS_SRC;
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => { loading = null; s.remove(); reject(new Error('gis_load_failed')); };
    document.head.appendChild(s);
  });
  return loading;
}

async function init() {
  if (!WEB_CLIENT_ID) throw new Error('not_configured');
  await loadScript();
  if (initialized) return;
  globalThis.google.accounts.id.initialize({
    client_id: WEB_CLIENT_ID,
    callback: r => { if (r && r.credential) setCredential(r.credential); },
    auto_select: true,
    ux_mode: 'popup',
    use_fedcm_for_prompt: true,
    cancel_on_tap_outside: true,
    itp_support: true
  });
  initialized = true;
}

/** Render the official Google button into `el` (user taps it → popup). */
export async function renderButton(el, { locale } = {}) {
  await init();
  globalThis.google.accounts.id.renderButton(el, {
    type: 'standard', theme: 'outline', size: 'large', text: 'signin_with', shape: 'pill',
    width: Math.min(320, el.clientWidth || 320), locale
  });
}

/** Silent re-prompt (auto_select). Resolves true if a token arrived. */
export async function silentSignIn(timeoutMs = 8000) {
  await init();
  if (getToken()) return true;
  return new Promise(resolve => {
    let done = false;
    const off = onAuthChange(u => { if (u && !done) { done = true; off(); resolve(true); } });
    setTimeout(() => { if (!done) { done = true; off(); resolve(false); } }, timeoutMs);
    try {
      globalThis.google.accounts.id.prompt(n => {
        if (done) return;
        const skipped = n && ((n.isNotDisplayed && n.isNotDisplayed()) || (n.isSkippedMoment && n.isSkippedMoment()));
        if (skipped) { done = true; off(); resolve(false); }
      });
    } catch { done = true; off(); resolve(false); }
  });
}

/** Sign out: drop the token, stop auto-select on this browser. */
export function signOut() {
  try { globalThis.google?.accounts?.id?.disableAutoSelect(); } catch { /* script not loaded: nothing to do */ }
  clearToken();
}

export function isLoaded() { return !!globalThis.google?.accounts?.id; }
