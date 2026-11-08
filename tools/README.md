# tools

## lab_ocr.py

Transcribes a lab-result photo into labs JSON (PC only).

```
pip install rapidocr-onnxruntime
python tools/lab_ocr.py path\to\lab.jpg --out labs-2026-11-08.json
```

- Omit `--out` to print JSON to stdout.
- Output: `{date, source:"ocr", values:{...}, units:{...}, raw_text}`.
- Analytes: potassium, sodium, phosphorus, albumin, bun, creatinine, hemoglobin, calcium.
- Missing analytes are `null`. Reference ranges (e.g. `3.5-5.1`) are never taken as values.
- Exit codes: 0 ok, 1 image not found, 2 rapidocr not installed.

## test_lab_ocr.py

Parser tests; no OCR install needed.

```
python tools/test_lab_ocr.py
```
