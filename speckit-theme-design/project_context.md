# Project Context — SKTIDVO theme redesign

## Identity
- App: SKTIDVO — fluid, weight, meds, dialysis and diet tracker for haemodialysis patients of SPMC Kidney & Transplant Institute (SKTI), Davao City.
- Users: older dialysis patients, many with low vision; some colour-vision deficiency. Languages: EN + Bisaya/Tagalog (js/i18n.js).
- Data stays on device (localStorage, js/store.js). Works offline (sw.js app-shell cache).

## Stack
- Vanilla JS, no build step. `index.html` + `css/styles.css` (~870 lines, `:root` tokens) + `js/app.js` (views) + `js/diet-view.js`, `js/food.js`, `js/limits.js` (diet feature, uncommitted — preserve).
- Android: Capacitor app bundling `www/`, which is a MANUAL copy of root app files. Every changed root file must be mirrored into `www/`.
- Tests: `tests/*.test.js`, run via scratchpad `run-all.mjs` (142 tests at last run).

## Current (pre-redesign) theme
- Palette "SKTI Teal & White": brand #0B6E78, bg #FFFFFF, surface #F2F9FA, fg #0D2026, muted #3F5C65, ok #3A7217, warn #8A4B00, danger #A81D24.
- Dark mode via `prefers-color-scheme` block + `[data-theme="dark"]`; Settings has Auto/Light/Dark picker (`data-theme-set`, `profile.theme`).
- Fonts: Caprasimo (headings/numbers) + Figtree (body), Google Fonts, system fallback.
- Header: sticky 100px; building photo (`assets/skti-building.jpg`) + dark scrim + white DOH/SPMC seal badge + "SKTIDVO" title/sub + translucent gear button.
- Radii 16/8/28; flat 1px shadows; hairline (non-3:1) card borders.
- meta theme-color #FFFFFF / #0B1A1E; manifest theme_color #0B6E78.

## Screens
Today (dashboard: status card, Fluid/Weight bento tiles, next HD, calendar, trend cards), Fluid, Weight, Meds, Dialysis, Diet, Settings; plus sheets (modal), toasts, banners, bottom nav (6 items), header.

## Constraints
- Older low-vision patients: 18px body, 56px tap targets, strong focus rings.
- Offline: fonts are progressive enhancement only; system stack must carry the UI.
- Don't touch icon PNGs. Don't commit.
- Capacitor `www/` mirror required.
