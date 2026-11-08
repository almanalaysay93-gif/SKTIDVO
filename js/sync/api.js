/* ===================================================================
   sync/api.js — transport to the Apps Script web app (plan §14.3, §14.7).
   POST text/plain JSON (no CORS preflight); the browser follows the 302
   to script.googleusercontent.com. Server replies {ok, code, data} with
   HTTP 200 even for errors, so the JSON `code` is what counts.
   The ID token is passed in per call and never stored or logged here.
   =================================================================== */

import { EXEC_URL } from './config.js';

export const TIMEOUT_MS = 20000;

export class SyncError extends Error {
  constructor(code, { status = null, retryAfter = null, data = null } = {}) {
    super('sync: ' + code);
    this.code = code;            // 'offline' | 'timeout' | 'bad_response' | 'auth' | 'forbidden' | 'rate_limited' | 'cursor_too_old' | 'no_consent' | server code
    this.status = status;        // 401 / 403 / 429 for nextRetryAt(), else null
    this.retryAfter = retryAfter;
    this.data = data;
  }
}

/** Map a parsed server reply to data or a SyncError (pure, tested). */
export function interpret(json) {
  if (!json || typeof json !== 'object') throw new SyncError('bad_response');
  if (json.ok === true) return json.data || {};
  const c = json.code;
  const data = json.data || {};
  if (c === 401 || c === '401') throw new SyncError('auth', { status: 401, data });
  if (c === 403 || c === '403') throw new SyncError('forbidden', { status: 403, data });
  if (c === 429 || c === '429') {
    const ra = Number(data.retryAfter);
    throw new SyncError('rate_limited', { status: 429, retryAfter: Number.isFinite(ra) ? ra : null, data });
  }
  throw new SyncError(String(c || 'server_error'), { data });
}

/**
 * call('pull', {since}, {idToken}) → data. Throws SyncError.
 * fetchImpl / url / timeoutMs injectable for tests.
 */
export async function call(op, body, { idToken, fetchImpl = globalThis.fetch, url = EXEC_URL, timeoutMs = TIMEOUT_MS } = {}) {
  if (!url) throw new SyncError('not_configured');
  if (!idToken) throw new SyncError('auth', { status: 401 });
  const ctrl = typeof AbortController === 'function' ? new AbortController() : null;
  const timer = ctrl ? setTimeout(() => ctrl.abort(), timeoutMs) : null;
  let res;
  try {
    res = await fetchImpl(url, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ ...body, op, idToken }),
      redirect: 'follow',
      credentials: 'omit',
      signal: ctrl ? ctrl.signal : undefined
    });
  } catch (e) {
    throw new SyncError(e && e.name === 'AbortError' ? 'timeout' : 'offline');
  } finally {
    if (timer) clearTimeout(timer);
  }
  if (!res || !res.ok) throw new SyncError('http_' + (res ? res.status : 0));
  let json;
  try { json = await res.json(); } catch { throw new SyncError('bad_response'); }
  return interpret(json);
}
