const store = new Map();
globalThis.localStorage = { getItem: k => store.has(k) ? store.get(k) : null, setItem: (k, v) => store.set(k, String(v)), removeItem: k => store.delete(k), clear: () => store.clear(), get length() { return store.size; }, key: i => [...store.keys()][i] ?? null };
globalThis.navigator ??= {};
const root = new URL('./', import.meta.url).href;
const h = await import(new URL('harness.js', root).href);
h.resetResults();
for (const [f, fn] of [['math.test.js','runMathTests'],['calendar.test.js','runCalendarTests'],['food.test.js','runFoodTests'],['limits.test.js','runLimitsTests'],['backup.test.js','runBackupTests'],['today.test.js','runTodayTests'],['sw.test.js','runSwTests'],['sync-queue.test.js','runSyncQueueTests'],['sync-merge.test.js','runSyncMergeTests'],['migrate-v2.test.js','runMigrateV2Tests'],['apps-script.test.js','runAppsScriptTests']]) {
  try { const m = await import(new URL(f, root).href); await m[fn](); } catch (e) { console.log('SUITE ERROR', f, e.message); }
}
const failed = h.results.filter(r => !r.ok);
for (const r of failed) console.log('FAIL', `[${r.suite}] ${r.name}\n   ${r.msg}`);
console.log(`${h.results.length - failed.length}/${h.results.length} passed`);
process.exitCode = failed.length ? 1 : 0;
