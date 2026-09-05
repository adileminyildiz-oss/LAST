'use strict';
/*
 * server.js — Serveur portail client Mar'q (http natif, zéro dépendance runtime).
 *
 * Rôle : rendre accessible à distance le « portail client » (lecture seule) qui,
 * côté front (index.html), lit aujourd'hui tout en localStorage. Le cabinet pousse
 * ici les documents PARTAGÉS + les codes d'accès (hachés) ; le portail du client
 * interroge ce backend par fetch.
 *
 * Endpoints publics (portail client) :
 *   POST /portal/login      { client, code }  -> { token, expiresIn, cabinet }
 *   GET  /portal/docs                          -> { client, cabinet, docs:[...] }   (auth Bearer)
 *   GET  /portal/file/:id                      -> octets du fichier                 (auth Bearer)
 *
 * Endpoints cabinet (protégés par le secret CABINET_TOKEN) :
 *   POST /admin/sync  { cabinet, clients:[{name,code}], docs:[...], files?:{...} }
 *   POST /admin/file  { id, data }   (data = dataURL ou base64)  — upload isolé
 *
 * Divers :
 *   GET  /health   -> { ok:true }
 */
const http = require('http');
const url = require('url');

const { config, verifierSecrets } = require('./lib/config');
const cryptoLib = require('./lib/crypto');
const store = require('./lib/store');
const rate = require('./lib/ratelimit');

/* ===================== Utilitaires HTTP ===================== */

// Détermine l'origine autorisée à renvoyer dans l'en-tête CORS.
function origineAutorisee(req) {
  const o = req.headers.origin;
  if (config.ALLOWED_ORIGIN.indexOf('*') >= 0) return o || '*';
  if (o && config.ALLOWED_ORIGIN.indexOf(o) >= 0) return o;
  return config.ALLOWED_ORIGIN[0] || '';
}

function poserCORS(req, res) {
  const o = origineAutorisee(req);
  if (o) res.setHeader('Access-Control-Allow-Origin', o);
  res.setHeader('Vary', 'Origin');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Cabinet-Token');
  res.setHeader('Access-Control-Max-Age', '600');
}

function envoyerJSON(res, code, obj) {
  const buf = Buffer.from(JSON.stringify(obj));
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Content-Length': buf.length });
  res.end(buf);
}

// Lit le corps d'une requête avec une taille maximale (protège la mémoire).
function lireCorps(req, maxOctets) {
  return new Promise(function (resolve, reject) {
    let taille = 0;
    const morceaux = [];
    req.on('data', function (c) {
      taille += c.length;
      if (taille > maxOctets) { reject(new Error('corps trop volumineux')); req.destroy(); return; }
      morceaux.push(c);
    });
    req.on('end', function () { resolve(Buffer.concat(morceaux)); });
    req.on('error', reject);
  });
}

// IP client (tient compte d'un éventuel proxy inverse : X-Forwarded-For).
function ipClient(req) {
  const xff = req.headers['x-forwarded-for'];
  if (xff) return String(xff).split(',')[0].trim();
  return (req.socket && req.socket.remoteAddress) || 'inconnue';
}

// Extrait le jeton Bearer de l'en-tête Authorization.
function jetonBearer(req) {
  const h = req.headers.authorization || '';
  const m = h.match(/^Bearer\s+(.+)$/i);
  return m ? m[1] : '';
}

/* ===================== Handlers ===================== */

// POST /portal/login
async function portalLogin(req, res) {
  let corps;
  try { corps = JSON.parse((await lireCorps(req, 4096)).toString('utf8') || '{}'); }
  catch (e) { return envoyerJSON(res, 400, { error: 'JSON invalide' }); }

  const client = corps.client || '';
  const code = String(corps.code || '').trim().toUpperCase();
  const k = store.ckey(client);

  // Rate-limit AVANT toute vérification (anti brute-force), clé = IP + client.
  const cle = ipClient(req) + '|' + k;
  const rl = rate.verifier(cle, config.LOGIN_MAX_ATTEMPTS, config.LOGIN_WINDOW_MS);
  if (rl.bloque) {
    res.setHeader('Retry-After', Math.ceil(rl.retryMs / 1000));
    return envoyerJSON(res, 429, { error: 'Trop de tentatives. Réessayez plus tard.' });
  }

  const fiche = store.getClient(k);
  // Message volontairement générique (ne révèle pas si le client existe).
  if (!fiche || !fiche.codeHash || !cryptoLib.verifierCode(code, fiche.codeHash)) {
    return envoyerJSON(res, 401, { error: 'Nom de client ou code d\'accès incorrect.' });
  }

  rate.reussite(cle); // reset du compteur après succès
  try { store.logEvent(k, 'login', { ip: ipClient(req) }); } catch (e) {}
  const exp = Math.floor(Date.now() / 1000) + config.SESSION_TTL;
  const token = cryptoLib.signerJeton({ c: k, exp: exp }, config.JWT_SECRET);
  return envoyerJSON(res, 200, {
    token: token,
    expiresIn: config.SESSION_TTL,
    client: fiche.name,
    cabinet: store.getMeta().cabinet || '',
  });
}

// Auth commune aux endpoints /portal/* protégés : renvoie ckey ou null (+ réponse 401).
function authClient(req, res) {
  const payload = cryptoLib.verifierJeton(jetonBearer(req), config.JWT_SECRET);
  if (!payload || !payload.c) { envoyerJSON(res, 401, { error: 'Session invalide ou expirée.' }); return null; }
  return payload.c;
}

// GET /portal/docs
function portalDocs(req, res) {
  const k = authClient(req, res);
  if (!k) return;
  const fiche = store.getClient(k);
  return envoyerJSON(res, 200, {
    client: fiche ? fiche.name : k,
    cabinet: store.getMeta().cabinet || '',
    docs: store.docsClient(k), // { id, nom, cat, date, type, size }
  });
}

// GET /portal/file/:id
function portalFile(req, res, id) {
  const k = authClient(req, res);
  if (!k) return;
  // Vérifie l'appartenance : le fichier doit être un document PARTAGÉ de CE client.
  if (!store.docAppartientAuClient(k, id)) {
    return envoyerJSON(res, 403, { error: 'Accès refusé à ce document.' });
  }
  const buf = store.lireFichier(id);
  if (!buf) return envoyerJSON(res, 404, { error: 'Fichier introuvable.' });
  // Retrouve le type/nom déclarés dans les métadonnées.
  const meta = store.docsClient(k).find(function (d) { return d.id === id; }) || {};
  const type = meta.type || 'application/octet-stream';
  const nom = (meta.nom || 'document').replace(/[\r\n"]/g, '');
  try { store.logEvent(k, 'file', { docId: id, docNom: meta.nom || '', ip: ipClient(req) }); } catch (e) {}
  res.writeHead(200, {
    'Content-Type': type,
    'Content-Length': buf.length,
    // inline : consultable dans le navigateur ; le front peut forcer le téléchargement.
    'Content-Disposition': 'inline; filename="' + encodeURIComponent(nom) + '"',
    'Cache-Control': 'private, no-store',
  });
  res.end(buf);
}

// Contrôle du secret cabinet pour /admin/*.
function verifierCabinet(req, res) {
  if (!config.CABINET_TOKEN) { envoyerJSON(res, 503, { error: 'CABINET_TOKEN non configuré côté serveur.' }); return false; }
  const fourni = req.headers['x-cabinet-token'] || jetonBearer(req);
  if (!cryptoLib.egaliteConstante(fourni, config.CABINET_TOKEN)) {
    envoyerJSON(res, 401, { error: 'Secret cabinet invalide.' });
    return false;
  }
  return true;
}

// POST /admin/sync
async function adminSync(req, res) {
  if (!verifierCabinet(req, res)) return;
  let corps;
  try { corps = JSON.parse((await lireCorps(req, config.MAX_ADMIN_BODY)).toString('utf8') || '{}'); }
  catch (e) { return envoyerJSON(res, 400, { error: 'JSON invalide ou corps trop volumineux.' }); }
  const mode = (corps.mode === 'merge') ? 'merge' : 'replace';
  const bilan = store.syncCabinet(corps, mode);
  return envoyerJSON(res, 200, { ok: true, mode: mode, bilan: bilan });
}

// POST /admin/file
async function adminFile(req, res) {
  if (!verifierCabinet(req, res)) return;
  let corps;
  try { corps = JSON.parse((await lireCorps(req, config.MAX_ADMIN_BODY)).toString('utf8') || '{}'); }
  catch (e) { return envoyerJSON(res, 400, { error: 'JSON invalide ou corps trop volumineux.' }); }
  if (!corps.id || !corps.data) return envoyerJSON(res, 400, { error: 'Champs requis : id, data.' });
  try { store.enregistrerFichier(corps.id, corps.data); }
  catch (e) { return envoyerJSON(res, 400, { error: e.message }); }
  return envoyerJSON(res, 200, { ok: true, id: corps.id });
}

// GET /admin/events?limit=200&client=<nom>  -> journal de consultation
function adminEvents(req, res, query) {
  if (!verifierCabinet(req, res)) return;
  const events = store.getEvents(query.limit, query.client);
  return envoyerJSON(res, 200, { events: events });
}

// POST /portal/upload  { nom, type, data }  (auth Bearer client) -> dépôt d'une pièce
async function portalUpload(req, res) {
  const k = authClient(req, res);
  if (!k) return;
  let corps;
  try { corps = JSON.parse((await lireCorps(req, config.MAX_UPLOAD_BODY)).toString('utf8') || '{}'); }
  catch (e) { return envoyerJSON(res, 400, { error: 'Fichier trop volumineux ou JSON invalide.' }); }
  if (!corps.data) return envoyerJSON(res, 400, { error: 'Aucun fichier fourni.' });
  let entree;
  try { entree = store.enregistrerUpload(k, { nom: corps.nom, type: corps.type }, corps.data); }
  catch (e) { return envoyerJSON(res, 400, { error: 'Fichier invalide.' }); }
  try { store.logEvent(k, 'upload', { docId: entree.id, docNom: entree.nom, ip: ipClient(req) }); } catch (e) {}
  return envoyerJSON(res, 200, { ok: true, id: entree.id, nom: entree.nom, size: entree.size });
}

// GET /admin/uploads?client=<nom>  -> liste des pièces déposées par les clients
function adminUploads(req, res, query) {
  if (!verifierCabinet(req, res)) return;
  return envoyerJSON(res, 200, { uploads: store.getUploads(query.client) });
}

// GET /admin/upload/:id  -> octets d'une pièce déposée par un client
function adminUploadFile(req, res, id) {
  if (!verifierCabinet(req, res)) return;
  const meta = store.getUpload(id);
  if (!meta) return envoyerJSON(res, 404, { error: 'Dépôt introuvable.' });
  const buf = store.lireFichier(id);
  if (!buf) return envoyerJSON(res, 404, { error: 'Fichier introuvable.' });
  const nom = (meta.nom || 'document').replace(/[\r\n"]/g, '');
  res.writeHead(200, {
    'Content-Type': meta.type || 'application/octet-stream',
    'Content-Length': buf.length,
    'Content-Disposition': 'inline; filename="' + encodeURIComponent(nom) + '"',
    'Cache-Control': 'private, no-store',
  });
  res.end(buf);
}

// POST /admin/upload-delete  { id }
async function adminUploadDelete(req, res) {
  if (!verifierCabinet(req, res)) return;
  let corps;
  try { corps = JSON.parse((await lireCorps(req, 4096)).toString('utf8') || '{}'); }
  catch (e) { return envoyerJSON(res, 400, { error: 'JSON invalide' }); }
  if (!corps.id) return envoyerJSON(res, 400, { error: 'Champ requis : id.' });
  const ok = store.supprimerUpload(corps.id);
  return envoyerJSON(res, 200, { ok: ok });
}

/* ===================== Routeur ===================== */

const serveur = http.createServer(function (req, res) {
  poserCORS(req, res);
  if (req.method === 'OPTIONS') { res.writeHead(204); return res.end(); }

  const parsed = url.parse(req.url, true);
  const chemin = parsed.pathname.replace(/\/+$/, '') || '/';

  // Journalisation minimale (méthode + chemin).
  try { console.log(new Date().toISOString(), req.method, chemin); } catch (e) {}

  Promise.resolve().then(function () {
    if (chemin === '/health' && req.method === 'GET') return envoyerJSON(res, 200, { ok: true });

    if (chemin === '/portal/login' && req.method === 'POST') return portalLogin(req, res);
    if (chemin === '/portal/docs' && req.method === 'GET') return portalDocs(req, res);

    const mf = chemin.match(/^\/portal\/file\/([^/]+)$/);
    if (mf && req.method === 'GET') return portalFile(req, res, decodeURIComponent(mf[1]));

    if (chemin === '/portal/upload' && req.method === 'POST') return portalUpload(req, res);

    if (chemin === '/admin/sync' && req.method === 'POST') return adminSync(req, res);
    if (chemin === '/admin/file' && req.method === 'POST') return adminFile(req, res);
    if (chemin === '/admin/events' && req.method === 'GET') return adminEvents(req, res, parsed.query || {});
    if (chemin === '/admin/uploads' && req.method === 'GET') return adminUploads(req, res, parsed.query || {});
    if (chemin === '/admin/upload-delete' && req.method === 'POST') return adminUploadDelete(req, res);
    const mu = chemin.match(/^\/admin\/upload\/([^/]+)$/);
    if (mu && req.method === 'GET') return adminUploadFile(req, res, decodeURIComponent(mu[1]));

    return envoyerJSON(res, 404, { error: 'Route inconnue.' });
  }).catch(function (e) {
    try { envoyerJSON(res, 500, { error: 'Erreur serveur.' }); } catch (_) {}
    try { console.error('Erreur:', e && e.message); } catch (_) {}
  });
});

/* ===================== Démarrage ===================== */
function demarrer() {
  store.init(config.DATA_DIR);
  const avert = verifierSecrets();
  avert.forEach(function (a) { console.warn('⚠  ' + a); });
  serveur.listen(config.PORT, function () {
    console.log('Portail Mar\'q — serveur démarré sur http://localhost:' + config.PORT);
    console.log('Données   : ' + config.DATA_DIR);
    console.log('Origines  : ' + config.ALLOWED_ORIGIN.join(', '));
  });
}

// Démarre seulement si exécuté directement (permet l'import en test).
if (require.main === module) demarrer();

module.exports = { serveur, demarrer };
