#!/usr/bin/env python3
"""Transcribe a lab-result photo into labs JSON.

Usage:
    python tools/lab_ocr.py <image> [--out file.json]

OCR uses rapidocr-onnxruntime (pip only). It is imported lazily so that
parse_lab_text() works without it (see tools/test_lab_ocr.py).
"""
import argparse
import datetime as _dt
import json
import os
import re
import sys

NUTRIENTS = [
    "potassium", "sodium", "phosphorus", "albumin",
    "bun", "creatinine", "hemoglobin", "calcium",
]

# Alias regexes per nutrient. Matched case-insensitively, bounded by letters.
ALIASES = {
    "potassium": ["potassium", r"k\+?"],
    "sodium": ["sodium", r"na\+?"],
    "phosphorus": ["phosphorus", "phosphorous", "phosphates?", "phos", "po4", "p"],
    "albumin": ["albumin", "alb"],
    "bun": [r"blood\s+urea\s+nitrogen", "bun"],
    "creatinine": ["creatinine", "creat", "cr"],
    "hemoglobin": ["hemoglobin", "haemoglobin", "hgb", "hb"],
    "calcium": ["calcium", r"ca\+*"],
}

UNITS = [
    "mmol/L", "mmol/l", "umol/L", "umol/l", "µmol/L", "μmol/L",
    "mEq/L", "meq/L", "g/dL", "g/dl", "g/L", "g/l", "mg/dL", "mg/dl",
    "mg/L", "mg/l", "ug/dL", "µg/dL", "μg/dL", "ng/mL", "U/L",
    "IU/L", "mmol", "mEq", "%",
]

_ALIAS_RE = re.compile(
    r"(?<![A-Za-z])(?:"
    + "|".join(
        "(?P<%s>%s)" % (n, "|".join(sorted(ALIASES[n], key=len, reverse=True)))
        for n in NUTRIENTS
    )
    + r")(?![A-Za-z])",
    re.IGNORECASE,
)

_NUM_RE = re.compile(r"(?<![\d.])\d+(?:\.\d+)?(?![\d.])")
_RANGE_AFTER_RE = re.compile(r"\s*(?:-|–|—|to)\s*\d", re.IGNORECASE)
_RANGE_BEFORE_RE = re.compile(r"\d\s*(?:-|–|—|to)\s*$", re.IGNORECASE)
_UNIT_RE = re.compile(
    r"\s*("
    + "|".join(re.escape(u) for u in sorted(UNITS, key=len, reverse=True))
    + r")(?![A-Za-z])",
    re.IGNORECASE,
)

_MONTHS = {m: i for i, m in enumerate(
    ["jan", "feb", "mar", "apr", "may", "jun",
     "jul", "aug", "sep", "oct", "nov", "dec"], 1)}
_MON = r"(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?"
_DATE_PATTERNS = [
    (re.compile(r"(?<!\d)(\d{4})[-/](\d{1,2})[-/](\d{1,2})(?!\d)"), "ymd"),
    (re.compile(r"(?<!\d)(\d{1,2})/(\d{1,2})/(\d{4})(?!\d)"), "mdy"),
    (re.compile(r"\b" + _MON + r"\s+(\d{1,2}),?\s+(\d{4})\b", re.IGNORECASE), "Mdy"),
    (re.compile(r"\b(\d{1,2})\s+" + _MON + r",?\s+(\d{4})\b", re.IGNORECASE), "dMy"),
]


def _to_iso(year, month, day):
    try:
        return _dt.date(year, month, day).isoformat()
    except ValueError:
        return None


def find_date(text):
    """First valid date in text as ISO YYYY-MM-DD, else None."""
    hits = []
    for pattern, kind in _DATE_PATTERNS:
        for m in pattern.finditer(text):
            hits.append((m.start(), kind, m))
    hits.sort(key=lambda h: h[0])
    for _, kind, m in hits:
        g = m.groups()
        if kind == "ymd":
            iso = _to_iso(int(g[0]), int(g[1]), int(g[2]))
        elif kind == "mdy":
            month, day, year = int(g[0]), int(g[1]), int(g[2])
            if month > 12 and day <= 12:  # only unambiguous DD/MM case
                month, day = day, month
            iso = _to_iso(year, month, day)
        elif kind == "Mdy":
            iso = _to_iso(int(g[2]), _MONTHS[g[0][:3].lower()], int(g[1]))
        else:  # dMy
            iso = _to_iso(int(g[2]), _MONTHS[g[1][:3].lower()], int(g[0]))
        if iso:
            return iso
    return None


def _extract_value(window):
    """First number in window that is not part of a range. Returns (value, unit)."""
    for m in _NUM_RE.finditer(window):
        before = window[:m.start()]
        after = window[m.end():]
        if _RANGE_AFTER_RE.match(after) or _RANGE_BEFORE_RE.search(before):
            continue
        text = m.group(0)
        value = float(text) if "." in text else int(text)
        unit_match = _UNIT_RE.match(after)
        unit = unit_match.group(1) if unit_match else None
        return value, unit
    return None, None


def parse_lab_text(text):
    """Pure parser. Returns {date, source, values, units, raw_text}.

    Takes the first occurrence of each analyte that has a value on its line.
    Missing analytes are None. Never guesses.
    """
    text = text or ""
    values = {n: None for n in NUTRIENTS}
    units = {n: None for n in NUTRIENTS}
    for line in text.splitlines():
        matches = list(_ALIAS_RE.finditer(line))
        for i, m in enumerate(matches):
            nutrient = m.lastgroup
            if values[nutrient] is not None:
                continue
            # Window ends at the next analyte label so values never cross columns.
            end = matches[i + 1].start() if i + 1 < len(matches) else len(line)
            value, unit = _extract_value(line[m.end():end])
            if value is not None:
                values[nutrient] = value
                units[nutrient] = unit
    return {
        "date": find_date(text),
        "source": "ocr",
        "values": values,
        "units": units,
        "raw_text": text,
    }


def ocr_lines(result):
    """Group rapidocr detections [box, text, score] into text lines, left to right."""
    items = []
    for entry in result or []:
        box, txt = entry[0], entry[1]
        ys = [p[1] for p in box]
        xs = [p[0] for p in box]
        items.append({"text": txt, "x": min(xs), "y": (min(ys) + max(ys)) / 2,
                      "h": max(ys) - min(ys)})
    items.sort(key=lambda it: it["y"])
    lines = []
    for it in items:
        if lines and abs(it["y"] - lines[-1]["y"]) <= max(lines[-1]["h"], it["h"]) * 0.5:
            lines[-1]["items"].append(it)
        else:
            lines.append({"y": it["y"], "h": it["h"], "items": [it]})
    out = []
    for ln in lines:
        ln["items"].sort(key=lambda it: it["x"])
        out.append("  ".join(it["text"] for it in ln["items"]))
    return "\n".join(out)


def ocr_image(path):
    """Run rapidocr on an image file and return the joined text."""
    try:
        from rapidocr_onnxruntime import RapidOCR
    except ImportError:
        print("Missing dependency. Install with: pip install rapidocr-onnxruntime",
              file=sys.stderr)
        sys.exit(2)
    engine = RapidOCR()
    result, _elapse = engine(path)
    return ocr_lines(result)


def main(argv=None):
    parser = argparse.ArgumentParser(description="OCR a lab-result image to labs JSON.")
    parser.add_argument("image", help="path to lab-result image")
    parser.add_argument("--out", help="write JSON to this file instead of stdout")
    args = parser.parse_args(argv)

    if not os.path.isfile(args.image):
        print("Image not found: %s" % args.image, file=sys.stderr)
        return 1

    text = ocr_image(args.image)
    data = parse_lab_text(text)

    if args.out:
        with open(args.out, "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
            f.write("\n")
        print("Wrote %s" % args.out, file=sys.stderr)
    else:
        print(json.dumps(data, ensure_ascii=True, indent=2))
    return 0


if __name__ == "__main__":
    sys.exit(main())
