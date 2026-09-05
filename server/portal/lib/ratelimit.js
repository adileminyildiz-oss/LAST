'use strict';
/*
 * ratelimit.js — Limiteur de tentatives de connexion en mémoire (best-effort).
 * Empêche le brute-force des codes d'accès à 6 caractères. Clé = IP + client.
 * Purge périodique des entrées expirées pour ne pas fuir de la mémoire.
 */
const seau = new Map(); // clé -> { count, reset }

function nettoyer() {
  const now = Date.now();
  for (const [k, v] of seau) { if (v.reset <= now) seau.delete(k); }
}
setInterval(nettoyer, 60 * 1000).unref();

/* Retourne { bloque:boolean, restant:number, retryMs:number }.
 * Appeler AVANT de vérifier le code : incrémente le compteur d'essais. */
function verifier(cle, max, fenetreMs) {
  const now = Date.now();
  let e = seau.get(cle);
  if (!e || e.reset <= now) { e = { count: 0, reset: now + fenetreMs }; seau.set(cle, e); }
  e.count++;
  const bloque = e.count > max;
  return { bloque: bloque, restant: Math.max(0, max - e.count), retryMs: Math.max(0, e.reset - now) };
}

/* À appeler après une connexion RÉUSSIE : réinitialise le compteur. */
function reussite(cle) { seau.delete(cle); }

module.exports = { verifier, reussite };
