/**
 * LAST — Fiscaliste approfondi : barème IR progressif + arbitrage PFU/barème.
 *   node tests/bareme.mjs
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
  const near = (a, b, t) => Math.abs(a - b) <= (t || 2);
  out.hasFn = typeof baremeIR === 'function' && typeof simuRemDiv === 'function';

  // barème IR par part
  out.ir0 = baremeIR(10000, 1) === 0;                       // sous le seuil
  out.ir30000 = near(baremeIR(30000, 1), 2286.23);          // 1925.33 + 360.90
  out.ir82341 = near(baremeIR(82341, 1), 17988.53);         // 1925.33 + 16063.20 (haut de la tranche 30%)
  out.quotient = near(baremeIR(60000, 2), 2 * baremeIR(30000, 1)); // quotient familial : 2 parts
  out.autres = (() => {
    // incrément d'IR pour un même revenu additionnel plus élevé si autres revenus élevés
    const a = simuRemDiv({ benefice: 50000, regimeSocial: 'assimile', capital: 1000, parts: 1, autres: 0 });
    const b = simuRemDiv({ benefice: 50000, regimeSocial: 'assimile', capital: 1000, parts: 1, autresRevenus: 60000 });
    return b.remuneration.ir > a.remuneration.ir;
  })();

  // assimilé 50k, 1 part : rému nette ≈ 25 569 ; div nette (meilleure option) ≈ 33 056
  const s = simuRemDiv({ benefice: 50000, regimeSocial: 'assimile', capital: 1000, parts: 1, autres: 0 });
  out.rem = near(s.remuneration.net, 25569, 3);
  out.div = near(s.dividendes.net, 33056, 3);
  out.best = s.best === 'dividendes';
  // à bas revenu, le barème bat le PFU pour les dividendes
  out.divOption = s.dividendes.option === 'bareme' && s.dividendes.baremeNet >= s.dividendes.pfuNet;

  // à haut bénéfice, le PFU redevient compétitif (barème atteint 41-45 %)
  const sh = simuRemDiv({ benefice: 300000, regimeSocial: 'assimile', capital: 1000, parts: 1, autres: 0 });
  out.highPfu = sh.dividendes.option === 'pfu';

  // le nombre de parts réduit l'IR de la rémunération → net plus élevé
  const p1 = simuRemDiv({ benefice: 80000, regimeSocial: 'assimile', capital: 1000, parts: 1 });
  const p3 = simuRemDiv({ benefice: 80000, regimeSocial: 'assimile', capital: 1000, parts: 3 });
  out.partsEffet = p3.remuneration.net > p1.remuneration.net;

  // rendu HTML : champs parts + autres revenus, option dividende affichée
  DB.clients = DB.clients || [];
  DB.clients.push({ id: 'c-bar', denomination: 'BAR', forme: 'SAS', capital: '5000', president: 'A', associes: [{ nom: 'A', parts: '1000' }], activites: ['Conseil'] });
  const d = { id: 'd-bar', clientIds: ['c-bar'], statut: 'Qualification' };
  DB.dossiers = DB.dossiers || []; DB.dossiers.unshift(d);
  const html = simuRemDivHTML(d, 50000, { parts: 1, autres: 0 });
  out.html = /af-parts/.test(html) && /af-autres/.test(html) && /barème progressif/.test(html) && /Net en poche/.test(html);

  // afSimuRun lit parts/autres
  document.body.insertAdjacentHTML('beforeend', '<input id="af-benef" value="50000"><div id="af-simu-res">' + html + '</div>');
  document.getElementById('af-parts').value = '3';
  afSimuRun('d-bar');
  out.recompute = /Net en poche/.test(document.getElementById('af-simu-res').textContent);
  return out;
});

await browser.close();
check('fonctions présentes (baremeIR, simuRemDiv)', r.hasFn);
check('IR nul sous le seuil (10 000 €)', r.ir0);
check('IR 30 000 € (1 part) ≈ 2 286 €', r.ir30000);
check('IR 82 341 € (1 part) ≈ 17 989 €', r.ir82341);
check('quotient familial : 2 parts = 2 × (1 part)', r.quotient);
check('autres revenus → IR incrémental plus élevé', r.autres);
check('assimilé 50k : rémunération nette ≈ 25 569', r.rem);
check('assimilé 50k : dividendes nets (meilleure option) ≈ 33 056', r.div);
check('à bas revenu, dividendes l’emportent', r.best);
check('dividendes : barème choisi (> PFU) à bas revenu', r.divOption);
check('à haut bénéfice, PFU redevient l’option retenue', r.highPfu);
check('parts fiscales ↑ → net rémunération ↑', r.partsEffet);
check('HTML : champs parts + autres + option affichée', r.html);
check('afSimuRun lit parts/autres (recalcul)', r.recompute);
check('aucun pageerror', perr.length === 0);

const ok = results.filter(x => x.ok).length, tot = results.length;
results.forEach(x => { if (!x.ok) console.log('✗ ' + x.n); });
if (perr.length) console.log('pageerrors:', perr.slice(0, 4).join(' | '));
console.log(`\nLAST barème IR & arbitrage : ${ok}/${tot} ` + (ok === tot ? 'OK — tout vert' : 'ÉCHEC'));
process.exit(ok === tot ? 0 : 1);
