// AVK AI Nieuws — Service Worker
const CACHE = 'avk-ai-nieuws-v1';
const STATIC = ['/', '/style.css', '/app.js', '/manifest.json', '/icon.svg'];

// Installeer: cache de statische bestanden
self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE).then(c => c.addAll(STATIC))
  );
  self.skipWaiting();
});

// Activeer: verwijder oude caches
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// Fetch: cache-first voor statische bestanden, network-first voor API
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;

  const url = new URL(e.request.url);

  // API calls nooit cachen
  if (url.pathname.startsWith('/api/')) return;

  // Externe URLs (fonts, etc.) gewoon doorsturen
  if (url.origin !== self.location.origin) return;

  e.respondWith(
    caches.match(e.request).then(hit => {
      if (hit) return hit;
      return fetch(e.request).then(res => {
        if (res.ok) {
          const clone = res.clone();
          caches.open(CACHE).then(c => c.put(e.request, clone));
        }
        return res;
      }).catch(() => {
        // Offline fallback: stuur hoofdpagina terug
        if (e.request.headers.get('accept').includes('text/html')) {
          return caches.match('/');
        }
      });
    })
  );
});
