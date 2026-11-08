/* Stay signed in across refresh: marker helpers, boot decision, sign-out. */
import { suite, test, eq } from './harness.js';
import * as S from '../js/store.js';
import { MARKER_KEY, readMarker, writeMarker, clearMarker, bootAuthDecision } from '../js/auth/session.js';
import { setCredential, currentUser, getToken } from '../js/auth/gis.js';
import { accountBarMode, headerStatus } from '../js/views/sync.js';

const mem = () => { const m = new Map(); return { getItem: k => m.has(k) ? m.get(k) : null, setItem: (k, v) => m.set(k, String(v)), removeItem: k => m.delete(k), m }; };
const jwt = o => 'x.' + Buffer.from(JSON.stringify(o)).toString('base64url') + '.y';

export async function runSessionTests() {
  suite('session');
  test('marker key is under skti.v1', () => eq(MARKER_KEY.startsWith('skti.v1.'), true));
  test('write/read valid marker: only email + signedInAt stored', () => {
    const st = mem();
    eq(writeMarker('A@B.com', st, 123), true);
    eq(JSON.stringify(readMarker(st)), JSON.stringify({ email: 'a@b.com', signedInAt: 123 }));
    eq(Object.keys(JSON.parse(st.getItem(MARKER_KEY))).sort().join(), 'email,signedInAt');
  });
  test('missing → null; corrupt JSON → null; bad shape → null', () => {
    const st = mem();
    eq(readMarker(st), null);
    st.setItem(MARKER_KEY, '{not json'); eq(readMarker(st), null);
    st.setItem(MARKER_KEY, '[1]'); eq(readMarker(st), null);
    st.setItem(MARKER_KEY, '{"email":"nope"}'); eq(readMarker(st), null);
    eq(writeMarker('', st), false);
  });
  test('storage that throws → null / false, no crash', () => {
    const bad = { getItem() { throw new Error('x'); }, setItem() { throw new Error('x'); }, removeItem() { throw new Error('x'); } };
    eq(readMarker(bad), null); eq(writeMarker('a@b.c', bad), false); clearMarker(bad);
  });
  test('clearMarker removes it', () => { const st = mem(); writeMarker('a@b.c', st); clearMarker(st); eq(readMarker(st), null); });
  test('boot: marker+online → silent; marker+offline → no attempt; no marker → gate rules', () => {
    const m = { email: 'a@b.c' };
    eq(bootAuthDecision({ configured: true, marker: m, online: true }), 'silent');
    eq(bootAuthDecision({ configured: true, marker: m, online: false }), 'offline');
    eq(bootAuthDecision({ configured: true, marker: null, online: true }), 'none');
    eq(bootAuthDecision({ configured: false, marker: m, online: true }), 'none');
  });
  test('account bar: signed in → signout; marker → signinAgain; offline → offline; never → none', () => {
    eq(accountBarMode({ configured: true, signedIn: true, wasSignedIn: true, online: true }), 'signout');
    eq(accountBarMode({ configured: true, signedIn: false, wasSignedIn: true, online: true }), 'signinAgain');
    eq(accountBarMode({ configured: true, signedIn: false, wasSignedIn: true, online: false }), 'offline');
    eq(accountBarMode({ configured: true, signedIn: false, wasSignedIn: false, online: true }), 'none');
  });
  test('header shows offline instead of signed-out states when offline', () => {
    eq(headerStatus({ state: 'signin' }, false).state, 'offline');
    eq(headerStatus({ state: 'off' }, false).state, 'offline');
    eq(headerStatus({ state: 'synced' }, false).state, 'synced');
    eq(headerStatus({ state: 'off' }, true).state, 'off');
  });
  // client.js touches addEventListener/document only inside startSync; safe to import.
  const client = await import('../js/sync/client.js');
  test('sign-out clears marker, identity and token; keeps local data; not in backup', () => {
    localStorage.clear();
    S.logWeight(70);
    setCredential(jwt({ email: 'p@x.com', exp: Math.floor(Date.now() / 1000) + 3600 }));
    writeMarker('p@x.com');
    eq(client.wasSignedIn(), true);
    eq(MARKER_KEY in S.exportAll(), false);
    eq(JSON.stringify(S.exportAll()).includes('p@x.com'), false);
    client.signOut();
    eq(readMarker(), null); eq(currentUser(), null); eq(getToken(), null);
    eq(client.wasSignedIn(), false);
    eq(S.getWeights().length, 1);
    eq(S.isWelcomeDismissed(), true);
    localStorage.clear();
  });
  test('trySilent offline → no attempt (resolves false)', async () => {
    localStorage.clear();
    writeMarker('p@x.com');
    const prev = navigator.onLine;
    Object.defineProperty(navigator, 'onLine', { value: false, configurable: true });
    eq(await client.trySilent(), false);
    Object.defineProperty(navigator, 'onLine', { value: prev, configurable: true });
    localStorage.clear();
  });
}
