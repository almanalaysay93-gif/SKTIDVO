/* ===================================================================
   sync/config.js — fixed internal defaults (plan §14.3a). No user-facing
   settings. EXEC_URL and WEB_CLIENT_ID are public values filled in after
   the owner's Google setup (apps-script/README.md); empty = sync off.
   Never put a secret here.
   =================================================================== */

export const EXEC_URL = '';        // Apps Script web app /exec URL (T053b)
export const WEB_CLIENT_ID = '';   // OAuth Web client ID (public)

export const BATCH_MAX_RECORDS = 200;
export const BATCH_MAX_BYTES = 400 * 1024;
export const BACKOFF_BASE_MS = 1000;
export const BACKOFF_CAP_MS = 15 * 60 * 1000;
export const FUTURE_SKEW_MS = 24 * 60 * 60 * 1000;
export const RETENTION_DAYS = 365;
export const BACKUP_REMINDER_DAYS = 14;
export const WRITE_DEBOUNCE_MS = 3000;

/** The 12 synced entities (plan §14.2). */
export const ENTITIES = ['profile', 'weights', 'intake', 'sessions', 'medications', 'medLogs',
  'checklist', 'hdBp', 'dietLog', 'customFoods', 'labs', 'limits'];
