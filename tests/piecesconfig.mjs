/**
 * LAST — Pièces à demander configurables (par type de formalité).
 *   node tests/piecesconfig.mjs
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
  out.hasFn = ['pcfgEffective', 'pcfgAdd', 'pcfgRemove', 'pcfgReset', 'piecesConfigCard'].every(f => typeof window[f] === 'function');

  // dossier de création SAS
  DB.clients = DB.clients || [];
  DB.clients.push({ id: 'c-pc', denomination: 'PC', forme: 'SAS', president: 'A', associes: [{ nom: 'A', parts: '1000' }] });
  const d = { id: 'd-pc', clientIds: ['c-pc'], forme: 'SAS', serviceSouhaite: 'Création SAS', statut: 'Qualification' };
  DB.dossiers = DB.dossiers || []; DB.dossiers.unshift(d);
  const type = formaliteType(d);
  out.type = type === 'creation_sas';

  const base = piecesRequises(d).map(p => p.label);
  out.baseNonVide = base.length >= 3;

  // sans config → modèle standard
  out.defautModele = !(DB.parametres && DB.parametres.piecesConfig && DB.parametres.piecesConfig[type]);

  // retirer une pièce → config matérialisée, piecesRequises reflète
  const n0 = piecesRequises(d).length;
  pcfgRemove(type, 0);
  out.materialise = !!(DB.parametres.piecesConfig && DB.parametres.piecesConfig[type]);
  out.retire = piecesRequises(d).length === n0 - 1;

  // ajouter une pièce personnalisée
  document.body.insertAdjacentHTML('beforeend', '<input id="pcfg-add" value="Kbis société mère">');
  pcfgAdd(type);
  const lbls = piecesRequises(d).map(p => p.label);
  out.ajout = lbls.some(l => /Kbis société mère/.test(l));
  out.ajoutK = DB.parametres.piecesConfig[type].some(p => /Kbis/.test(p.label) && p.k && p.k.length > 3);

  // réinitialiser → retour au modèle
  pcfgReset(type);
  out.reset = !(DB.parametres.piecesConfig && DB.parametres.piecesConfig[type]) && piecesRequises(d).length === base.length;

  // config d'un type n'affecte pas un autre type
  const dSarl = { id: 'd-pc2', clientIds: [], forme: 'SARL', serviceSouhaite: 'Création SARL', statut: 'Qualification' };
  DB.dossiers.unshift(dSarl);
  pcfgRemove('creation_sas', 0);
  out.isole = piecesRequises(dSarl).length === piecesRequises({ id: 'x', forme: 'SARL', serviceSouhaite: 'Création SARL' }).length
    && !(DB.parametres.piecesConfig && DB.parametres.piecesConfig['creation_sarl']);
  pcfgReset('creation_sas');

  // carte rendue dans Paramètres
  const params = pageParams();
  out.card = /Pièces à demander/.test(params) && /pcfg-card/.test(params) && /Type de formalité/.test(params);
  return out;
});

await browser.close();
check('fonctions pièces configurables présentes', r.hasFn);
check('type de formalité détecté (création SAS)', r.type);
check('modèle de base non vide', r.baseNonVide);
check('par défaut : modèle standard (pas de config)', r.defautModele);
check('retirer une pièce matérialise la config', r.materialise);
check('piecesRequises reflète le retrait', r.retire);
check('ajouter une pièce personnalisée', r.ajout);
check('pièce ajoutée a une clé stable', r.ajoutK);
check('réinitialiser → retour au modèle', r.reset);
check('la config d’un type n’affecte pas un autre', r.isole);
check('carte « Pièces à demander » dans Paramètres', r.card);
check('aucun pageerror', perr.length === 0);

const ok = results.filter(x => x.ok).length, tot = results.length;
results.forEach(x => { if (!x.ok) console.log('✗ ' + x.n); });
if (perr.length) console.log('pageerrors:', perr.slice(0, 4).join(' | '));
console.log(`\nLAST pièces configurables : ${ok}/${tot} ` + (ok === tot ? 'OK — tout vert' : 'ÉCHEC'));
process.exit(ok === tot ? 0 : 1);
