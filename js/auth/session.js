/* ===================================================================
   auth/session.js — "this device was signed in" marker (stay signed in
   across refresh). Stores ONLY {email, signedInAt}: no access token,
   no ID token, no credential (C017). Device-local, never synced, never
   in backups (exportAll does not read it). On boot the marker lets the
   app try a silent Google token refresh (prompt:'none', no popup).
   =================================================================== */

export const MARKER_KEY = 'skti.v1.session';

const store = s => s || globalThis.localStorage;

/** Pure-ish: valid marker or null (missing/corrupt → null). */
export function readMarker(storage) {
  try {
    const raw = store(storage)?.getItem(MARKER_KEY);
    if (!raw) return null;
    const v = JSON.parse(raw);
    if (!v || typeof v !== 'object' || Array.isArray(v)) return null;
    const email = String(v.email || '').trim().toLowerCase();
    if (!email || !email.includes('@')) return null;
    const signedInAt = Number(v.signedInAt);
    return { email, signedInAt: Number.isFinite(signedInAt) ? signedInAt : 0 };
  } catch { return null; }
}

/** Write {email, signedInAt}. Anything else passed in is dropped. */
export function writeMarker(email, storage, now = Date.now()) {
  const e = String(email || '').trim().toLowerCase();
  if (!e || !e.includes('@')) return false;
  try { store(storage).setItem(MARKER_KEY, JSON.stringify({ email: e, signedInAt: now })); return true; }
  catch { return false; }
}

export function clearMarker(storage) {
  try { store(storage).removeItem(MARKER_KEY); } catch { /* storage blocked: nothing to clear */ }
}

/**
 * Pure boot decision.
 *  'silent'  — marker + online + configured: try prompt:'none' token refresh
 *  'offline' — marker but offline: no sign-in attempt, app stays local
 *  'none'    — no marker (or sync unconfigured): normal welcome-gate rules
 */
export function bootAuthDecision({ configured, marker, online }) {
  if (!configured || !marker) return 'none';
  return online ? 'silent' : 'offline';
}
