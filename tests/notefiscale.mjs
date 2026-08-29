/**
 * LAST — Note de synthèse fiscaliste imprimable par dossier.
 *   node tests/notefiscale.mjs
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
  window.print = () => { window.__printed = (window.__printed || 0) + 1; };
  const out = {};
  out.hasFn = ['noteFiscaleHTML', 'noteFiscaleDoc', 'ouvrirNoteFiscale', 'imprimerNoteFiscale', 'telechargerNoteFiscale'].every(f => typeof window[f] === 'function');

  // Structure à l'IS (SAS) — assimilé salarié
  DB.clients = DB.clients || [];
  DB.clients.push({ id: 'c-nf', denomination: 'NOTECO', forme: 'SAS', capital: '5000', president: 'A', regime: 'IS', associes: [{ nom: 'A', parts: '1000' }], activites: ['Conseil'] });
  const d = { id: 'd-nf', clientIds: ['c-nf'], ref: 'AEM-NF', numeroDossier: 'DOS-2026-090', statut: 'Qualification' };
  DB.dossiers = DB.dossiers || []; DB.dossiers.unshift(d);

  const html = noteFiscaleHTML(d);
  out.title = /Note de synthèse fiscale et sociale/.test(html) && /AEM CONSEIL/.test(html) && /NOTECO/.test(html);
  out.ref = /DOS-2026-090/.test(html);
  out.profil = /Régime fiscal/.test(html) && /Régime social/.test(html) && /SAS/.test(html);
  out.reco = /Recommandations et points de vigilance/.test(html);
  // section IS chiffrée + arbitrage
  out.is = /Simulation d.impôt sur les sociétés/.test(html) && /taux effectif/.test(html) && /Hypothèse de travail/.test(html);
  out.mix = /Arbitrage rémunération \/ dividendes/.test(html) && /Mix optimal conseillé/.test(html);
  out.disclaimer = /à titre indicatif/.test(html) && /dg-page/.test(html);

  // Structure à l'IR (SCI IR) → section transparence, pas d'arbitrage IS
  DB.clients.push({ id: 'c-nf2', denomination: 'SCITRANSP', forme: 'SCI', capital: '1000', president: 'B', regime: 'IR', associes: [{ nom: 'B', parts: '500' }, { nom: 'C', parts: '500' }], activites: ['Location nue'] });
  const d2 = { id: 'd-nf2', clientIds: ['c-nf2'], ref: 'AEM-NF2', statut: 'Qualification' };
  DB.dossiers.unshift(d2);
  const h2 = noteFiscaleHTML(d2);
  out.ir = /impôt sur le revenu/.test(h2) && /transparence/.test(h2) && !/Mix optimal conseillé/.test(h2);

  // ouvrirNoteFiscale ouvre une modale avec le document + boutons
  ouvrirNoteFiscale('d-nf');
  const ov = document.getElementById('ov');
  out.modal = !!ov && /Note de synthèse fiscale/.test(ov.textContent) && /Imprimer/.test(ov.textContent) && /Télécharger/.test(ov.textContent);

  // impression → window.print appelé, #fv-printarea rempli
  window.__printed = 0;
  imprimerNoteFiscale('d-nf');
  return new Promise(function (resolve) {
    setTimeout(function () {
      out.print = window.__printed >= 1 && /Note de synthèse fiscale/.test((document.getElementById('fv-printarea') || {}).innerHTML || '');
      // téléchargement ne jette pas
      try { telechargerNoteFiscale('d-nf'); out.dl = true; } catch (e) { out.dl = false; }
      // bouton dans l'analyse fiscaliste
      const af = avocatFiscalisteHTML(d);
      out.toolbar = /Note de synthèse imprimable/.test(af) && /ouvrirNoteFiscale/.test(af);
      resolve(out);
    }, 220);
  });
});

await browser.close();
check('fonctions présentes (note/doc/ouvrir/imprimer/télécharger)', r.hasFn);
check('en-tête + titre + société', r.title);
check('référence du dossier reprise', r.ref);
check('profil (régime fiscal/social) affiché', r.profil);
check('bloc recommandations & vigilance', r.reco);
check('IS : simulation chiffrée + hypothèse', r.is);
check('arbitrage rém/div (mix optimal)', r.mix);
check('page A4 imprimable + mention indicative', r.disclaimer);
check('IR : section transparence, sans arbitrage IS', r.ir);
check('ouvrirNoteFiscale : modale + boutons', r.modal);
check('impression : window.print + zone remplie', r.print);
check('téléchargement sans erreur', r.dl);
check('bouton « Note imprimable » dans l’analyse fiscaliste', r.toolbar);
check('aucun pageerror', perr.length === 0);

const ok = results.filter(x => x.ok).length, tot = results.length;
results.forEach(x => { if (!x.ok) console.log('✗ ' + x.n); });
if (perr.length) console.log('pageerrors:', perr.slice(0, 4).join(' | '));
console.log(`\nLAST note de synthèse fiscale : ${ok}/${tot} ` + (ok === tot ? 'OK — tout vert' : 'ÉCHEC'));
process.exit(ok === tot ? 0 : 1);
