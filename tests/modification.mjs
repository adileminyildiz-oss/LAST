/**
 * LAST — Volet modification (droits de cession, plus-value, conséquences sociales).
 *   node tests/modification.mjs
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
  const near = (a, b, t) => Math.abs(a - b) <= (t || 1);

  out.hasFn = typeof analyseModification === 'function' && typeof droitsCession === 'function' && typeof plusValueCession === 'function' && typeof modificationHTML === 'function';

  // Droits d'enregistrement
  // SARL, 100 000 €, 100% → abattement 23000, base 77000, 3% = 2310
  out.sarl100 = near(droitsCession({ forme: 'SARL', prix: 100000, quotite: 100 }).droits, 2310);
  // SARL, 100 000 €, 50% → abattement 11500, base 88500, 3% = 2655
  out.sarl50 = near(droitsCession({ forme: 'SARL', prix: 100000, quotite: 50 }).droits, 2655);
  // SAS actions, 100 000 € → 0,1% = 100
  out.sas = near(droitsCession({ forme: 'SAS', prix: 100000 }).droits, 100);
  // SCI parts → 5% = 5000
  out.sci = near(droitsCession({ forme: 'SCI', prix: 100000 }).droits, 5000);

  // Plus-value : 100 000 − 20 000 = 80 000 ; PFU 30% = 24 000
  const pv = plusValueCession({ prix: 100000, acquisition: 20000 });
  out.pv = near(pv.plusValue, 80000) && near(pv.total, 24000) && near(pv.ir, 10240) && near(pv.ps, 13760);

  // analyse cession : chiffres + agrément SARL
  const aCess = analyseModification('cession', { forme: 'SARL', prix: 100000, acquisition: 20000, quotite: 100 });
  out.cessChiffres = aCess.chiffres.length >= 3;
  out.cessAgrement = aCess.analyses.some(x => /agrément/i.test(x.titre + x.detail));

  // changement de dirigeant SARL : bascule minoritaire→majoritaire = risque social
  const aDir = analyseModification('dirigeant', { forme: 'SARL', partsAvant: 30, partsApres: 70 });
  out.dirBascule = aDir.analyses.some(x => x.niveau === 'risque' && /TNS/.test(x.detail));
  const aDir2 = analyseModification('dirigeant', { forme: 'SARL', partsAvant: 60, partsApres: 80 });
  out.dirStable = aDir2.analyses.some(x => /inchangé/i.test(x.titre + x.detail));

  // transfert de siège : changement de ressort = attention + 2 publications
  const aSiege = analyseModification('siege', { forme: 'SARL', memeRessort: '0' });
  out.siege = aSiege.analyses.some(x => /ressort|département/i.test(x.detail)) && aSiege.formalites.some(f => /annonce légale/i.test(f));

  // changement d'objet : APE / réglementation
  const aObj = analyseModification('objet', { forme: 'SAS' });
  out.objet = aObj.analyses.some(x => /APE|réglement/i.test(x.detail));

  // option IS SCI = irréversible (risque)
  const aReg = analyseModification('regime', { forme: 'SCI' });
  out.regSCI = aReg.analyses.some(x => x.niveau === 'risque' && /irréversible/i.test(x.detail));
  const aRegEURL = analyseModification('regime', { forme: 'EURL' });
  out.regEURL = aRegEURL.analyses.some(x => /révocable/i.test(x.detail));

  // formalités présentes pour chaque type
  out.formalites = ['cession', 'dirigeant', 'siege', 'objet', 'regime'].every(t => analyseModification(t, { forme: 'SARL' }).formalites.length >= 2);

  // rendu HTML + recalcul dynamique
  DB.clients = DB.clients || [];
  DB.clients.push({ id: 'c-mod', denomination: 'MODIF', forme: 'SARL', capital: '50000', president: 'A', associes: [{ nom: 'A', parts: '600' }, { nom: 'B', parts: '400' }] });
  const d = { id: 'd-mod', clientIds: ['c-mod'], statut: 'Qualification' };
  DB.dossiers = DB.dossiers || []; DB.dossiers.unshift(d);
  document.body.insertAdjacentHTML('beforeend', '<div id="mo-wrap" data-t="cession">' + modificationHTML(d, 'cession') + '</div>');
  out.htmlCession = /Droits d'enregistrement/.test(document.getElementById('mo-res').innerHTML);
  // change le prix → recalcul
  document.getElementById('mo-prix').value = '200000';
  document.getElementById('mo-acq').value = '0';
  document.getElementById('mo-quot').value = '100';
  modifRun('d-mod');
  // 200000 - 23000 = 177000 * 3% = 5310
  out.htmlRecalc = /5\s?310|5310/.test(document.getElementById('mo-res').textContent.replace(/ | /g, ''));
  return out;
});

await browser.close();
check('fonctions modification présentes', r.hasFn);
check('droits SARL 100k / 100 % = 2 310 €', r.sarl100);
check('droits SARL 100k / 50 % = 2 655 €', r.sarl50);
check('droits SAS (actions) 100k = 100 € (0,1 %)', r.sas);
check('droits SCI 100k = 5 000 € (5 %)', r.sci);
check('plus-value 80 000 → PFU 24 000 (12,8 + 17,2)', r.pv);
check('cession : chiffres (droits + PV + impôt)', r.cessChiffres);
check('cession SARL : agrément signalé', r.cessAgrement);
check('dirigeant : bascule minoritaire→majoritaire = risque TNS', r.dirBascule);
check('dirigeant : majorité stable = régime inchangé', r.dirStable);
check('transfert de siège : ressort + annonce légale', r.siege);
check('changement d’objet : APE / réglementation', r.objet);
check('option IS SCI = irréversible (risque)', r.regSCI);
check('option IS EURL = révocable 5 ans', r.regEURL);
check('formalités listées pour chaque type', r.formalites);
check('rendu HTML cession', r.htmlCession);
check('recalcul dynamique (200k → droits 5 310 €)', r.htmlRecalc);
check('aucun pageerror', perr.length === 0);

const ok = results.filter(x => x.ok).length, tot = results.length;
results.forEach(x => { if (!x.ok) console.log('✗ ' + x.n); });
if (perr.length) console.log('pageerrors:', perr.slice(0, 4).join(' | '));
console.log(`\nLAST volet modification : ${ok}/${tot} ` + (ok === tot ? 'OK — tout vert' : 'ÉCHEC'));
process.exit(ok === tot ? 0 : 1);
