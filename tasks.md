# tasks.md — F-RESTRUCTURE-01 + F-SYNC-01

Rev 3.4 · 2026-11-08 · Mode: Buildme Markdown adapter; native Spec Kit not run
Owners: **OI** = Opus implementer · **HB** = Haiku builder · **OR** = Opus reviewer/test · **USER** = user (and clinic where stated). Sequential unless [P]. Blocked until user approval + Agent 22 PASS (C013).
"TEST" = `node tests/run-all.mjs` → pass count ≥ baseline N recorded at T002 (not hard-coded), 0 fail.
"7 screens" = 6 bottom tabs (Today, Fluid, Weight, Meds, Diet, Dialysis) + Settings (header gear).
**Scope (user decision 2026-11-08): WEB APP FIRST.** Phase 1 = web app/PWA on GitHub Pages (phone browser, tablet, desktop; iOS/Android via browser + Add to Home Screen). Android/Capacitor tasks live in Phase 2 (deferred) and do not block Phase 1. `www/` is left untouched during Phase 1 (stale on purpose) and will be regenerated from root by the sync script in Phase 2.
Advisory: no deploy between T014 and T027 (stale SW SHELL).

## Phase 1 — Web (F-RESTRUCTURE-01)
| ID | Task | Owner | Deps | Links | Files | Verification |
|---|---|---|---|---|---|---|
| T001 | Commit pre-work on branch `feat/diet-theme`; record baseline SHA | main session | — | C014, OQ-08 | git only | DONE — d60a336 on feat/diet-theme |
| T002 | Commit test runner `tests/run-all.mjs`; record baseline pass count N | HB | T001 | FR002, C012 | tests/run-all.mjs | runner output with N, 0 fail  · DONE a879021 — baseline N=142/142 |
| T003 | Baseline screenshots 320/390/768/1024/1440 × 7 screens | OR | T002 | A004 | docs/screens/baseline/ | 35 PNGs  · DONE 59291b4 — 35 PNGs docs/screens/baseline (baseline overflow 320 Meds/Diet, 390 Diet) |
| T004 | localStorage + backup fixture from current version | OR | T002 | C005, A008 | tests/fixtures/ | fixture loads in current app  · DONE 59291b4 — tests/fixtures/*-v1.json |
| T005 | Move `$`,`$$`,`esc`,`nf`,`localeTag`,`fmtDate`,`fmtTime`,`relDay` → ui/format.js; `icon` → ui/icons.js; `toast` → ui/toast.js | HB | T002 | FR001, plan §3.1 | js/ui/*, js/app.js | TEST; no console error  · DONE |
| T006 | Move sheet primitives → ui/sheet.js | HB | T005 | FR001 | js/ui/sheet.js | TEST; open/close each sheet  · DONE |
| T007 | Move charts → ui/charts.js | HB | T006 | FR001 | js/ui/charts.js | TEST; trends render  · DONE |
| T008 | Move sheets/* (weight, calibrate, drink, hdbp, session, medication) | HB | T007 | FR001 | js/sheets/* | TEST; log one of each  · DONE |
| T009 | Move Today symbols incl. `emptyStatus`,`nextHdLabel`,`calCursor`,`calendarCard` → views/today.js | OI | T008 | FR001 | js/views/today.js | TEST; matches T003 at 390  · DONE |
| T010 | Move fluid (`DRINKS`,`FOODS`,`addDrink`,`tiles`,`drinkGrid`), weight, meds, session (`hdBpCard`) views | HB | T009 | FR001 | js/views/* | TEST; each tab renders  · DONE |
| T011 | Move views/settings.js | OI | T010 | FR001 | js/views/settings.js | TEST; language, schedule, USDA key, wipe-all confirm  · DONE |
| T012 | Move diet-view.js → views/diet.js + re-export shim | HB | T011 | FR001 | js/views/diet.js, js/diet-view.js | TEST; diet, CSV import, lab JSON import, manual lab  · DONE |
| T013 | Move features/backup (`downloadFile`,`exportBackup`,`importBackup`), cal-export (`calFile`,`cal*`), print, install | HB | T012 | FR001 | js/features/* | TEST; export/import roundtrip, ICS, print preview  · DONE |
| T014 | Move `view`,`VIEWS`,`go`,`render` → router.js; `onClick` → events.js; boot/SW register → main.js; delete app.js; index.html → main.js | OI | T013 | FR001, C002 | js/main.js, router.js, events.js, index.html | TEST; full click-through  · DONE 0565ec6 — click-through parity vs baseline |
| T015 | Symbol + module-graph check script (each baseline app.js symbol in exactly one module, no cycles, imports resolve, ≤400 lines) | HB | T014 | NFR001, plan §3.1 | scripts/check-modules.mjs | exit 0  · DONE 4bf099b — PASS (store.js, views/diet.js >400 known) |
| T016 | Review parity + `esc` audit of innerHTML | OR | T015 | C001, plan §7 | — | review notes; fixes by OI  · DONE 4bf099b — ids esc()d |
| T017 | Split CSS into tokens/base/layout/components/views/print (link tags) | HB | T016 | FR005 | css/*, index.html | no visual diff vs T003 at 390  · DONE 600fb4e — no visual diff 5×7 |
| T018 | manifest `orientation` portrait → any | HB | T017 | US003 | manifest.webmanifest | installed PWA rotates on tablet  · DONE 824b156 |
| T019 | Breakpoints 768/1024; grid (Today: status+fluid left, reminders+trends right); bottom nav all sizes | OI | T018 | FR005, C009, OQ-06 | css/layout.css, views.css | A004  · DONE 8a89cda — 0 overflow 5×7 |
| T020 | Header subtitle fix at 390 | OI | T019 | FR007 | css/* | A006  · DONE 8a89cda |
| T021 | Fluid card over-limit icon + label | OI | T020 | FR006, C007 | js/views/today.js, css | A005 + unit test  · DONE 8af176d — today.test.js |
| T022 | Backup import resets all labs/limits to `pending` (approval by clinician login after F-SYNC-01; PIN until T060) | OI | T021 | FR008, US005, OQ-03 | js/features/backup.js, js/store.js | A007 in tests/backup.test.js  · DONE 1fde8e2 — backup.test.js (A007 browser-verified) |
| T023 | Backup import validation (types, size cap) | OI | T022 | plan §7 | js/features/backup.js | tests/backup.test.js  · DONE 1fde8e2 |
| T024 | Food search offline message; cached/custom foods usable | OI | T023 | FR009 | js/views/diet.js | A011  · DONE 192be49 — offline icon+text, custom foods searchable |
| T025 | Print stylesheet tablet/desktop | HB | T024 | FR013 | css/print.css | A013 (A4 + Letter)  · DONE 833b6fc — A4/Letter PDFs, no clipping |
| T026 | CSP meta (styles `'unsafe-inline'`, `script-src 'self'`) — Google origins added later in T062 | OI | T025 | plan §7 | index.html | no CSP console errors; no visual diff vs T003 at 390; food search works online  · DONE bc3b507 — 0 CSP errors; online food search fails identically on baseline (USDA 400 / OFF CORS) |
| T027 | sw.js: module SHELL, `sktidvo-v8`, food API network-only, guarded update toast; SHELL test | OI | T026 | FR003, FR012, plan §6 | sw.js, js/main.js, tests/sw.test.js | test covers `./`, manifest, assets, js/**, css/*  · DONE 572a9ab — 162/162; offline reload OK |
| T028 | Relative-path audit | HB | T027 | FR004, C006 | — | grep root-absolute URLs = 0  · DONE — root-absolute URLs = 0 |
| T030 | `.github/workflows/pages.yml` (upload-pages-artifact, web files only) + `.nojekyll` | HB | T028 | FR011, OQ-02 | .github/workflows/pages.yml | A012 artifact listing  · DONE 4650a79 — workflow file only, not pushed/deployed; artifact = index.html, manifest, sw.js, .nojekyll, css/, js/, assets/ |
| T031 | Data-compat test with T004 fixture (rerun at T032) | OR | T014 | C005, A008 | tests/ | counts equal |
| T032 | Feature parity click-through (spec §2) + rerun T031 | OR | T031, T030 | C001 | — | checklist all pass |
| T033 | iOS A2HS prompt + periodic backup reminder (shown only when not signed in to sync; T059 wires the signed-in check) (`a2hsDismissed`, `lastBackupAt`) + i18n strings | OI | T032 | FR014, OQ-09 | js/features/install.js, backup.js, views/today.js, i18n.js, js/store.js | A017 + unit test  · IMPL d465617 — tests/reminders.test.js; A017 device check pending (T032/T041 OR) |
| T034 | i18n completeness check en/tl/ceb | HB | T033 | spec §2 | js/i18n.js, scripts/ | missing keys = 0  · DONE fd6bb51 — scripts/check-i18n.mjs: missing keys = 0 |
| T035 | Offline test phone browser + desktop | OR | T034 | FR003, C004 | — | A002, A011 |
| T036 | Viewport screenshots 5 widths × 7 screens vs baseline | OR | T035 | A004, A014, C009 | docs/screens/after/ | no overflow; A014 |
| T037 | A11y + theme + UX-laws audit (axe, keyboard, contrast.mjs, reduced motion) | OR | T036 | C008, C010 | — | 0 critical/serious |
| T038 | Clinical copy diff review | OR | T037 | C007 | — | review note |
| T039 | Performance run (Lighthouse mobile throttled, INP) | OR | T038 | NFR002 | — | A015 |
| T040 | Desktop browser smoke Chrome/Edge/Firefox/Safari (last 2) + Android Chrome browser | OR | T039 | NFR006 | — | A016 |
| T041 | iOS 15+ Safari PWA smoke (A2HS, offline) | OR | T040 | NFR006, FR014 | — | A017, A002 on iOS |
| T043 | Deploy + smoke on `/skti-tubig/` incl. SW update test | OR | T041 | FR004, FR012 | — | A003, A010 |
| T044 | Restructure review + anti-slop sign-off; PROJECT_MEMORY.md entry | OR | T043 | C012 | PROJECT_MEMORY.md | all Phase 1 restructure tasks have evidence |
| T045 | Translation + warning copy review (tl/ceb/en) | USER | T044 | C007, OQ-04 | — | user sign-off; fixes → OI |

## Phase 1 — Web (F-SYNC-01, Rev 3.1)
Graph: main path T047→…→T053→T053b→T054→T057→T059→T060→T061→T062→T065 contains no OQ-blocked task. OQ tails (T055b OQ-11, T056 OQ-12, T060b OQ-14, T064 OQ-11/15) are parallel branches that only T066/T069 wait on.

| ID | Task | Owner | Deps | Links | Files | Verification |
|---|---|---|---|---|---|---|
| T047 | Sync meta helpers (pure): `stamp`, deviceId gen | OI | T044 | FR021, plan §14.2 | js/sync/meta.js, tests/ | unit tests  · DONE 6cc748d — tests/sync-queue.test.js (sync-meta) |
| T048 | store.js migration v2: `updatedAt`/`deviceId`/`deleted` (+ `syncedAt` left absent = never-synced); `store.importAll` (js/store.js) clears `syncedAt` on all restored records (PR038, A5); legacy approved labs/limits → `pending` (OQ-14), tombstone deletes, getters hide deleted, new keys | OI | T047 | FR021, C005 | js/store.js, tests/migrate-v2.test.js | A023; TEST; T031 fixture still passes; "restored backup records survive resync" (rerun in T050)  · DONE 6cc748d — tests/migrate-v2.test.js; backup fixture tests pass; restored-records-survive-resync in sync-merge |
| T049 | Outbox queue + backoff (pure, fake clock) | OI | T048 | FR019 | js/sync/queue.js, tests/sync-queue.test.js | A021  · DONE 6cc748d — tests/sync-queue.test.js |
| T050 | LWW merge + tombstones + stale-device rule (`cursor_too_old` → snapshot; drop only records with `syncedAt` missing from snapshot; re-push all records without `syncedAt` flagged `neverSynced`) (pure) | OI | T049 | FR020, C005, plan §14.3 step 8 | js/sync/merge.js, tests/sync-merge.test.js | A022 incl. "stale device after purge does not resurrect", "never-synced old create survives resync", "previously synced deleted record does not resurrect", "dirty synced record edited offline is re-pushed and resolved by LWW"  · DONE 6cc748d — tests/sync-merge.test.js (all 4 named cases + restore case) |
| T051 | Apps Script pure lib: `verifyClaims`, `authorize` (incl. `clinicianEdit`, `approve`), `validatePayload` (incl. future-`updatedAt` > +24 h reject), `lww`, `forcePendingLabs`, `rateLimitDecision`, `purgeWatermarkDecision` (watermark applied only to pushes not flagged `neverSynced`) + node tests via vm shim | OI | T050 | FR022, FR023, FR029, FR031, C016 | apps-script/lib.gs, tests/apps-script.test.js | A024, A025, A029, A030, A036 (unit); server-side "never-synced old create survives resync" + "previously synced deleted record does not resurrect"  · DONE 51184e8 — tests/apps-script.test.js incl. both server-side resync cases |
| T052 | Apps Script `Code.gs`: doPost routing (push/pull/approve/clinicianEdit/patients/consent/withdraw/deleteMe), tokeninfo fetch + cache, LockService (writes + rate counter), sheet tabs, `setup()`, audit, purge job with `RETENTION_DAYS` parameter + `purgedBefore` watermark; verify current free quotas | OI | T051 | FR029, NFR007, plan §14.7 | apps-script/Code.gs, appsscript.json | code review; quota page cited in README  · DONE c40469f — code review only (no live deploy); quotas cited in README |
| T053 | `apps-script/README.md` exact deploy + OAuth steps (plan §14.9, web origin only) | HB | T052 | FR030, US012 | apps-script/README.md | steps match plan §14.9  · DONE 22d2d27 — apps-script/README.md |
| T053b | USER setup: create OAuth Web client (origins `https://almanalaysay93-gif.github.io`, `http://localhost`), deploy Apps Script, Script Properties (sheet ID, client ID, clinician list), sheet sharing Restricted to the two owners | USER | T053 | C017, US012 | — | A031 screenshot; `/exec` URL + client ID handed to OI |
| T054 | Client transport (text/plain POST, error codes, 401/429/`cursor_too_old` handling) | OI | T053, T053b | FR018, FR019 | js/sync/api.js, js/sync/config.js | unit test with stub fetch; live ping to `/exec` |
| T055 | Delete-my-cloud-data op + client flow (core, no OQ) | OI | T054 | FR027, C018 | apps-script/*, js/sync/*, views/settings.js | A028 |
| T055b | Retention: 1-year inactivity deletion + tombstone purge as fixed constants; notice text states 1 year | OI | T055 | OQ-11 (resolved) | apps-script/lib.gs, Code.gs, README.md | A039 unit + purge test |
| T056 | Trusted sheet edits: installable onEdit trigger (stamp `updatedAt`/`serverSeq`/`approvedBy="sheet edit"`, audit editor email if available — UNVERIFIED) + daily sweep fallback | OI | T052 | FR023, OQ-12 (resolved), Amendment A2 | apps-script/* | A038; result of editor-email check recorded  · IMPL c40469f — onSheetEdit + daily sweep; editor-email check UNVERIFIED until T053b deploy |
| T057 | GIS web sign-in, popup mode only (on-demand script load, memory-only token, silent re-prompt); test iOS 15+ Safari + standalone | OI | T054 | FR015, plan §14.5 | js/auth/gis.js | A018 (no Google requests signed-out); sign-in on web + iOS |
| T059 | Sync engine + status UI (header + Settings: sign in/out, Sync now, status); async, chunked merge | OI | T057 | FR018, FR026, FR028, NFR008 | js/sync/engine.js, views/settings.js, header | A020, A033, A034 |
| T060 | Retire PIN (migration deletes `skti.v1.clinician`, remove PIN UI); clinician UI: patient list, approve, edit labs/limits via `clinicianEdit` (online + share@spmcdvo.net only) | OI | T059 | FR024, FR025, FR031, C007, C016 | js/store.js, views/*, js/sync/* | A026, A027, A036 |
| T060b | Verify legacy PIN-approved labs/limits reset to `pending` after migration (done in T048) and re-approval by share@spmcdvo.net works | OR | T060 | OQ-14 (resolved), FR025 | tests/ | A027 |
| T061 | Consent screen + gate + withdraw flow (stop sync, record withdrawal server-side, offer "delete my cloud data") + privacy notice DRAFT written by the assistant in en/tl/ceb (OQ-15) (purpose, data list, recipients incl. disclosed developer co-owner access almanalaysay93@gmail.com, retention 1 year, rights, deletion, contact; versioned) | OI | T060 | FR016, C018, NFR010, OQ-10 | views/consent.js, i18n.js | A019, A037; draft sent to T064 |
| T062 | CSP + SW update for Google `/gsi/` paths (plan §14.8); network-only for Google domains | OI | T061 | C017, plan §14.8 | index.html, sw.js | no CSP errors during sign-in + sync; SW test asserts no Google caching |
| T064 | USER/clinic: approve the assistant-drafted consent + privacy text (en/tl/ceb, incl. developer access + sheet-edit approval disclosure, 1-year retention) | USER | T061 | C018, NFR010, OQ-15 (resolved) | — | signed-off text version |
| T065 | Security review of sync (token handling, email-from-token only, payload caps, rate limit, secrets, accepted risks A1/A2) | OR | T062 | C016, C017 | — | findings fixed by OI |
| T066 | E2E web: A018–A021, A024, A026, A028, A030, A033–A037; NFR008 run (A035) | OR | T065, T055b, T056, T060b, T064 | FR015–FR031, NFR008 | — | evidence log |
| T067 | i18n for all sync/consent strings en/tl/ceb + completeness rerun | HB | T066 | FR016 | js/i18n.js | missing keys = 0 |
| T068 | Security tests: forged/expired/wrong-aud token against live script, cross-patient access, non-clinician `clinicianEdit`/`approve`, secret grep, sheet sharing re-check | OR | T067 | C016, C017, NFR009 | — | 401/403 observed; grep clean; A031 |
| T069 | Sync deploy to Pages + final review + anti-slop sign-off; PROJECT_MEMORY.md update | OR | T068 | C012 | PROJECT_MEMORY.md | all Phase 1 tasks evidence |

Note: former T063 (user setup) moved to T053b so every dependency points to an earlier task.

## Phase 2 — Android (DEFERRED; does not block Phase 1)
| ID | Task | Owner | Deps | Links | Files | Verification |
|---|---|---|---|---|---|---|
| T029 | `scripts/sync-www.mjs` + parity check; regenerate `www/` from root | HB | T069 | FR010, C011 | scripts/, www/ | A009 |
| T042 | Android: `npm run sync`, CI APK build green | OI | T029 | NFR006 | android/ | CI log green |
| T058 | Android sign-in spike: native Capacitor plugin (Credential Manager) returning ID token with Web client `aud`; Android OAuth client (package + SHA-1); fallback Custom Tabs; update Apps Script allowed `aud` | OI | T042 | FR015, OQ-13, plan §14.6 | js/auth/native.js, android/, apps-script/ | A032 on device |
| T046 | Android build + sign-in + sync verification on user's phone (Android 8+) | USER | T058 | OQ-05, NFR006, A032 | — | user confirms launch, offline, sign-in, sync |

## Coverage map (principle → req → plan → task → check)
C001→FR001/FR002→§3→T005–T016,T032→A001 · C002→FR001→§2/§3→T014,T015 · C003→NFR005→§7/§14.8→T026,T062→grep + consent gate · C004→FR003/FR009→§6→T024,T027,T035→A002/A011 · C005→§4/§14.2→T004,T031,T032,T048→A008/A023 · C006→FR004→T028,T043→A003 · C007→FR006/FR008/FR024→T021,T022,T038,T045,T060→A005/A007/A026 · C008/C010→NFR003→T037 · C009→FR005/FR007→T018–T020,T036→A004/A006/A014 · C011→FR010→T029 (Phase 2)→A009 · C012→evidence column · C013→approval before T002 · C014→T001 · C015→FR015→T057,T066→A018 · C016→FR022/FR029→§14.4/§14.7→T051,T060,T065,T068→A024/A029 · C017→§14.8→T053b,T062,T068→A031 · C018→FR016/FR027→T055,T061,T064→A019/A028/A037 · NFR002→T039→A015 · NFR006→T040,T041 (web); T042,T046 (Phase 2)→A016/A017 · NFR007→T052 · FR011→T030→A012 · FR013→T025→A013 · FR014→T033,T041→A017 · FR017–FR021→T047–T050,T059→A020–A023 · FR022→T051,T068→A024 · FR023→T051,T056→A025 · FR024/FR025→T060→A026/A027 · FR026→T059→A033 · FR027→T055→A028 · FR028→T059→A034 · FR029→T051,T052→A029/A030 · FR030→T053 · FR031→T051,T060,T068→A036 · NFR008→T059,T066→A035 · NFR009→T065,T068 · NFR010→T061,T064→A037.

## Blocked by open questions
Phase 1: none (OQ-11/12/14/15 resolved 2026-11-08). Phase 2: OQ-13 → T058.

## Change record
- Rev 1 (2026-11-08): initial.
- Rev 2 (2026-11-08): user OQ answers folded; PR001–PR016 repairs.
- Rev 2.1 (2026-11-08): PR022 T001 SHA; PR019 store.js in T022/T033; no-deploy advisory.
- Rev 3 (2026-11-08): F-SYNC-01 tasks T047–T069 (T058 → Phase 2); web-first: T029, T042, T046, T058 moved to Phase 2 (deferred); T030 dep → T028; T043 dep → T041; `www/` untouched in Phase 1; OQ-10 resolved (developer access disclosed in T061).
- Rev 3.1 (2026-11-08): PR024 T054 deps T053b (former T063 moved to T053b so deps stay earlier); PR027 OQ tails T055b/T056/T060b/T064 parallel, only T066 waits; PR025 stale-device rule in T050/T051/T052; PR026 clinicianEdit in T051/T052/T060/T068; PR028/PR035 A033–A037 + full coverage map; PR033 withdraw flow T061; PR034 popup-only T057, /gsi/ CSP T062.
- Rev 3.2 (2026-11-08): PR036 T048 `syncedAt` in migration; T050/T051 never-synced rule + two tests.
- Rev 3.3 (2026-11-08): PR037 T050 dirty-record test; PR038 restore clears `syncedAt` + test, placed in T048 (introduces `syncedAt`; no forward reference from T022).
- Rev 3.4 (2026-11-08): OQ answers: T055b 1-year retention, T056 trusted sheet edits + onEdit audit, T060b verify legacy reset, T061/T064 assistant draft + clinic approval; T048 legacy reset + syncedAt clearing in store.importAll (A5); T033 reminder only when signed out; no OQ blocks in Phase 1.
