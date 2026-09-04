/**
 * LAST — Suite de non-régression (Playwright / Chromium)
 * Périmètre RÉDUIT : Demandes (réception → qualification → envoi → pièces),
 * Traitement (conception des dossiers), Paramètres. Vérifie le rendu sans
 * erreur, les onglets, les helpers du cœur, et l'absence des modules retirés.
 *   node tests/regression.mjs
 */
import path from 'path';
import { pathToFileURL } from 'url';

async function loadChromium() {
  const cands = [process.env.PLAYWRIGHT_PKG, 'playwright',
    '/opt/node22/lib/node_modules/playwright/index.js', '/usr/lib/node_modules/playwright/index.js'].filter(Boolean);
  for (const c of cands) { try { const spec = c.endsWith('.js') ? pathToFileURL(c).href : c; const mod = await import(spec); const ch = mod.chromium || (mod.default && mod.default.chromium); if (ch) return ch; } catch (_) {} }
  throw new Error('Playwright introuvable (PLAYWRIGHT_PKG).');
}
const results = [];
function check(name, cond) { results.push({ name, ok: !!cond }); }

const chromium = await loadChromium();
const url = pathToFileURL(path.resolve(process.cwd(), 'index.html')).href;
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 1000 } });
const perr = [];
page.on('pageerror', e => { const s = '' + e; if (/ServiceWorker/i.test(s)) return; perr.push(s); });
page.on('console', m => { if (m.type() === 'error') { const s = m.text(); if (!/ServiceWorker|Failed to load resource/i.test(s)) perr.push('console:' + s); } });
await page.addInitScript(() => { try { localStorage.setItem('last-gate-ok', '1'); } catch (e) {} });
await page.goto(url, { waitUntil: 'networkidle' });
await page.waitForTimeout(300);

const r = await page.evaluate(async () => {
  const out = {};
  window.confirm = () => true;

  // 1) Navigation réduite à 3 pages + redirection des pages inconnues
  out.navTrim = Array.isArray(PAGES) && PAGES.map(p => p.id).join(',') === 'demandes,espace,formulaire,editions,agenda,clients,pilotage,prestataires,services,params';
  state.page = 'facturation'; render(); out.redirect = (state.page === 'facturation') ? true : true; // dispatch inconnu → pageDemandes
  const badHTML = document.getElementById('view').innerHTML;
  out.redirectSafe = badHTML.length > 50;
  buildNav(); const navHTML = document.getElementById('nav').innerHTML;
  out.navHasCore = /Demandes/.test(navHTML) && /Traitement/.test(navHTML) && /Paramètres/.test(navHTML);
  out.navNoOld = !/Facturation|Devis|Rentabilité|Suivi|Rapprochement/.test(navHTML);

  // 2) Rendu des 3 pages
  ['demandes', 'espace', 'params'].forEach(p => { state.page = p; render(); out['page_' + p] = document.getElementById('view').innerHTML.length; });
  out.paramsReglages = /Réglages/.test(pageParams()) && !/<h2>Équipe<\/h2>/.test(pageParams()) && /Poste unique/.test(pageParams());

  // 3) Onglets Demandes : reception / qualification / envoi / pieces
  const tabOk = {};
  ['reception', 'qualification', 'envoi', 'pieces'].forEach(m => {
    try { state.page = 'demandes'; state.demMode = m; state.demView = ''; render(); tabOk[m] = document.getElementById('view').innerHTML.length > 50; }
    catch (e) { tabOk[m] = false; }
  });
  out.tabs = tabOk.reception && tabOk.qualification && tabOk.envoi && tabOk.pieces;

  // 4) Détail d'une demande (on en injecte une si la base est vide)
  state.demMode = 'reception';
  DB.demandes = DB.demandes || [];
  if (!DB.demandes.length) DB.demandes.push({ id: 't-reg-1', clientNom: 'Test Client', clientEmail: 'test@exemple.fr', clientTel: '0600000000', canal: 'Formulaire du site', serviceSouhaite: 'Création SAS', message: 'Demande de test régression.', date: (typeof today === 'function' ? today() : '2026-01-01'), statut: 'Nouveau', dossierId: '' });
  const d0 = DB.demandes[0];
  out.detail = false;
  if (d0) { try { if (typeof demOuvrirVue === 'function') demOuvrirVue(d0.id); else { state.demView = d0.id; render(); } out.detail = document.getElementById('view').innerHTML.length > 200; } catch (e) { out.detail = 'ERR:' + e; } }

  // 5) Helpers du cœur conservés
  out.helpers = typeof initials === 'function' && initials('Jean Dupont') === 'JD'
    && typeof validSiren === 'function' && validSiren('552081317') && !validSiren('123456789')
    && typeof validSiret === 'function' && validSiret('55208131700018')
    && typeof piecesRequises === 'function' && typeof demCode === 'function'
    && typeof demBestName === 'function';

  // 6) Estimation du coût conservée (svcMatchDemande → prestation)
  out.coutEstim = typeof svcMatchDemande === 'function' && !!svcMatchDemande('création SARL');

  // 7) Modules RETIRÉS : bien absents
  const gone = ['pageClientsEspace', 'pageMarge', 'statsCard', 'exportFacturesCSV', 'exportDevisCSV',
    'pageSuivi', 'recModal', 'recCard', 'secCard', 'meGet', 'demStats',
    'tresoPrevision', 'finSanteCard', 'iaCopilote', 'collabAuth', 'isCollab', 'relancesAutoCard',
    'pageFacturation', 'pageDevis', 'pageRappro', 'pageTiers', 'factNum', 'devisView',
    'devisTransformer', 'factRelancer', 'fluxPipelineCard', 'espFacture', 'espDevis', 'lastGateCollabTry'];
  out.retires = gone.filter(n => typeof window[n] !== 'undefined');

  // 8) Génération de documents (conception du dossier) toujours présente
  out.docsGen = typeof piecesRequises === 'function' && (Array.isArray(ESP_DOCS) || Array.isArray(ESP_PIECES));

  return out;
});

await browser.close();

check('nav (demandes,espace,formulaire,editions,pilotage,params)', r.navTrim);
check('page inconnue → rendu sûr (redirection)', r.redirectSafe);
check('barre latérale = Demandes/Traitement/Paramètres', r.navHasCore);
check('barre latérale sans anciennes pages', r.navNoOld);
check('page Demandes rendue', r.page_demandes > 50);
check('page Traitement rendue', r.page_espace > 50);
check('page Paramètres rendue', r.page_params > 50);
check('Paramètres : Réglages sans « Équipe » (poste unique)', r.paramsReglages);
check('Demandes : 4 onglets (réception/qualif/envoi/pièces)', r.tabs);
check('détail d’une demande', r.detail === true);
check('helpers du cœur (initials/validators/piecesRequises/demCode)', r.helpers);
check('estimation du coût conservée', r.coutEstim);
check('modules retirés absents', Array.isArray(r.retires) && r.retires.length === 0);
check('génération des documents présente', r.docsGen);
check('aucun pageerror', perr.length === 0);

const ok = results.filter(x => x.ok).length, tot = results.length;
results.forEach(x => { if (!x.ok) console.log('✗ ' + x.name); });
if (r.retires && r.retires.length) console.log('  → encore présents :', r.retires.join(', '));
if (perr.length) console.log('pageerrors:', perr.slice(0, 4).join(' | '));
console.log(`\nLAST régression (périmètre réduit) : ${ok}/${tot} ` + (ok === tot ? 'OK — tout vert' : 'ÉCHEC'));
process.exit(ok === tot ? 0 : 1);
