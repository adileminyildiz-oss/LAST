/**
 * LAST — Orientation par objectif (forme & régime recommandés).
 *   node tests/orientation.mjs
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
  out.hasFn = typeof optimiserStructure === 'function' && typeof orientationHTML === 'function' && typeof orientationRun === 'function';
  const o = (obj, solo) => optimiserStructure(obj, { solo: solo });

  // protection → SAS(U) assimilé salarié IS
  out.protSolo = o('protection', true).recommandation.forme === 'SASU' && /Assimilé/.test(o('protection', true).recommandation.social);
  out.protMulti = o('protection', false).recommandation.forme === 'SAS';
  // coût minimal → EURL/SARL TNS
  out.coutSolo = o('cout', true).recommandation.forme === 'EURL' && /TNS/.test(o('cout', true).recommandation.social);
  out.coutMulti = o('cout', false).recommandation.forme === 'SARL' && o('cout', false).recommandation.fiscal === 'IS';
  // dividendes → SAS(U) assimilé (PFU)
  out.div = /SAS/.test(o('dividendes', false).recommandation.forme) && o('dividendes', false).raisons.join(' ').match(/PFU/);
  // levée → SAS
  out.levee = o('levee', false).recommandation.forme === 'SAS';
  // transmission → SARL de famille IR
  out.transmission = /famille/i.test(o('transmission', false).recommandation.forme) && o('transmission', false).recommandation.fiscal === 'IR';
  // immobilier → SCI IR
  out.immo = o('immobilier', false).recommandation.forme === 'SCI' && o('immobilier', false).recommandation.fiscal === 'IR';
  // chaque objectif renvoie raisons + attention
  out.structure = ORIENT_OBJECTIFS.every(x => {
    const rr = optimiserStructure(x.k, { solo: false });
    return rr.recommandation.forme && rr.raisons.length >= 1 && rr.attention.length >= 1;
  });

  // détection auto par activité (immobilier) + solo
  DB.clients = DB.clients || [];
  DB.clients.push({ id: 'c-or', denomination: 'PATRIMOINE', forme: 'SAS', capital: '1000', activites: ['Location immobilière'], president: 'A', associes: [{ nom: 'A', parts: '500' }, { nom: 'B', parts: '500' }] });
  const d = { id: 'd-or', clientIds: ['c-or'], statut: 'Qualification' };
  DB.dossiers = DB.dossiers || []; DB.dossiers.unshift(d);
  const html = orientationHTML(d); // sans objectif → auto immobilier
  out.autoImmo = /SCI/.test(html) && /or-obj/.test(html);

  // recalcul dynamique via orientationRun
  document.body.insertAdjacentHTML('beforeend', '<div id="wrap-or">' + orientationHTML(d) + '</div>');
  const sel = document.getElementById('or-obj'); sel.value = 'levee';
  orientationRun('d-or');
  out.recompute = /SAS/.test(document.getElementById('or-res').textContent) && /investisseurs/i.test(document.getElementById('or-res').textContent);

  // intégré à l'analyse fiscaliste
  out.inAf = /Orientation par objectif/.test(avocatFiscalisteHTML(d));
  return out;
});

await browser.close();
check('fonctions orientation présentes', r.hasFn);
check('protection (solo) → SASU assimilé salarié', r.protSolo);
check('protection (plusieurs) → SAS', r.protMulti);
check('coût minimal (solo) → EURL TNS', r.coutSolo);
check('coût minimal (plusieurs) → SARL à l’IS', r.coutMulti);
check('dividendes → SAS (PFU)', !!r.div);
check('levée de fonds → SAS', r.levee);
check('transmission → SARL de famille à l’IR', r.transmission);
check('immobilier → SCI à l’IR', r.immo);
check('chaque objectif : reco + raisons + attention', r.structure);
check('détection auto (activité immobilière) → SCI', r.autoImmo);
check('recalcul dynamique (changer d’objectif)', r.recompute);
check('intégré à l’analyse fiscaliste', r.inAf);
check('aucun pageerror', perr.length === 0);

const ok = results.filter(x => x.ok).length, tot = results.length;
results.forEach(x => { if (!x.ok) console.log('✗ ' + x.n); });
if (perr.length) console.log('pageerrors:', perr.slice(0, 4).join(' | '));
console.log(`\nLAST orientation par objectif : ${ok}/${tot} ` + (ok === tot ? 'OK — tout vert' : 'ÉCHEC'));
process.exit(ok === tot ? 0 : 1);
