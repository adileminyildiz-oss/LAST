/**
 * LAST — Recommandation chiffrée du mix optimal rémunération / dividendes (B3).
 *   node tests/mix.mjs
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
  out.hasFn = ['mixOptimal', 'mixOptimalHTML', 'mixRun', 'mixReco'].every(f => typeof window[f] === 'function');

  // L'optimum domine toujours les deux extrêmes (net total ≥ max(100% rém, 100% div))
  const m = mixOptimal({ enveloppe: 80000, regimeSocial: 'assimile', capital: 1000, parts: 1, autres: 0 });
  out.domine = m.optimum.netTotal >= m.remOnly.netTotal - 1 && m.optimum.netTotal >= m.divOnly.netTotal - 1;
  out.gain = m.gain >= 0 && near(m.gain, Math.max(0, m.optimum.netTotal - Math.max(m.remOnly.netTotal, m.divOnly.netTotal)), 1);
  out.part = m.partRem >= 0 && m.partRem <= 1 && near(m.partRem + m.partDiv, 1, 0.001);

  // Cohérence avec le simulateur B1 : les extrêmes du mix = simuRemDiv (100% rém / 100% div)
  const s = simuRemDiv({ benefice: 80000, regimeSocial: 'assimile', capital: 1000, parts: 1, autres: 0 });
  out.endRem = near(m.remOnly.netTotal, s.remuneration.net, 2);
  out.endDiv = near(m.divOnly.netTotal, s.dividendes.net, 2);

  // Le partage optimal reconstitue le net : remNet + divNet = netTotal
  out.recon = near(m.optimum.remNet + m.optimum.divNet, m.optimum.netTotal, 1);

  // Taux global cohérent : (enveloppe − net) / enveloppe
  out.taux = near(m.optimum.tauxGlobal, (80000 - m.optimum.netTotal) / 80000, 0.001);

  // TNS : capital élevé → plus de dividendes non cotisés → part dividendes ≥ celle à capital faible
  const tLow = mixOptimal({ enveloppe: 120000, regimeSocial: 'tns', capital: 1000, parts: 1, autres: 0 });
  const tHigh = mixOptimal({ enveloppe: 120000, regimeSocial: 'tns', capital: 200000, parts: 1, autres: 0 });
  out.tnsCap = tHigh.partDiv >= tLow.partDiv - 0.001;

  // enveloppe 0 → tout à zéro, pas de division par zéro
  const z = mixOptimal({ enveloppe: 0, regimeSocial: 'assimile' });
  out.zero = z.optimum.netTotal === 0 && z.partRem === 0 && z.gain === 0;

  // reco : texte adapté au résultat
  out.reco = /rémunération|dividendes|mix/i.test(mixReco(m));

  // Intégration dans l'analyse fiscaliste + HTML interactif
  DB.clients = DB.clients || [];
  DB.clients.push({ id: 'c-mix', denomination: 'MIXCO', forme: 'SAS', capital: '5000', president: 'A', associes: [{ nom: 'A', parts: '1000' }], activites: ['Conseil'] });
  const d = { id: 'd-mix', clientIds: ['c-mix'], statut: 'Qualification' };
  DB.dossiers = DB.dossiers || []; DB.dossiers.unshift(d);
  const full = avocatFiscalisteHTML(d);
  out.integ = /Mix optimal rémunération/.test(full) && /mix-res/.test(full);

  const html = mixOptimalHTML(d, {});
  out.htmlFields = /mix-env/.test(html) && /mix-parts/.test(html) && /mix-autres/.test(html) && /Mix optimal conseillé/.test(html) && /Net total en poche/.test(html) && /mix-bar/.test(html);

  // mixRun recalcule depuis les champs
  document.body.insertAdjacentHTML('beforeend', '<div id="mix-res">' + html + '</div>');
  document.getElementById('mix-env').value = '150000';
  document.getElementById('mix-parts').value = '2';
  mixRun('d-mix');
  out.recompute = /Net total en poche/.test(document.getElementById('mix-res').textContent) && /150 ?000|150000/.test(document.getElementById('mix-res').innerHTML);

  return out;
});

await browser.close();
check('fonctions présentes (mixOptimal, mixOptimalHTML, mixRun, mixReco)', r.hasFn);
check('l’optimum domine les deux extrêmes', r.domine);
check('gain = optimum − meilleur extrême (≥ 0)', r.gain);
check('part rém + part div = 100 %', r.part);
check('extrême 100 % rém = simuRemDiv (B1)', r.endRem);
check('extrême 100 % div = simuRemDiv (B1)', r.endDiv);
check('reconstitution : remNet + divNet = netTotal', r.recon);
check('taux global cohérent', r.taux);
check('TNS : capital élevé → plus de dividendes', r.tnsCap);
check('enveloppe 0 → net 0, pas de division par zéro', r.zero);
check('reco textuelle adaptée', r.reco);
check('intégré dans l’analyse fiscaliste', r.integ);
check('HTML : champs env/parts/autres + barre + mix conseillé', r.htmlFields);
check('mixRun recalcule depuis les champs', r.recompute);
check('aucun pageerror', perr.length === 0);

const ok = results.filter(x => x.ok).length, tot = results.length;
results.forEach(x => { if (!x.ok) console.log('✗ ' + x.n); });
if (perr.length) console.log('pageerrors:', perr.slice(0, 4).join(' | '));
console.log(`\nLAST mix optimal rém/div : ${ok}/${tot} ` + (ok === tot ? 'OK — tout vert' : 'ÉCHEC'));
process.exit(ok === tot ? 0 : 1);
