# Tasks

Status legend: [x] done (before spec freeze), [ ] pending. Owner: impl = implementing agent, main = main session/user.

| ID | Task | Owner | Depends | Acceptance | Status |
|---|---|---|---|---|---|
| T001 | Resolve OPEN QUESTIONS Q1–Q6 (spec §8) | main | — | Decision recorded in spec.md | [x] |
| T002 | Replace `:root` tokens, add contrast comment table | impl | — | contrast.mjs: all required pairs pass | [x] |
| T003 | Remove dark-mode block + `[data-theme=dark]` | impl | T002 | grep `color-scheme: dark`, `data-theme` in CSS → 0 | [x] |
| T004 | Swap fonts to Plus Jakarta Sans via `--font` | impl | T002 | grep Caprasimo/Figtree → 0 | [x] |
| T005 | Clay-lite component states (buttons, cards, seg, nav, sheet, inputs, toast, banner) | impl | T002 | visual review screenshots | [x] |
| T006 | Header redesign + blob/entrance animation | impl | T002 | screenshot; transform/opacity only | [x] |
| T007 | Reduced-motion kills header/entrance/pulse | impl | T006 | CDP reduced-motion emulation: `document.getAnimations()` running = 0 | [x] code / [ ] verified |
| T008 | index.html: theme-color, fonts URL, remove photo+scrim | impl | T004,T006 | HTML diff review | [x] |
| T009 | app.js: remove theme picker, applyTheme light-only | impl | T003 | Settings shows no theme section; tests green | [x] |
| T010 | manifest colours | impl | T002 | values #EEF5FB / #F7FBFF | [x] |
| T011 | sw.js cache bump v7 | impl | — | `CACHE = 'sktidvo-v7'` | [x] |
| T012 | Mirror to www/ | impl | T002–T010 | `diff` root vs www for 4 files → identical | [x] (re-mirror after any later change) |
| T013 | Apply T001 decisions | impl | T001 | per decision | [ ] |
| T014 | Run tests | impl | T013 | run-all.mjs all pass (142/142 at last run) | [x] pre-T013 / [ ] final |
| T015 | Screenshots 390px all views + sheet + toast; 320px nav | impl | T013 | PNGs in scratchpad, paths listed | [ ] |
| T016 | Final contrast table | impl | T013 | contrast.mjs output in report | [x] pre-T013 / [ ] final |
| T017 | Status tokens: ok sky, warn/danger magenta #7A0E3E; striped warn bars; outlined chips | impl | T001 | contrast ≥4.5 on tints; no green/amber/red hex in CSS | [x] |
| T018 | Remove photo from sw.js; delete theme i18n + handler | impl | T001 | grep → 0 | [x] |
| T019 | Header border #4F687E | impl | T001 | 4.45:1 | [x] |
| T020 | Drink/food icons sky | impl | T001 | screenshot | [x] |
| T021 | Reduced-motion check via CDP | impl | T007 | running animations = 0 | see report |
