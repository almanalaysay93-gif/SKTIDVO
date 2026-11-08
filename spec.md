# spec.md — F-RESTRUCTURE-01

Rev 3.4 · 2026-11-08 · Mode: Buildme Markdown adapter; native Spec Kit not run
Source: user answers 2026-11-08 (Q1–Q10), repo scan (project_context.md).

## 1. Goal
Split `js/app.js` into cohesive modules with identical features, add tablet-optimised responsive layout, harden offline + GitHub Pages hosting, fix listed pending defects. No framework, no build step.

**Phase scope (user decision 2026-11-08): WEB APP FIRST.** Phase 1 = web app/PWA on GitHub Pages (phone browser, tablet, desktop; iOS/Android via browser + Add to Home Screen). Phase 2 = Capacitor Android (deferred, non-blocking). `www/` stays untouched in Phase 1 and is regenerated from root in Phase 2 (T029).

## 2. Feature inventory (must survive — C001)
Today dashboard (status, reminders, trends, calendar card) · Fluid (drinks, custom drink, IDWG band) · Weight (log, sparkline, scale calibration) · Meds (list, slots, taken toggle, editor) · Dialysis sessions + HD BP · Diet (food search, barcode, custom foods, diet log) · Labs + limits (pending → clinician approval (server-verified share@spmcdvo.net; PIN retired, FR025)) · Settings via header gear (profile, schedule incl. custom dialysis days, language en/tl/ceb, USDA API key, install, persistent storage, wipe all data) · Daily meds checklist · HD BP card + sheet · Custom-food CSV import · Lab JSON import + manual lab entry · Backup export/import · Calendar export (ICS + Google link) · Print summary · Toasts with undo · Offline banner.
Nav: 6 bottom tabs (Today, Fluid, Weight, Meds, Diet, Dialysis) + Settings in header — 7 screens.

## 3. User stories (priority order)
- **US001 (P1)** Patient: app opens and works fully with no signal after first visit, so I can log at home/clinic.
- **US002 (P1)** Patient: every existing feature behaves exactly as before the restructure, and my saved data is intact.
- **US003 (P1)** Patient on tablet / desktop browser: layout uses the wider screen (multi-column cards) while the bottom tab bar stays the same.
- **US004 (P2)** Nurse/doctor at checkup: read the patient's Today, trends, labs and print summary clearly on the patient's phone, tablet or browser.
- **US005 (P2)** Clinician (share@spmcdvo.net): approve pending labs/limits only while signed in online, verified server-side; restored backups cannot bypass that (OQ-03). Rev 3: PIN retired.
- **US006 (P2)** Patient: over-limit fluid is unmistakable (icon + text), header readable at 390px.
- **US007 (P3)** Maintainer: small modules, in-repo test runner, www sync script, GH Pages deploy.

## 4. Functional requirements
| ID | Requirement | Story |
|---|---|---|
| FR001 | app.js split into modules per plan §3; `js/main.js` entry; no behaviour change. | US002, US007 |
| FR002 | All existing tests (baseline N recorded at T002) pass after each extraction step; runner committed at `tests/run-all.mjs`. | US002, US007 |
| FR003 | Service worker precaches every module in new tree; cache name bumped; offline navigation falls back to `./index.html`. | US001 |
| FR004 | All URLs relative; app works at `https://<user>.github.io/<repo>/` and Capacitor root. | US001 |
| FR005 | Responsive breakpoints (plan §5): phone single column; tablet ≥768 two-column card grid; desktop ≥1024 wider shell, max content width; bottom nav on all. | US003 |
| FR006 | Today Fluid card shows alert icon + label when over limit (theme rule 5). | US006 |
| FR007 | Header subtitle not truncated at 390px (wrap or responsive size). | US006 |
| FR008 | Backup import resets every lab and limit to `pending` (OQ-03); re-approval needs clinician Google login (Rev 3). | US005 |
| FR014 | iOS Safari non-standalone: dismissible "Add to Home Screen" instructions prompt. Backup reminder (fixed 14-day interval) shown ONLY when the user is NOT signed in to sync; signed-in users are backed up automatically by sync. Copy via i18n en/tl/ceb. | US001 |
| FR009 | Online-only food search shows clear offline message; cached foods/custom foods still usable. | US001 |
| FR010 | (Phase 2, deferred) `www/` sync script copies root web files; diff verifies parity. `www/` untouched in Phase 1. | US007 |
| FR011 | GH Pages deploy workflow publishes web files only (not android/, node_modules, apk). | US007 |
| FR012 | SW update: new version activates and user sees refreshed shell on next launch without data loss. | US001 |
| FR013 | Print summary readable on A4/letter from desktop and tablet. | US004 |

## 5. Non-functional
| ID | Requirement |
|---|---|
| NFR001 | No module > 400 lines (i18n strings exempt). |
| NFR002 | First load ≤ 3 s on Moto-G-class 4G; repeat (cached) interactive ≤ 1 s; tap feedback < 400 ms (Doherty). |
| NFR003 | WCAG 2.2 AA + theme constitution; targets 56px. |
| NFR004 | No horizontal scroll at 320/390/768/1024/1440. |
| NFR005 | Zero remote telemetry (C003); sync traffic only to the clinic Apps Script, after consent. |
| NFR006 | Platforms: Capacitor Android + iOS Safari PWA + desktop Chrome/Edge/Firefox/Safari; min versions: Android 8+ (WebView/Chrome 90+), iOS/iPadOS 15+, last 2 desktop versions. |

## 6. Acceptance (Given/When/Then)
- **A001 (FR001/FR002):** Given restructured tree, when `node tests/run-all.mjs` runs, then ≥ baseline N (recorded at T002) pass, 0 fail.
- **A002 (FR003, US001):** Given one online visit, when network set offline and page reloaded, then all tabs render and logging fluid/weight/meds/session works.
- **A003 (FR004):** Given deployed to GH Pages subpath, when opened, then no 404 in network log and SW registers with scope = repo path.
- **A004 (FR005):** Given widths 320/390/768/1024/1440, when each tab is screenshotted, then no horizontal overflow, bottom nav visible, tablet+ shows ≥2 columns on Today.
- **A005 (FR006):** Given intake > limit, when Today renders, then fluid card shows alert icon and text label.
- **A006 (FR007):** Given 390px width, then header subtitle fully visible (no ellipsis).
- **A007 (FR008):** Given a backup with approved labs, when imported, then every imported lab/limit has status `pending`, none `approved`, and approving requires server-verified clinician login (test asserts).
- **A008 (C005):** Given localStorage fixture from current version, when new version loads, then all records present and counts equal.
- **A009 (FR010):** Given sync script run, then `diff -r` of web files root vs www = empty.
- **A010 (FR012):** Given v(n) installed, when v(n+1) deployed, then after reload the new cache name active and old caches deleted, data intact; update toast shown only if a controller existed before.
- **A011 (FR009):** Given offline, when user searches foods, then an offline message (icon + text) shows and cached + custom foods can still be added to the diet log.
- **A012 (FR011):** Given the Pages workflow artifact, when listed, then it contains no `android/`, `node_modules/`, `*.apk`, `tools/`, `*.py`.
- **A013 (FR013):** Given desktop and tablet, when print preview at A4 and Letter, then no clipped content and all summary sections present.
- **A014 (US004):** Given 768 and 1024 widths, when Today, trends and labs are viewed, then body text ≥18px, values readable without zoom, warn states show icon + label.
- **A015 (NFR002):** Given Lighthouse mobile throttling (Moto G class, 4G), then first load ≤3 s, repeat ≤1 s, tap feedback <400 ms (DevTools INP).
- **A017 (FR014):** Given iOS Safari not in standalone mode, then the A2HS prompt shows once until dismissed and is hidden when standalone; given last backup older than the reminder interval, and the user is not signed in to sync, then the backup reminder appears and links to export; when signed in it never appears.
- **A016 (NFR006):** Given desktop Chrome, Edge, Firefox, Safari (latest 2), when smoke run, then all 7 screens render and logging works.

## 7. States
Empty (no data) · normal · warn/danger (icon + label) · offline banner · food search offline/error · pending approval · approval needs clinician sign-in · signed-out · signing-in · sync pending/ok/error/offline · consent required · import error · SW update available.

## 8. Permissions
Patient: all logging; own rows only in cloud. Clinician (share@spmcdvo.net, server-verified): approve/reject labs/limits; may view all patients in the sheet. Owners (share@spmcdvo.net; almanalaysay93@gmail.com = developer/co-owner, sees all rows, disclosed): sheet + script admin; no in-app approval for the developer. PIN removed (Rev 3).

## 9. Exclusions
Framework rewrite · build step · own server (Apps Script only) · Sheets API from client · paid Google tiers · remote telemetry (Sentry declined) · dark theme (theme C3) · side-rail nav · new clinical content · iOS native app (PWA only).

## 10. Resolved questions (user, 2026-11-08)
- **OQ-01** Min versions: Android 8+ (WebView/Chrome 90+), iOS/iPadOS 15+ Safari, last 2 desktop browser versions (Chrome, Edge, Firefox, Safari). → NFR006, T040, T041.
- **OQ-02** Repo `https://github.com/almanalaysay93-gif/skti-tubig.git`; Pages base path `/skti-tubig/`; deploy via GitHub Actions static upload of web files only (exclude android/, tools/, node_modules, *.apk, *.py; tests/ optional — excluded by default). → FR011, T030, T043.
- **OQ-03** Restored labs/limits are reset to `pending`; must be re-approved by clinician login (Rev 3). → FR008, A007, T022.
- **OQ-04** Translations + warning copy reviewed by the user after the build. → T045 (owner: user).
- **OQ-05** Android build verified by the user on own phone after build. → T046 (owner: user; Phase 2, deferred).
- **OQ-06** Tablet Today: status + fluid left column; reminders + trends right. → FR005, T019.
- **OQ-07** Palette = sky blue + polar white + hot pink per speckit-theme-design; 23fee0d teal/green superseded.
- **OQ-08** Main session commits pre-work on branch `feat/diet-theme`. → T001 done by main session.
- **OQ-09** iOS Safari (non-standalone): show "Add to Home Screen" prompt; periodic backup reminder for all users. → FR014, A017, T033.

## 11. F-SYNC-01 — Google Sign-In + two-way Sheet sync (Rev 3)
### Stories
- **US008 (P1)** Patient: I can use the app without ever signing in.
- **US009 (P1)** Patient: after Google sign-in + consent, all my data syncs to the clinic sheet and back; a new phone restores it.
- **US010 (P1)** Clinician: I can approve and edit a patient's labs/limits from the app; my changes flow to the patient and count only when I am signed in (server-verified).
- **US011 (P2)** Patient: I can read the privacy notice, withdraw consent, sign out and request "delete my cloud data".
- **US012 (P2)** Owner: I can deploy the Apps Script and OAuth client from written steps.

### Functional
| ID | Requirement | Story |
|---|---|---|
| FR015 | Optional Google sign-in: GIS on web / iOS PWA / Android browser (Phase 1); Capacitor native flow in Phase 2 (plan §14.6). Signed-out = all features local. | US008 |
| FR016 | Consent screen (clinic-approved, versioned text) before first sync; consent version + time stored locally and server-side; no sync without it. Withdrawal: sync stops immediately, withdrawal recorded in the `consent` tab, user is offered "delete my cloud data"; if declined, cloud rows are kept until deleteMe or the retention window — the notice says so. | US011 |
| FR017 | Sync ALL entities: profile, weights, intake, sessions, medications, med logs, checklists, HD BP, diet log, custom foods, labs, limits. | US009 |
| FR018 | Two-way: push local changes; pull remote changes since a server cursor; first sign-in on a new device restores everything. | US009 |
| FR019 | Durable outbox in localStorage; exponential backoff + jitter (1 s → cap 15 min); triggers: online event, app start, visibilitychange to visible, debounced after writes. | US009 |
| FR020 | Conflict: last-write-wins per record by `updatedAt` (ms epoch), tie-break `deviceId` lexical; deletes = tombstones (`deleted:true`) kept for the retention window (OQ-11). | US009 |
| FR021 | Each record gets `updatedAt`, `deviceId`, `deleted` (plus existing `id`); profile/settings synced as single records; versioned migration of existing data. | US009 |
| FR022 | Server scopes every read/write to the verified email; no cross-patient access. | US009 |
| FR023 | Labs/limits pushed by a non-clinician are stored `pending`; `approved`/`rejected` via the app accepted only from verified share@spmcdvo.net. Rows typed directly into the sheet (Restricted to the two owners) are TRUSTED (OQ-12): they flow to phones, and labs/limits edited there arrive `approved` with `approvedBy = "sheet edit"`. | US010 |
| FR024 | Approval UI only when signed in as share@spmcdvo.net AND online; otherwise message "Approval needs clinician sign-in (online)". No offline approval. | US010 |
| FR025 | PIN retired: migration deletes `skti.v1.clinician`; PIN UI removed; legacy PIN-approved labs/limits reset to `pending` and must be re-approved by share@spmcdvo.net (OQ-14). | US010 |
| FR026 | Sign out: stop sync, drop token from memory; local data kept unless the user also picks "remove from this device". | US011 |
| FR027 | "Delete my cloud data": authenticated request; server deletes all rows for that email; confirmation shown; local data untouched; sync turned off. | US011 |
| FR028 | Sync status (icon + text) in Settings and header: off / pending n / synced hh:mm / error. | US009 |
| FR029 | Apps Script: verify token, authorize, validate payload schema/size, rate limit per email, LockService around writes, JSON responses with error codes. | US009 |
| FR031 | Clinician edit: `op:'clinicianEdit'` (server-verified share@spmcdvo.net only, target patient email) writes lab/limit values + status; stored `approved` with `approvedBy` because the approver made it; audited. | US010 |
| FR030 | Repo `apps-script/Code.gs`, `apps-script/appsscript.json`, `apps-script/README.md` with exact deploy + OAuth setup steps. | US012 |

### Non-functional
| ID | Requirement |
|---|---|
| NFR007 | Free tier only (Apps Script consumer quotas; no paid GCP products). |
| NFR008 | Syncing a typical day's changes completes < 5 s on 4G; the UI is never blocked. |
| NFR009 | No secrets in client or repo (OAuth client ID is public by design; no client secret used). |
| NFR010 | RA 10173 items: consent, notice, retention, deletion, access limited to clinician + the two owners (developer access disclosed, OQ-10 resolved). |

### Acceptance
- **A018 (FR015, C015):** Given never signed in and offline, then every §2 feature works and no request goes to Google domains.
- **A019 (FR016):** Given signed in without consent, then no sync request is sent; after accept, a consent record exists locally and in the sheet.
- **A020 (FR017/FR018):** Given data on phone A, when the same user signs in on a fresh phone B, then all 12 entity types appear on B with equal counts.
- **A021 (FR019):** Given offline writes, when online, then the queue drains; on 5xx/429 the delay grows exponentially, capped at 15 min (fake-clock unit test).
- **A022 (FR020):** Given one record edited on two devices, then the later `updatedAt` wins on both; ties go by `deviceId`; a delete propagates as a tombstone (unit tests).
- **A023 (FR021):** Given a pre-Rev 3 fixture, when migrated, then every record has `updatedAt`, `deviceId`, `deleted:false`, and counts are equal.
- **A024 (FR022, C016):** Given patient A's valid token, when asking for B's rows, then 403 (pure-function test + manual).
- **A025 (FR023):** Given a patient pushes a lab with `status:'approved'`, then the server stores it `pending`.
- **A026 (FR024):** Given the clinician signed in online, approval succeeds; given offline or another email, the control is hidden or the server rejects it.
- **A027 (FR025):** Given existing PIN data, after migration `skti.v1.clinician` is absent, no PIN UI renders, and every previously approved lab/limit is `pending`.
- **A038 (FR023 sheet edit):** Given an owner types a lab row directly into the sheet, then the patient device receives it `approved` with `approvedBy="sheet edit"`; if the onEdit audit trigger works, the audit tab records the editor email when available.
- **A039 (retention):** Given a patient with no activity for 1 year and no deletion request, then the daily job deletes that patient's rows; tombstones are purged per the watermark design within that year.
- **A028 (FR027):** Given "delete my cloud data" confirmed, then the patient's rows are gone from all tabs and local data stays.
- **A029 (FR029):** Given an expired, wrong-`aud`, wrong-`iss` or unverified-email token, then 401 (node tests of `verifyClaims`).
- **A030 (FR029):** Given more than the per-email rate limit in 1 min, then 429 and the client backs off.
- **A031 (C017):** Sheet general access = Restricted; only the two owners have access (user screenshot).
- **A032 (FR015 Android, Phase 2 — deferred):** Given the Capacitor APK, sign-in completes with no `disallowed_useragent` error (user device test).

- **A033 (FR026):** Given signed in, when the user signs out, then no further sync requests are sent, the token is gone from memory, and local data remains.
- **A034 (FR028):** Given each state (off, pending n, synced hh:mm, error), then the header/Settings show icon + text for that state.
- **A035 (NFR008):** Given 4G throttling and a typical day's changes, then sync completes < 5 s and no main-thread long task > 50 ms occurs during it.
- **A036 (FR031):** Given the clinician edits a patient's limit, then the patient device receives it `approved` with `approvedBy=share@spmcdvo.net`; given any other email calls `clinicianEdit`, then 403.
- **A037 (FR016 withdrawal):** Given consent withdrawn, then sync stops, the `consent` tab records the withdrawal, and the delete-cloud-data offer is shown.

### Questions (F-SYNC-01) — all Phase 1 questions resolved; only OQ-13 (Phase 2) open
Fixed internal defaults (user: "should be automatic"; no user-facing settings): rate limit 60/min + 600/day per email, batch ≤ 200 records / ≤ 400 KB, backoff 1 s → cap 15 min with jitter, future-skew reject > +24 h, retention 1 year, backup-reminder interval 14 days.

- **OQ-10** RESOLVED 2026-11-08 [user]: almanalaysay93@gmail.com KEEPS access as developer/co-owner (acknowledged: can see all patient rows in the sheet). In-app approval rights remain share@spmcdvo.net only. Disclosed in the privacy notice (T061/T064).
- **OQ-11** RESOLVED 2026-11-08 [user]: retention = 1 year. Patient rows are deleted 1 year after last activity unless deletion is requested earlier (FR027); tombstones are purged per the watermark design (plan §14.3 step 8) within that year. → T055b, A039.
- **OQ-12** RESOLVED 2026-11-08 [user]: direct sheet edits are TRUSTED. Rows typed into the Restricted sheet (owners share@spmcdvo.net + almanalaysay93@gmail.com) are accepted and flow to phones; labs/limits arrive `approved`, `approvedBy="sheet edit"`. Accepted risk: the developer co-owner can effectively approve via the sheet. Audit via an installable onEdit trigger recording editor email when available (UNVERIFIED). → FR023, T056, A038.
- **OQ-13** (Phase 2, deferred) Android sign-in plugin: confirm after the spike (plan §14.6). Blocks: T058 only.
- **OQ-14** RESOLVED 2026-11-08 [user]: approvals are identified only by Google email; legacy PIN-approved labs/limits are reset to `pending` on migration and must be re-approved by share@spmcdvo.net. → FR025, T060b, A027.
- **OQ-15** RESOLVED 2026-11-08 [user]: the assistant drafts the consent/privacy text in en/tl/ceb (T061); the clinic approves it (T064).

## Change record
- Rev 1 (2026-11-08): initial.
- Rev 2 (2026-11-08): all OQs resolved by user answers (FR008 decided, FR014 added, A017); PR001 OQ-07 resolved; PR005 inventory completed; PR006/PR007 A011–A016; PR011 OQ blocks; nav = 6 tabs + header Settings.
- Rev 2.1 (2026-11-08): PR018 FR002/A001 use baseline N from T002 (no fixed count).
- Rev 3 (2026-11-08): F-SYNC-01 added: US008–US012, FR015–FR030, NFR007–NFR010, A018–A032, OQ-10 (resolved) + OQ-11–OQ-15; PIN replaced by server-verified login. Web-first: FR010/A032/OQ-13 moved to Phase 2; OQ-10 resolved (developer co-owner keeps access, disclosed).
- Rev 3.1 (2026-11-08): PR023 inventory approval wording; PR026 US010 + FR031 clinicianEdit + A036; PR028 A033–A035; PR033 withdrawal rule + A037.
- Rev 3.4 (2026-11-08): OQ-11/12/14/15 resolved; FR014 reminder only when not signed in; FR023 sheet-edit trust; FR025 legacy reset; A038, A039; fixed internal defaults.
