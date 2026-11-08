/* ===================================================================
   Service worker — app shell cache.
   The point of this app is that it works with the radio off, so every
   file it needs is cached on first visit and served cache-first after.
   Bump CACHE on every release or patients keep the old shell.
   =================================================================== */

const CACHE = 'sktidvo-v31';

// Every module in the tree must be here (tests/sw.test.js checks it).
const SHELL = [
  './',
  './index.html',
  './manifest.webmanifest',
  './css/tokens.css',
  './css/base.css',
  './css/layout.css',
  './css/components.css',
  './css/views.css',
  './css/print.css',
  './js/auth/gis.js',
  './js/auth/session.js',
  './js/calendar.js',
  './js/diet-view.js',
  './js/events.js',
  './js/features/backup.js',
  './js/features/cal-export.js',
  './js/features/install.js',
  './js/features/installPopup.js',
  './js/features/print.js',
  './js/food.js',
  './js/i18n.js',
  './js/limits.js',
  './js/main.js',
  './js/router.js',
  './js/sheets/calibrate.js',
  './js/sheets/drink.js',
  './js/sheets/hdbp.js',
  './js/sheets/medication.js',
  './js/sheets/session.js',
  './js/sheets/weight.js',
  './js/store.js',
  './js/sync/api.js',
  './js/sync/client.js',
  './js/sync/config.js',
  './js/sync/engine.js',
  './js/sync/merge.js',
  './js/sync/meta.js',
  './js/sync/queue.js',
  './js/ui/charts.js',
  './js/ui/format.js',
  './js/ui/icons.js',
  './js/ui/sheet.js',
  './js/ui/theme.js',
  './js/ui/toast.js',
  './js/views/diet.js',
  './js/views/fluid.js',
  './js/views/meds.js',
  './js/views/session.js',
  './js/views/settings.js',
  './js/views/sync.js',
  './js/views/today.js',
  './js/views/weight.js',
  './js/views/welcome.js',
  './assets/icon.svg',
  './assets/icon-maskable.svg',
  './assets/icon-512.png',
  './assets/icon-maskable-512.png',
  './assets/logo.png',
  './assets/skti-building-welcome.jpg'
];

const FOOD_ORIGINS = ['https://api.nal.usda.gov', 'https://world.openfoodfacts.org'];
// Sign-in + sync are live and authenticated: never cached (plan §14.8, T062).
const GOOGLE_ORIGINS = ['https://accounts.google.com', 'https://script.google.com',
  'https://script.googleusercontent.com', 'https://oauth2.googleapis.com'];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE)
      // cache:'reload' bypasses the browser's own HTTP cache — c.add()
      // alone can hand a version bump a stale file straight out of that
      // cache, silently undoing the bump. addAll rejects the whole batch
      // if one file 404s (assets/logo.png is optional), so cache each
      // file independently.
      .then(c => Promise.all(SHELL.map(url =>
        fetch(url, { cache: 'reload' }).then(res => res.ok && c.put(url, res)).catch(() => {}))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);

  // Food search is live data: network-only. The app keeps its own food
  // cache in localStorage, so offline search still works (FR009).
  if (FOOD_ORIGINS.includes(url.origin)) return;
  if (GOOGLE_ORIGINS.includes(url.origin)) return;

  // Google Fonts are a nicety. Cache them opportunistically; never block on them.
  const sameOrigin = url.origin === location.origin;

  e.respondWith(
    caches.match(req).then(hit => {
      if (hit) return hit;
      return fetch(req)
        .then(res => {
          if (res.ok && (sameOrigin || res.type === 'cors' || res.type === 'opaque')) {
            const copy = res.clone();
            caches.open(CACHE).then(c => c.put(req, copy)).catch(() => {});
          }
          return res;
        })
        .catch(() => {
          // Offline navigation falls back to the shell.
          if (req.mode === 'navigate') return caches.match('./index.html');
          return new Response('', { status: 504, statusText: 'Offline' });
        });
    })
  );
});
