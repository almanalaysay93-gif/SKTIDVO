/* features/backup.js — moved from app.js (F-RESTRUCTURE-01). */

import * as S from '../store.js';
import { applyTheme, render } from '../app.js';
import { setLang, t } from '../i18n.js';
import { toast } from '../ui/toast.js';

export function downloadFile(filename, mime, text) {
  const url = URL.createObjectURL(new Blob([text], { type: mime }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function exportBackup() {
  downloadFile(S.exportFilename(), 'application/json',
               JSON.stringify(S.exportAll(), null, 2));
  toast(t('data.exported'));
}

/* ---------- Google Calendar ----------
   An .ics file rather than the Calendar API: no OAuth, no Cloud
   project, and nothing leaves the phone until the patient imports it.
   The VALARM in these events is also the only reminder this app can
   produce that survives the app being closed. */

export function importBackup(file) {
  const reader = new FileReader();
  reader.onload = () => {
    let parsed;
    try {
      parsed = JSON.parse(reader.result);
    } catch {
      toast(t('data.badFile'));
      return;
    }
    // Restore overwrites everything, so confirm before touching stored data.
    if (!confirm(t('data.restoreConfirm'))) return;
    try {
      const counts = S.importAll(parsed);
      setLang(S.getProfile().lang);
      applyTheme(S.getProfile().theme);
      render();
      toast(`${t('data.restored')} · ${counts.weights}/${counts.intake}/${counts.sessions}`);
    } catch {
      toast(t('data.badFile'));
    }
  };
  reader.onerror = () => toast(t('data.badFile'));
  reader.readAsText(file);
}
