/**
 * LAST — Simulateur rémunération vs dividendes (logique fiscaliste).
 *   node tests/simu.mjs
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

  out.hasFn = typeof simuRemDiv === 'function' && typeof simuRemDivHTML === 'function' && typeof afSimuRun === 'function';

  // IS : 42 500 → 6375 ; 100 000 → 20 750
  const isA = simuRemDiv({ benefice: 42500, regimeSocial: 'assimile', capital: 1000 }).dividendes.is;
  const isB = simuRemDiv({ benefice: 100000, regimeSocial: 'assimile', capital: 1000 }).dividendes.is;
  out.is1 = near(isA, 6375);
  out.is2 = near(isB, 20750);

  // Assimilé salarié, 50 000 € : rému net ≈ 19 710 ; div net ≈ 29 225 ; dividendes gagnent
  const a = simuRemDiv({ benefice: 50000, regimeSocial: 'assimile', capital: 1000 });
  out.aRem = near(a.remuneration.net, 19710, 5);
  out.aDiv = near(a.dividendes.net, 29225, 5);
  out.aBest = a.best === 'dividendes';

  // TNS, 50 000 €, capital 1 000 : dividendes lourdement cotisés → rémunération gagne
  const t = simuRemDiv({ benefice: 50000, regimeSocial: 'tns', capital: 1000 });
  out.tRem = near(t.remuneration.net, 25172, 5);
  out.tSsiPositif = t.dividendes.ssi > 0;
  out.tBest = t.best === 'remuneration';

  // TNS : augmenter le capital réduit la part cotisée → net dividende croît
  const t1 = simuRemDiv({ benefice: 50000, regimeSocial: 'tns', capital: 1000 });
  const t2 = simuRemDiv({ benefice: 50000, regimeSocial: 'tns', capital: 200000 });
  out.capEffet = t2.dividendes.net > t1.dividendes.net;

  // bénéfice 0 → tout à 0
  const z = simuRemDiv({ benefice: 0, regimeSocial: 'assimile', capital: 1000 });
  out.zero = z.remuneration.net === 0 && z.dividendes.net === 0 && z.dividendes.is === 0;

  // rendu + intégration dans l'analyse fiscaliste (dossier identifiable)
  DB.clients = DB.clients || [];
  DB.clients.push({ id: 'c-simu', denomination: 'SIMU', forme: 'SAS', capital: '5000', president: 'Alex Martin', associes: [{ nom: 'Alex Martin', parts: '1000' }], activites: ['Conseil'] });
  const d = { id: 'd-simu', clientIds: ['c-simu'], statut: 'Qualification' };
  DB.dossiers = DB.dossiers || []; DB.dossiers.unshift(d);
  const html = avocatFiscalisteHTML(d);
  out.htmlSimu = /Simulation/.test(html) && /af-benef/.test(html) && /Net en poche/.test(html);
  // afSimuRun recalcule dans le conteneur
  document.body.insertAdjacentHTML('beforeend', '<div id="wrap-simu">' + html + '</div>');
  const before = document.getElementById('af-simu-res').textContent;
  const inp = document.getElementById('af-benef'); inp.value = '120000';
  afSimuRun('d-simu');
  const after = document.getElementById('af-simu-res').textContent;
  out.recompute = after !== before && /Net en poche/.test(after) && (after.match(/\d/g) || []).length > 0;
  out.recomputeVal = simuRemDiv({ benefice: 120000, regimeSocial: 'assimile', capital: 5000 }).dividendes.net > simuRemDiv({ benefice: 50000, regimeSocial: 'assimile', capital: 5000 }).dividendes.net;
  return out;
});

await browser.close();
check('fonctions simulateur présentes', r.hasFn);
check('IS 15 % jusqu’à 42 500 (= 6375)', r.is1);
check('IS 42 500×15 % + 57 500×25 % (= 20 750)', r.is2);
check('assimilé 50k : rémunération nette ≈ 19 710', r.aRem);
check('assimilé 50k : dividendes nets ≈ 29 225', r.aDiv);
check('assimilé 50k : dividendes l’emportent', r.aBest);
check('TNS 50k : rémunération nette ≈ 25 172', r.tRem);
check('TNS : cotisations SSI sur dividendes > 0', r.tSsiPositif);
check('TNS 50k faible capital : rémunération l’emporte', r.tBest);
check('TNS : capital ↑ → net dividende ↑', r.capEffet);
check('bénéfice nul → tout à zéro', r.zero);
check('rendu simulateur dans l’analyse fiscaliste', r.htmlSimu);
check('recalcul dynamique (Calculer)', r.recompute);
check('cohérence : net dividende croît avec le bénéfice', r.recomputeVal);
check('aucun pageerror', perr.length === 0);

const ok = results.filter(x => x.ok).length, tot = results.length;
results.forEach(x => { if (!x.ok) console.log('✗ ' + x.n); });
if (perr.length) console.log('pageerrors:', perr.slice(0, 4).join(' | '));
console.log(`\nLAST simulateur rém/div : ${ok}/${tot} ` + (ok === tot ? 'OK — tout vert' : 'ÉCHEC'));
process.exit(ok === tot ? 0 : 1);
