/* Halloween Haunt offline application shell and static-asset cache. */
const CACHE_NAME='bsms-halloween-haunt-v4';
const SHELL=[
  '/event/halloween-haunt.html',
  '/css/styles.css',
  '/css/halloween-haunt.css',
  '/css/halloween-haunt-save.css',
  '/js/halloween-haunt-page.js',
  '/js/halloween-haunt.js',
  '/js/halloween-haunt-redesign.js'
];
self.addEventListener('install',event=>event.waitUntil((async()=>{
  const cache=await caches.open(CACHE_NAME);
  await Promise.all(SHELL.map(async url=>{try{const response=await fetch(url,{cache:'reload'});if(response.ok)await cache.put(url,response);}catch(_){}}));
  await self.skipWaiting();
})()));
self.addEventListener('activate',event=>event.waitUntil((async()=>{
  const keys=await caches.keys();
  await Promise.all(keys.filter(key=>key.startsWith('bsms-halloween-haunt-')&&key!==CACHE_NAME).map(key=>caches.delete(key)));
  await self.clients.claim();
})()));
self.addEventListener('fetch',event=>{
  const request=event.request;
  if(request.method!=='GET')return;
  const url=new URL(request.url);
  if(url.origin!==self.location.origin||url.pathname.startsWith('/api/'))return;
  if(request.mode==='navigate'){
    event.respondWith((async()=>{
      try{
        const response=await fetch(request);
        if(response.ok){const cache=await caches.open(CACHE_NAME);cache.put('/event/halloween-haunt.html',response.clone());}
        return response;
      }catch(_){
        const cache=await caches.open(CACHE_NAME);
        return await cache.match(request,{ignoreSearch:true})||await cache.match('/event/halloween-haunt.html')||new Response('You are offline. Reopen Halloween Haunt after visiting it online once, then import your encrypted save file.',{status:503,headers:{'Content-Type':'text/plain;charset=utf-8'}});
      }
    })());
    return;
  }
  if(/\.(?:css|js|png|jpe?g|webp|svg|woff2?|ttf|ico)$/i.test(url.pathname)){
    event.respondWith((async()=>{
      const cache=await caches.open(CACHE_NAME),cached=await cache.match(request);
      if(cached)return cached;
      try{const response=await fetch(request);if(response.ok)cache.put(request,response.clone());return response;}catch(_){return new Response('',{status:504,statusText:'Offline asset unavailable'});}
    })());
  }
});
