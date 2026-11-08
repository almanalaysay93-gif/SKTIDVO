# Plan

## Approach
Token-first: rewrite `:root` in `css/styles.css`, add `--cta`, `--hairline`, `--shadow-press`, `--clay-hi`, `--font`; then minimal per-component edits only where a role changes (primary → pink, dividers → hairline, clay shadows/pressed states, header).

## File-by-file
- `css/styles.css`: new token block + contrast comment table; delete dark `@media` block and `[data-theme="dark"]`; `--font` replaces Caprasimo/Figtree; header section rewritten (no photo/scrim, gradient + blobs + entrance); component state edits per spec §4; reduced-motion block extended to kill header/entrance/pulse animations.
- `index.html`: drop `data-theme-default`; single `theme-color #F7FBFF` + `color-scheme light`; Google Fonts URL → Plus Jakarta Sans 400–800; remove header `<img>` photo + scrim div.
- `js/app.js`: remove Settings theme picker markup; `applyTheme()` always clears `data-theme` (stored value ignored).
- `manifest.webmanifest`: background_color #EEF5FB, theme_color #F7FBFF.
- `sw.js`: CACHE `sktidvo-v6` → `sktidvo-v7`.
- `www/`: mirror css/styles.css, index.html, js/app.js, manifest.webmanifest (www has no sw.js).
- `js/i18n.js`: delete `settings.theme*` strings. `js/app.js`: delete `data-theme-set` handler.
- Status tokens re-pointed: ok → sky, warn/danger → deep magenta; warn bars striped, danger solid; chips/badges outlined tints.
- `sw.js`: drop `assets/skti-building.jpg` from precache.
- `js/store.js`: untouched (theme value harmless).

## Font loading
Google Fonts stylesheet with preconnect + `display=swap`; offline falls back to system stack; service worker does not cache fonts (unchanged behaviour).

## Verification
1. `node <scratchpad>/run-all.mjs` — all tests pass.
2. Serve root (`python -m http.server`), screenshot Today/Fluid/Weight/Meds/Dialysis/Diet/Settings + a sheet + toast at 390px, nav at 320px (browser-harness MCP).
3. `node speckit-theme-design/contrast.mjs` — table in spec.md.
4. Reduced motion: emulate via CDP `Emulation.setEmulatedMedia` and confirm no running animations.
