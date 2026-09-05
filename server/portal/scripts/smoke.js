'use strict';
/*
 * smoke.js — Test à blanc de bout en bout (aucune dépendance).
 * Démarre le serveur sur un port/dossier temporaires, puis :
 *   1) /admin/sync pousse un client + code + 1 document partagé + le fichier ;
 *   2) /portal/login valide le code et renvoie un jeton ;
 *   3) /portal/docs liste le document ;
 *   4) /portal/file/:id renvoie bien les octets ;
 *   5) contrôles négatifs : mauvais code, mauvais secret cabinet, fichier d'un autre client.
 * Sort en code 0 si tout passe, 1 sinon.
 */
const http = require('http');
const fs = require('fs');
const os = require('os');
const path = require('path');

const PORT = 8799;
const DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'marq-portal-'));
process.env.PORT = String(PORT);
process.env.DATA_DIR = DIR;
process.env.CABINET_TOKEN = 'secret-cabinet-test';
process.env.JWT_SECRET = 'secret-jwt-test';
process.env.ALLOWED_ORIGIN = '*';

const { demarrer, serveur } = require('../server');

function req(method, chemin, body, headers) {
  return new Promise(function (resolve, reject) {
    const data = body ? Buffer.from(JSON.stringify(body)) : null;
    const r = http.request({ host: '127.0.0.1', port: PORT, method: method, path: chemin,
      headers: Object.assign({ 'Content-Type': 'application/json' }, data ? { 'Content-Length': data.length } : {}, headers || {}) },
      function (res) {
        const chunks = [];
        res.on('data', function (c) { chunks.push(c); });
        res.on('end', function () {
          const buf = Buffer.concat(chunks);
          const ct = res.headers['content-type'] || '';
          resolve({ status: res.statusCode, buf: buf, json: ct.indexOf('json') >= 0 ? JSON.parse(buf.toString() || '{}') : null });
        });
      });
    r.on('error', reject);
    if (data) r.write(data);
    r.end();
  });
}

let echecs = 0;
function assert(cond, msg) {
  if (cond) console.log('  ✓ ' + msg);
  else { console.error('  ✗ ' + msg); echecs++; }
}

(async function () {
  demarrer();
  await new Promise(function (r) { setTimeout(r, 300); });

  const contenu = Buffer.from('%PDF-1.4 contenu de test').toString('base64');

  // 1) sync (mauvais secret d'abord)
  let s = await req('POST', '/admin/sync', { clients: [] }, { 'X-Cabinet-Token': 'mauvais' });
  assert(s.status === 401, 'sync refusé avec un mauvais secret cabinet');

  // sync correct : 2 clients, 2 docs (dont un pour l'autre client)
  s = await req('POST', '/admin/sync', {
    cabinet: 'AEM CONSEIL',
    clients: [{ name: 'Dupont SARL', code: 'ABC123' }, { name: 'Autre SA', code: 'ZZZ999' }],
    docs: [
      { id: 'cf1', client: 'Dupont SARL', nom: 'Bilan 2024.pdf', cat: 'Bilans', date: '2025-04-01', type: 'application/pdf', size: 24, shared: true },
      { id: 'cf2', client: 'Autre SA', nom: 'Secret.pdf', cat: 'Divers', date: '2025-01-01', type: 'application/pdf', size: 10, shared: true },
      { id: 'cf3', client: 'Dupont SARL', nom: 'Non partagé.pdf', cat: 'Divers', shared: false }
    ],
    files: { cf1: { name: 'Bilan 2024.pdf', type: 'application/pdf', data: 'data:application/pdf;base64,' + contenu }, cf2: { data: contenu } }
  }, { 'X-Cabinet-Token': 'secret-cabinet-test' });
  assert(s.status === 200 && s.json.bilan.clients === 2, 'sync OK (2 clients)');
  assert(s.json.bilan.docs === 2, 'sync : seuls les 2 docs partagés sont conservés (le non-partagé ignoré)');

  // 2) login mauvais code
  let l = await req('POST', '/portal/login', { client: 'Dupont SARL', code: 'WRONG9' });
  assert(l.status === 401, 'login refusé avec un mauvais code');

  // login OK (code insensible à la casse via le front, ici en clair majuscules)
  l = await req('POST', '/portal/login', { client: 'dupont sarl', code: 'ABC123' });
  assert(l.status === 200 && l.json.token, 'login OK -> jeton renvoyé');
  assert(l.json.cabinet === 'AEM CONSEIL', 'login renvoie le nom du cabinet');
  const token = l.json.token;
  const auth = { Authorization: 'Bearer ' + token };

  // 3) docs sans jeton -> 401
  let d = await req('GET', '/portal/docs', null, {});
  assert(d.status === 401, 'docs refusé sans jeton');

  d = await req('GET', '/portal/docs', null, auth);
  assert(d.status === 200 && d.json.docs.length === 1 && d.json.docs[0].id === 'cf1', 'docs : le client ne voit QUE son document (cf1)');

  // 4) fichier autorisé
  let f = await req('GET', '/portal/file/cf1', null, auth);
  assert(f.status === 200 && f.buf.length > 0, 'file cf1 servi (octets renvoyés)');
  assert((f.buf.toString().indexOf('%PDF') === 0), 'file cf1 : contenu correct');

  // 5) fichier d'un AUTRE client -> 403
  f = await req('GET', '/portal/file/cf2', null, auth);
  assert(f.status === 403, 'file cf2 (autre client) refusé -> cloisonnement OK');

  serveur.close();
  console.log(echecs === 0 ? '\nTOUS LES TESTS PASSENT ✓' : '\n' + echecs + ' ÉCHEC(S) ✗');
  process.exit(echecs === 0 ? 0 : 1);
})().catch(function (e) { console.error(e); process.exit(1); });
