/**
 * LAST — Numérotation des dossiers configurable.
 *   node tests/numconfig.mjs
 */
import path from 'path';
import { pathToFileURL } from 'url';
async function loadChromium() {
  const cands = [process.env.PLAYWRIGHT_PKG, 'playwright',
    '/opt/node22/lib/node_modules/playwright/index.js', '/usr/lib/node_modules/playwright/index.js'].filter(Boolean);
  for (const c of cands) { try { const spec = c.endsWith('.js') ? pathToFileURL(c).href : c; const mod = await import(spec); const ch = mod.chromium || (mod.default && mod.default.chromium); if (ch) return ch; } catch (_) {} }
  throw new Error('Playwright introuvable');
}
const results = []; const check = (n, c) => results.push({ n, ok: !!c });
const chromium = await loadChromium();
const url = pathToFileURL(path.resolve('index.html')).href;
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 1000 } });
const perr = []; page.on('pageerror', e => { const s = '' + e; if (!/ServiceWorker/.test(s)) perr.push(s); });
await page.addInitScript(() => { try { localStorage.setItem('last-gate-ok', '1'); } catch (e) {} });
await page.goto(url, { waitUntil: 'networkidle' });
await page.waitForTimeout(300);

const r = await page.evaluate(() => {
  window.confirm = () => true; window.toast = () => {}; window.render = window.render || (() => {});
  const out = {};
  const Y = '' + new Date().getFullYear();
  out.hasFn = ['numCfg', 'numDossierFormat', 'numDossierPreview', 'numDossierNext', 'numDossierCard'].every(f => typeof window[f] === 'function');

  // défaut : DOS-<année>-001
  numCfg().compteurs = {}; // repart de zéro
  out.preview = numDossierPreview() === 'DOS-' + Y + '-001';

  // next incrémente et persiste par année
  const a = numDossierNext(), b = numDossierNext();
  out.next = a === 'DOS-' + Y + '-001' && b === 'DOS-' + Y + '-002' && numCfg().compteurs[Y] === 2;
  out.previewAfter = numDossierPreview() === 'DOS-' + Y + '-003';

  // format personnalisé : préfixe AEM, sans année, 4 chiffres
  const c = numCfg(); c.prefix = 'AEM'; c.annee = false; c.taille = 4; c.compteurs = {};
  out.custom = numDossierFormat(1) === 'AEM-0001' && numDossierPreview() === 'AEM-0001';

  // compteur de départ éditable
  c.compteurs[Y] = 41;
  out.startAt = numDossierNext() === 'AEM-0042';

  // remise au format par défaut pour la création
  c.prefix = 'DOS'; c.annee = true; c.taille = 3; c.compteurs = {};

  // création de dossier sans numéro d'intake → numéro attribué par la config
  const dd = { id: 'dd-num', clientNom: 'Zoé', clientEmail: 'z@z.fr', statut: 'Qualification',
    intake: { version: 'LASTv1', type: 'sas', societe: { denomination: 'NUM', capital: '1000', objet: 'X', regime: 'IS' }, siege: { rue: 'r', cp: '75001', ville: 'Paris' }, direction: { nom: 'Z', prenom: 'A' }, associes: [{ nom: 'Z', prenom: 'A', parts: '1000' }], contact: { nom: 'Z', prenom: 'A', email: 'z@z.fr' } } };
  DB.demandes.unshift(dd);
  const d1 = creerDossierDepuis(dd.id, true);
  out.assigned = d1.numeroDossier === 'DOS-' + Y + '-001';

  // création avec numéro d'intake fourni → préservé
  const dd2 = { id: 'dd-num2', clientNom: 'Bo', clientEmail: 'b@b.fr', statut: 'Qualification',
    intake: { version: 'LASTv1', type: 'sarl', numeroDossier: 'DOS-2099-777', societe: { denomination: 'NUM2', capital: '1000', objet: 'X', regime: 'IS' }, siege: { rue: 'r', cp: '75001', ville: 'Paris' }, direction: { nom: 'B', prenom: 'O' }, associes: [{ nom: 'B', prenom: 'O', parts: '1000' }], contact: { nom: 'B', prenom: 'O', email: 'b@b.fr' } } };
  DB.demandes.unshift(dd2);
  const d2 = creerDossierDepuis(dd2.id, true);
  out.preserve = d2.numeroDossier === 'DOS-2099-777';
  // le compteur n'a pas bougé pour le dossier à numéro fourni
  out.noConsume = numCfg().compteurs[Y] === 1;

  // enregistrement via la carte
  document.body.insertAdjacentHTML('beforeend', '<div>' + numDossierCard() + '</div>');
  document.getElementById('num-prefix').value = 'YADA';
  document.getElementById('num-taille').value = '5';
  document.getElementById('num-compteur').value = '10';
  document.getElementById('num-annee').checked = true;
  numCfgSave();
  out.saved = numCfg().prefix === 'YADA' && numCfg().taille === 5 && numDossierPreview() === 'YADA-' + Y + '-00011';

  const params = pageParams();
  out.card = /Numérotation des dossiers/.test(params) && /num-card/.test(params) && /Prochain/.test(params);
  return out;
});

await browser.close();
check('fonctions numérotation présentes', r.hasFn);
check('aperçu par défaut DOS-<année>-001', r.preview);
check('next incrémente + persiste par année', r.next);
check('aperçu suivant = 003', r.previewAfter);
check('format personnalisé AEM-0001 (sans année, 4 chiffres)', r.custom);
check('compteur de départ éditable (→ 0042)', r.startAt);
check('création sans n° d’intake → n° attribué par la config', r.assigned);
check('n° d’intake fourni → préservé', r.preserve);
check('n° fourni ne consomme pas le compteur', r.noConsume);
check('enregistrement via la carte (YADA-…-00011)', r.saved);
check('carte « Numérotation des dossiers » dans Paramètres', r.card);
check('aucun pageerror', perr.length === 0);

const ok = results.filter(x => x.ok).length, tot = results.length;
results.forEach(x => { if (!x.ok) console.log('✗ ' + x.n); });
if (perr.length) console.log('pageerrors:', perr.slice(0, 4).join(' | '));
console.log(`\nLAST numérotation configurable : ${ok}/${tot} ` + (ok === tot ? 'OK — tout vert' : 'ÉCHEC'));
process.exit(ok === tot ? 0 : 1);
