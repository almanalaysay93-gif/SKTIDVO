# constitution.md — SKTIDVO

Rev 3.4 · 2026-11-08 · Mode: Buildme Markdown adapter; native Spec Kit not run
Authority: constitution > spec.md > plan.md > tasks.md; project_context.md = facts. Theme rules: `speckit-theme-design/constitution.md`, incorporated by reference (C010).

| ID | Principle | Enforcement check |
|---|---|---|
| C001 | **Same features.** Restructure changes code layout, not behaviour. All features in spec §2 remain, except changes authorized by Amendment A1 (PIN approval → server-verified login approval). | Parity checklist (T032) + all tests green before/after. |
| C002 | **No framework, no build step.** Native ES modules served as-is; no bundler/transpiler/runtime npm dep for the web app. | `package.json` deps = Capacitor + Capacitor plugins only (Rev 3: native sign-in plugin allowed, §14.6); index loads `js/main.js` type=module. |
| C003 | **No telemetry; cloud only by consent.** No remote telemetry, analytics or error monitoring (Sentry declined). Patient data leaves the device only via user-initiated food lookup / calendar link, or via F-SYNC-01 after Google sign-in AND recorded consent, only to the clinic Apps Script endpoint. | grep `fetch(`/`sendBeacon`/3rd-party = only food.js, calendar.js, js/sync/*; consent gate test (T061). |
| C004 | **Offline-first.** After first visit all features except online food search work with network off. | T035 offline run. |
| C005 | **Storage compatibility.** `skti.v1.` keys and backup JSON stay readable; F-SYNC-01 may add fields (`updatedAt`, `deviceId`, `deleted`) only via a versioned, tested, additive migration; no data loss. | Pre-restructure backup + localStorage fixture renders identically (T004, T031, T032). |
| C006 | **Relative paths only.** Works under GH Pages subpath and Capacitor root. | grep for root-absolute `"/` / `'/` URLs = none. |
| C007 | **Clinical safety.** No new limits, thresholds, advice or clinical copy without clinic review. Warnings = icon + text. Lab/limit approval only by signed-in share@spmcdvo.net, verified server-side (Rev 3; PIN retired). | Copy diff review T038, user review T045; server approve/edit tests A025/A026/A036; T068. |
| C008 | **Accessibility.** WCAG 2.2 AA min + theme 7:1 body, 56px targets, keyboard/screen-reader operable, reduced motion. | T037 audit, `contrast.mjs`. |
| C009 | **Responsive, one nav.** Bottom tab nav on phone, tablet, desktop; 320–1440+ no horizontal scroll. | T036 screenshots. |
| C010 | **Approved theme.** `speckit-theme-design/constitution.md` rules 1–8 bind. | T037. |
| C011 | **www parity (Phase 2).** `www/` untouched during Phase 1 (web-first); regenerated from root and kept in parity from Phase 2 on. | Sync script + diff (T029, Phase 2). |
| C012 | **Evidence before DONE.** Task DONE only with command output; test count never decreases. | tasks.md evidence. |
| C013 | **Approval gates.** User approves planning set + Agent 22 PASS before code. | Approval record. |
| C014 | **Preserve uncommitted work.** Never overwrite in-progress diet/icon/docs work. | T001 git check. |

Note on C010 / theme rule 8 ("no commits"): that rule scoped the theme-design work only. This feature commits per extraction (plan §11) under C014/T001 with user authorization (OQ-08 resolved: branch `feat/diet-theme`).

**Phase scope (user decision 2026-11-08): WEB APP FIRST.** Phase 1 = web app/PWA on GitHub Pages (phone browser, tablet, desktop; iOS/Android via browser + Add to Home Screen). Phase 2 = Capacitor Android (deferred, non-blocking). `www/` stays untouched in Phase 1 and is regenerated from root in Phase 2 (T029).

## Amendments
Dated version bump; explicit user authorization; reconcile spec/plan/tasks; Agent 22 re-review.

## Rev 3 principles (F-SYNC-01)
| ID | Principle | Enforcement check |
|---|---|---|
| C015 | **Login optional, offline-first.** Fully usable signed-out and offline; local store primary; sync never blocks UI. | A018 signed-out offline run (T066). |
| C016 | **Server is the authority for identity and role.** Apps Script verifies the ID token (Google-validated signature, `aud`, `iss`, `exp`, `email_verified`), scopes rows to the verified email, and grants the clinician role only to share@spmcdvo.net. Client checks are UX only. | Node tests of pure verify/authorize functions (T051); forged-token manual test (T068). |
| C017 | **Least access.** Patients never get sheet access; sheet never "anyone with link"; app never calls the Sheets API; no secrets in client or repo. | T053b user sharing check (A031); T068 secret grep. |
| C018 | **Privacy law (RA 10173, PH Data Privacy Act).** Consent before first sync, privacy notice, retention statement, "delete my cloud data" flow; clinic approves wording. | T061, T064 (user/clinic sign-off). |

## Amendment A2 (2026-11-08, user-authorized)
C016 exception: rows typed directly into the Restricted sheet by an owner are trusted, and labs/limits edited there count as approved (`approvedBy="sheet edit"`), even though the script cannot verify the editor. Accepted risk: the developer co-owner can effectively approve via the sheet. In-app approval stays server-verified share@spmcdvo.net only.

## Amendment A1 (2026-11-08, user-authorized via coordinator)
Reason: new scope F-SYNC-01. Changed C003 (cloud by consent), C005 (additive migration allowed), C007 (PIN → server-verified Google login). Added C015–C018. C002 check widened to Capacitor plugins. Owner decision: almanalaysay93@gmail.com keeps sheet access as developer/co-owner (disclosed); approval stays share@spmcdvo.net only. All other decisions kept.

## Change record
- Rev 1 (2026-11-08): initial.
- Rev 2 (2026-11-08): PR008 C005 check tasks fixed; PR016 theme rule 8 scoping note.
- Rev 3 (2026-11-08): Amendment A1 (user-authorized 2026-11-08): C003, C005, C007 amended; C015–C018 added for F-SYNC-01. Web-first phasing: C011 deferred to Phase 2.
- Rev 3.1 (2026-11-08): PR023 C001 exception for Amendment A1; PR029 C007 check updated; T063 → T053b.
- Rev 3.4 (2026-11-08): Amendment A2: C016 exception for trusted direct sheet edits (OQ-12), risk recorded.
