#!/usr/bin/env node
// Module-structure check for js/. Verifies baseline symbol coverage, relative
// import resolution, import cycles and per-module line limits.
import { execSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const JS_DIR = path.join(REPO, 'js');
const BASELINE_REF = '59291b4:js/app.js';
const MAX_LINES = 400;

const BASELINE_RE = /^(?:const|let|function|async function)\s+([A-Za-z_$][\w$]*)/gm;
const DECL_RE = /^(?:export\s+)?(?:const|let|var|function|async function|class)\s+([A-Za-z_$][\w$]*)/gm;
const IMPORT_RE = /^\s*import\s+(?:[^'";]*?)\bfrom\s*['"]([^'"]+)['"]/gm;

const LINE_EXEMPT = new Set(['js/i18n.js']); // strings exempt per NFR001
const LINE_KNOWN = new Set(['js/store.js', 'js/views/diet.js']); // pre-existing, unchanged
const IGNORE = new Set(['js/diet-view.js']); // re-export shim

const failures = [];
const warnings = [];
const notes = [];

const rel = (p) => path.relative(REPO, p).split(path.sep).join('/');

function walk(dir) {
  const out = [];
  for (const ent of readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) out.push(...walk(p));
    else if (ent.isFile() && ent.name.endsWith('.js')) out.push(p);
  }
  return out;
}

function lineCount(src) {
  const n = src.split(/\r?\n/).length;
  return src.endsWith('\n') ? n - 1 : n;
}

// 1. Baseline symbols
let baselineSrc;
try {
  baselineSrc = execSync(`git show ${BASELINE_REF}`, {
    cwd: REPO,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  });
} catch (err) {
  console.error(`FATAL: cannot read baseline ${BASELINE_REF}: ${err.message}`);
  process.exit(1);
}
const baseline = new Set([...baselineSrc.matchAll(BASELINE_RE)].map((m) => m[1]));

// 2. Module scan
const modules = walk(JS_DIR)
  .map((abs) => ({ abs, rel: rel(abs) }))
  .filter((f) => !IGNORE.has(f.rel))
  .sort((a, b) => a.rel.localeCompare(b.rel));

const declared = new Map(); // name -> Set(rel)
const sources = new Map();
for (const f of modules) {
  const src = readFileSync(f.abs, 'utf8');
  sources.set(f.rel, src);
  for (const m of src.matchAll(DECL_RE)) {
    if (!declared.has(m[1])) declared.set(m[1], new Set());
    declared.get(m[1]).add(f.rel);
  }
}

// 3. Baseline symbol ownership
let symbolOk = 0;
for (const name of [...baseline].sort()) {
  // views/diet.js was never part of app.js (moved diet-view.js); its closure-local names don't count.
  const owners = [...(declared.get(name) ?? [])].filter(f => f !== 'js/views/diet.js' || name === 'Diet');
  if (owners.length === 0) {
    failures.push(`MISSING symbol '${name}' (baseline app.js) not declared in any js/ module`);
  } else if (owners.length > 1) {
    failures.push(`DUPLICATE symbol '${name}' declared in: ${owners.join(', ')}`);
  } else {
    symbolOk++;
  }
}

// 4. Import resolution + graph
const graph = new Map();
let importCount = 0;
for (const f of modules) {
  const deps = [];
  for (const m of sources.get(f.rel).matchAll(IMPORT_RE)) {
    const spec = m[1];
    if (!spec.startsWith('./') && !spec.startsWith('../')) continue;
    importCount++;
    const target = path.resolve(path.dirname(f.abs), spec);
    if (!existsSync(target) || !statSync(target).isFile()) {
      failures.push(`UNRESOLVED import in ${f.rel}: '${spec}'`);
      continue;
    }
    deps.push(rel(target));
  }
  graph.set(f.rel, deps);
}

// Cycle detection (DFS)
const cycles = [];
const cycleKeys = new Set();
const state = new Map(); // 1 = on stack, 2 = done
const stack = [];
function dfs(node) {
  state.set(node, 1);
  stack.push(node);
  for (const dep of graph.get(node) ?? []) {
    if (state.get(dep) === 1) {
      const cyc = [...stack.slice(stack.indexOf(dep)), dep];
      const key = [...new Set(cyc)].sort().join('|');
      if (!cycleKeys.has(key)) {
        cycleKeys.add(key);
        cycles.push(cyc);
      }
    } else if (!state.get(dep)) {
      dfs(dep);
    }
  }
  stack.pop();
  state.set(node, 2);
}
for (const f of modules) if (!state.get(f.rel)) dfs(f.rel);
for (const cyc of cycles) failures.push(`CYCLE: ${cyc.join(' -> ')}`);

// 5. Line limits
const lineReport = [];
for (const f of modules) {
  const lines = lineCount(sources.get(f.rel));
  lineReport.push(`${String(lines).padStart(5)}  ${f.rel}`);
  if (lines <= MAX_LINES) continue;
  if (LINE_EXEMPT.has(f.rel)) {
    notes.push(`EXEMPT ${f.rel}: ${lines} lines (strings exempt, NFR001)`);
  } else if (LINE_KNOWN.has(f.rel)) {
    warnings.push(`KNOWN (pre-existing, unchanged code) ${f.rel}: ${lines} lines (> ${MAX_LINES})`);
  } else {
    failures.push(`LINES ${f.rel}: ${lines} lines (> ${MAX_LINES})`);
  }
}

// 6. Summary
console.log('Module line counts:');
console.log(lineReport.join('\n'));
console.log('');
if (notes.length) console.log(`Notes:\n  ${notes.join('\n  ')}\n`);
if (warnings.length) console.log(`Warnings:\n  ${warnings.join('\n  ')}\n`);
if (failures.length) console.log(`Failures:\n  ${failures.join('\n  ')}\n`);

console.log('Summary:');
console.log(`  baseline symbols: ${baseline.size} (ok: ${symbolOk})`);
console.log(`  modules scanned:  ${modules.length}`);
console.log(`  relative imports: ${importCount}`);
console.log(`  cycles:           ${cycles.length}`);
console.log(`  warnings:         ${warnings.length}`);
console.log(`  failures:         ${failures.length}`);
console.log(failures.length ? 'RESULT: FAIL' : 'RESULT: PASS');

process.exit(failures.length ? 1 : 0);
