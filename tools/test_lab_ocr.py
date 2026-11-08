#!/usr/bin/env python3
"""Tests for tools/lab_ocr.py parsing. No OCR install needed.

Run: python tools/test_lab_ocr.py
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from lab_ocr import NUTRIENTS, find_date, ocr_lines, parse_lab_text  # noqa: E402

if __name__ == "__main__":
    passed = 0

    # 1. Labeled "name value unit" lines, all eight analytes, ISO date.
    r = parse_lab_text(
        "Potassium 5.8 mmol/L\n"
        "Sodium 138 mmol/L\n"
        "Phosphorus 1.9 mmol/L\n"
        "Albumin 32 g/L\n"
        "BUN 25 mmol/L\n"
        "Creatinine 850 umol/L\n"
        "Hemoglobin 98 g/L\n"
        "Calcium 2.2 mmol/L\n"
        "Date: 2026-11-08"
    )
    assert r["source"] == "ocr"
    assert r["date"] == "2026-11-08"
    assert r["values"] == {
        "potassium": 5.8, "sodium": 138, "phosphorus": 1.9, "albumin": 32,
        "bun": 25, "creatinine": 850, "hemoglobin": 98, "calcium": 2.2,
    }
    assert r["units"]["creatinine"] == "umol/L"
    assert r["units"]["potassium"] == "mmol/L"
    assert r["raw_text"].startswith("Potassium 5.8")
    assert set(r["values"]) == set(NUTRIENTS)
    passed += 1
    print("ok 1 - labeled lines, all analytes, ISO date")

    # 2. Symbol-style labels with colon, and phosphate alias.
    r = parse_lab_text("K+ : 5.8\nNa+ : 140 mEq/L\nPhosphate 1.2 mg/dL")
    assert r["values"]["potassium"] == 5.8
    assert r["units"]["potassium"] is None
    assert r["values"]["sodium"] == 140
    assert r["units"]["sodium"] == "mEq/L"
    assert r["values"]["phosphorus"] == 1.2
    assert r["units"]["phosphorus"] == "mg/dL"
    passed += 1
    print("ok 2 - K+ : colon format and phosphate alias")

    # 3. Reference-range trap: ranges are never the value.
    r = parse_lab_text(
        "Potassium 3.5-5.1 mmol/L\n"
        "Sodium (135-145) 140 mmol/L\n"
        "Calcium 2.2 mmol/L (2.1 - 2.6)\n"
        "Albumin 35 - 50 g/L"
    )
    assert r["values"]["potassium"] is None, r["values"]
    assert r["values"]["sodium"] == 140
    assert r["values"]["calcium"] == 2.2
    assert r["values"]["albumin"] is None
    passed += 1
    print("ok 3 - reference ranges are not taken as values")

    # 4. Missing values stay None, never guessed.
    r = parse_lab_text("Potassium\nRandom header text\nHemoglobin pending")
    assert all(v is None for v in r["values"].values()), r["values"]
    assert all(u is None for u in r["units"].values())
    assert r["date"] is None
    r = parse_lab_text("")
    assert r["values"] == {n: None for n in NUTRIENTS}
    assert r["raw_text"] == ""
    passed += 1
    print("ok 4 - missing values and empty text give null")

    # 5. Date formats to ISO.
    assert find_date("Date Collected: 11/08/2026") == "2026-11-08"
    assert find_date("Collected Nov 8, 2026") == "2026-11-08"
    assert find_date("Collected November 8, 2026") == "2026-11-08"
    assert find_date("Specimen 2026-11-08 08:00") == "2026-11-08"
    assert find_date("8 Nov 2026") == "2026-11-08"
    assert find_date("13/11/2026") == "2026-11-13"  # only unambiguous DD/MM
    assert find_date("Issued Feb 30, 2026") is None  # invalid date
    assert find_date("no date here") is None
    passed += 1
    print("ok 5 - date formats parse to ISO or null")

    # 6. Analytes do not bleed across columns on one line.
    r = parse_lab_text("Potassium Sodium 140 mmol/L")
    assert r["values"]["potassium"] is None
    assert r["values"]["sodium"] == 140
    passed += 1
    print("ok 6 - no value stolen from neighbouring analyte label")

    # 7. First occurrence wins; parenthesised symbol label still works.
    r = parse_lab_text("Creatinine 850 umol/L\nCreatinine 900 umol/L\nPotassium (K) 5.8 mmol/L")
    assert r["values"]["creatinine"] == 850
    assert r["values"]["potassium"] == 5.8
    passed += 1
    print("ok 7 - first occurrence wins, parenthesised label")

    # 8. OCR line grouping (no OCR engine needed; fake detections).
    fake = [
        [[[0, 0], [60, 0], [60, 10], [0, 10]], "Potassium", 0.9],
        [[[200, 2], [230, 2], [230, 12], [200, 12]], "mmol/L", 0.9],
        [[[100, 1], [130, 1], [130, 11], [100, 11]], "5.8", 0.9],
        [[[0, 30], [60, 30], [60, 40], [0, 40]], "Sodium", 0.9],
        [[[100, 31], [130, 31], [130, 41], [100, 41]], "138", 0.9],
    ]
    text = ocr_lines(fake)
    assert text.splitlines() == ["Potassium  5.8  mmol/L", "Sodium  138"], text
    assert parse_lab_text(text)["values"]["potassium"] == 5.8
    passed += 1
    print("ok 8 - OCR detections grouped into lines")

    print("ALL %d TESTS PASSED" % passed)
