/* T033 iOS A2HS + backup reminder decisions (FR014, OQ-09). */
import { shouldShowA2hs, shouldShowBackupReminder, isIos, BACKUP_REMINDER_MS } from '../js/features/install.js';
import * as S from '../js/store.js';
import { suite, test, eq } from './harness.js';

export function runReminderTests() {
  suite('reminders');
  test('A2HS only on iOS Safari, not standalone, not dismissed', () => {
    eq(isIos('Mozilla/5.0 (iPhone; CPU iPhone OS 15_0 like Mac OS X)'), true);
    eq(isIos('Mozilla/5.0 (Linux; Android 14)'), false);
    eq(shouldShowA2hs({ ios: true, standalone: false, dismissed: false }), true);
    eq(shouldShowA2hs({ ios: true, standalone: true, dismissed: false }), false);
    eq(shouldShowA2hs({ ios: true, standalone: false, dismissed: true }), false);
    eq(shouldShowA2hs({ ios: false, standalone: false, dismissed: false }), false);
  });
  test('backup reminder: 14 days, never-backed-up with data, hidden when signed in or empty', () => {
    const now = 100 * BACKUP_REMINDER_MS;
    eq(shouldShowBackupReminder({ lastBackupAt: null, now, hasData: true }), true);
    eq(shouldShowBackupReminder({ lastBackupAt: now - BACKUP_REMINDER_MS, now, hasData: true }), true);
    eq(shouldShowBackupReminder({ lastBackupAt: now - BACKUP_REMINDER_MS + 1, now, hasData: true }), false);
    eq(shouldShowBackupReminder({ lastBackupAt: null, now, hasData: true, signedIn: true }), false);
    eq(shouldShowBackupReminder({ lastBackupAt: null, now, hasData: false }), false);
  });
  test('device-local keys persist and are not exported', () => {
    localStorage.clear();
    S.setLastBackupAt(1234); S.dismissA2hs();
    eq(S.getLastBackupAt(), 1234); eq(S.isA2hsDismissed(), true);
    const ex = JSON.stringify(S.exportAll());
    eq(ex.includes('lastBackupAt') || ex.includes('a2hsDismissed'), false);
  });
}