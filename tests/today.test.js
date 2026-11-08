/* Tests for views/today.js fluid tile — FR006 / A005 (icon + text when over). */

import * as S from '../js/store.js';
import { suite, test, eq } from './harness.js';

export async function runTodayTests() {
  // views/diet.js wires document listeners at import; a no-op stub is enough here.
  globalThis.document ??= { addEventListener() {}, querySelector() { return null; }, querySelectorAll() { return []; } };
  const { fluidReminder } = await import('../js/views/today.js');
  suite('today');

  test('A005: over limit shows alert icon and "over" label', () => {
    localStorage.clear();
    S.saveProfile({ allowanceMl: 500, dryWeightKg: 60, setupDone: true });
    S.logSession({ preKg: 62, postKg: 60, ufL: 2, bpSys: 120, bpDia: 80 });
    S.logIntake(800, 'fluid.water');
    const html = fluidReminder();
    eq(html.includes('#i-alert"'), true, 'alert icon: ');
    eq(html.includes('over'), true, 'text label: ');
    eq(html.includes('reminder__icon--danger'), true);
  });

  test('A005: under limit keeps droplet, no alert', () => {
    localStorage.clear();
    S.saveProfile({ allowanceMl: 1500, dryWeightKg: 60, setupDone: true });
    S.logSession({ preKg: 62, postKg: 60, ufL: 2, bpSys: 120, bpDia: 80 });
    S.logIntake(200, 'fluid.water');
    const html = fluidReminder();
    eq(html.includes('#i-alert"'), false);
    eq(html.includes('#i-droplet"'), true);
  });
}
