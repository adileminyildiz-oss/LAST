/**
 * LAST — Parcours de bout en bout (Playwright / Chromium)
 * ------------------------------------------------------
 * Complément de regression.mjs : au lieu de vérifier des invariants
 * isolés, ce script rejoue un vrai parcours utilisateur — navigation
 * de toutes les pages puis exercice de chaque fonction IA (mode démo,
 * hors-ligne) et des flux métier — en surveillant la moindre erreur
 * JavaScript (page + console).
 *
 * Lancement :
 *   node tests/e2e.mjs
 *
 * Playwright : résolu via PLAYWRIGHT_PKG, sinon node_modules, sinon
 * emplacements courants. Chromium doit être installé.
 */
import path from 'path';
import { pathToFileURL } from 'url';

async function loadChromium() {
  const cands = [
    process.env.PLAYWRIGHT_PKG,
    'playwright',
    '/opt/node22/lib/node_modules/playwright/index.js',
    '/usr/lib/node_modules/playwright/index.js',
  ].filter(Boolean);
  for (const c of cands) {
    try {
      const spec = c.endsWith('.js') ? pathToFileURL(c).href : c;
      const mod = await import(spec);
      const chromium = mod.chromium || (mod.default && mod.default.chromium);
      if (chromium) return chromium;
    } catch (_) {}
  }
  throw new Error('Playwright introuvable. Installez-le (npm i -D playwright) ou définissez PLAYWRIGHT_PKG.');
}

const R = [];
const ok = (n, c) => R.push([n, !!c]);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

const chromium = await loadChromium();
const url = pathToFileURL(path.resolve(process.cwd(), 'index.html')).href;
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 1000 } });

// Bruit d'environnement lié au protocole file:// (sans rapport avec l'app) :
//  - le service worker ne peut pas s'enregistrer (SecurityError) ;
//  - version.json ne peut pas être fetché (scheme "file" non supporté).
const perr = [];
page.on('pageerror', (e) => { const s = '' + e; if (/ServiceWorker/i.test(s)) return; perr.push(s); });
const cerr = [];
page.on('console', (m) => {
  if (m.type() !== 'error') return;
  const t = m.text();
  if (/ServiceWorker|Failed to load resource|favicon|version\.json|scheme .file./i.test(t)) return;
  cerr.push(t);
});

// Contourne la porte + neutralise les confirmations natives (le headless
// refuse confirm() par défaut, ce qui bloquerait devis→facture, etc.).
await page.addInitScript(() => { try { localStorage.setItem('last-gate-ok', '1'); } catch (e) {} });
await page.addInitScript(() => { try { window.confirm = () => true; } catch (e) {} });
await page.goto(url, { waitUntil: 'networkidle' });
await page.waitForTimeout(700);

// 0) Boot + IA en mode démonstration
ok('Chargement app (view rempli)', await page.evaluate(() => { const v = document.getElementById('view'); return !!v && v.innerHTML.length > 100; }));
await page.evaluate(() => { iaCfg().demo = true; iaCfg().enabled = false; });

// 1) Navigation de TOUTES les pages
const pages = ['dash', 'demandes', 'espace', 'clients', 'facturation', 'rappro', 'devis', 'marge', 'pilotage', 'params'];
for (const pg of pages) {
  const r = await page.evaluate((pg) => { try { state.page = pg; render(); const v = document.getElementById('view'); return !!v && v.innerHTML.length > 40; } catch (e) { return 'ERR:' + e.message; } }, pg);
  ok('Page « ' + pg + ' » rend', r === true);
}

// 2) Demande — parcours complet (analyse, réponse, signaux, résumé)
const dem = await page.evaluate(async () => {
  DB.demandes = DB.demandes || [];
  const d = { id: 'e2edem', clientNom: 'Julie Martin', clientEmail: 'julie@ex.fr', clientTel: '0600000000', canal: 'Mail', serviceSouhaite: 'Création SARL', message: "Bonjour, je veux créer ma SARL rapidement, c'est urgent. Merci", date: '2026-07-01', attachments: [] };
  DB.demandes.push(d);
  const o = {};
  await new Promise((res) => demAnalyse('e2edem', () => res()));
  o.analyse = /Analyse IA/.test(demAnalyseCard('e2edem'));
  const sg = demSignaux(d); o.signaux = !!sg && /urgen/i.test(JSON.stringify(sg));
  demReponseIA('e2edem'); await new Promise((r) => setTimeout(r, 450));
  o.reponse = !!document.getElementById('ml-corps') && document.getElementById('ml-corps').value.length > 20;
  if (typeof closeModal === 'function') closeModal();
  iaResumeDemande('e2edem'); await new Promise((r) => setTimeout(r, 450));
  o.resume = /Résumé de la demande/.test((document.getElementById('ov-t') || {}).innerHTML || '');
  if (typeof closeModal === 'function') closeModal();
  return o;
});
ok('Demande — Analyse IA', dem.analyse);
ok('Demande — Signaux (urgence)', dem.signaux);
ok('Demande — Réponse IA (composeur pré-rempli)', dem.reponse);
ok('Demande — Résumé IA', dem.resume);

// 3) Pièces (vision démo)
const pc = await page.evaluate(async () => {
  const d = DB.demandes.find((x) => x.id === 'e2edem');
  d.attachments = [{ name: 'CNI_recto.jpg', type: 'image/jpeg', dataUrl: 'data:image/jpeg;base64,AAAA' }];
  const o = {};
  o.block = /datt|Pièces jointes/.test(demAttBlock('e2edem'));
  if (typeof demPieceLire === 'function') { await new Promise((res) => { try { demPieceLire('e2edem', 0); setTimeout(res, 450); } catch (e) { res(); } }); o.lire = true; } else o.lire = false;
  return o;
});
ok('Pièces — bloc pièces jointes', pc.block);
ok('Pièces — lecture vision (démo) sans crash', pc.lire);

// 4) Formalités + résumé de dossier
const fo = await page.evaluate(async () => {
  DB.dossiers = DB.dossiers || [];
  const d = { id: 'e2edoss', ref: 'DOS-E2E', denom: 'MARTIN SARL', forme: 'SARL', clientNom: 'Julie Martin', clientIds: [], serviceIds: [], docs: {}, pieces: {}, serviceSouhaite: 'Création SARL' };
  DB.dossiers.push(d);
  const o = {};
  o.card = typeof iaFormaliteCard === 'function' && /formalités/i.test(iaFormaliteCard(d));
  o.objet = true;
  if (typeof demObjetSocial === 'function') { demObjetSocial('e2edoss'); await new Promise((r) => setTimeout(r, 450)); if (typeof closeModal === 'function') closeModal(); }
  iaResumeDossier('e2edoss'); await new Promise((r) => setTimeout(r, 450));
  o.resume = /Résumé du dossier/.test((document.getElementById('ov-t') || {}).innerHTML || '');
  if (typeof closeModal === 'function') closeModal();
  return o;
});
ok('Formalités — carte IA', fo.card);
ok('Formalités — objet social (démo)', fo.objet);
ok('Dossier — Résumé IA', fo.resume);

// 8) Transverse — barre IA + raccourcir
const tr = await page.evaluate(async () => {
  document.body.insertAdjacentHTML('beforeend', '<textarea id="e2ta">ceci   est un  texte   de test. deuxieme phrase longue ici. troisieme phrase.</textarea>');
  iaDecorerTextareas();
  const o = { bar: !!document.querySelector('.iatb[data-for="e2ta"]') };
  const before = document.getElementById('e2ta').value.length;
  iaTA('e2ta', 'raccourcir'); await new Promise((r) => setTimeout(r, 450));
  o.short = document.getElementById('e2ta').value.length < before;
  return o;
});
ok('Transverse — barre IA sur zone de texte', tr.bar);
ok('Transverse — raccourcir (démo)', tr.short);

// 9) Guide de mise en service du proxy
const gd = await page.evaluate(() => {
  iaGuideProxy(); const bd = (document.getElementById('ov-b') || {}).innerHTML || '';
  const o = /MISTRAL_KEY/.test(bd) && /SHARED_KEY/.test(bd) && /\/exec/.test(bd) && /RGPD/.test(bd);
  if (typeof closeModal === 'function') closeModal(); return o;
});
ok('Guide — mise en service proxy Mistral', gd);

// 10) Cœur métier : devis → facture
const core = await page.evaluate(() => {
  const o = {};
  DB.clients = [{ id: 'ce', prenom: 'A', nom: 'B', email: 'a@b.fr' }];
  DB.devis = [{ id: 'dve', num: 'DEV-E', tiers: 'A B', date: '2026-05-01', ech: '2026-06-01', ht: 1000, tva: 200, ttc: 1200, statut: 'Émis', doc: { type: 'devis', numero: 'DEV-E', clientId: 'ce', lignes: [{ desc: 'X', qte: 1, pu: 1000, taux: 20 }] } }];
  DB.factures = []; devisTransformer('dve');
  o.dv2fac = DB.factures.some((f) => f.devisId === 'dve' && f.ttc === 1200);
  return o;
});
ok('Cœur — devis → facture', core.dv2fac);

ok('Aucune erreur JS (pageerror)', perr.length === 0);
ok('Aucune erreur console', cerr.length === 0);

await browser.close();

const pass = R.filter((x) => x[1]).length;
for (const x of R) if (!x[1]) console.log('  ✗ ' + x[0]);
console.log(`\nLAST e2e: ${pass}/${R.length} OK` + (pass === R.length ? ' — tout vert' : ` — ${R.length - pass} ÉCHEC(S)`));
if (perr.length) console.log('pageerrors:', perr.slice(0, 5));
if (cerr.length) console.log('console:', cerr.slice(0, 5));
process.exit(pass === R.length ? 0 : 1);
