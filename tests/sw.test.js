/* Tests for sw.js SHELL completeness â€” FR003 / T027. Node-only (reads files). */

import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { suite, test, eq } from './harness.js';

const root = new URL('../', import.meta.url);
const read = p => readFileSync(new URL(p, root), 'utf8');

function walk(dir) {
  const out = [];
  for (const name of readdirSync(new URL(dir, root))) {
    const rel = dir + name;
    if (statSync(new URL(rel, root)).isDirectory()) out.push(...walk(rel + '/'));
    else out.push(rel);
  }
  return out;
}

export function runSwTests() {
  suite('sw');
  const src = read('sw.js');
  const shell = [...src.match(/const SHELL = \[([\s\S]*?)\];/)[1].matchAll(/'([^']+)'/g)].map(m => m[1]);
  const has = p => shell.includes('./' + p);

  test('cache name bumped to sktidvo-v17', () => eq(/const CACHE = 'sktidvo-v17'/.test(src), true));
  test('SHELL has ./, index.html, manifest', () => {
    eq(shell.includes('./'), true); eq(has('index.html'), true); eq(has('manifest.webmanifest'), true);
  });
  test('SHELL lists every js/**/*.js', () => {
    const missing = walk('js/').filter(f => f.endsWith('.js') && !has(f));
    eq(missing.join(), '');
  });
  test('SHELL lists every css/*.css', () => {
    const missing = walk('css/').filter(f => f.endsWith('.css') && !has(f));
    eq(missing.join(), '');
  });
  test('SHELL lists assets referenced by index.html and manifest', () => {
    const refs = new Set([...read('index.html').matchAll(/(assets\/[\w.-]+)/g), ...read('manifest.webmanifest').matchAll(/(assets\/[\w.-]+)/g)].map(m => m[1]));
    eq([...refs].filter(r => !has(r)).join(), '');
  });
  test('every SHELL entry exists on disk', () => {
    eq(shell.filter(p => p !== './' && !existsSync(new URL(p.slice(2), root))).join(), '');
  });
  test('index.html links every css file and loads js/main.js', () => {
    const html = read('index.html');
    eq(walk('css/').filter(f => f.endsWith('.css') && !html.includes(`href="${f}"`)).join(), '');
    eq(html.includes('src="js/main.js"'), true);
  });
  test('T062 Google sign-in/sync origins are network-only (never cached)', () => {
    eq(/GOOGLE_ORIGINS\.includes\(url\.origin\)\) return;/.test(src), true);
    for (const o of ['https://accounts.google.com', 'https://script.google.com', 'https://script.googleusercontent.com', 'https://oauth2.googleapis.com'])
      eq(src.includes(`'${o}'`), true, o + ' ');
  });
  test('T062 CSP: GIS scoped to /gsi/, Apps Script + redirect host in connect-src, no unsafe-eval', () => {
    const csp = read('index.html').match(/Content-Security-Policy" content="([^"]+)"/)[1];
    eq(/script-src 'self' https:\/\/accounts\.google\.com\/gsi\/client;/.test(csp), true);
    eq(/frame-src https:\/\/accounts\.google\.com\/gsi\/;/.test(csp), true);
    eq(/connect-src[^;]*https:\/\/script\.google\.com[^;]*https:\/\/script\.googleusercontent\.com[^;]*https:\/\/accounts\.google\.com\/gsi\//.test(csp), true);
    eq(csp.includes('unsafe-eval'), false);
  });
  test('food APIs are network-only', () => {
    eq(/FOOD_ORIGINS\.includes\(url\.origin\)\) return;/.test(src), true);
  });
}
