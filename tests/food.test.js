/* ===================================================================
   Tests for food.js — FDC and Open Food Facts parsing, unit conversion,
   portion scaling and daily totals.

   Fixtures are hand-written, minimal and use round numbers on purpose.
   They exercise the shapes and units; they are not nutrition data.
   =================================================================== */

import * as F from '../js/food.js';
import { suite, test, eq, near } from './harness.js';

/* ---------- fixtures ---------- */

/* Search-result shape: nutrientNumber / nutrientName / unitName / value. */
function fdcFood(nutrients, extra = {}) {
  return { fdcId: 999001, description: 'Test food, raw', dataType: 'SR Legacy', foodNutrients: nutrients, ...extra };
}
const FDC_FULL = fdcFood([
  { nutrientId: 1093, nutrientName: 'Sodium, Na',     nutrientNumber: '307', unitName: 'MG', value: 20 },
  { nutrientId: 1092, nutrientName: 'Potassium, K',   nutrientNumber: '306', unitName: 'MG', value: 300 },
  { nutrientId: 1091, nutrientName: 'Phosphorus, P',  nutrientNumber: '305', unitName: 'MG', value: 50 },
  { nutrientId: 1003, nutrientName: 'Protein',        nutrientNumber: '203', unitName: 'G',  value: 4 },
  { nutrientId: 1051, nutrientName: 'Water',          nutrientNumber: '255', unitName: 'G',  value: 80 },
  { nutrientId: 1062, nutrientName: 'Energy',         nutrientNumber: '268', unitName: 'KJ', value: 418 },
  { nutrientId: 1008, nutrientName: 'Energy',         nutrientNumber: '208', unitName: 'KCAL', value: 100 },
]);

/* OFF product shape: nutriments in grams per 100 g. */
const OFF_FULL = {
  code: '4800000000017',
  product_name: 'Test crackers',
  brands: 'Testbrand',
  nutriments: { sodium_100g: 0.4, potassium_100g: 0.2, phosphorus_100g: 0.1, proteins_100g: 8, 'energy-kcal_100g': 450 },
};

/* ---------- suites ---------- */

export function runFoodTests() {

  /* ---------- FDC parsing ---------- */
  suite('food: FDC parsing');

  test('maps name, source and ref', () => {
    const item = F.parseFdcFood(FDC_FULL);
    eq(item.name, 'Test food, raw');
    eq(item.source, 'fdc');
    eq(item.ref, '999001', 'ref is stored as a string: ');
  });

  test('reads all five nutrients plus kcal by nutrient number', () => {
    const p = F.parseFdcFood(FDC_FULL).per100;
    eq(Object.keys(p).sort().join(','), 'k,kcal,na,p,protein,water');
    near(p.na, 20);
    near(p.k, 300);
    near(p.p, 50);
    near(p.protein, 4);
    near(p.water, 80);
  });

  test('kcal reads energy 208 in kcal, not the kJ row', () => {
    near(F.parseFdcFood(FDC_FULL).per100.kcal, 100);
  });

  test('kcal matches nutrientId 1008 when the number is missing', () => {
    const f = fdcFood([{ nutrientId: 1008, nutrientName: 'Energy', unitName: 'KCAL', value: 52 }]);
    near(F.parseFdcFood(f).per100.kcal, 52);
  });

  test('energy only in kJ gives kcal null', () => {
    const f = fdcFood([{ nutrientId: 1062, nutrientName: 'Energy', nutrientNumber: '268', unitName: 'KJ', value: 418 }]);
    eq(F.parseFdcFood(f).per100.kcal, null);
  });

  test('no energy row gives kcal null', () => {
    eq(F.parseFdcFood(fdcFood([])).per100.kcal, null);
  });

  test('a mg mineral is left in mg', () => {
    near(F.parseFdcFood(FDC_FULL).per100.na, 20);
  });

  test('a gram mineral is converted to mg', () => {
    const food = fdcFood([{ nutrientNumber: '307', nutrientName: 'Sodium, Na', unitName: 'G', value: 0.5 }]);
    near(F.parseFdcFood(food).per100.na, 500);
  });

  test('a microgram mineral is converted to mg', () => {
    const food = fdcFood([{ nutrientNumber: '306', nutrientName: 'Potassium, K', unitName: 'UG', value: 2000 }]);
    near(F.parseFdcFood(food).per100.k, 2);
  });

  test('a mg protein is converted to g', () => {
    const food = fdcFood([{ nutrientNumber: '203', nutrientName: 'Protein', unitName: 'MG', value: 250 }]);
    near(F.parseFdcFood(food).per100.protein, 0.25);
  });

  test('a microgram protein is converted to g', () => {
    const food = fdcFood([{ nutrientNumber: '203', nutrientName: 'Protein', unitName: 'UG', value: 250000 }]);
    near(F.parseFdcFood(food).per100.protein, 0.25);
  });

  test('an unknown unit gives null rather than a guess', () => {
    const food = fdcFood([{ nutrientNumber: '307', nutrientName: 'Sodium, Na', unitName: 'IU', value: 5 }]);
    eq(F.parseFdcFood(food).per100.na, null);
  });

  test('a missing unit gives null', () => {
    const food = fdcFood([{ nutrientNumber: '307', nutrientName: 'Sodium, Na', value: 5 }]);
    eq(F.parseFdcFood(food).per100.na, null);
  });

  test('a nutrient with no value gives null', () => {
    const food = fdcFood([{ nutrientNumber: '307', nutrientName: 'Sodium, Na', unitName: 'MG', value: null }]);
    eq(F.parseFdcFood(food).per100.na, null);
  });

  test('a nutrient absent from the record gives null', () => {
    eq(F.parseFdcFood(fdcFood([])).per100.water, null);
  });

  test('falls back to the nutrient name when the number is missing', () => {
    const food = fdcFood([
      { nutrientName: 'Phosphorus, P', unitName: 'MG', value: 70 },
      { nutrientName: 'Potassium', unitName: 'MG', value: 150 },
    ]);
    const p = F.parseFdcFood(food).per100;
    near(p.p, 70);
    near(p.k, 150);
  });

  test('reads the detail-endpoint shape (nested nutrient, amount)', () => {
    const food = fdcFood([
      { nutrient: { number: '306', name: 'Potassium, K', unitName: 'MG' }, amount: 123 },
    ]);
    near(F.parseFdcFood(food).per100.k, 123);
  });

  test('a record with no description is dropped', () => {
    eq(F.parseFdcFood(fdcFood([], { description: '   ' })), null);
    eq(F.parseFdcFood(null), null);
  });

  /* ---------- OFF parsing ---------- */
  suite('food: OFF parsing');

  test('maps name, source and ref from the barcode', () => {
    const item = F.parseOffProduct(OFF_FULL);
    eq(item.name, 'Test crackers');
    eq(item.source, 'off');
    eq(item.ref, '4800000000017');
  });

  test('converts g per 100 g to mg for sodium, potassium and phosphorus', () => {
    const p = F.parseOffProduct(OFF_FULL).per100;
    near(p.na, 400);
    near(p.k, 200);
    near(p.p, 100);
  });

  test('protein is already in g and passes through', () => {
    near(F.parseOffProduct(OFF_FULL).per100.protein, 8);
  });

  test('kcal is read from energy-kcal_100g', () => {
    near(F.parseOffProduct(OFF_FULL).per100.kcal, 450);
  });

  test('kcal absent from the product gives null', () => {
    eq(F.parseOffProduct({ code: '1', product_name: 'Bare', nutriments: { 'energy-kj_100g': 100 } }).per100.kcal, null);
  });

  test('water absent from the product gives null', () => {
    eq(F.parseOffProduct(OFF_FULL).per100.water, null);
  });

  test('a product with no nutriments block still parses, all null', () => {
    const item = F.parseOffProduct({ code: '1', product_name: 'Bare' });
    eq(item.name, 'Bare');
    eq(item.per100.na, null);
    eq(item.per100.protein, null);
  });

  test('a product with no name is dropped', () => {
    eq(F.parseOffProduct({ code: '1', product_name: '', nutriments: {} }), null);
    eq(F.parseOffProduct(null), null);
  });

  /* ---------- scale ---------- */
  suite('food: scale');

  const PER100 = { na: 400, k: 200, p: 100, protein: 10, water: null };

  test('scales per-100 g values to the portion', () => {
    const s = F.scale(PER100, 150);
    near(s.na, 600);
    near(s.k, 300);
    near(s.p, 150);
    near(s.protein, 15);
  });

  test('a null nutrient stays null', () => {
    eq(F.scale(PER100, 150).water, null);
  });

  test('zero grams gives zero, not null', () => {
    eq(F.scale(PER100, 0).na, 0);
  });

  test('no per-100 record gives all nulls', () => {
    const s = F.scale(null, 100);
    eq(s.na, null);
    eq(s.water, null);
  });

  /* ---------- sumDay ---------- */
  suite('food: sumDay');

  test('sums the scaled values of every entry', () => {
    const { totals } = F.sumDay([
      { grams: 100, per100: { na: 100, k: 200, p: 50, protein: 5, water: 80 } },
      { grams: 50,  per100: { na: 200, k: 0,   p: 10, protein: 2, water: 40 } },
    ]);
    near(totals.na, 200);
    near(totals.k, 200);
    near(totals.p, 55);
    near(totals.protein, 6);
    near(totals.water, 100);
  });

  test('a null nutrient is skipped and counted as missing', () => {
    const { totals, missing } = F.sumDay([
      { grams: 100, per100: { na: 100, k: 200, p: 50, protein: 5, water: 80 } },
      { grams: 100, per100: { na: 100, k: 200, p: 50, protein: 5, water: null } },
    ]);
    near(totals.water, 80, 0.001, 'only the known entry counts: ');
    eq(missing.water, 1);
    eq(missing.na, 0);
  });

  test('when no entry states a nutrient the total is null, not zero', () => {
    const { totals, missing } = F.sumDay([
      { grams: 100, per100: { na: 100, k: 200, p: 50, protein: 5, water: null } },
      { grams: 30,  per100: { na: 10,  k: 20,  p: 5,  protein: 1, water: null } },
    ]);
    eq(totals.water, null);
    eq(missing.water, 2);
  });

  test('an empty day gives zero totals and zero missing', () => {
    const { totals, missing } = F.sumDay([]);
    eq(totals.na, 0);
    eq(totals.water, 0);
    eq(missing.na, 0);
  });

  test('a null entry in the list is ignored', () => {
    const { totals, missing } = F.sumDay([
      null,
      { grams: 100, per100: { na: 100, k: 0, p: 0, protein: 0, water: 0 } },
    ]);
    near(totals.na, 100);
    eq(missing.na, 0);
  });

  test('kcal is scaled, summed and counted as missing like other nutrients', () => {
    const { totals, missing } = F.sumDay([
      { grams: 150, per100: { na: 1, k: 1, p: 1, protein: 1, water: 1, kcal: 200 } },
      { grams: 50,  per100: { na: 1, k: 1, p: 1, protein: 1, water: 1, kcal: null } },
      { grams: 100, per100: { na: 1, k: 1, p: 1, protein: 1, water: 1 } },
    ]);
    near(totals.kcal, 300);
    eq(missing.kcal, 2);
    near(F.scale({ kcal: 80 }, 50).kcal, 40);
  });

  test('a non-array input is treated as an empty day', () => {
    const { totals } = F.sumDay(undefined);
    eq(totals.na, 0);
  });
}
