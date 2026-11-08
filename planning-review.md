# Independent planning review

Overall: **PASS — READY** (round 7, Rev 3.4, all five files). User approval is recorded in ORCHESTRATOR.md:3-4 (C013). No Phase 1 open questions; OQ-13 is Phase 2 only. 0 block · 0 major · 2 minor (PR039, PR040; non-blocking, fix in T033/T060).

Round 7 baseline:
- project_context.md 93d3a8d62db23c9f26823ba1aca588ffe0d785157625991d63a3596aab53634e
- constitution.md 226869dcdc0488f09c7b4a6dc4ac039e17e90ce46fff14372ae922b676e269c5
- spec.md 0a1042204f0a1353f7a7cfdfbdf320648a0c03d34faabf523d6377fb70e86596
- plan.md 0826ea7eadac70fbcdcf40ca3cb4292011533bdef330a6122c206c8d51758567
- tasks.md 244fd0337bd4a7ac0ec393005625f2ccd05b9061f9b03fdd2233e62784eca534

Round 7 verified:
- **Amendment A2:** dated, user-authorized and records the accepted risk (constitution.md:38-40, change record :49).
- **Open questions:** OQ-11 → T055b/A039; OQ-12 → FR023/T056/A038; OQ-14 → FR025/T048/T060b; OQ-15 → T061/T064. tasks.md:101 says Phase 1 has none.
- **syncedAt clearing:** done in `store.importAll` (tasks.md:63), which closes advisory A5.
- **Task graph:** every dependency points to an earlier task, no cycles, and no Phase 1 task depends on Phase 2 (T029/T042/T058/T046 come after T069). The plan drops HMAC consistently.

| ID | Sev | File:line | Issue | Repair | Status |
| --- | --- | --- | --- | --- | --- |
| PR039 | minor | constitution.md:14 (C007) | The C007 text "approval only by signed-in share@spmcdvo.net" does not mention the Amendment A2 sheet-edit approval exception. | Append "(exception: trusted direct sheet edits, Amendment A2)". | open |
| PR040 | minor | spec.md:89 (OQ-09) | OQ-09 still says "backup reminder for all users", but FR014/A017 (Rev 3.4) show it only when the user is not signed in. | Append "(Rev 3.4: only when not signed in to sync)". | open |
Reviewer: Agent 22, separate context, read-only. HEAD d60a336. Date 2026-11-08. Round 5. C013 approval is still required.

## Reviewed artifacts (round 5 baseline)

| Artifact | Rev | SHA-256 |
| --- | --- | --- |
| project_context.md | 3.1 | da73143f1e97dc492934f3a829cc75839fbb5209d213d9154622fb6900753a96 |
| constitution.md | 3.1 | aaa5a912eac04bab688cdbc10892aae93372469f8cb829291c90c10de7641ad0 |
| spec.md | 3.1 | 53b5c344a988506dd105670cd632b71f645f0408efb0bcac6879ec913d02e2e2 |
| plan.md | 3.2 | 74274521877ff94fcb9b366aa9b0c37f261cdb2cd658ee14379a4a57230d8f49 |
| tasks.md | 3.2 | 995b13600b818f0542432b6dc15a96f0f0bdd19e8aba3818f8f8325fcb13143e |

## Round 5 checks
- **Never-pushed data preserved:** PASS. Records without `syncedAt` are never dropped and are re-pushed with `neverSynced` regardless of `updatedAt`. The server does not apply the watermark to them (plan.md:195-196).
- **No resurrection:** PASS. A record that was synced and then deleted elsewhere has `syncedAt` and is missing from the snapshot, so it is dropped. Its tombstone-era copy is not `neverSynced`, so the server watermark filter blocks it.
- **Migration:** PASS. migrateV2 leaves `syncedAt` absent, so all pre-sync data is pushed on first sync (plan.md:178; T048).
- **Tests:** T050 and T051 list the 3 tests.

| ID | Sev | File:line | Issue | Repair | Status |
| --- | --- | --- | --- | --- | --- |
| PR037 (resolved R6) | minor | plan.md:195 | A record that was synced, then edited offline (in the outbox with `updatedAt` < `purgedBefore`), and is still present in the snapshot is not re-pushed. Local LWW keeps the local edit, but the server keeps the old value, so the device and server diverge. | Step (3): also re-push outbox records whose id exists in the snapshot, regardless of `updatedAt` (normal LWW decides). Add a test. | open |
| PR038 (resolved R6) | minor | plan.md:179 (backup) / T022 | A backup restored on another device carries `syncedAt`. On `cursor_too_old`, if those records are absent from the snapshot (for example after deleteMe), they are dropped and the restored data is lost. | Strip `syncedAt` on backup import, so the records count as never-synced. Add an assertion to A007/T022. | open |

## Reviewed artifacts (round 4 baseline)

| Artifact | Rev | SHA-256 | Verdict |
| --- | --- | --- | --- |
| project_context.md | 3.1 | da73143f1e97dc492934f3a829cc75839fbb5209d213d9154622fb6900753a96 | PASS (sheet ID redacted; grep "spreadsheets" = 0) |
| constitution.md | 3.1 | aaa5a912eac04bab688cdbc10892aae93372469f8cb829291c90c10de7641ad0 | PASS (C001 A1 exception; C007 check A025/A026/A036/T068) |
| spec.md | 3.1 | 53b5c344a988506dd105670cd632b71f645f0408efb0bcac6879ec913d02e2e2 | PASS (FR031, A033–A037) |
| plan.md | 3.1 | 3109543584ce2b7ec2d1ea344dfffdea9a2e88a926889627a9d469eef0eb4519 | FAIL (PR036) |
| tasks.md | 3.1 | 9b2305a61a0d0bd238545d189745282ba63ca08af5701e93b58390a69d18e99e | FAIL (PR036 retest in T050/T051) |

## Round 4 checks

| Check | Verdict | Evidence |
| --- | --- | --- |
| T053b ordering/deps | PASS | T053b (USER) depends on T053. T054 depends on T053 and T053b, so T057 and T059 inherit the setup step. No references to the old T063 remain except the note at tasks.md:87. |
| OQ tasks parallel, only T066 waits | PASS | T055b, T056, T060b and T064 are branches. T066 depends on T065, T055b, T056, T060b and T064. The main path T047→T065 contains no OQ-blocked task. T067–T069 follow T066 by design. |
| purgedBefore + cursor_too_old | **FAIL** | Deleted records can no longer come back. But the rule at plan.md:195-196 also drops never-synced local creates/edits older than the watermark (PR036). |
| clinicianEdit security | PASS | Clinician-only via the verified token. The entity whitelist is labs/limits. The server validates, stamps approvedBy, bumps updatedAt server-side and audits. A036 covers it, plus the non-clinician 403 test in T068. Patient edits of those rows are forced to pending (plan.md:204). |
| CSP /gsi/, popup only | PASS | plan.md:212 sets popup mode and drops form-action. plan.md:234 scopes script-src, frame-src and connect-src to /gsi/. No redirect fallback remains (plan.md:224 refers to the /exec 302, which is expected). |
| A033–A037 + coverage | PASS | Every FR015–FR031 and NFR007–NFR010 has a task and a check (tasks.md coverage map). |
| Exclusions, rate limit, skew, withdrawal, A1/A2/A3 | PASS | Not-synced list present; locked/soft rate limit at plan.md:227; +24 h reject at plan.md:190; withdrawal handled in A037/T061; tokeninfo rationale at plan.md:223; replay risk at plan.md:236. |
| New contradictions | none besides PR036 | |

## Findings (round 4)

| ID | Sev | File:line | Linked | Expected vs observed | Required repair (Agent 21) | Retest | Status |
| --- | --- | --- | --- | --- | --- | --- | --- |
| PR036 (resolved R5) | major | plan.md:194-196; tasks.md T050/T051 | C005 (no data loss), FR018, FR020 | A device offline longer than the retention window may hold records it created offline that were never pushed. Two rules drop them: "Only outbox records with `updatedAt` ≥ `purgedBefore` are re-pushed", and the server "ignores pushes of unknown ids with `updatedAt` < `purgedBefore`". Both silently drop that genuine patient data. Only records that were previously synced can be resurrection candidates. | Add a per-record `syncedAt` (or ack flag) on the client. On `cursor_too_old`: (1) pull the snapshot; (2) drop local records that have `syncedAt` and are absent from the snapshot (deleted elsewhere); (3) re-push every record without `syncedAt`, regardless of `updatedAt`, with a `neverSynced:true` hint; (4) the server applies the watermark-ignore rule only to pushes that are not `neverSynced`. Add unit tests: "never-synced old create survives resync" and "previously synced deleted record does not resurrect". | Both tests listed in T050/T051 and plan §14.3 step 8 | open |

## Findings (round 3)

| ID | Sev | File:line | Linked | Expected vs observed | Required repair (Agent 21) | Retest | Status |
| --- | --- | --- | --- | --- | --- | --- | --- |
| PR023 | major | spec.md:12; constitution.md:8 | C001, FR025, A1 | The §2 inventory still says "Labs + limits (pending → clinician PIN approval)", and C001 says every §2 feature remains. FR025 retires the PIN, so the T032 parity check contradicts the scope. | Change spec §2 to "pending → clinician approval (server-verified share@spmcdvo.net; PIN retired, FR025)". Add to C001: "except changes authorized by Amendment A1". | grep "clinician PIN approval" = 0 | **resolved R4** |
| PR024 | major | tasks.md T054/T057/T059 (lines 67, 70, 71) | FR015, FR018 | T054 writes the `/exec` URL into js/sync/config.js, and T057/T059 verify live sign-in and sync (A020). All three need T063's outputs (client ID, deployed script), but none depends on T063. | Add T063 to the deps of T054, T057 and T059. | deps include T063 | **resolved R4** |
| PR025 | major | plan.md §14.2 (line 177), §14.3, §14.7 retention (line 220) | FR020, OQ-11 | After tombstones are purged (N days), a device that was offline longer than N pushes the deleted record again. With no tombstone left on the server, the deleted record comes back. | Add a rule: the server keeps a per-email `purgedBefore` watermark and ignores pushes of unknown ids with `updatedAt` < watermark, or a client whose `lastSyncAt` is older than the window does a full pull before it pushes. Add a unit test under A022. | test "stale device after purge does not resurrect" | **resolved R4** |
| PR026 | major | spec.md US010 (line 95) vs plan.md §14.4 (lines 192-197) | US010, FR023 | US010 says "lab/limit edits flow to the patient", but the only clinician op is `approve` (status only). No op lets the clinician edit a patient's values or limits. | Either add `op:'clinicianEdit'` (clinician-only, target email, writes values + status + audit) with `authorize` tests and an A-ID, or reword US010 to approval-only. | US010 matches the op table and has an A-ID | **resolved R4** |
| PR027 | major | tasks.md:68-73, :95 | OQ-11, OQ-12, OQ-14 | tasks.md:95 says these OQs block only T055, T056 and T060. But T057, T059 and T061–T069 depend on them through the single chain, so one pending answer stops sign-in, sync, consent and the deploy. | Re-base the deps: T057 → T054 (+T063), T059 → T057. Make T055 (retention part), T056 and T060 (legacy-approval part) parallel branches that only T066/T069 wait on, or split each into an unblocked core task and an OQ-dependent tail task. | T054→T057→T059→T061→T062→T065 path contains no OQ-blocked task | **resolved R4** |
| PR028 | major | spec.md:116-117, 123-126; tasks.md:94 | FR026, FR028, NFR008, NFR010 | FR026 (sign out) and FR028 (status) have no A-ID. NFR008 (sync < 5 s, UI never blocked) has no task or check. NFR010 is missing from the coverage map. | Add A033 (sign out stops sync, token dropped, local data kept), A034 (status states off/pending n/synced/error shown as icon + text) and A035 (4G-throttled sync of a typical day < 5 s, no main-thread long task > 50 ms). Verify them in T059/T066, and map NFR010 → T061, T064. | every FR/NFR has an A-ID and a task | **resolved R4** |
| PR029 | minor | plan.md:84; constitution.md:14 | C005, C007 | plan §4 says "No schema change … Migration: none required", which contradicts §14.2 migrateV2. The C007 check still says "PIN tests". | §4: add "(F-RESTRUCTURE-01 only; F-SYNC-01 migration v2 in §14.2)". Change the C007 check to "server approve tests A025/A026; T068". | text | **resolved R4** |
| PR030 | minor | plan.md:180 (§14.2 entities) | FR017 | FR017 says "ALL data", but the plan does not say whether foodCache, the USDA API key and the device-local keys are excluded. | Add an exclusion list with reasons: foodCache (regenerable), USDA key (device setting), deviceId/syncState/outbox/a2hsDismissed/lastBackupAt (device-local). | explicit list | **resolved R4** |
| PR031 | minor | plan.md:217 | FR029, A030 | The CacheService rate counter does a read-then-increment that is not atomic, so parallel executions undercount. | Increment inside a short LockService lock, or declare it a soft limit. | text | **resolved R4** |
| PR032 | minor | plan.md:189 | FR020 | The future-`updatedAt` guard (+24 h) is listed only as an "unverified mitigation", but LWW correctness depends on it. | Make it a `validatePayload` rule with a unit test (A029/A022). | unit test | **resolved R4** |
| PR033 | minor | spec.md:115 (FR016) | C018, NFR010 | When consent is withdrawn, the spec does not say the server records the withdrawal, or what happens to cloud rows. | State: "withdrawal recorded in the `consent` tab; cloud rows kept until deleteMe or retention; the notice says so". | text | **resolved R4** |
| PR034 | minor | plan.md:224 | CSP | Google's GIS CSP guidance scopes frame-src/connect-src to `https://accounts.google.com/gsi/`, but the plan allows the whole origin. The redirect fallback (`ux_mode:'redirect'`) also needs form-action. | Narrow to `/gsi/` paths. Add `form-action https://accounts.google.com` only if T057 adopts the redirect fallback. | T062 CSP check | **resolved R4** |
| PR035 | minor | tasks.md:94 | coverage | The map has no rows for FR026, FR028, FR030 → T053, NFR008, NFR009 → T068 or NFR010. | Complete the map. | map lists FR015–FR030 and NFR007–NFR010 | **resolved R4** |

Advisories:
- A1: document why tokeninfo is used instead of local JWKS verification, and the tokeninfo rate-limit exposure (the token cache reduces it).
- A2: document bearer-token replay within exp as an accepted risk (memory-only tokens, HTTPS only).
- A3: tag `js/auth/native.js` in plan §14.1 as Phase 2.
- A4: project_context.md §10 contains the full Sheet URL and ID, although the plan says the ID lives only in Script Properties. The sheet is Restricted, but consider redacting the ID from repo docs.

Counts (round 3): open block 0 · major 6 (PR023–PR028) · minor 7 (PR029–PR035) · advisories 4. R0–R2 findings PR001–PR022 remain resolved.

## History

- Round 0 (Rev 1, 2026-11-08, commit 70d1f46): FAIL. 9 major, 7 minor (PR001–PR016).
- Round 1 (Rev 2, 2026-11-08, d60a336): all of PR001–PR016 resolved. New minors PR017–PR022. Verdict PASS.
- Round 2 (Rev 2.1 / constitution Rev 2, 2026-11-08): PR017–PR022 resolved; no new contradictions; advisory A3 (wording). Verdict PASS.
- Round 3 (Rev 3, F-SYNC-01 added, Amendment A1; 2026-11-08, d60a336): full review. FAIL. 6 major (PR023–PR028), 7 minor (PR029–PR035), 4 advisories. The restructure portion is still consistent.
- Round 4 (Rev 3.1, 2026-11-08): PR023–PR035 + A1–A4 resolved. New major PR036 (watermark drops never-synced old records). FAIL.
- Round 5 (Rev 3.2, 2026-11-08): PR036 resolved. New minors PR037, PR038. PASS.
- Round 6 (Rev 3.3, 2026-11-08): PR037 and PR038 resolved; no forward refs or new contradictions; advisory A5. PASS.
- Round 7 (Rev 3.4, 2026-11-08): user OQ answers folded in, Amendment A2 recorded, C013 approval recorded, A5 closed. New minors PR039 and PR040. PASS — READY.

## Gate and validity

Open mandatory findings: none. PR039/PR040 are wording fixes. C013 approval: ORCHESTRATOR.md:3-4.
Reasoned overall: **PASS**. Agent 0 may record **READY** for Phase 1 (F-RESTRUCTURE-01 + F-SYNC-01 web). Any material edit to the five files invalidates this review. This report is not deployment authorization.
