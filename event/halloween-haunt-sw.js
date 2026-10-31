/*
 * BSMS Web
 * One-time cleanup for the retired Halloween Haunt service worker.
 */
self.addEventListener('install', event => event.waitUntil(self.skipWaiting()));
self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(key => key.startsWith('bsms-halloween-haunt-')).map(key => caches.delete(key)));
    await self.registration.unregister();
    const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    await Promise.all(clients.filter(client => new URL(client.url).pathname === '/event/halloween-haunt').map(client => client.navigate('/events')));
  })());
});
