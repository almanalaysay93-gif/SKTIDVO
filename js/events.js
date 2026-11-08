/* events.js — moved from app.js (F-RESTRUCTURE-01). */

import * as S from './store.js';
import { exportBackup } from './features/backup.js';
import { calOpenGoogle, calSchedule, calSessions, calWeighIn } from './features/cal-export.js';
import { installPrompt, setInstallPrompt, syncInstallUi } from './features/install.js';
import { printSummary } from './features/print.js';
import { setLang, t } from './i18n.js';
import { go, render } from './router.js';
import { sheetCalibrate } from './sheets/calibrate.js';
import { sheetCustomDrink } from './sheets/drink.js';
import { sheetHdBp } from './sheets/hdbp.js';
import { sheetMedication } from './sheets/medication.js';
import { sheetSession } from './sheets/session.js';
import { sheetWeight } from './sheets/weight.js';
import { $ } from './ui/format.js';
import { readNumber } from './ui/sheet.js';
import { toast } from './ui/toast.js';
import { addDrink } from './views/fluid.js';
import { calCursor, setCalCursor } from './views/today.js';
import { onSyncClick } from './views/sync.js';
import { welcomeSkip } from './views/welcome.js';

export function onClick(e) {
  const syncHit = onSyncClick(e);
  if (syncHit === 'settings' || syncHit === 'welcome') return go(syncHit);
  if (e.target.closest('#btnWelcomeSkip')) return welcomeSkip(go);
  if (syncHit) return;
  const el = e.target.closest('[data-go],[data-ml],[data-lang],[data-sched],[data-custom-day],' +
    '[data-del-intake],[data-del-weight],[data-del-session],[data-empty-action],' +
    '[data-toggle-med],[data-edit-med],[data-toggle-chk],[data-del-hdbp],[data-cal-nav],' +
    '#btnWeigh,#btnSession,#btnSettings,#btnAddMed,#btnLogHdBp,#pSave,#btnPrint,#btnWipe,' +
    '#btnCalibrate,#btnExport,#btnImport,#btnInstall,#btnA2hsDismiss,' +
    '#btnCalSchedule,#btnCalWeigh,#btnCalSessions,#btnCalGoogle');
  if (!el) return;

  if (el.id === 'btnCalSchedule') return calSchedule();
  if (el.id === 'btnCalWeigh')    return calWeighIn();
  if (el.id === 'btnCalSessions') return calSessions();
  if (el.id === 'btnCalGoogle')   return calOpenGoogle();

  if (el.dataset.calNav) {
    setCalCursor(new Date(calCursor.getFullYear(), calCursor.getMonth() + Number(el.dataset.calNav), 1));
    return render();
  }

  if (el.dataset.go)         return go(el.dataset.go);
  if (el.id === 'btnSettings') return go('settings');
  if (el.id === 'btnWeigh')  return sheetWeight();
  if (el.id === 'btnSession') return sheetSession();
  if (el.id === 'btnAddMed') return sheetMedication();
  if (el.dataset.toggleMed)  return S.toggleMedicationTaken(el.dataset.toggleMed);
  if (el.dataset.editMed)    return sheetMedication(el.dataset.editMed);
  if (el.dataset.toggleChk)  return S.toggleChecklistItem(el.dataset.toggleChk);
  if (el.id === 'btnLogHdBp') return sheetHdBp();
  if (el.dataset.delHdbp) {
    const entry = S.getHdBp().find(r => r.id === el.dataset.delHdbp);
    S.deleteHdBp(entry.id);
    return toast(t('common.delete'), t('common.undo'), () => S.restoreHdBp(entry));
  }
  if (el.id === 'btnCalibrate') return sheetCalibrate();
  if (el.id === 'btnExport') { exportBackup(); return render(); }
  if (el.id === 'btnA2hsDismiss') return S.dismissA2hs();
  if (el.id === 'btnImport') return $('#importFile').click();

  if (el.id === 'btnInstall') {
    if (!installPrompt) return;
    installPrompt.prompt();
    installPrompt.userChoice.finally(() => { setInstallPrompt(null); syncInstallUi(); });
    return;
  }

  if (el.dataset.emptyAction) {
    return el.dataset.emptyAction === 'session' ? sheetSession() : sheetWeight();
  }

  if (el.dataset.ml !== undefined) {
    const ml = Number(el.dataset.ml);
    return ml ? addDrink(ml, el.dataset.key) : sheetCustomDrink();
  }

  if (el.dataset.lang) {
    setLang(el.dataset.lang);
    S.saveProfile({ lang: el.dataset.lang });
    return;                                   // store emit() triggers render
  }

  if (el.dataset.sched)     return S.saveProfile({ schedule: el.dataset.sched });
  if (el.dataset.customDay !== undefined) {
    const dow = Number(el.dataset.customDay);
    const days = new Set(S.getProfile().customDays || []);
    days.has(dow) ? days.delete(dow) : days.add(dow);
    return S.saveProfile({ schedule: 'CUSTOM', customDays: [...days].sort() });
  }

  if (el.dataset.delIntake) {
    const entry = S.getIntake().find(i => i.id === el.dataset.delIntake);
    S.deleteIntake(entry.id);
    return toast(t('fluid.removed'), t('common.undo'), () => S.restoreIntake(entry));
  }
  if (el.dataset.delWeight)  return S.deleteWeight(el.dataset.delWeight);
  if (el.dataset.delSession) return S.deleteSession(el.dataset.delSession);

  if (el.id === 'pSave') {
    const dry   = readNumber($('#pDry'),   { min: 20,  max: 250,  required: false });
    if (dry === null) return $('#pDry').focus();
    const allow = readNumber($('#pAllow'), { min: 200, max: 3000, required: false });
    if (allow === null) return $('#pAllow').focus();
    const idwg  = readNumber($('#pIdwg'),  { min: 0.5, max: 6,    required: false });
    if (idwg === null) return $('#pIdwg').focus();
    
    const name    = $('#pName')?.value.trim() ?? '';
    const booklet = $('#pBooklet')?.value.trim() ?? '';
    const doctor  = $('#pDoctor')?.value.trim() ?? '';
    const station = $('#pStation')?.value.trim() ?? '';
    const nurse   = $('#pNurse')?.value.trim() ?? '';
    const emerg   = $('#pEmerg')?.value.trim() ?? '';

    S.saveProfile({
      name,
      bookletNo: booklet,
      doctorName: doctor,
      stationNo: station,
      nursePhone: nurse,
      emergencyPhone: emerg,
      dryWeightKg: dry ?? null,
      allowanceMl: allow ?? null,
      idwgLimitKg: idwg ?? 2.0,
      setupDone: true
    });
    return toast(t('settings.saved'));
  }

  if (el.id === 'btnPrint') return printSummary();
  if (el.id === 'btnWipe') {
    if (confirm(t('settings.wipeConfirm'))) { S.wipeAll(); go('today'); }
    return;
  }
}
