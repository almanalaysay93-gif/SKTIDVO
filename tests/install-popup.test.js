/* Install popup: the "Not now" postponement rule (pure). */
import { suite, test, eq } from './harness.js';
import { installLaterActive } from '../js/features/installPopup.js';

export function runInstallPopupTests() {
  suite('install-popup');
  test('no stored postponement → popup may show', () => eq(installLaterActive(1000, null), false));
  test('postponed until a future time → hidden', () => eq(installLaterActive(1000, 5000), true));
  test('postponement expired → shown again', () => eq(installLaterActive(6000, 5000), false));
}
