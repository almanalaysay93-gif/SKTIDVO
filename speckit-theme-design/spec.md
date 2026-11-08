# Spec — "Sky Clay" light theme

## 1. Palette (ratios computed by `contrast.mjs`)

| Token | Hex | Role |
|---|---|---|
| --bg | #EEF5FB | page, cool sky-tinted off-white |
| --surface | #FBFDFF | polar-white clay cards |
| --surface-2 | #E2EEF8 | sunken tracks (segmented), hover |
| --fg | #0B2236 | body text |
| --fg-muted | #3B5268 | secondary text |
| --brand | #0B5FA0 | sky: icons, links, focus, nav current |
| --brand-dark | #084A7E | sky hover |
| --brand-tint / -2 | #DCEBF8 / #BFDAF1 | icon chips, calendar sched |
| --cta | #C2185B | hot pink: primary buttons, selected segment, today cell |
| --cta-dark | #9C1149 | pink hover/pressed, primary border |
| --on-cta / --on-brand | #FFFFFF | labels |
| --border | #6B8499 | card/control boundary |
| --hairline | fg @14% | list dividers only (no 3:1 duty) |
| --ok / tint | #0B5FA0 / #DCEBF8 | sky = within limit |
| --warn / tint | #7A0E3E / #FDF0F5 | deep magenta, light tint, striped bar |
| --danger / tint | #7A0E3E / #FBE3EC | deep magenta, solid bar |
| header border | #4F687E | 4.45:1 on #CFE4F5 |
| header gradient | #F7FBFF → #DCEBF8 → #CFE4F5 | |

| Pair | Ratio | Req | Pass |
|---|---|---|---|
| fg on bg | 14.73 | 7 | yes |
| fg on surface | 15.89 | 7 | yes |
| fg on surface-2 | 13.75 | 7 | yes |
| fg on header #CFE4F5 / #F7FBFF | 12.40 / 15.58 | 7 | yes |
| fg on danger tint | 13.35 | 7 | yes |
| muted on bg | 7.36 | 4.5 | yes |
| muted on surface | 7.94 | 4.5 | yes |
| muted on surface-2 | 6.87 | 4.5 | yes |
| muted on header #CFE4F5 | 6.20 | 4.5 | yes |
| muted on warn / danger tint | 7.31 / 6.67 | 4.5 | yes |
| white on cta | 5.87 | 4.5 | yes |
| white on cta-dark | 8.11 | 4.5 | yes |
| cta on surface | 5.76 | 4.5 | yes |
| brand on surface / bg / brand-tint | 6.52 / 6.04 / 5.47 | 4.5 | yes |
| white on brand | 6.65 | 4.5 | yes |
| brand focus ring on bg / header | 6.04 / 5.09 | 3 | yes |
| ok (sky) on tint / surface | 5.47 / 6.52 | 4.5 | yes |
| magenta on warn tint / danger tint / surface | 9.67 / 8.83 / 10.51 | 4.5 | yes |
| magenta vs button pink (lightness) | 1.82 | distinguishable | yes |
| magenta vs sky ok | 1.61 | + icon/label | yes |
| white toast text on fg | 16.20 | 7 | yes |
| border on bg / surface / surface-2 | 3.54 / 3.82 / 3.31 | 3 | yes |
| header border #4F687E on #CFE4F5 | 4.45 | 3 | yes |

## 2. Typography
- Family: **Plus Jakarta Sans** 400/500/600/700/800 (Google Fonts, `display=swap`). One family; headings 800, numbers 800, body 400–600.
- Why: open apertures, tall x-height, calm geometric-humanist — legible for low vision, less playful than Caprasimo.
- Fallback: `-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif` via `--font`.
- Scale unchanged: 15 / 17 / 18 (body) / 22 / 28 / 36 / 56px.

## 3. Clay-lite surface recipe
- Radii: --radius 20px, --radius-sm 14px, --radius-lg 32px (cards use lg).
- Raised (`--shadow`): `inset 0 2px 0 rgba(255,255,255,.95), inset 0 -2px 4px rgba(11,95,160,.06), 0 2px 4px rgba(16,58,98,.08), 0 10px 22px -10px rgba(16,58,98,.28)`.
- Overlay (`--shadow-lg`): `0 4px 10px rgba(16,58,98,.12), 0 22px 44px -12px rgba(16,58,98,.35)`.
- Pressed (`--shadow-press`): `inset 0 3px 8px rgba(16,58,98,.22), inset 0 -1px 0 rgba(255,255,255,.6)` + scale(.97).
- Border: 1px solid --border on cards and controls.

## 4. Component states
- **Primary button**: bg --cta, border --cta-dark, white label; hover --cta-dark; active inset shadow + scale .97; disabled opacity .5, no shadow.
- **Ghost button**: surface bg, --brand label, 1px border. **Danger button**: surface bg, --danger label + border.
- **Cards / stat / reminder / chart-card / drink**: surface, border, raised shadow; active = pressed shadow. Drink icons --cta.
- **Segmented**: sunken track (surface-2 + press shadow); selected = --cta pill, 56px tall.
- **Nav**: surface, top border, 24px top radii, upward shadow; current = --brand text + 3px top bar + brand-tint fill, weight 800.
- **Sheet**: surface, border (no bottom), lg radius top, inset highlight + shadow-lg; scrim rgba(8,34,60,.5).
- **Inputs**: surface, 1px border, inset shadow (sunken); focus = brand border + 3px brand-tint-2 ring (plus global 3px --brand focus-visible outline).
- **Toast**: --fg bg, white text (16.2:1).
- **Banner**: brand-tint bg, fg text, border.
- **Diet bars (.dbar)**: track brand-tint; ok = sky solid; warn = magenta diagonal stripes on warn tint; danger = solid magenta. Warning text carries alert icon + label.
- **Status card**: unchanged band logic; tints above.
- **Checklist done**: box --ok (sky).
- **Status/med/lab chips & badges**: tinted fill + 1px outline in tone colour; never solid fill.
- **Calendar today**: --cta fill, white.

## 5. Header
- Drop building photo + scrim (dark scrim fought light theme). Keep seal badge (alt text unchanged), title, sub, gear, sticky.
- 96px + safe area; gradient 160° #F7FBFF→#DCEBF8→#CFE4F5; bottom 28px radii; 1px border; soft shadow.
- Two pseudo-element blobs: sky (rgba 120,180,235,.55) 220px drifting 22s; pink (rgba 194,24,91,.16) 180px drifting 30s; `ease-in-out infinite alternate`, transform only.
- Row entrance: opacity+translateY(-6px), 600ms, once.
- Title --fg 22px/800; sub --fg-muted 15px/600; gear = clay circle, --brand icon, pressed inset.
- Reduced motion: all header animation none.

## 6. Motion elsewhere
- Today: existing staggered `cardUp` kept. Other views: `.card` children `cardUp` 420ms.
- Buttons/cards: press = scale + inset shadow (120ms).
- Danger badge pulse (scale, 1.8s) kept; disabled under reduced motion.

## 7. Per-screen notes
- **Today**: status card, bento tiles, calendar (today pink), trend cards as clay buttons.
- **Fluid**: drink grid clay tiles with sky icons; meter bands unchanged.
- **Weight**: sparkline brand line; grid lines hairline.
- **Meds**: med rows bordered; check button clay circle; taken = ok.
- **Dialysis**: schedule segmented control pink-selected; checklist done = ok.
- **Diet**: nutrient bars ok/warn/danger; food list items surface + border; chips unchanged semantics.
- **Settings**: theme section removed; language segmented control pink-selected.

## 8. Decisions (resolved)
- Q1: building photo removed from sw.js precache.
- Q2: theme i18n strings + theme click handler deleted.
- Q3: header bottom border #4F687E (4.45:1).
- Q4: three-colour palette; status = sky / deep magenta #7A0E3E (see §1, constitution 5).
- Q5: pink fill only on buttons; drink/food icons sky.
- Q6: screenshots 390px all views + sheet + over-limit diet; nav 320px; reduced-motion verified.
