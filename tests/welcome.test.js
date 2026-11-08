/* FR032/T070 sign-in page logic: first launch, dismissed state, signed-in. */
import { suite, test, eq } from './harness.js';
import * as S from '../js/store.js';
import { shouldShowWelcome, welcomeSkip } from '../js/views/welcome.js';
import { shouldShowLocalOnlyNote, statusLabel } from '../js/views/sync.js';
import { offBusy } from '../js/views/diet.js';

export function runWelcomeTests() {
  suite('welcome');
  test('first launch (configured, signed out, not dismissed) → shown', () =>
    eq(shouldShowWelcome({ configured: true, signedIn: false, dismissed: false }), true));
  test('dismissed → hidden; signed in → hidden; sync unconfigured → hidden', () => {
    eq(shouldShowWelcome({ configured: true, signedIn: false, dismissed: true }), false);
    eq(shouldShowWelcome({ configured: true, signedIn: true, dismissed: false }), false);
    eq(shouldShowWelcome({ configured: false, signedIn: false, dismissed: false }), false);
  });
  test('skip stores device-local dismissed flag; routes to setup on first run', () => {
    localStorage.clear();
    eq(S.isWelcomeDismissed(), false);
    let to = null;
    welcomeSkip(n => { to = n; });
    eq(S.isWelcomeDismissed(), true); eq(to, 'settings');
    S.saveProfile({ setupDone: true });
    welcomeSkip(n => { to = n; });
    eq(to, 'today');
    eq('welcomeDismissed' in S.exportAll(), false);
    localStorage.clear();
  });
  test('A027 retirePin removes legacy skti.v1.clinician, idempotent', () => {
    localStorage.setItem('skti.v1.clinician', '{"salt":"a","hash":"b"}');
    eq(S.retirePin(), true); eq(localStorage.getItem('skti.v1.clinician'), null); eq(S.retirePin(), false);
  });
  test('sync state never stores a token; markAllUnsynced clears syncedAt and queues', () => {
    localStorage.clear();
    S.logWeight(70);
    const id = S.syncRecords('weights')[0].id;
    S.applySyncRecords('weights', S.syncRecords('weights').map(r => ({ ...r, syncedAt: 5 })));
    localStorage.setItem('skti.v1.outbox', '[]');
    S.markAllUnsynced();
    eq(Number.isFinite(S.syncRecords('weights')[0].syncedAt), false);
    eq(JSON.parse(localStorage.getItem('skti.v1.outbox')).some(o => o.id === id), true);
    S.setSyncState({ email: 'a@b' });
    eq(Object.keys(S.getSyncState()).join(), 'email');
    localStorage.clear();
  });
  test('local-only note: shown signed out or without consent; hidden when signed in + consented', () => {
    eq(shouldShowLocalOnlyNote({ configured: true, signedIn: false, consented: false }), true);
    eq(shouldShowLocalOnlyNote({ configured: true, signedIn: true, consented: false }), true);
    eq(shouldShowLocalOnlyNote({ configured: true, signedIn: true, consented: true }), false);
    eq(shouldShowLocalOnlyNote({ configured: false, signedIn: false, consented: false }), false);
  });
  test('A034 statusLabel: every state has icon + text', () => {
    for (const state of ['off', 'signin', 'consent', 'offline', 'syncing', 'pending', 'synced', 'error']) {
      const l = statusLabel({ state, pending: 2, lastSyncAt: 1 }, k => k, () => '10:00');
      eq(!!l.icon && !!l.text, true, state + ' ');
    }
    eq(statusLabel({ state: 'error' }, k => k).tone, 'warn');
  });
  test('OFF busy: online + network/CORS-type failure → busy; offline or other error → not busy', () => {
    const rej = code => ({ status: 'rejected', reason: { code } });
    eq(offBusy(rej('OFFLINE'), true), true);
    eq(offBusy(rej('OFFLINE'), false), false);
    eq(offBusy(rej('HTTP'), true), false);
    eq(offBusy({ status: 'fulfilled', value: [] }, true), false);
  });
}
