/* Legacy cleanup only: Halloween Haunt no longer supports offline play. */
self.addEventListener('install', event => { self.skipWaiting(); });
self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(key => key.startsWith('bsms-halloween-haunt-')).map(key => caches.delete(key)));
    await self.registration.unregister();
    await self.clients.claim();
  })());
});
