/**
 * LAST — GED intelligente : extraction des métadonnées + recherche plein texte.
 *   node tests/ged.mjs
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
  window.confirm = () => true; window.toast = () => {};
  const out = {};
  const intake = { version: 'LASTv1', type: 'sas', numeroDossier: 'DOS-2026-G1',
    societe: { denomination: 'ORION TECH', capital: '5000', objet: 'Édition de logiciels', regime: 'IS', siren: '900111222' },
    siege: { rue: '10 avenue des Lilas', cp: '69003', ville: 'Lyon', type: 'Local commercial (bail)', bailleur: 'SCI Lilas' },
    direction: { nom: 'Fabre', prenom: 'Nora', naissance: '1988-03-03', nationalite: 'Française', adresse: '10 avenue des Lilas Lyon' },
    associes: [{ nom: 'Fabre', prenom: 'Nora', apport: '3000', parts: '3000' }, { nom: 'Girard', prenom: 'Elias', apport: '2000', parts: '2000' }],
    contact: { nom: 'Fabre', prenom: 'Nora', email: 'nora@orion.tech' } };
  const dd = { id: 't-ged1', clientNom: 'Nora Fabre', clientEmail: 'nora@orion.tech', statut: 'Qualification', intake };
  DB.demandes.unshift(dd);
  const d = creerDossierDepuis(dd.id, true);
  const c = clientById(d.clientIds[0]) || {};
  if (c && !c.siren) c.siren = '900111222';
  d.docs = { statuts: { genere: true }, pouvoir: { genere: true } };

  out.hasFn = typeof gedMetadata === 'function' && typeof gedHaystack === 'function' && typeof gedMatch === 'function';
  const md = gedMetadata(d);
  const F = k => (md.fields.find(f => f[0] === k) || [])[1] || '';
  out.metaDenom = /ORION TECH/.test(F('Dénomination'));
  out.metaSiren = /900111222/.test(F('SIREN'));
  out.metaSiege = /Lyon/.test(F('Siège')) && /69003/.test(F('Siège'));
  out.metaAssoc = /Girard/.test(F('Associés')) && /Fabre/.test(F('Associés'));
  out.metaDocs = /Statuts|statuts/i.test(F('Documents'));
  out.metaNum = md.num === 'DOS-2026-G1';

  // haystack + match plein texte
  const hay = gedHaystack(d);
  out.hayObjet = hay.indexOf('logiciels') >= 0;   // objet social indexé
  out.hayVille = hay.indexOf('lyon') >= 0;
  out.matchSiren = gedMatch(d, '900111').some(f => f[0] === 'SIREN');
  out.matchAssoc = gedMatch(d, 'girard').some(f => f[0] === 'Associés');

  // recherche omnibox : trouve le dossier par un terme profond (associé, ville, objet)
  function search(q) { gSearchRender(q); const el = document.getElementById('gsearch'); return el ? el.innerHTML : ''; }
  out.searchAssoc = /DOS-2026-G1/.test(search('Girard'));       // par nom d'associé
  out.searchVille = /DOS-2026-G1/.test(search('Lyon'));         // par ville du siège
  out.searchObjet = /DOS-2026-G1/.test(search('logiciels'));    // par objet social
  out.searchSiren = /DOS-2026-G1/.test(search('900111'));       // par SIREN
  out.searchSnippet = /Associés\s*:/.test(search('Girard'));    // extrait du champ correspondant
  out.searchNone = /Aucun résultat/.test(search('zzzxqyw'));

  // métadonnées dans la fiche d'archive
  out.archiveMeta = /Métadonnées extraites/.test(archiveHTML(d)) && /ORION TECH/.test(archiveHTML(d));
  return out;
});

await browser.close();
check('fonctions gedMetadata / gedHaystack / gedMatch', r.hasFn);
check('métadonnée : dénomination extraite', r.metaDenom);
check('métadonnée : SIREN extrait', r.metaSiren);
check('métadonnée : siège (ville + CP)', r.metaSiege);
check('métadonnée : associés extraits', r.metaAssoc);
check('métadonnée : documents générés listés', r.metaDocs);
check('métadonnée : numéro de dossier', r.metaNum);
check('index plein texte : objet social', r.hayObjet);
check('index plein texte : ville', r.hayVille);
check('correspondance champ SIREN', r.matchSiren);
check('correspondance champ Associés', r.matchAssoc);
check('recherche par nom d’associé', r.searchAssoc);
check('recherche par ville du siège', r.searchVille);
check('recherche par objet social', r.searchObjet);
check('recherche par SIREN', r.searchSiren);
check('extrait du champ correspondant affiché', r.searchSnippet);
check('aucun résultat pour terme absent', r.searchNone);
check('métadonnées extraites dans la fiche d’archive', r.archiveMeta);
check('aucun pageerror', perr.length === 0);

const ok = results.filter(x => x.ok).length, tot = results.length;
results.forEach(x => { if (!x.ok) console.log('✗ ' + x.n); });
if (perr.length) console.log('pageerrors:', perr.slice(0, 4).join(' | '));
console.log(`\nLAST GED intelligente : ${ok}/${tot} ` + (ok === tot ? 'OK — tout vert' : 'ÉCHEC'));
process.exit(ok === tot ? 0 : 1);
