/* TuitionMitra service worker — cache-first app shell for offline use */
const CACHE = 'tuitionmitra-v2';
const ASSETS = [
  './',
  './index.html',
  './css/style.css',
  './js/config.js',
  './js/data.js',
  './js/app.js',
  './manifest.json',
  './offline.html',
  './icons/icon-192.png',
  './icons/icon-512.png',
];
// Note: the app shell (HTML/CSS/JS) caches for offline use, but live data
// now lives in a shared Supabase database — booking/search/dashboard data
// itself requires a network connection. This is the necessary trade-off of
// moving from per-device demo storage to a real shared backend.

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(ASSETS)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;

  e.respondWith(
    caches.match(e.request).then((cached) => {
      const fetchPromise = fetch(e.request)
        .then((networkResponse) => {
          // Cache same-origin and font assets for next time we're offline
          if (networkResponse && networkResponse.status === 200) {
            const copy = networkResponse.clone();
            caches.open(CACHE).then((cache) => cache.put(e.request, copy));
          }
          return networkResponse;
        })
        .catch(() => {
          if (e.request.mode === 'navigate') return caches.match('./offline.html');
          return cached;
        });
      // Cache-first for speed & offline reliability, fall back to network
      return cached || fetchPromise;
    })
  );
});
