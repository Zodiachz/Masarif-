// Offline support: serve the app shell from cache, refresh it in the background.
const CACHE = 'masarif-v2.0.0';
const SHELL = [
  './',
  'index.html',
  'css/styles.css',
  'js/i18n.js',
  'js/logic.js',
  'js/chart.js',
  'js/app.js',
  'locales/en.js',
  'locales/ar.js',
  'locales/es.js',
  'locales/fr.js',
  'locales/de.js',
  'locales/it.js',
  'locales/pt.js',
  'locales/tr.js',
  'icons/icon.svg',
  'icons/icon-192.png',
  'manifest.webmanifest',
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET' || new URL(event.request.url).origin !== location.origin) return;
  event.respondWith(
    caches.match(event.request).then((cached) => {
      const network = fetch(event.request)
        .then((res) => {
          if (res.ok) {
            const copy = res.clone();
            caches.open(CACHE).then((cache) => cache.put(event.request, copy));
          }
          return res;
        })
        .catch(() => cached);
      return cached || network;
    })
  );
});
