'use strict';
/*
 * store.js — Couche de stockage sur disque, simple et portable (aucun service tiers).
 *
 * Arborescence sous DATA_DIR :
 *   clients.json   → { "<ckey>": { name, codeHash } }        (codes HASHÉS, jamais en clair)
 *   docs.json      → { "<ckey>": [ { id, nom, cat, date, type, size } ] }  (docs PARTAGÉS)
 *   meta.json      → { cabinet: "AEM CONSEIL" }               (paramètres d'affichage)
 *   files/<id>     → contenu binaire du fichier
 *
 *  - ckey = nom du client normalisé (minuscule + trim), identique à la logique front.
 *  - On ne stocke QUE les documents partagés (shared:true) poussés par le cabinet.
 *  - Les fichiers sont stockés hors-JSON (dossier files/), servis avec leur Content-Type.
 */
const fs = require('fs');
const path = require('path');
const { hasherCode } = require('./crypto');

let DIR = null;
let FILES_DIR = null;

function init(dataDir) {
  DIR = dataDir;
  FILES_DIR = path.join(DIR, 'files');
  fs.mkdirSync(FILES_DIR, { recursive: true });
  // Crée les JSON manquants.
  for (const f of ['clients.json', 'docs.json', 'meta.json']) {
    const p = path.join(DIR, f);
    if (!fs.existsSync(p)) fs.writeFileSync(p, f === 'meta.json' ? '{"cabinet":""}' : '{}');
  }
}

/* ---- Normalisation identique au front (ckey) ---- */
function ckey(c) { return String(c == null ? '' : c).trim().toLowerCase(); }

/* ---- Lecture/écriture JSON atomique ---- */
function lireJSON(nom) {
  try { return JSON.parse(fs.readFileSync(path.join(DIR, nom), 'utf8')) || {}; }
  catch (e) { return {}; }
}
function ecrireJSON(nom, obj) {
  const p = path.join(DIR, nom);
  const tmp = p + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(obj, null, 2));
  fs.renameSync(tmp, p); // remplacement atomique
}

/* ---- Fichiers ---- */
// id sûr : uniquement lettres/chiffres/-/_/. (empêche toute traversée de chemin).
function idSur(id) { return /^[A-Za-z0-9._-]{1,128}$/.test(String(id || '')); }
function cheminFichier(id) {
  if (!idSur(id)) return null;
  return path.join(FILES_DIR, id);
}
function ecrireFichier(id, buffer) {
  const p = cheminFichier(id);
  if (!p) throw new Error('id de fichier invalide');
  fs.writeFileSync(p, buffer);
}
function lireFichier(id) {
  const p = cheminFichier(id);
  if (!p || !fs.existsSync(p)) return null;
  return fs.readFileSync(p);
}
function supprimerFichier(id) {
  const p = cheminFichier(id);
  try { if (p && fs.existsSync(p)) fs.unlinkSync(p); } catch (e) {}
}

/* ---- Décodage d'un fichier fourni en dataURL ou base64 brut ---- */
function decoderContenu(data) {
  if (Buffer.isBuffer(data)) return data;
  let s = String(data || '');
  const m = s.match(/^data:([^;]*);base64,(.*)$/); // data:<type>;base64,<b64>
  if (m) s = m[2];
  return Buffer.from(s, 'base64');
}

/* =========================================================================
 * API métier
 * ========================================================================= */

// Métadonnées cabinet (nom affiché sur le portail).
function getMeta() { return lireJSON('meta.json'); }
function setMeta(m) { ecrireJSON('meta.json', Object.assign(getMeta(), m || {})); }

// Récupère la fiche d'un client par son nom (ou ckey).
function getClient(nomOuKey) {
  const clients = lireJSON('clients.json');
  return clients[ckey(nomOuKey)] || null;
}

// Documents partagés d'un client (métadonnées uniquement).
function docsClient(nomOuKey) {
  const docs = lireJSON('docs.json');
  return docs[ckey(nomOuKey)] || [];
}

// Vérifie qu'un fichier (par id) appartient bien au client donné ET est partagé.
function docAppartientAuClient(nomOuKey, fileId) {
  return docsClient(nomOuKey).some(function (d) { return d.id === fileId; });
}

/* -------------------------------------------------------------------------
 * Journal de consultation : trace des connexions et accès aux documents.
 * events.json = [ { ts, client, name, type, docId?, docNom?, ip? }, ... ]
 * (plafonné aux MAX_EVENTS plus récents pour rester léger).
 * ------------------------------------------------------------------------- */
const MAX_EVENTS = 3000;
function logEvent(clientKey, type, opts) {
  opts = opts || {};
  const k = ckey(clientKey);
  const fiche = getClient(k);
  const ev = { ts: Date.now(), client: k, name: (fiche && fiche.name) || k, type: type };
  if (opts.docId) ev.docId = String(opts.docId);
  if (opts.docNom) ev.docNom = String(opts.docNom);
  if (opts.ip) ev.ip = String(opts.ip);
  let arr = lireJSON('events.json');
  if (!Array.isArray(arr)) arr = [];
  arr.push(ev);
  if (arr.length > MAX_EVENTS) arr = arr.slice(arr.length - MAX_EVENTS);
  ecrireJSON('events.json', arr);
  return ev;
}
// Événements récents (les plus récents d'abord), filtrables par client.
function getEvents(limit, clientKey) {
  let arr = lireJSON('events.json');
  if (!Array.isArray(arr)) arr = [];
  if (clientKey) { const k = ckey(clientKey); arr = arr.filter(function (e) { return e.client === k; }); }
  arr = arr.slice().reverse();
  const n = Math.max(1, Math.min(parseInt(limit || 200, 10) || 200, 1000));
  return arr.slice(0, n);
}

/* -------------------------------------------------------------------------
 * Dépôts client (le client envoie une pièce au cabinet depuis le portail).
 * uploads.json = [ { id, client, name, nom, type, size, ts } ] ; les octets
 * sont stockés via ecrireFichier(id) (préfixe up_ pour ne pas collisionner
 * avec les documents partagés du cabinet).
 * ------------------------------------------------------------------------- */
function enregistrerUpload(clientKey, meta, data) {
  const k = ckey(clientKey);
  const fiche = getClient(k);
  const id = 'up_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  ecrireFichier(id, decoderContenu(data)); // lève si data invalide
  const buf = lireFichier(id);
  const entree = {
    id: id,
    client: k,
    name: (fiche && fiche.name) || k,
    nom: String((meta && meta.nom) || 'document').slice(0, 180).replace(/[\r\n]/g, ''),
    type: String((meta && meta.type) || 'application/octet-stream').slice(0, 120),
    size: buf ? buf.length : 0,
    ts: Date.now(),
  };
  let arr = lireJSON('uploads.json');
  if (!Array.isArray(arr)) arr = [];
  arr.push(entree);
  ecrireJSON('uploads.json', arr);
  return entree;
}
function getUploads(clientKey) {
  let arr = lireJSON('uploads.json');
  if (!Array.isArray(arr)) arr = [];
  if (clientKey) { const k = ckey(clientKey); arr = arr.filter(function (u) { return u.client === k; }); }
  return arr.slice().reverse(); // plus récents d'abord
}
function getUpload(id) {
  let arr = lireJSON('uploads.json');
  if (!Array.isArray(arr)) arr = [];
  return arr.find(function (u) { return u.id === id; }) || null;
}

// Révoque l'accès d'un client : supprime son empreinte de code (login impossible)
// tout en conservant sa fiche/documents (restaurés à la prochaine synchronisation).
function revokeClient(nomOuKey) {
  const k = ckey(nomOuKey);
  const clients = lireJSON('clients.json');
  if (clients[k]) { delete clients[k].codeHash; ecrireJSON('clients.json', clients); return true; }
  return false;
}
function supprimerUpload(id) {
  let arr = lireJSON('uploads.json');
  if (!Array.isArray(arr)) arr = [];
  const avant = arr.length;
  arr = arr.filter(function (u) { return u.id !== id; });
  ecrireJSON('uploads.json', arr);
  try { supprimerFichier(id); } catch (e) {}
  return avant !== arr.length;
}

/* -------------------------------------------------------------------------
 * Synchronisation depuis le cabinet (endpoint /admin/sync).
 * payload = {
 *   cabinet?: string,
 *   clients: [ { name, code } ],   // code EN CLAIR -> haché ici, jamais stocké en clair
 *   docs:    [ { id, client, nom, cat, date, type, size } ],  // uniquement shared:true
 *   files?:  { "<id>": { name, type, data } }   // data = dataURL ou base64 (optionnel)
 * }
 * mode = 'replace' (défaut, remplace tout l'état) | 'merge' (fusionne/complète)
 * ------------------------------------------------------------------------- */
function syncCabinet(payload, mode) {
  mode = mode || 'replace';
  payload = payload || {};

  if (typeof payload.cabinet === 'string') setMeta({ cabinet: payload.cabinet });

  // 1) Clients + codes (hachés).
  const clientsOut = mode === 'merge' ? lireJSON('clients.json') : {};
  (payload.clients || []).forEach(function (c) {
    const k = ckey(c.name);
    if (!k) return;
    const entree = clientsOut[k] || { name: (c.name || '').trim() };
    entree.name = (c.name || '').trim() || entree.name;
    // Le code n'est haché que s'il est fourni (permet de resynchroniser les docs
    // sans changer le code existant en mode merge).
    if (c.code) entree.codeHash = hasherCode(c.code);
    if (entree.codeHash) clientsOut[k] = entree;
  });
  ecrireJSON('clients.json', clientsOut);

  // 2) Documents partagés (métadonnées), regroupés par client.
  const docsOut = mode === 'merge' ? lireJSON('docs.json') : {};
  const idsConserves = {}; // pour le nettoyage des fichiers en mode replace
  (payload.docs || []).forEach(function (d) {
    if (!d || d.shared === false || !d.id) return; // on n'accepte QUE le partagé
    const k = ckey(d.client);
    if (!k) return;
    if (!docsOut[k]) docsOut[k] = [];
    // Évite les doublons d'id lors d'un merge.
    docsOut[k] = docsOut[k].filter(function (x) { return x.id !== d.id; });
    docsOut[k].push({
      id: String(d.id),
      nom: d.nom || d.name || 'Document',
      cat: d.cat || 'Divers',
      date: d.date || '',
      type: d.type || d.ftype || 'application/octet-stream',
      size: d.size || d.fsize || 0,
    });
    idsConserves[String(d.id)] = true;
  });
  ecrireJSON('docs.json', docsOut);

  // 3) Fichiers inline éventuels.
  let fichiersEcrits = 0;
  if (payload.files && typeof payload.files === 'object') {
    Object.keys(payload.files).forEach(function (id) {
      if (!idSur(id)) return;
      const f = payload.files[id];
      // Tolère les deux formes : { name, type, data } OU une dataURL/base64 en chaîne directe.
      const data = (f && typeof f === 'object') ? f.data : f;
      if (!data) return;
      try { ecrireFichier(id, decoderContenu(data)); fichiersEcrits++; } catch (e) {}
    });
  }

  // 4) Nettoyage : en mode replace, supprime les fichiers orphelins (non référencés).
  let fichiersSupprimes = 0;
  if (mode === 'replace') {
    // Recense tous les ids réellement référencés après écriture.
    const refs = {};
    Object.keys(docsOut).forEach(function (k) {
      docsOut[k].forEach(function (d) { refs[d.id] = true; });
    });
    try {
      fs.readdirSync(FILES_DIR).forEach(function (nom) {
        if (!refs[nom]) { supprimerFichier(nom); fichiersSupprimes++; }
      });
    } catch (e) {}
  }

  return {
    clients: Object.keys(clientsOut).length,
    docs: Object.keys(docsOut).reduce(function (n, k) { return n + docsOut[k].length; }, 0),
    fichiersEcrits: fichiersEcrits,
    fichiersSupprimes: fichiersSupprimes,
  };
}

/* Upload d'un fichier isolé (endpoint /admin/file). */
function enregistrerFichier(id, data) {
  if (!idSur(id)) throw new Error('id invalide');
  ecrireFichier(id, decoderContenu(data));
}

module.exports = {
  init, ckey,
  getMeta, setMeta,
  getClient, docsClient, docAppartientAuClient,
  lireFichier, enregistrerFichier,
  syncCabinet,
  logEvent, getEvents,
  enregistrerUpload, getUploads, getUpload, supprimerUpload,
  revokeClient,
};
