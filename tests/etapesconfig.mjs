/**
 * LAST — Étapes de traitement configurables (par type de formalité).
 *   node tests/etapesconfig.mjs
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
  out.hasFn = ['etapesEffective', 'ecfgAdd', 'ecfgRemove', 'ecfgMove', 'ecfgReset', 'etapesConfigCard'].every(f => typeof window[f] === 'function');

  const d = { id: 'd-ec', clientIds: [], forme: 'SAS', serviceSouhaite: 'Création SAS', statut: 'Qualification' };
  DB.demandes = DB.demandes || []; DB.demandes.unshift(d);
  const type = formaliteType(d);
  out.type = type === 'creation_sas';

  const base = demEtapes(d);
  out.baseNonVide = base.length >= 4;
  out.defautModele = !(DB.parametres && DB.parametres.etapesConfig && DB.parametres.etapesConfig[type]);

  // ajouter une étape → demEtapes reflète
  document.body.insertAdjacentHTML('beforeend', '<input id="ecfg-add" value="Vérification anti-blanchiment (LCB-FT)">');
  ecfgAdd(type);
  out.materialise = !!(DB.parametres.etapesConfig && DB.parametres.etapesConfig[type]);
  out.ajout = demEtapes(d).some(s => /anti-blanchiment/i.test(s)) && demEtapes(d).length === base.length + 1;

  // réordonner : monter la dernière d'un cran
  const before = demEtapes(d).slice();
  const last = before.length - 1;
  ecfgMove(type, last, -1);
  const after = demEtapes(d);
  out.move = after[last - 1] === before[last] && after[last] === before[last - 1];
  // borne : monter l'élément 0 ne fait rien
  const a0 = demEtapes(d).slice();
  ecfgMove(type, 0, -1);
  out.moveBorne = JSON.stringify(demEtapes(d)) === JSON.stringify(a0);

  // retirer une étape
  const n = demEtapes(d).length;
  ecfgRemove(type, 0);
  out.retire = demEtapes(d).length === n - 1;

  // la checklist reflète les étapes personnalisées
  const prog = demChkProgress(d);
  out.checklist = prog.total === demEtapes(d).length;

  // réinitialiser → retour au modèle
  ecfgReset(type);
  out.reset = !(DB.parametres.etapesConfig && DB.parametres.etapesConfig[type]) && JSON.stringify(demEtapes(d)) === JSON.stringify(base);

  // un type n'affecte pas un autre
  ecfgRemove('creation_sas', 0);
  const dSarl = { id: 'd-ec2', clientIds: [], forme: 'SARL', serviceSouhaite: 'Création SARL' };
  out.isole = !(DB.parametres.etapesConfig && DB.parametres.etapesConfig['creation_sarl']);
  ecfgReset('creation_sas');

  // carte rendue
  const params = pageParams();
  out.card = /Étapes de traitement/.test(params) && /ecfg-card/.test(params) && /Type de formalité/.test(params);
  return out;
});

await browser.close();
check('fonctions étapes configurables présentes', r.hasFn);
check('type de formalité détecté', r.type);
check('modèle d’étapes non vide', r.baseNonVide);
check('par défaut : modèle standard', r.defautModele);
check('ajout matérialise la config', r.materialise);
check('demEtapes reflète l’ajout', r.ajout);
check('réordonner (↑) inverse deux étapes', r.move);
check('borne : monter la 1ʳᵉ ne fait rien', r.moveBorne);
check('retirer une étape', r.retire);
check('la checklist suit les étapes personnalisées', r.checklist);
check('réinitialiser → retour au modèle', r.reset);
check('la config d’un type n’affecte pas un autre', r.isole);
check('carte « Étapes de traitement » dans Paramètres', r.card);
check('aucun pageerror', perr.length === 0);

const ok = results.filter(x => x.ok).length, tot = results.length;
results.forEach(x => { if (!x.ok) console.log('✗ ' + x.n); });
if (perr.length) console.log('pageerrors:', perr.slice(0, 4).join(' | '));
console.log(`\nLAST étapes configurables : ${ok}/${tot} ` + (ok === tot ? 'OK — tout vert' : 'ÉCHEC'));
process.exit(ok === tot ? 0 : 1);
