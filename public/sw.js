/*
 * SnapPath intentionally does not use an offline/PWA service worker.
 * This file exists to satisfy and clean up stale browser registrations from
 * older builds or cached clients that still request /sw.js.
 */

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    if (self.caches) {
      const cacheNames = await self.caches.keys();
      await Promise.all(cacheNames.map((cacheName) => self.caches.delete(cacheName)));
    }

    await self.registration.unregister();

    const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    await Promise.all(clients.map((client) => client.navigate(client.url)));
  })());
});

self.addEventListener('fetch', () => {
  // No-op: allow the browser/network to handle all requests.
});
