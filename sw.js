var CACHE='last-v503';
var ASSETS=['./manifest.webmanifest','./icon-192.png','./icon-512.png','./icon-512-maskable.png'];
self.addEventListener('install',function(e){e.waitUntil(caches.open(CACHE).then(function(c){return c.addAll(ASSETS).catch(function(){});}).then(function(){return self.skipWaiting();}));});
self.addEventListener('message',function(e){if(e.data==='skipWaiting'){self.skipWaiting();}});
self.addEventListener('activate',function(e){e.waitUntil(
  caches.keys().then(function(ks){
    var old=ks.filter(function(k){return k!==CACHE;});
    var hadOld=old.length>0;                                   /* une version antérieure existait → c'est une MISE À JOUR */
    return Promise.all(old.map(function(k){return caches.delete(k);})).then(function(){return hadOld;});
  }).then(function(hadOld){
    return self.clients.claim().then(function(){
      if(!hadOld) return;                                       /* première installation : ne pas recharger */
      /* MISE À JOUR : on force le rechargement des fenêtres ouvertes DEPUIS le service worker.
         client.navigate() fonctionne même si la page tourne sur un ancien code (aucune
         coopération de la page requise) → l'app installée se met à jour toute seule. */
      return self.clients.matchAll({type:'window'}).then(function(cs){
        return Promise.all((cs||[]).map(function(c){
          try{ if(c.navigate) return c.navigate(c.url).catch(function(){try{c.postMessage('reload');}catch(_){}}); }catch(e){}
          try{c.postMessage('reload');}catch(_){}
          return null;
        }));
      });
    });
  })
);});
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
