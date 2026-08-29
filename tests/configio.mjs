/**
 * LAST — Sauvegarde / restauration de la configuration du logiciel (Chantier A).
 *   node tests/configio.mjs
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
  out.hasFn = ['configExportData', 'configExport', 'configImport', 'configImportFile', 'configIOCard'].every(f => typeof window[f] === 'function');

  // Prépare une configuration + des DONNÉES à ne pas exporter
  DB.parametres = DB.parametres || {};
  DB.parametres.piecesConfig = { sas: [{ k: 'x', label: 'Pièce X' }] };
  DB.parametres.etapesConfig = { sas: ['Étape 1', 'Étape 2'] };
  DB.parametres.depotMsg = { sujet: 'S', corps: 'Bonjour {prenom}' };
  DB.parametres.mailModeles = { accuse: { sujet: 'A', corps: 'B' } };
  DB.parametres.slaJours = 5;
  DB.parametres.numDossier = { prefix: 'AEM', annee: true, taille: 4, compteurs: { '2026': 12 } };
  DB.parametres.mailsImportes = [{ id: 'm1' }];  // DONNÉE — ne doit pas sortir
  DB.parametres.demSeq = 99;                       // DONNÉE — ne doit pas sortir

  const p = configExportData();
  out.shape = p.app === 'LAST' && p.kind === 'config' && p.version === 1 && !!p.exportedAt && !!p.config;
  const C = p.config;
  out.hasConfig = C.piecesConfig && C.etapesConfig && C.depotMsg && C.mailModeles && C.slaJours === 5 && C.numDossier;
  // numDossier exporté SANS les compteurs
  out.noCounters = C.numDossier.prefix === 'AEM' && C.numDossier.compteurs === undefined;
  // les DONNÉES ne fuitent pas
  out.noData = C.mailsImportes === undefined && C.demSeq === undefined && JSON.stringify(p).indexOf('mailsImportes') < 0;

  // Round-trip : on modifie tout, puis on réimporte le payload initial
  const backup = JSON.parse(JSON.stringify(p));
  DB.parametres.piecesConfig = {};
  DB.parametres.slaJours = 99;
  DB.parametres.numDossier = { prefix: 'ZZZ', annee: false, taille: 2, compteurs: { '2026': 500 } };
  const res = configImport(backup);
  out.applied = res.ok && res.applied.indexOf('piecesConfig') >= 0 && res.applied.indexOf('numDossier') >= 0;
  out.restored = DB.parametres.piecesConfig.sas && DB.parametres.slaJours === 5 && DB.parametres.numDossier.prefix === 'AEM' && DB.parametres.numDossier.taille === 4;
  // les compteurs LOCAUX sont préservés (pas ceux du fichier — il n'en a pas)
  out.keepCounters = DB.parametres.numDossier.compteurs && DB.parametres.numDossier.compteurs['2026'] === 500;

  // Import d'un fichier étranger → refusé proprement
  const bad = configImport({ hello: 'world' });
  out.rejectBad = bad.ok === false && bad.error === 'shape';
  const badTxt = configImport('{ pas du json');
  out.rejectParse = badTxt.ok === false;

  // export retourne le payload (et déclenche le téléchargement sans erreur)
  const dl = configExport();
  out.exportReturns = dl && dl.kind === 'config';

  // Carte dans Paramètres
  const params = pageParams();
  out.card = /Sauvegarde de la configuration/.test(params) && /cfgio-card/.test(params) && /Exporter la configuration/.test(params) && /Importer une configuration/.test(params);
  // résumé affiché
  out.summary = /Pièces par formalité/.test(params) && /Modèles d.e-mails/.test(params);

  return out;
});

await browser.close();
check('fonctions présentes (export/import/carte)', r.hasFn);
check('payload : app/kind/version/exportedAt/config', r.shape);
check('config exportée : pièces/étapes/dépôt/e-mails/SLA/numéro', r.hasConfig);
check('numérotation exportée SANS les compteurs', r.noCounters);
check('aucune donnée exportée (mailsImportes/demSeq exclus)', r.noData);
check('import applique les réglages', r.applied);
check('round-trip : configuration restaurée', r.restored);
check('compteurs locaux préservés à l’import', r.keepCounters);
check('fichier étranger → refusé (shape)', r.rejectBad);
check('texte non-JSON → refusé (parse)', r.rejectParse);
check('export retourne le payload', r.exportReturns);
check('carte « Sauvegarde de la configuration » dans Paramètres', r.card);
check('résumé des réglages affiché', r.summary);
check('aucun pageerror', perr.length === 0);

const ok = results.filter(x => x.ok).length, tot = results.length;
results.forEach(x => { if (!x.ok) console.log('✗ ' + x.n); });
if (perr.length) console.log('pageerrors:', perr.slice(0, 4).join(' | '));
console.log(`\nLAST export/import config : ${ok}/${tot} ` + (ok === tot ? 'OK — tout vert' : 'ÉCHEC'));
process.exit(ok === tot ? 0 : 1);
