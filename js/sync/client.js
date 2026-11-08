/* ===================================================================
   sync/client.js — the app's single sync engine wired to real IO:
   store.js, localStorage outbox, GIS token, fetch transport, triggers
   (boot, online, visibilitychange, debounced local writes, Sync now).
   Signed out = no timers, no requests (C015, A018).
   =================================================================== */

import * as S from '../store.js';
import * as gis from '../auth/gis.js';
import { call } from './api.js';
import { EXEC_URL, WEB_CLIENT_ID } from './config.js';
import { createEngine } from './engine.js';
import { loadOutbox, saveOutbox } from './queue.js';

export const configured = !!(EXEC_URL && WEB_CLIENT_ID);

export const engine = createEngine({
  configured,
  api: (op, body, idToken) => call(op, body, { idToken }),
  store: S,
  outbox: { load: () => loadOutbox(localStorage), save: l => saveOutbox(l, localStorage) },
  auth: { getToken: () => gis.getToken(), user: () => gis.currentUser(), clearToken: () => gis.clearToken() },
  isOnline: () => navigator.onLine !== false,
  onWhoami: me => setRole(me)
});

let role = null;                 // {email, clinician} from server whoami / sync; UX only
/** Role from any verified server reply (sign-in whoami or the sync op). */
export function setRole(me) {
  if (me && me.email) { role = { email: me.email, clinician: !!me.clinician }; engine.publish(); }
}
export function getRole() { return role && role.email === gis.currentUser()?.email ? role : null; }

async function refreshRole() {
  role = null;
  if (!gis.getToken()) return;
  try { role = await engine.call('whoami', {}); } catch { role = null; }
  engine.publish();
}

/** After a token arrives (button or silent). Guards a device bound to another account. */
function onSignedIn(user) {
  const st = S.getSyncState();
  if (st.boundEmail && st.boundEmail !== user.email && !confirmSwitch(st.boundEmail, user.email)) {
    gis.signOut();
    return;
  }
  S.setSyncState({ email: user.email });
  // Background only: UI is already rendered. Sync op returns the role; whoami only if still unknown.
  engine.run().then(() => { if (!getRole()) refreshRole(); });
}

let confirmSwitch = () => true;
export function setSwitchConfirm(fn) { confirmSwitch = fn; }

export function signOut() {
  gis.signOut();
  role = null;
  S.setSyncState({ email: undefined });
  engine.signedOut();
}

/** Was signed in before → silent re-prompt (only then may GIS load at boot). */
export function wasSignedIn() { return !!S.getSyncState().email; }

export async function trySilent() {
  if (!configured || !wasSignedIn() || !navigator.onLine) return false;
  try { return await gis.silentSignIn(); } catch { return false; }
}

let started = false;
export function startSync() {
  if (started) return;
  started = true;
  let lastEmail = null;
  gis.onAuthChange(u => {
    if (u && u.email !== lastEmail) { lastEmail = u.email; onSignedIn(u); }
    if (!u) { lastEmail = null; engine.publish(); }
  });
  S.subscribe(() => engine.localWrite());
  addEventListener('online', () => { engine.publish(); if (gis.getToken()) engine.run(); else trySilent(); });
  addEventListener('offline', () => engine.publish());
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible') return;
    if (gis.getToken()) engine.run(); else if (wasSignedIn()) trySilent();
  });
  trySilent();
}

export { gis };
