# Apps Script sync backend (SKTIDVO)

Apps Script web app that verifies Google ID tokens through Google's tokeninfo endpoint and stores sync rows in the owner's Google Sheet. The sheet ID never reaches the client.

## Setup steps

1. In Google Cloud Console (sign in as share@spmcdvo.net or almanalaysay93@gmail.com), create a free project named "SKTIDVO".
2. Go to APIs & Services → OAuth consent screen. Choose External, set app name SKTIDVO, add a support email and developer contact, and request only the `openid`, `email` and `profile` scopes. Add test users while the app is in Testing, or publish it (basic scopes need no verification; confirm at setup).
3. Go to Credentials → Create OAuth client ID → Web application. Under Authorized JavaScript origins add `https://almanalaysay93-gif.github.io` and `http://localhost` (add `http://localhost:8080` or your dev port if it uses one). Add no redirect URIs unless the redirect fallback is used. Copy the Client ID.
4. Phase 2 only, after the T058 spike: create an Android OAuth client for package `io.github.almanalaysay93gif.sktidvo` using the SHA-1 from `./gradlew signingReport` (debug and release). Skip this step for Phase 1.
5. Open the sheet → Extensions → Apps Script. Paste `Code.gs`, `lib.gs` and `appsscript.json`. Then open Project Settings → Script Properties and set:
   - `WEB_CLIENT_ID` = the OAuth Web client ID from step 3
   - `CLINICIAN_EMAILS` = `share@spmcdvo.net`
   - `ANDROID_CLIENT_ID` = leave empty (Phase 2 only)
6. In the Apps Script editor, select `setup` and click Run. It creates the 12 entity tabs (profile, weights, intake, sessions, medications, medLogs, checklist, hdBp, dietLog, customFoods, labs, limits) plus the consent, audit and meta tabs. It also creates a daily 03:00 trigger for `dailyJob` and an installable `onEdit` trigger for `onSheetEdit`. Approve the permission prompt.
7. Deploy → New deployment → Web app. Set Execute as: Me and Who has access: Anyone. Copy the `/exec` URL. Paste it into `EXEC_URL`, and paste the client ID into `WEB_CLIENT_ID`, both in `js/sync/config.js`. These are public values; never put a secret in that file.
   - Check: open the `/exec` URL in a browser. It must show `{"ok":true,"code":"alive",...}`.
8. Go to the sheet → Share. Set General access to Restricted and limit people to the two owners. Take a screenshot for audit item A031.
9. To redeploy, go to Manage deployments → edit → New version. This keeps the same URL.

## Sheet edits

- Owners may edit rows directly in the sheet.
- Edited `labs` and `limits` rows count as approved, with `approvedBy` set to "sheet edit".
- Whether the editor's email is captured for consumer accounts is UNVERIFIED. If it is not, the audit tab shows "unknown owner".
- The daily job sweeps for rows with an empty `serverSeq` and stamps them so devices pull the change.

## Retention

- Daily, patients inactive for 1 year are deleted. The period is a fixed 365 days, not a setting.
- Tombstones (deleted rows) older than 1 year are purged.
- For each patient, a `purgedBefore:<email>` watermark is stored in the `meta` tab.

## Quotas

Consumer account limits, from https://developers.google.com/apps-script/guides/services/quotas (checked 2026-11-08):

| Quota | Limit |
|---|---|
| URL Fetch calls | 20,000 per day |
| Script runtime | 6 min per execution |
| Triggers total runtime | 90 min per day |
| Properties read/write | 50,000 per day |

Design to stay under these: one tokeninfo call per token (cached until the token's `exp`), and one request per sync step.

Note: setup() deletes all existing triggers of this script project before creating dailyJob and onSheetEdit; re-running it is safe.


## Changes after first deploy (stage 3)
New ops `whoami`, `patientRecords` (clinician) and a server-side consent gate (`no_consent` for push/pull). Redeploy: Manage deployments → Edit → New version (keeps the /exec URL).
