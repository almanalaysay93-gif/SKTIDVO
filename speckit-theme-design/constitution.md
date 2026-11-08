# Constitution — non-negotiables

1. **Contrast** (WCAG 2.x, computed by `contrast.mjs`, never guessed)
   - Body text ≥ 7:1 on its background.
   - Muted text ≥ 4.5:1; button labels ≥ 4.5:1 on their fill.
   - Component boundaries (cards, controls) and focus rings ≥ 3:1 against adjacent colour (1.4.11).
2. **Size**: body 18px; tap targets 56px (44px absolute floor for secondary icon buttons).
3. **Light theme only.** No dark tokens, no `prefers-color-scheme: dark` block, no theme picker UI. A stored `profile.theme` value stays harmless (ignored, still validated by store).
4. **Motion**: animate transform/opacity only; 60fps; no flashing (nothing > 3 flashes/s, no luminance strobing). `prefers-reduced-motion: reduce` disables ALL decorative motion (header blobs, entrances, pulses).
5. **Three-colour palette**: sky blue, polar white, hot pink (+ neutral ink). No green, amber or red. Status: ok = sky blue; warn/danger = deep magenta #7A0E3E (darker than button pink #C2185B, 1.82:1 lightness gap), ALWAYS with alert icon + text label, shown as outlined/tinted badge or bar — never a filled button shape. Warn vs danger differ by icon + label + bar fill (warn striped light, danger solid). Pink FILL is reserved for buttons/primary actions.
6. **No invented clinical content**: theme work changes presentation only — no new limits, advice, thresholds or copy.
7. **Offline-safe**: system font fallback; no new runtime network dependency.
8. **Scope**: token-first; preserve uncommitted diet feature work; mirror to `www/`; no icon PNG changes; no commits.
