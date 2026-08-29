/**
 * LAST — Simulateur d'impôt sur les sociétés (IS) complet.
 *   node tests/is.mjs
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
  const near = (a, b, t) => Math.abs(a - b) <= (t || 1);
  out.hasFn = ['calculISDetail', 'isSimHTML', 'isSimRun'].every(f => typeof window[f] === 'function');

  // Bénéfice 100 000 € éligible taux réduit → 42 500×15 % + 57 500×25 % = 6 375 + 14 375 = 20 750
  const a = calculISDetail({ benefice: 100000, ca: 500000, capitalLibere: true, detentionPP: true });
  out.reduit = a.eligibleReduit && near(a.isTotal, 20750) && a.tranches.length === 2 && near(a.tauxEffectif, 0.2075, 0.001);

  // Non éligible (détention PP fausse) → 25 % plein = 25 000
  const b = calculISDetail({ benefice: 100000, ca: 500000, capitalLibere: true, detentionPP: false });
  out.plein = !b.eligibleReduit && near(b.isTotal, 25000) && b.tranches.length === 1 && /75/.test(b.manques.join(' '));

  // Capital non libéré → non éligible
  const c = calculISDetail({ benefice: 30000, ca: 100000, capitalLibere: false, detentionPP: true });
  out.libere = !c.eligibleReduit && near(c.isTotal, 7500) && /libéré/.test(c.manques.join(' '));

  // CA ≥ 10 M€ → non éligible même si le reste est ok
  const d = calculISDetail({ benefice: 30000, ca: 12000000, capitalLibere: true, detentionPP: true });
  out.ca10 = !d.eligibleReduit && /10 M/.test(d.manques.join(' '));

  // Bénéfice 30 000 € éligible → 30 000×15 % = 4 500 (une seule tranche)
  const e = calculISDetail({ benefice: 30000, ca: 100000, capitalLibere: true, detentionPP: true });
  out.petit = e.eligibleReduit && near(e.isTotal, 4500) && e.tranches.length === 1;

  // Contribution sociale 3,3 % : CA ≥ 7,63 M€ & IS > 763 000 €
  //   bénéfice 4 000 000, taux plein (detentionPP false) → IS = 1 000 000 ; contribution = (1 000 000−763 000)×3,3 % = 7 821
  const f = calculISDetail({ benefice: 4000000, ca: 8000000, capitalLibere: true, detentionPP: false });
  out.contrib = near(f.is, 1000000) && near(f.contribution, 7821) && near(f.isTotal, 1007821);

  // Pas de contribution si CA < 7,63 M€ même si IS élevé
  const g = calculISDetail({ benefice: 4000000, ca: 5000000, capitalLibere: true, detentionPP: false });
  out.noContrib = g.contribution === 0;

  // Pas de contribution si IS ≤ 763 000 € même si CA élevé (bénéfice 1 M€ → IS 250 000 €)
  const h = calculISDetail({ benefice: 1000000, ca: 8000000, capitalLibere: true, detentionPP: false });
  out.noContrib2 = h.contribution === 0 && near(h.is, 250000);

  // bénéfice 0 → IS 0, taux effectif 0
  out.zero = calculISDetail({ benefice: 0, ca: 0 }).isTotal === 0 && calculISDetail({ benefice: 0 }).tauxEffectif === 0;

  // Intégration dans l'analyse fiscaliste + rendu HTML
  DB.clients = DB.clients || [];
  DB.clients.push({ id: 'c-is', denomination: 'ISCO', forme: 'SAS', capital: '5000', president: 'A', associes: [{ nom: 'A', parts: '1000' }], activites: ['Conseil'] });
  const dd = { id: 'd-is', clientIds: ['c-is'], statut: 'Qualification' };
  DB.dossiers = DB.dossiers || []; DB.dossiers.unshift(dd);
  const full = avocatFiscalisteHTML(dd);
  out.integ = /Simulateur d.impôt sur les sociétés/.test(full) && /is-simu-res/.test(full);

  const html = isSimHTML(dd, {});
  out.htmlFields = /is-benef/.test(html) && /is-ca/.test(html) && /is-liber/.test(html) && /is-pp/.test(html) && /taux effectif/.test(html);

  // isSimRun recalcule depuis les champs
  document.body.insertAdjacentHTML('beforeend', '<div id="is-simu-res">' + html + '</div>');
  document.getElementById('is-benef').value = '30000';
  document.getElementById('is-ca').value = '100000';
  document.getElementById('is-liber').checked = true;
  document.getElementById('is-pp').checked = true;
  isSimRun('d-is');
  const txt = document.getElementById('is-simu-res').textContent;
  out.recompute = /4 500/.test(txt.replace(/ | /g, ' ')) && /Éligible au taux réduit/.test(txt);

  return out;
});

await browser.close();
check('fonctions présentes (calculISDetail, isSimHTML, isSimRun)', r.hasFn);
check('bénéfice 100 000 € éligible → IS 20 750 € (15 %+25 %)', r.reduit);
check('détention < 75 % PP → IS 25 000 € (taux plein)', r.plein);
check('capital non libéré → non éligible (IS 7 500 €)', r.libere);
check('CA ≥ 10 M€ → non éligible', r.ca10);
check('bénéfice 30 000 € éligible → IS 4 500 € (une tranche)', r.petit);
check('contribution sociale 3,3 % (CA ≥ 7,63 M€ & IS > 763 000 €)', r.contrib);
check('pas de contribution si CA < 7,63 M€', r.noContrib);
check('pas de contribution si IS ≤ 763 000 €', r.noContrib2);
check('bénéfice 0 → IS 0, taux effectif 0', r.zero);
check('intégré dans l’analyse fiscaliste', r.integ);
check('HTML : champs benef/ca/libéré/PP + taux effectif', r.htmlFields);
check('isSimRun recalcule depuis les champs', r.recompute);
check('aucun pageerror', perr.length === 0);

const ok = results.filter(x => x.ok).length, tot = results.length;
results.forEach(x => { if (!x.ok) console.log('✗ ' + x.n); });
if (perr.length) console.log('pageerrors:', perr.slice(0, 4).join(' | '));
console.log(`\nLAST simulateur d'IS : ${ok}/${tot} ` + (ok === tot ? 'OK — tout vert' : 'ÉCHEC'));
process.exit(ok === tot ? 0 : 1);
