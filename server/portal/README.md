# Portail client Mar'q — backend léger

[![Deploy to Render](https://render.com/images/deploy-to-render-button.svg)](https://render.com/deploy?repo=https://github.com/adileminyildiz-oss/last)

> **Déploiement en un clic** — le bouton ci-dessus utilise le fichier `render.yaml`
> à la **racine** du dépôt : Render crée le service, génère `CABINET_TOKEN` et
> `JWT_SECRET`, monte le disque persistant. Réglez ensuite `ALLOWED_ORIGIN` sur
> l'URL de votre site. Un **déploiement automatique Fly.io** (GitHub Actions) est
> aussi fourni — voir l'option D plus bas.

Backend minimal (Node.js, **http natif, zéro dépendance runtime**) qui rend le
« portail client » de Mar'q réellement accessible **à distance**.

Aujourd'hui le portail (dans `index.html`, ouvert via `#portail&c=<client>`) lit
tout en **localStorage** : le navigateur du client n'y a évidemment pas accès.
Ce serveur stocke les **documents partagés** + les **codes d'accès (hachés)**
poussés par le cabinet, et le portail front les interroge par `fetch`.

- Le cabinet ne pousse **que** les documents `shared:true`.
- Les codes d'accès sont **hachés au repos** (scrypt + sel), jamais en clair.
- Les fichiers sont stockés **hors-JSON** (`data/files/`) et servis avec leur
  bon `Content-Type`.
- Sessions par **jeton signé HMAC-SHA256** expirant (2 h par défaut).
- **CORS** limité à l'origine du site, **rate-limit** anti brute-force.

---

## 1. Lancer en local

```bash
cd server/portal
cp .env.example .env        # puis éditez les secrets
npm start                   # démarre sur http://localhost:8787 (aucun npm install requis)
```

> `npm install` n'est **pas nécessaire** (zéro dépendance). Node ≥ 18 suffit.

Vérifications rapides :

```bash
npm run check               # node --check sur tous les fichiers
npm run smoke               # test de bout en bout (login, docs, fichier, cloisonnement)
curl localhost:8787/health  # -> {"ok":true}
```

Générer des secrets forts :

```bash
openssl rand -hex 32        # pour CABINET_TOKEN et JWT_SECRET
```

---

## 2. Endpoints

### Portail client (public)

| Méthode | Route | Corps / Auth | Réponse |
|--------|-------|--------------|---------|
| `POST` | `/portal/login` | `{ client, code }` | `{ token, expiresIn, client, cabinet }` |
| `GET`  | `/portal/docs` | `Authorization: Bearer <token>` | `{ client, cabinet, docs:[{id,nom,cat,date,type,size}] }` |
| `GET`  | `/portal/file/:id` | `Authorization: Bearer <token>` | octets du fichier (`Content-Type` d'origine) |

- `/portal/file/:id` vérifie que le fichier est bien un **document partagé du
  client connecté** (sinon `403`). Cloisonnement strict entre clients.

### Cabinet (protégé par `CABINET_TOKEN`)

En-tête requis : `X-Cabinet-Token: <CABINET_TOKEN>` (ou `Authorization: Bearer <CABINET_TOKEN>`).

| Méthode | Route | Corps |
|--------|-------|-------|
| `POST` | `/admin/sync` | état complet à publier (voir ci-dessous) |
| `POST` | `/admin/file` | `{ id, data }` — `data` = dataURL **ou** base64 (upload isolé) |

Corps de `/admin/sync` :

```jsonc
{
  "cabinet": "AEM CONSEIL",
  "mode": "replace",                 // "replace" (défaut) remplace tout ; "merge" complète
  "clients": [
    { "name": "Dupont SARL", "code": "ABC123" }   // code EN CLAIR -> haché côté serveur
  ],
  "docs": [                          // UNIQUEMENT les documents partagés
    { "id": "cf1", "client": "Dupont SARL", "nom": "Bilan 2024.pdf",
      "cat": "Bilans", "date": "2025-04-01", "type": "application/pdf", "size": 24000, "shared": true }
  ],
  "files": {                         // optionnel : contenu des fichiers (dataURL ou base64)
    "cf1": { "name": "Bilan 2024.pdf", "type": "application/pdf", "data": "data:application/pdf;base64,..." }
  }
}
```

> En mode `replace`, les fichiers orphelins (non référencés par un doc) sont supprimés.
> En mode `merge`, un client déjà présent conserve son code si `code` n'est pas fourni.

### Health

`GET /health` → `{ "ok": true }` (pour les checks de la plateforme d'hébergement).

---

## 3. Déploiement

Le serveur écoute sur `process.env.PORT` : compatible avec la plupart des PaaS.
Prévoir un **volume/disque persistant** monté sur `DATA_DIR` (les JSON + fichiers
y sont stockés) et servir en **HTTPS** (obligatoire : le site est en HTTPS, un
backend en HTTP serait bloqué comme « mixed content »).

Variables d'environnement à définir : `CABINET_TOKEN`, `JWT_SECRET`,
`ALLOWED_ORIGIN=https://last.aemconseil.eu`, `DATA_DIR` (chemin du volume).

**Render** — New → Web Service → Root Directory `server/portal`,
Build `` (vide), Start `node server.js`, ajouter un **Disk** monté sur
`/data` et `DATA_DIR=/data`, renseigner les variables d'environnement.

**Railway** — New Project → Deploy from repo, Root `server/portal`,
Start `node server.js`, ajouter un **Volume** sur `/data` + `DATA_DIR=/data`,
définir les variables.

**Fly.io** — `fly launch` dans `server/portal` (Dockerfile non requis :
buildpack Node), créer un **volume** (`fly volumes create data`), le monter sur
`/data` dans `fly.toml`, `DATA_DIR=/data`, `fly secrets set CABINET_TOKEN=... JWT_SECRET=...`.

**VPS (systemd + Nginx)** — `git clone`, créer `.env`, `node server.js` derrière
un service systemd, puis un reverse-proxy Nginx (TLS Let's Encrypt) vers
`http://127.0.0.1:8787`. `X-Forwarded-For` est déjà pris en compte pour le rate-limit.

---

## 4. Intégration front (portail de `index.html`) — ✅ DÉJÀ IMPLÉMENTÉE

> **À jour :** cette intégration est **déjà en place** dans `index.html` (mode
> distant automatique dès qu'un serveur est configuré via la carte « 🌐 Portail
> en ligne » ou la constante `PORTAL_API`). La section ci-dessous est conservée
> comme **référence technique** du contrat d'API.

Cette section décrit **précisément** ce que le portail devrait appeler. Les
fonctions front concernées lisent aujourd'hui :

- `portailState().codes[ckey(client)]` — validation du code (dans `svcPortLogin`) ;
- `clientSharedDocs(client)` — liste des documents partagés (dans `portailRenderDocs`) ;
- `cofFiles()[fileId]` — le fichier lui-même (dans `svcPortFileView` / `svcPortFileDl`).

### Ce qu'il faut remplacer

| Aujourd'hui (localStorage) | Demain (backend) |
|----------------------------|------------------|
| `svcPortLogin` compare le code à `portailState().codes[...]` | `POST /portal/login {client,code}` → conserve le `token` renvoyé |
| `portailRenderDocs` lit `clientSharedDocs(client)` | `GET /portal/docs` (Bearer token) → `json.docs` |
| `svcPortFileView(fid)` lit `cofFiles()[fid].data` | ouvre `GET /portal/file/<id>` (avec le token) |
| `svcPortFileDl(fid)` lit `cofFiles()[fid].data` | télécharge `GET /portal/file/<id>` (avec le token) |

La forme des documents renvoyés (`{id, nom, cat, date, type, size}`) est
volontairement alignée sur les items du coffre côté front (`d.fileId` devient `d.id`).

### Extraits front indicatifs (à intégrer dans le bloc portail)

```js
// Base URL du backend (à externaliser dans un réglage cabinet plutôt qu'en dur).
var PORTAL_API = 'https://portail.aemconseil.eu';
var portToken = null; // jeton de session courant

// 1) Connexion — remplace la vérification locale de svcPortLogin
window.svcPortLogin = async function () {
  var c = (document.getElementById('port-in-client') || {}).value || '';
  var code = ((document.getElementById('port-in-code') || {}).value || '').trim().toUpperCase();
  try {
    var r = await fetch(PORTAL_API + '/portal/login', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ client: c, code: code })
    });
    if (!r.ok) { portErr('Nom de client ou code d’accès incorrect.'); return; }
    var j = await r.json();
    portToken = j.token;                       // à garder en mémoire (pas en localStorage de préférence)
    var ov = document.getElementById('portail-ov');
    if (ov) portailRenderDocs(ov, j.client || c);
  } catch (e) { portErr('Serveur indisponible. Réessayez plus tard.'); }
};

// 2) Liste — remplace clientSharedDocs(client) par un appel réseau
async function portailChargerDocs() {
  var r = await fetch(PORTAL_API + '/portal/docs', {
    headers: { 'Authorization': 'Bearer ' + portToken }
  });
  if (r.status === 401) { portToken = null; return null; } // session expirée -> reconnexion
  var j = await r.json();
  return j.docs; // [{ id, nom, cat, date, type, size }]
}
// (portailRenderDocs devient async : const docs = await portailChargerDocs();)

// 3) Consulter / Télécharger — remplace cofFiles()[fid]
window.svcPortFileView = async function (id) {
  var r = await fetch(PORTAL_API + '/portal/file/' + encodeURIComponent(id), {
    headers: { 'Authorization': 'Bearer ' + portToken }
  });
  if (!r.ok) { toast('Fichier indisponible.'); return; }
  var blob = await r.blob();
  window.open(URL.createObjectURL(blob), '_blank'); // ouvre dans un nouvel onglet
};

window.svcPortFileDl = async function (id, nom) {
  var r = await fetch(PORTAL_API + '/portal/file/' + encodeURIComponent(id), {
    headers: { 'Authorization': 'Bearer ' + portToken }
  });
  if (!r.ok) return;
  var blob = await r.blob();
  var a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = nom || 'document';
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
};
```

Côté **cabinet** (dans le module Coffre-fort), ajouter un bouton « Publier au
portail » qui envoie l'état vers `/admin/sync` — les clients/codes existent déjà
(`portailState().codes`, `cofClients()`), et les documents partagés/fichiers via
`clientSharedDocs()` + `cofFiles()` :

```js
async function publierPortail() {
  var ps = portailState();
  var clients = cofClients().map(function (nom) {
    return { name: nom, code: portailCode(nom) }; // code en clair -> haché côté serveur
  });
  var docs = [], files = {};
  cofClients().forEach(function (nom) {
    clientSharedDocs(nom).forEach(function (it) {
      docs.push({ id: it.fileId, client: nom, nom: it.nom, cat: it.cat,
                  date: it.date, type: it.ftype, size: it.fsize, shared: true });
      var f = cofFiles()[it.fileId];
      if (f) files[it.fileId] = { name: f.name, type: f.type, data: f.data };
    });
  });
  await fetch(PORTAL_API + '/admin/sync', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Cabinet-Token': CABINET_TOKEN_LOCAL },
    body: JSON.stringify({ cabinet: cabName(), clients: clients, docs: docs, files: files })
  });
}
```

> Le `CABINET_TOKEN` ne doit **jamais** être exposé au client. Il ne vit que dans
> l'environnement du cabinet (poste admin) — idéalement la publication passe par
> un petit relais (Apps Script / fonction serveur) détenant le secret, plutôt que
> de l'inscrire dans le front public. Pour les gros volumes, préférez `/admin/sync`
> pour les métadonnées puis un `/admin/file` par fichier.

---

## 5. Rappel CSP / réseau (site `last.aemconseil.eu`)

- Le site étant en **HTTPS**, le backend doit l'être aussi (sinon `fetch` bloqué
  en « mixed content »). Utiliser un domaine dédié, ex. `https://portail.aemconseil.eu`.
- Autoriser l'origine du backend dans une éventuelle **CSP** (`connect-src`), ex. :
  `connect-src 'self' https://portail.aemconseil.eu;`
- Le serveur renvoie déjà les en-têtes **CORS** vers `ALLOWED_ORIGIN` — y mettre
  l'URL exacte du site (`https://last.aemconseil.eu`).

---

## Fichiers

```
server/portal/
├── server.js            # serveur HTTP + routeur (endpoints)
├── lib/
│   ├── config.js        # config + mini-parseur .env + validation des secrets
│   ├── crypto.js        # scrypt (codes) + jetons HMAC + comparaisons constantes
│   ├── store.js         # stockage disque (clients/docs/meta JSON + files/)
│   └── ratelimit.js     # anti brute-force en mémoire
├── scripts/smoke.js     # test de bout en bout (npm run smoke)
├── package.json         # scripts start / check / smoke (aucune dépendance)
├── .env.example         # gabarit de configuration
├── .gitignore           # ignore .env et data/
└── README.md
```

---

## Déploiement en un clic

Trois fichiers prêts à l'emploi sont fournis (aucune dépendance à installer, le serveur est en Node natif).

### Option A — Render (le plus simple)
1. Poussez ce dépôt sur GitHub.
2. Render → **New → Blueprint** → sélectionnez le dépôt : Render lit le `render.yaml` à la racine du dépôt, crée le service, **génère automatiquement** `CABINET_TOKEN` et `JWT_SECRET`, et monte un disque persistant (`/var/data`).
3. Vérifiez la variable **`ALLOWED_ORIGIN`** = l'URL exacte de votre site (ex. `https://last.aemconseil.eu`).
4. Récupérez l'URL publique du service (ex. `https://marq-portail.onrender.com`) et le `CABINET_TOKEN` (onglet *Environment*).

> Le disque persistant nécessite un plan **Starter**. En plan gratuit, supprimez la section `disk` du `render.yaml` : les fichiers deviennent éphémères (il suffit de **resynchroniser** depuis Mar'q après chaque redéploiement).

### Option B — Fly.io (volumes inclus)
```bash
cd server/portal
fly launch --no-deploy
fly volumes create marq_data --size 1 --region cdg
fly secrets set CABINET_TOKEN=$(openssl rand -hex 32) \
                JWT_SECRET=$(openssl rand -hex 32) \
                ALLOWED_ORIGIN=https://last.aemconseil.eu
fly deploy
```

### Option C — Docker (n'importe quel hébergeur / VPS)
```bash
cd server/portal
docker build -t marq-portail .
docker run -d --name marq-portail -p 8787:8787 \
  -e CABINET_TOKEN=$(openssl rand -hex 32) \
  -e JWT_SECRET=$(openssl rand -hex 32) \
  -e ALLOWED_ORIGIN=https://last.aemconseil.eu \
  -v marq_data:/data \
  marq-portail
```

### Option D — Déploiement automatique (GitHub Actions → Fly.io)
Le workflow `.github/workflows/deploy-portal.yml` **vérifie** le serveur (syntaxe +
tests smoke) à chaque push, puis **déploie sur Fly.io** dès que le dossier
`server/portal/` change. Activation :
1. Créez l'app + le volume une première fois en local (option B ci-dessus).
2. Générez un jeton de déploiement : `fly tokens create deploy`.
3. GitHub → **Settings → Secrets and variables → Actions → New repository secret** :
   nom `FLY_API_TOKEN`, valeur = le jeton.

Sans ce secret, le workflow se contente de vérifier le serveur (le déploiement est
ignoré, sans erreur).

### Brancher Mar'q (une fois le serveur en ligne)
1. Dans Mar'q → **Services → Coffre-fort & portail client → « 🌐 Portail en ligne »** : collez l'**adresse du serveur** et le **secret cabinet** (`CABINET_TOKEN`), puis **Tester la connexion** et **Synchroniser maintenant**.
2. Pour que vos clients atteignent le serveur depuis leurs propres appareils, renseignez la même adresse dans la constante **`PORTAL_API`** (en tête du bloc portail de `index.html`), puis redéployez le site.

Vos clients se connectent alors sur `https://votre-site/#portail` avec leur **nom** + **code d'accès**, et consultent uniquement leurs documents partagés, en lecture seule.
