# Diet / Electrolyte Tracker — Spec (v1)

Owner decisions from user (2026-11-08):
- Track per food: sodium (mg), potassium (mg), phosphorus (mg), protein (g), fluid/water (ml ≈ g water).
- Free online sources only: USDA FoodData Central (free key; `DEMO_KEY` fallback, user key in Settings) + Open Food Facts (keyless, barcode). Credit OFF (ODbL).
- Filipino foods: no free public API (FNRI PhilFCT is login-gated). Support **custom foods** (manual per-100 g entry) + **CSV import** of custom foods. Never ship invented nutrient values.
- Entry: search by name (FDC + OFF), barcode (BarcodeDetector API if available, else type barcode digits), manual entry. Portion in grams.
- Placement/UI: designed via /designme skill; fits existing SKTIDVO design system (css/styles.css, Lucide sprite, no emoji).
- Display: daily total vs limit bar per nutrient + warning text when over. Warning text is i18n (en, tl, ceb) and marked for clinic approval.
- Language: existing js/i18n.js.

## Limits from labs + approval
- Python script `tools/lab_ocr.py <image>` (free, pip-only: rapidocr-onnxruntime) transcribes a lab-result photo → `labs-YYYY-MM-DD.json`: `{date, source, values:{potassium, sodium, phosphorus, albumin, bun, creatinine, hemoglobin, calcium}, units, raw_text}`; missing values = null. Runs on a PC (phone cannot run Python). App imports that JSON.
- App also allows manual lab entry.
- Imported/entered labs are **pending** until approved. Approval = clinician PIN (set in Settings, stored hashed SHA-256 via SubtleCrypto). Approval records approver name + timestamp.
- Compute: suggested daily limits from latest **approved** labs using **clinician-configured rules** (Settings): per nutrient, a base limit and optional "if lab X > threshold then limit = Y". Protein = g/kg × dry weight (g/kg clinician-set). Fluid limit = existing `allowanceMl`. No hardcoded clinical defaults: blank rule → no suggestion.
- Suggested limits are pending until clinician approves (same PIN). Only approved limits drive the bars. Show "limits pending approval" state.

## Data (localStorage, store.js, namespace skti.v1.)
- `foods_custom`: [{id, name, per100:{na,k,p,protein,water}, source:'custom'}]
- `diet_log`: [{id, day, ts, name, grams, source:'fdc'|'off'|'custom', ref, per100}]
- `food_cache`: last ~200 lookups for offline.
- `labs`: [{id, date, values, units, status:'pending'|'approved'|'rejected', approvedBy, approvedAt, origin:'ocr'|'manual'}]
- `diet_limits`: {current:{na,k,p,protein,fluid, approvedBy, approvedAt}, pending:{...}|null, rules:{...}}
- Backup export/import must include new keys.

## Tests
- js unit tests in tests/ harness (nutrient math, FDC/OFF parsing with fixture JSON, limit rules).
- Python: `python tools/test_lab_ocr.py` for text-parsing function (no image needed).

## Calories (added 2026-11-08)
- `per100.kcal` (kcal per 100 g) from USDA FDC energy 208/1008 (kcal unit only; kJ rows ignored) and OFF `energy-kcal_100g`; null when absent. Additive field; no new storage key, no migration.
- Diet screen: kcal per entry and a daily kcal total with "not listed" count. Information only — no limit, no bar, no warning.
- License: product idea from OpenNutriTracker (GPL-3.0) README only; nothing copied or translated from it.
