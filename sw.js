// ControlCuentas Pro — Service Worker v2.3
const CACHE_NAME = 'controlcuentas-v2.3'
const BASE = '/Control-cuentas/';
const STATIC_CACHE = 'cc-static-v2.3';
const DATA_CACHE = 'cc-data-v2.3';

const STATIC_ASSETS = [
  './',
  './index.html',
  './manifest.json',
  'https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js',
  'https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js',
];

// Install: pre-cache static assets
self.addEventListener('install', (event) => {
  console.log('[SW] Installing ControlCuentas Pro v2.3');
  event.waitUntil(
    caches.open(STATIC_CACHE).then((cache) => {
      return cache.addAll(STATIC_ASSETS.filter(url => !url.startsWith('https://cdn')))
        .then(() => {
          // Try CDN assets separately — don't fail install if they're unavailable
          return Promise.allSettled(
            STATIC_ASSETS
              .filter(url => url.startsWith('https://cdn'))
              .map(url => cache.add(url).catch(() => {}))
          );
        });
    }).then(() => self.skipWaiting())
  );
});

// Activate: clean old caches
self.addEventListener('activate', (event) => {
  console.log('[SW] Activating ControlCuentas Pro v2.3');
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter(k => k !== STATIC_CACHE && k !== DATA_CACHE)
          .map(k => { console.log('[SW] Deleting old cache:', k); return caches.delete(k); })
      )
    ).then(() => self.clients.claim())
  );
});

// Fetch strategy: Cache-first for static, Network-first for API
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Skip non-GET & chrome-extension requests
  if (event.request.method !== 'GET' || url.protocol === 'chrome-extension:') return;

  // CDN / external: stale-while-revalidate
  if (url.origin !== location.origin) {
    event.respondWith(
      caches.match(event.request).then(cached => {
        const networkFetch = fetch(event.request).then(response => {
          if (response && response.status === 200) {
            const clone = response.clone();
            caches.open(STATIC_CACHE).then(cache => cache.put(event.request, clone));
          }
          return response;
        }).catch(() => cached);
        return cached || networkFetch;
      })
    );
    return;
  }

  // App shell & local: cache-first, fallback network
  event.respondWith(
    caches.match(event.request).then(cached => {
      if (cached) return cached;
      return fetch(event.request).then(response => {
        if (!response || response.status !== 200 || response.type === 'opaque') return response;
        const clone = response.clone();
        caches.open(STATIC_CACHE).then(cache => cache.put(event.request, clone));
        return response;
      }).catch(() => {
        // Fallback: return index.html for navigation
        if (event.request.mode === 'navigate') {
          return caches.match('./index.html');
        }
      });
    })
  );
});

// Background sync: retry pending saves
self.addEventListener('sync', (event) => {
  if (event.tag === 'cc-sync') {
    event.waitUntil(
      self.clients.matchAll().then(clients => {
        clients.forEach(client => client.postMessage({ type: 'SYNC_TRIGGERED' }));
      })
    );
  }
});

// Push notifications
self.addEventListener('push', (event) => {
  const data = event.data ? event.data.json() : {};
  event.waitUntil(
    self.registration.showNotification(data.title || 'ControlCuentas Pro', {
      body: data.body || 'Tienes una notificación pendiente',
      icon: './icons/icon-192x192.svg',
      badge: './icons/icon-72x72.svg',
      vibrate: [100, 50, 100],
      data: data,
      actions: [
        { action: 'open', title: 'Abrir app' },
        { action: 'dismiss', title: 'Ignorar' }
      ]
    })
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  if (event.action !== 'dismiss') {
    event.waitUntil(clients.openWindow('./index.html'));
  }
});

// Message handling
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
  if (event.data && event.data.type === 'GET_VERSION') {
    event.ports[0].postMessage({ version: CACHE_NAME });
  }
});
