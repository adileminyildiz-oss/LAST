var CACHE='last-v69';
var ASSETS=['./','./index.html','./manifest.webmanifest','./icon-192.png','./icon-512.png','./icon-512-maskable.png'];
self.addEventListener('install',function(e){e.waitUntil(caches.open(CACHE).then(function(c){return c.addAll(ASSETS).catch(function(){});}).then(function(){return self.skipWaiting();}));});
self.addEventListener('message',function(e){if(e.data==='skipWaiting'){self.skipWaiting();}});
self.addEventListener('activate',function(e){e.waitUntil(caches.keys().then(function(ks){return Promise.all(ks.filter(function(k){return k!==CACHE;}).map(function(k){return caches.delete(k);}));}).then(function(){return self.clients.claim();}));});
self.addEventListener('fetch',function(e){var r=e.request;if(r.method!=='GET')return;
  e.respondWith(fetch(r).then(function(resp){var cp=resp.clone();caches.open(CACHE).then(function(c){try{c.put(r,cp);}catch(_){}});return resp;})
    .catch(function(){return caches.match(r).then(function(c){return c||caches.match('./index.html');});}));});
