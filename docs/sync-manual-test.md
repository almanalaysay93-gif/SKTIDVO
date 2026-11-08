# F-SYNC-01 — manual live test (user)

These steps need real Google accounts, so they cannot be automated here. Run them on the GitHub Pages URL or on `http://localhost:<port>` (must be an origin listed in the OAuth client). Use Chrome on Android and Safari on iOS 15+, both in a browser tab and as an installed PWA.

## 0. Before you start
1. **Redeploy the Apps Script.** Stage 3 changed `apps-script/Code.gs` and `lib.gs` (new ops `whoami` and `patientRecords`, and a server-side consent gate). Paste both files into the bound script, then go to Manage deployments → Edit → **New version**, so the `/exec` URL stays the same.
2. Script Properties: `WEB_CLIENT_ID` and `CLINICIAN_EMAILS=share@spmcdvo.net`.
3. Sheet sharing: General access = Restricted. Only share@spmcdvo.net and almanalaysay93@gmail.com have access. Take a screenshot for A031.
4. You need a test patient Google account (any Gmail address other than the two owners).

| # | Steps | Expected |
|---|---|---|
| 1 | First launch: open the app with storage cleared. Check DevTools → Network. | The sign-in page appears with the seal, the language switch, "Sign in with Google to save your data with SKTI" and "Continue without signing in — data stays only on this phone". **No request goes to any google.com or googleusercontent.com host** (A018). |
| 2 | Tap "Continue without signing in". | You go to Settings (first run) or Today. The note "Your data is only on this phone…" shows on Today and in Settings. The header shows "Backup off". |
| 3 | Turn on airplane mode, then open the sign-in page from the header badge. | The button reads "Sign-in needs internet" and is disabled. Every other tab still works offline. |
| 4 | Go back online, tap Sign in, then tap the Google button and choose the patient account. | The Google popup closes. The consent sheet opens with the DRAFT privacy notice. **No push or pull request is sent yet** (A019). |
| 5 | Tap "I agree". | A toast says "Cloud backup is on". The header shows "Syncing…" and then "Synced hh:mm". The sheet gets a `consent` row with `given` and data rows for the patient email (A019, A020). |
| 6 | Log a weight. Wait about 3 s. | The header shows "1 waiting" and then "Synced". A new row appears in the `weights` tab. |
| 7 | On a second phone or browser, sign in with the same account and accept consent. | All data from phone A appears on phone B with equal counts (A020). |
| 8 | Edit the same weight on both phones while offline, then bring both online. | The later edit wins on both phones (A022). |
| 9 | Patient phone: add a lab result (Diet tab). | The lab shows "pending" and the hint "Approval needs clinician sign-in (online)". There is no PIN anywhere (A027). |
| 10 | Clinician phone: sign in as **share@spmcdvo.net** and accept consent. Go to Settings → "Clinician — approvals" → Load patients → choose the patient → Approve the lab. Set limits and tap "Save as approved". | A toast says "Saved with clinician approval". After the patient taps "Sync now", the lab shows approved by share@spmcdvo.net and the limits show approvedBy share@spmcdvo.net (A026, A036). |
| 11 | Sign in as almanalaysay93@gmail.com (or any other account). | The Clinician section does not appear. A forged call returns 403 (see step 15). |
| 12 | Sheet edit: as an owner, type a lab row (email, id, json `{"date":"2026-11-08","values":{"potassium":5}}`) into the `labs` tab, leave `serverSeq` empty, then sync the patient. | The lab arrives `approved` with approvedBy "sheet edit" (A038). Check the `audit` tab: if `sheetEdit:labs` shows your email, the onEdit editor check works. If it says "unknown owner", record that result for T056. If nothing arrives until the next day, the onEdit trigger did not fire and the daily sweep is the fallback. |
| 13 | Settings → Withdraw consent → confirm. | Sync stops. The `consent` tab gets a `withdrawn` row. A sheet offers "Delete my cloud data". If you choose "Keep the cloud copy", new local writes are not sent (A037). |
| 14 | Settings → Delete my cloud data → confirm. | All rows for that email disappear from every tab. Local data stays on the phone. The header shows "Needs your consent" (A028). |
| 15 | Sign out. | The header shows "Backup off" or "Sign in again". No further requests are sent. Data stays on the phone (A033). |
| 16 | iOS 15+: repeat step 4 in a Safari tab, then in the installed home-screen app. | Record whether the popup works in standalone mode. If it fails there, sign in from the Safari tab instead (plan §14.5, T057). |
| 17 | DevTools console during steps 4–6. | No CSP violation messages (T062). |

## Security checks (T068)
Run from any shell. The server always answers HTTP 200 with JSON, after a 302 redirect.
```
U='<EXEC_URL>'
curl -sL -H 'Content-Type: text/plain' --data '{"op":"pull"}' "$U"                         # {"ok":false,"code":"no_token"}
curl -sL -H 'Content-Type: text/plain' --data '{"op":"pull","idToken":"forged"}' "$U"      # {"ok":false,"code":401,...}
```
Expired token: copy a real ID token from step 4 (DevTools, the request body of a sync call), wait more than 1 hour, then resend it. Expected: `401` with reason `expired`.

Patient token on a clinician op: resend that body with `"op":"patients"`. Expected: `403` with reason `forbidden`.
