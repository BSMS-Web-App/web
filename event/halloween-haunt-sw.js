/*
 * BSMS Web
 * Copyright © 2026 Jellyfish Jelly
 * SPDX-License-Identifier: MIT
 */
/* Halloween Haunt-only offline cache. */
const CACHE_NAME = 'bsms-halloween-haunt-v8';
const CORE_ASSETS = [
  '/event/halloween-haunt.html',
  '/css/styles.css',
  '/css/halloween-haunt.css',
  '/js/halloween-haunt.js',
  '/js/halloween-haunt-page.js',
  '/js/halloween-haunt-offline.js',
  '/js/halloween-haunt-redesign.js',
  '/js/ban-check.js',
  '/js/account-check.js',
  '/img/icon.png',
  '/img/halloween-haunt-event/candy/candy-corn.png',
  '/img/halloween-haunt-event/candy/smarties.png',
  '/img/halloween-haunt-event/candy/tootsie-roll.png',
  '/img/halloween-haunt-event/candy/whoppers.jpeg.png',
  '/img/halloween-haunt-event/candy/milk-duds.png',
  '/img/halloween-haunt-event/candy/mounds.png',
  '/img/halloween-haunt-event/candy/3-musketeers.png',
  '/img/halloween-haunt-event/candy/milky-way.png',
  '/img/halloween-haunt-event/candy/mr-goodbar.png',
  '/img/halloween-haunt-event/candy/almond-joy.png',
  '/img/halloween-haunt-event/candy/baby-ruth.png',
  '/img/halloween-haunt-event/candy/tootsie-pop.png',
  '/img/halloween-haunt-event/candy/jolly-ranchers.png',
  '/img/halloween-haunt-event/candy/twizzlers.png',
  '/img/halloween-haunt-event/candy/hersheys.png',
  '/img/halloween-haunt-event/candy/m-ms.png',
  '/img/halloween-haunt-event/candy/skittles.png',
  '/img/halloween-haunt-event/candy/airheads.png',
  '/img/halloween-haunt-event/candy/swedish-fish.png',
  '/img/halloween-haunt-event/candy/york.png',
  '/img/halloween-haunt-event/candy/crunch.png',
  '/img/halloween-haunt-event/candy/butter-finger.png',
  '/img/halloween-haunt-event/candy/startburst.png',
  '/img/halloween-haunt-event/candy/kitkat.png',
  '/img/halloween-haunt-event/candy/snickers.png',
  '/img/halloween-haunt-event/candy/sour-patch-kids.png',
  '/img/halloween-haunt-event/candy/100-grand.png',
  '/img/halloween-haunt-event/candy/twix.png',
  '/img/halloween-haunt-event/candy/reeses.png'
];

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    await Promise.all(CORE_ASSETS.map(async path => {
      try {
        const response = await fetch(path, { cache: 'reload' });
        if (response.ok && response.type === 'basic') await cache.put(path, response);
      } catch (_) {
        // Keep installing even if a nonessential image is temporarily unavailable.
      }
    }));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(key => key.startsWith('bsms-halloween-haunt-') && key !== CACHE_NAME).map(key => caches.delete(key)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // Never serve or cache API responses from this static-asset worker.
  if (url.pathname === '/api' || url.pathname.startsWith('/api/')) return;

  if (request.mode === 'navigate' &&
      (url.pathname === '/event/halloween-haunt.html' || url.pathname === '/event/halloween-haunt')) {
    event.respondWith((async () => {
      try {
        const response = await fetch(request);
        if (response.ok) {
          const cache = await caches.open(CACHE_NAME);
          cache.put('/event/halloween-haunt.html', response.clone());
        }
        return response;
      } catch (_) {
        return (await caches.match('/event/halloween-haunt.html')) || Response.error();
      }
    })());
    return;
  }

  event.respondWith((async () => {
    const cached = await caches.match(request, { ignoreSearch: true });
    if (cached) return cached;
    try {
      const response = await fetch(request);
      if (response.ok && response.type === 'basic' &&
          (url.pathname.startsWith('/js/halloween-haunt') ||
           url.pathname.startsWith('/img/halloween-haunt-event/candy/'))) {
        const cache = await caches.open(CACHE_NAME);
        cache.put(request, response.clone());
      }
      return response;
    } catch (_) {
      return Response.error();
    }
  })());
});
