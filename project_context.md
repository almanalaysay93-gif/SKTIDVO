# project_context.md — SKTIDVO (skti-tubig)

Rev 3.4 · 2026-11-08 · Author: Agent 21 (Markdown Planner) · Mode: Buildme Markdown adapter; native Spec Kit not run
Feature IDs: F-RESTRUCTURE-01 (modular split + tablet layout + GH Pages offline hardening) · F-SYNC-01 (optional Google Sign-In + two-way Google Sheet sync, added Rev 3)

## 1. Identity (observed)
- App: SKTIDVO — fluid / weight / meds / dialysis / diet tracker for haemodialysis patients (`package.json` description).
- Users (confirmed): patients primarily; doctors/nurses view during checkups on the patient's device/browser.
- Locales: en / tl / ceb (`js/i18n.js`, 1049 lines).
- Android id `io.github.almanalaysay93gif.sktidvo`, webDir `www` (`capacitor.config.json`).

## 2. Stack (observed, evidence)
| Item | Value | Evidence |
|---|---|---|
| Language | Vanilla JS ES modules, no framework, no bundler | `index.html`, `js/*.js` |
| Storage | localStorage, namespace `skti.v1.`; clinician key (PIN salt+hash) excluded from backups | `js/store.js:4-22, 650+` |
| Offline | Service worker cache-first, `CACHE='sktidvo-v7'`, explicit SHELL list, per-file caching with `cache:'reload'` | `sw.js` |
| PWA | `start_url ./index.html`, `scope ./` (relative — GH Pages subpath safe); `"orientation": "portrait"` locks installed PWA (blocks tablet landscape) | `manifest.webmanifest:5-8` |
| Android orientation | No `screenOrientation` lock in AndroidManifest (only `configChanges=orientation…`) | `android/app/src/main/AndroidManifest.xml:13` |
| Android | Capacitor ^7.4.4 (`@capacitor/android`, `core`, `cli`); `npm run sync` = `cap sync android` | `package.json` |
| CI | `.github/workflows/build-apk.yml`: npm install → cap sync → setup-java → android-actions/setup-android@v3 → gradlew assembleDebug → release | workflow |
| Tests | Custom harness `tests/harness.js` + `tests/index.html`; suites calendar/food/limits/math; node runner `run-all.mjs` lives in session scratchpad, NOT in repo; coordinator reports 142 passing, `test(` grep in tests/*.test.js = 143 — baseline count to be recorded by T002, not hard-coded | `tests/` |
| Tools | `tools/lab_ocr.py`, `tools/test_lab_ocr.py` (Python) | `tools/` |

## 3. Code size (wc -l)
app.js 1720 · i18n.js 1049 · store.js 914 · diet-view.js 900 · styles.css 862 · food.js 242 · calendar.js 238 · limits.js 164 · sw.js 77.

## 4. Current architecture (observed)
- `js/app.js` holds everything UI: `$`/`$$` 14-15, `esc` 18, `icon` 21, `nf` 24, `localeTag` 26, fmt helpers (28-31), state `view`/`calCursor` 37-38, `toast` 44, `openSheet/closeSheet` 68-115, `readNumber` 128, sheets (weight 149, customDrink 205, hdBp 232, session 313, calibrate 372, medication 958), Today cards/charts 415-760, `viewToday` 769, `viewFluid` 802, `viewWeight` 866, `viewMeds` 907, `viewSession` 1035, `viewSettings` 1097, `printSummary` 1304, download/backup/calendar export 1345-1424, `importBackup` 1424, install/persist UI 1454-1494, `go` 1494, `render` 1505, `onClick` 1524 (single delegated click handler), `applyTheme` 1640, `wireNetwork` 1646, `boot` 1663.
- `js/store.js`: data layer, `subscribe()` pub-sub, ~60 exports (weights, intake, sessions, meds, checklist, HD BP, custom foods, diet log, food cache, labs pending/approved, limits, clinician PIN).
- Inline `style=` attributes: 55 in app.js, 17 in diet-view.js, 1 in index.html (relevant to CSP).
- Nav: 6 bottom tabs (today, fluid, weight, meds, diet, session; index.html:173-190); Settings via header gear button (index.html:158).
- `js/diet-view.js` Diet tab; `js/food.js` USDA FDC + Open Food Facts (network `fetch` food.js:83); `js/limits.js` lab→limit math; `js/calendar.js` ICS + Google Calendar URL.
- CSS: single `css/styles.css`; one breakpoint `@media (min-width: 900px)` (line 146); shell capped by `--shell-max`; bottom nav fixed, `max-width: var(--shell-max)` (line 726).
- `www/` = hand-maintained mirror of root web files (no copy script).

## 5. Design system
Approved theme: `speckit-theme-design/` (constitution, spec, plan, tasks, `contrast.mjs`) — referenced, not duplicated. Binding: body ≥7:1, 18px body, 56px targets, light-only, reduced-motion, warn/danger always icon+label.
Resolved 2026-11-08 [user]: approved palette = sky blue + polar white + hot pink per speckit-theme-design (css/styles.css:30-53); 23fee0d teal/green superseded.

## 6. Network surface (observed)
Optional online only: USDA FDC search, Open Food Facts barcode (food.js:18-20), Google Calendar link (calendar.js:237), Google Fonts opportunistic (sw.js). No backend, auth server or telemetry.

## 7. Working tree (git status 2026-11-08)
Uncommitted: diet feature (diet-view/food/limits + tests), icon PNGs, `app-debug.apk`, icon scripts, docs/, tools/, speckit-theme-design/. Committed on `feat/diet-theme` as d60a336 (OQ-08 resolved).
Hosting target: https://github.com/almanalaysay93-gif/skti-tubig.git → GitHub Pages `/skti-tubig/`.

## 8. Absent
No PROJECT_MEMORY.md, AGENTS.md, lint config, in-repo node test runner, GH Pages workflow, screenshot tooling, www sync script.

## 9. Pending items (user-stated)
Today Fluid card over-limit lacks alert icon · header subtitle truncates at 390px · backup restore resets labs/limits to pending (OQ-03 resolved → T022) · tl/ceb + warning copy need native-speaker/clinic review · `npm run sync` unverified locally.

## 10. F-SYNC-01 context (Rev 3, user-stated 2026-11-08 — not built)
**Phase scope (user decision 2026-11-08): WEB APP FIRST.** Phase 1 = web app/PWA on GitHub Pages (phone browser, tablet, desktop; iOS/Android via browser + Add to Home Screen). Phase 2 = Capacitor Android (deferred, non-blocking). `www/` stays untouched in Phase 1 and is regenerated from root in Phase 2 (T029).
- Target sheet: the clinic Google Sheet (ID held by the owners and in Script Properties only; not stored in repo docs) (not opened by planner; current structure unknown → plan §14 defines tabs).
- Sheet + Apps Script owners: share@spmcdvo.net, almanalaysay93@gmail.com (developer/co-owner, keeps access, can see all rows — user decision, disclosed in privacy notice). Clinician/approval role: share@spmcdvo.net only.
- OAuth client ID: user will create (none in repo).
- Observed absences: no `apps-script/`, no Google libraries, no auth code, no `updatedAt`/device id/tombstone fields on store.js records, no sync code.
- Existing clinician PIN (`KEYS.clinician` salt+hash, store.js:650+) to be retired (user decision 7).

## Change record
- Rev 1 (2026-11-08): initial.
- Rev 2 (2026-11-08): OQ-02/08 facts; PR001 palette resolved; PR010 test-count source; PR014 orientation fact; nav + inline-style facts added.
- Rev 2.1 (2026-11-08): PR017 backup policy + pre-work commit d60a336.
- Rev 3 (2026-11-08): F-SYNC-01 scope facts (user-stated) and absences. Web-first phasing; owner access decision.
- Rev 3.1 (2026-11-08): A4 sheet ID redacted.
- Rev 3.4 (2026-11-08): user answers OQ-11/12/14/15 recorded in spec §11; facts unchanged.
