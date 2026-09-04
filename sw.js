var CACHE='last-v394';
var ASSETS=['./manifest.webmanifest','./icon-192.png','./icon-512.png','./icon-512-maskable.png'];
self.addEventListener('install',function(e){e.waitUntil(caches.open(CACHE).then(function(c){return c.addAll(ASSETS).catch(function(){});}).then(function(){return self.skipWaiting();}));});
self.addEventListener('message',function(e){if(e.data==='skipWaiting'){self.skipWaiting();}});
self.addEventListener('activate',function(e){e.waitUntil(caches.keys().then(function(ks){return Promise.all(ks.filter(function(k){return k!==CACHE;}).map(function(k){return caches.delete(k);}));}).then(function(){return self.clients.claim();}));});
self.addEventListener('fetch',function(e){
  var r=e.request; if(r.method!=='GET') return;
  var url; try{url=new URL(r.url);}catch(_){return;}
  var path=url.pathname||'';
  var isDoc=(r.mode==='navigate')||path==='/'||path.slice(-1)==='/'||/\.html$/i.test(path);
  var isVer=/version\.json$/i.test(path);
  /* PAGES : jamais servies depuis le cache — toujours la dernière version (aucun flash de l'ancien design).
     Le HTML n'est PAS renvoyé depuis le cache ; une copie de secours (hors-ligne) est rafraîchie en arrière-plan. */
  if(isDoc){
    e.respondWith(fetch(r.url,{cache:'no-store'}).then(function(resp){
      try{var cp=resp.clone();caches.open(CACHE).then(function(c){c.put('./index.html',cp);});}catch(_){}
      return resp;
    }).catch(function(){return caches.match('./index.html');}));
    return;
  }
  /* version.json : toujours frais, jamais mis en cache */
  if(isVer){
    e.respondWith(fetch(r.url,{cache:'no-store'}).catch(function(){return new Response('{}',{headers:{'Content-Type':'application/json'}});}));
    return;
  }
  /* Autres ressources (icônes, manifest) : réseau d'abord, cache en secours hors-ligne */
  e.respondWith(fetch(r).then(function(resp){var cp=resp.clone();caches.open(CACHE).then(function(c){try{c.put(r,cp);}catch(_){}});return resp;})
    .catch(function(){return caches.match(r);}));
});
