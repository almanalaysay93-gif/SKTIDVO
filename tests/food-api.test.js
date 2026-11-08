/* FDC search request shape: POST JSON body (no dataType in the URL). Stub fetch. */
import { searchFdc } from '../js/food.js';
import { suite, eq } from './harness.js';

export async function runFoodApiTests() {
  suite('food-api');
  const real = globalThis.fetch;
  let seen;
  globalThis.fetch = async (url, init) => { seen = { url, init }; return { ok: true, status: 200, json: async () => ({ foods: [] }) }; };
  try {
    await searchFdc('rice', ' MYKEY ');
    const ok = seen.init.method === 'POST' && !seen.url.includes('dataType') && seen.url.endsWith('api_key=MYKEY')
      && JSON.parse(seen.init.body).dataType.join('|') === 'Foundation|SR Legacy|Survey (FNDDS)';
    const { test } = await import('./harness.js');
    test('searchFdc POSTs dataType in JSON body, trimmed key in URL', () => eq(ok, true));
    await searchFdc('rice', '');
    test('empty key falls back to DEMO_KEY', () => eq(seen.url.endsWith('api_key=DEMO_KEY'), true));
  } finally { globalThis.fetch = real; }
}