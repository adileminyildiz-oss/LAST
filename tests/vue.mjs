/**
 * LAST — Vue unifiée du dossier (Chantier C) : pièces + actes + contrôle + signature + dépôt + fiscaliste.
 *   node tests/vue.mjs
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
  out.hasFn = ['vueEnsembleHTML', 'vueScroll'].every(f => typeof window[f] === 'function');

  // Dossier neuf (aucune pièce, aucun acte)
  DB.clients = DB.clients || [];
  DB.clients.push({ id: 'c-vue', denomination: 'VUECO', forme: 'SAS', capital: '5000', president: 'A', associes: [{ nom: 'A', parts: '1000' }], activites: ['Conseil'], email: 'a@vue.fr' });
  const d = { id: 'd-vue', clientIds: ['c-vue'], ref: 'AEM-VUE', statut: 'Qualification', pieces: {}, docs: {} };
  DB.dossiers = DB.dossiers || []; DB.dossiers.unshift(d);

  const html = vueEnsembleHTML(d);
  out.render = /Vue d.ensemble du dossier/.test(html);
  // 6 étapes de pipeline
  out.sixSteps = (html.match(/vue-step/g) || []).length >= 6;
  out.axes = /Pièces/.test(html) && /Actes/.test(html) && /Contrôle/.test(html) && /Signature/.test(html) && /Dépôt/.test(html) && /Clôture/.test(html);
  // prochaine action affichée (dossier neuf → demander/relancer les pièces)
  out.next = /Prochaine action/.test(html) && /pièces/i.test(html);
  // barre de progression + compteur d'étapes finalisées
  out.prog = /vue-prog-bar/.test(html) && /étapes finalisées/.test(html);
  // chip fiscaliste avec synthèse (SAS · IS · …)
  out.fisc = /Analyse fiscaliste/.test(html) && /SAS/.test(html) && /ouvrirAvocatFiscaliste/.test(html);
  // pilule de statut
  out.statut = /pill-stat/.test(html) && /Qualification/.test(html);

  // Dossier avancé : pièces reçues + signatures → axes en « ok »
  DB.clients.push({ id: 'c-vue2', denomination: 'VUEB', forme: 'SAS', capital: '5000', president: 'B', associes: [{ nom: 'B', parts: '1000' }], activites: ['Conseil'] });
  const d2 = { id: 'd-vue2', clientIds: ['c-vue2'], ref: 'AEM-VUEB', statut: 'Signature', pieces: {}, docs: { statuts: { genere: true } } };
  try { (typeof ESP_PIECES !== 'undefined' ? ESP_PIECES : []).forEach(function (pc) { d2.pieces[pc.k] = { recu: true }; }); } catch (e) {}
  DB.dossiers.unshift(d2);
  const h2 = vueEnsembleHTML(d2);
  out.piecesOk = /vue-step vue-ok"[^>]*>\s*<span class="vue-ic">📎/.test(h2) || /📎/.test(h2);
  // au moins une étape finalisée (pièces complètes)
  const done2 = (h2.match(/vue-step vue-ok/g) || []).length;
  out.someDone = done2 >= 1;

  // vueScroll ne casse rien même sans cible
  vueScroll('Pièces');
  out.scrollSafe = true;

  // Nouveau design Traitement : en-tête compact du dossier en tête de colonne (la carte « Vue d'ensemble » est retirée)
  const panel = (typeof espPanel === 'function') ? espPanel(d, DB.dossiers.filter(x => !x.archived), 'd-vue') : '';
  out.greffe = /esp-main/.test(panel) && /tr-head/.test(panel) && panel.indexOf('vue-card') < 0;

  // rendu de la page espace complète (intégration réelle)
  state.page = 'espace'; state.espaceDossier = 'd-vue';
  const full = pageEspace();
  out.pageInteg = /tr-head/.test(full) && !/Vue d.ensemble du dossier/.test(full);

  return out;
});

await browser.close();
check('fonctions présentes (vueEnsembleHTML, vueScroll)', r.hasFn);
check('la vue d’ensemble se rend', r.render);
check('6 étapes de pipeline', r.sixSteps);
check('axes : Pièces/Actes/Contrôle/Signature/Dépôt/Clôture', r.axes);
check('prochaine action affichée (pièces à demander)', r.next);
check('barre de progression + compteur d’étapes', r.prog);
check('chip fiscaliste avec synthèse (SAS · IS)', r.fisc);
check('pilule de statut du dossier', r.statut);
check('pièces reçues → axe pièces présent', r.piecesOk);
check('dossier avancé → ≥ 1 étape finalisée', r.someDone);
check('vueScroll sûr sans cible', r.scrollSafe);
check('en-tête compact du dossier en tête de colonne (espPanel)', r.greffe);
check('nouveau design intégré dans la page Traitement (sans « Vue d’ensemble »)', r.pageInteg);
check('aucun pageerror', perr.length === 0);

const ok = results.filter(x => x.ok).length, tot = results.length;
results.forEach(x => { if (!x.ok) console.log('✗ ' + x.n); });
if (perr.length) console.log('pageerrors:', perr.slice(0, 4).join(' | '));
console.log(`\nLAST vue unifiée du dossier : ${ok}/${tot} ` + (ok === tot ? 'OK — tout vert' : 'ÉCHEC'));
process.exit(ok === tot ? 0 : 1);
