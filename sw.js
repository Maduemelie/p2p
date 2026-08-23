/**
 * Bybit NGN P2P Trade Tracker — Service Worker
 * Provides offline shell caching and network fallback
 */

const CACHE_NAME = 'bybit-p2p-v8';
const STATIC_ASSETS = [
  './',
  './index.html',
  './css/styles.css?v=2.5',
  './js/app.js',
  './js/views/pricing.view.js',
  './js/pricing.js',
  './manifest.json',
  './icons/icon.svg',
  './icons/icon-192.png',
  './icons/icon-512.png'
];

// Install Event — pre-cache core app shell
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('[SW] Pre-caching offline app shell');
      return cache.addAll(STATIC_ASSETS).catch((err) => {
        console.warn('[SW] Pre-cache warning (some assets may be created at runtime):', err);
      });
    }).then(() => self.skipWaiting())
  );
});

// Activate Event — purge outdated caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((name) => {
          if (name !== CACHE_NAME) {
            console.log('[SW] Clearing old cache:', name);
            return caches.delete(name);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// Fetch Event — Network First for local assets, Cache First for external CDN assets
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;

  const requestUrl = new URL(event.request.url);
  const isLocalAsset = requestUrl.origin === self.location.origin;

  if (isLocalAsset) {
    // Network-First Strategy for local files (always load latest when online)
    event.respondWith(
      fetch(event.request)
        .then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200) {
            const responseClone = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(event.request, responseClone);
            });
          }
          return networkResponse;
        })
        .catch(() => {
          // Offline fallback
          return caches.match(event.request).then((cachedResponse) => {
            if (cachedResponse) return cachedResponse;
            if (event.request.headers.get('accept')?.includes('text/html')) {
              return caches.match('./index.html');
            }
          });
        })
    );
  } else {
    // Cache-First Strategy for static external libraries & CDNs
    event.respondWith(
      caches.match(event.request).then((cachedResponse) => {
        if (cachedResponse) {
          return cachedResponse;
        }

        return fetch(event.request)
          .then((networkResponse) => {
            if (networkResponse && networkResponse.status === 200) {
              const url = event.request.url;
              if (
                url.includes('fonts.googleapis.com') ||
                url.includes('fonts.gstatic.com') ||
                url.includes('unpkg.com/lucide') ||
                url.includes('cdn.jsdelivr.net')
              ) {
                const responseClone = networkResponse.clone();
                caches.open(CACHE_NAME).then((cache) => {
                  cache.put(event.request, responseClone);
                });
              }
            }
            return networkResponse;
          });
      })
    );
  }
});
