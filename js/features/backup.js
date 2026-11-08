/* features/backup.js — moved from app.js (F-RESTRUCTURE-01). */

import * as S from '../store.js';
import { setLang, t } from '../i18n.js';
import { render } from '../router.js';
import { applyTheme } from '../ui/theme.js';
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

/* Backups are a few hundred KB at most; anything far bigger is not ours. */
export const MAX_BACKUP_BYTES = 5 * 1024 * 1024;

export function importBackup(file) {
  if (!file || file.size > MAX_BACKUP_BYTES) { toast(t('data.badFile')); return; }
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
