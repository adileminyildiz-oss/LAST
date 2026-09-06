/* ============================================================================
   Mar'q — Service worker AUTO-DÉSACTIVANT (kill-switch, sans cache)
   ----------------------------------------------------------------------------
   But : garantir que l'app charge TOUJOURS la dernière version depuis le réseau,
   sans jamais rester bloquée sur une version antérieure (module manquant, etc.).

   Ce worker REMPLACE l'ancien worker « cache-first ». Dès que le navigateur le
   récupère (vérification automatique du script), il :
     1) vide TOUS les caches,
     2) se DÉSENREGISTRE lui-même,
     3) recharge les fenêtres ouvertes (elles repartent du réseau → dernière version).
   Il n'a AUCUN gestionnaire 'fetch' : il n'intercepte plus rien → chargement
   réseau normal. Après sa désinscription, plus aucun service worker ne contrôle
   la page : chaque ouverture récupère la dernière version en ligne.
   ============================================================================ */
var CACHE='last-v504-killswitch';
self.addEventListener('install',function(e){ try{ self.skipWaiting(); }catch(_){} });
self.addEventListener('message',function(e){ if(e&&e.data==='skipWaiting'){ try{ self.skipWaiting(); }catch(_){} } });
self.addEventListener('activate',function(e){ e.waitUntil((function(){
  var purge = (self.caches && caches.keys)
    ? caches.keys().then(function(ks){ return Promise.all(ks.map(function(k){ return caches.delete(k); })); })
    : Promise.resolve();
  return purge.catch(function(){})
    .then(function(){ try{ return self.registration.unregister(); }catch(e){ return null; } })
    .catch(function(){})
    .then(function(){ try{ return self.clients.matchAll({type:'window'}); }catch(e){ return []; } })
    .then(function(cs){
      (cs||[]).forEach(function(c){
        try{ if(c.navigate){ c.navigate(c.url).catch(function(){ try{c.postMessage('reload');}catch(_){}} ); } else { c.postMessage('reload'); } }
        catch(e){ try{ c.postMessage('reload'); }catch(_){} }
      });
    });
})()); });
/* Pas de gestionnaire 'fetch' : le réseau gère tout (dernière version). */
