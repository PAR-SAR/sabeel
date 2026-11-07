// Sabeel service worker: keeps the app itself available offline.
// API calls to Anthropic/OpenAI are never cached.
const CACHE = 'sabeel-0.1.0';
const ASSETS = [
  './', './index.html', './manifest.webmanifest', './css/app.css',
  './js/app.js', './js/db.js', './js/providers.js', './js/md.js',
  './vendor/marked.umd.js', './vendor/purify.min.js',
  './fonts/readex-pro-latin-600-normal.woff2', './fonts/readex-pro-arabic-600-normal.woff2',
  './icons/icon-192.png', './icons/icon-512.png', './icons/maskable-512.png',
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

// Network first for the app's own files (so updates show up right away),
// falling back to the cached copy when offline.
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== self.location.origin) return;
  e.respondWith(
    fetch(e.request)
      .then(res => {
        if (res.ok) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(e.request, copy)); }
        return res;
      })
      .catch(() => caches.match(e.request).then(r => r || caches.match('./index.html'))),
  );
});
