/**
 * LAST — Logique d'avocat fiscaliste (régime fiscal, social, TVA, dividendes, alertes).
 *   node tests/fiscaliste.mjs
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
  // fabrique un dossier avec une fiche client paramétrable
  let seq = 0;
  const mk = (over) => {
    seq++;
    const id = 'c-fisc-' + seq;
    const c = Object.assign({ denomination: 'SOC' + seq, capital: '1000', forme: 'SAS', regime: '', activites: ['Conseil'],
      siege: '1 rue', cp: '75001', ville: 'Paris', president: 'Alex Martin',
      associes: [{ nom: 'Alex Martin', parts: '600' }, { nom: 'Bo Durand', parts: '400' }] }, over.client || {});
    DB.clients = DB.clients || []; DB.clients.push(Object.assign({ id }, c));
    return { id: 'd-fisc-' + seq, clientIds: [id], statut: 'Qualification' };
  };
  const af = (over) => avocatFiscaliste(mk(over));

  out.hasFn = typeof avocatFiscaliste === 'function' && typeof avocatFiscalisteHTML === 'undefined' ? typeof avocatFiscalisteHTML : true;
  out.hasFn2 = typeof avocatFiscaliste === 'function' && typeof avocatFiscalisteHTML === 'function' && typeof ouvrirAvocatFiscaliste === 'function';

  // 1. SASU → IS par défaut + assimilé salarié
  const sasu = af({ client: { forme: 'SASU', president: 'Alex Martin', associes: [{ nom: 'Alex Martin', parts: '1000' }] } });
  out.sasuFiscal = sasu.profil.regimeFiscal === 'IS';
  out.sasuSocial = sasu.profil.regimeSocial === 'Assimilé salarié';
  out.sasuDiv = sasu.analyses.some(a => /PFU/.test(a.detail) || /dividendes ne supportent pas/.test(a.detail));

  // 2. SARL gérant MAJORITAIRE (>50%) → TNS + dividendes >10% cotisés
  const sarlMaj = af({ client: { forme: 'SARL', president: 'Alex Martin', associes: [{ nom: 'Alex Martin', parts: '700' }, { nom: 'Bo Durand', parts: '300' }] } });
  out.sarlTNS = sarlMaj.profil.regimeSocial === 'TNS';
  out.sarlDiv = sarlMaj.analyses.some(a => /10 %/.test(a.detail) && /SSI|cotisations sociales/.test(a.detail));

  // 3. SARL gérant MINORITAIRE (<50%) → assimilé salarié
  const sarlMin = af({ client: { forme: 'SARL', president: 'Bo Durand', associes: [{ nom: 'Alex Martin', parts: '700' }, { nom: 'Bo Durand', parts: '300' }] } });
  out.sarlMinSocial = sarlMin.profil.regimeSocial === 'Assimilé salarié';

  // 4. EURL → IR par défaut + TNS
  const eurl = af({ client: { forme: 'EURL', president: 'Alex Martin', associes: [{ nom: 'Alex Martin', parts: '1000' }] } });
  out.eurlFiscal = eurl.profil.regimeFiscal === 'IR';
  out.eurlTNS = eurl.profil.regimeSocial === 'TNS';
  out.eurlOptionIS = eurl.analyses.some(a => /option/i.test(a.detail) && /IS/.test(a.detail));

  // 5. SCI → IR par défaut ; SCI à l'IS → risque irréversible
  const sci = af({ client: { forme: 'SCI', regime: '', activites: ['Location nue'], president: 'Alex Martin' } });
  out.sciFiscal = sci.profil.regimeFiscal === 'IR';
  const sciIS = af({ client: { forme: 'SCI', regime: 'IS', activites: ['Location nue'] } });
  out.sciISrisque = sciIS.analyses.some(a => a.niveau === 'risque' && /irréversible/i.test(a.detail));

  // 6. SCI + location meublée → risque activité commerciale
  const sciMeuble = af({ client: { forme: 'SCI', regime: '', activites: ['Location meublée saisonnière'] } });
  out.sciMeuble = sciMeuble.analyses.some(a => a.niveau === 'risque' && /commerciale/i.test(a.titre + a.detail));

  // 7. capital très faible → attention
  const capFaible = af({ client: { forme: 'SAS', capital: '10' } });
  out.capFaible = capFaible.analyses.some(a => a.niveau === 'attention' && /capital/i.test(a.titre));

  // 8. IS → mention du taux réduit 15%
  out.tauxReduit = sasu.analyses.some(a => /15 %/.test(a.detail) && /42 500/.test(a.detail));

  // 9. TVA toujours analysée
  out.tva = sasu.analyses.some(a => /TVA/i.test(a.titre) && /franchise/i.test(a.detail));

  // 10. rendu HTML + intégration au contrôle qualité
  const dqc = mk({ client: { forme: 'SARL', president: 'Alex Martin', associes: [{ nom: 'Alex Martin', parts: '800' }, { nom: 'Bo Durand', parts: '200' }] } });
  const html = avocatFiscalisteHTML(dqc);
  out.html = /avocat fiscaliste/i.test(html) && /Régime social/.test(html) && /TNS/.test(html);
  out.inQC = /avocat fiscaliste/i.test(controleQualiteHTML(dqc));
  return out;
});

await browser.close();
check('fonctions fiscaliste présentes', r.hasFn2);
check('SASU → IS (défaut)', r.sasuFiscal);
check('SASU → dirigeant assimilé salarié', r.sasuSocial);
check('SASU → dividendes PFU (pas de cotisations)', r.sasuDiv);
check('SARL gérant majoritaire → TNS', r.sarlTNS);
check('SARL majoritaire → dividendes > 10 % cotisés SSI', r.sarlDiv);
check('SARL gérant minoritaire → assimilé salarié', r.sarlMinSocial);
check('EURL → IR (défaut)', r.eurlFiscal);
check('EURL → gérant TNS', r.eurlTNS);
check('EURL → option IS signalée', r.eurlOptionIS);
check('SCI → IR (défaut)', r.sciFiscal);
check('SCI à l’IS → risque (option irréversible)', r.sciISrisque);
check('SCI + location meublée → risque activité commerciale', r.sciMeuble);
check('capital très faible → attention', r.capFaible);
check('IS → taux réduit 15 % jusqu’à 42 500 €', r.tauxReduit);
check('régime de TVA analysé (franchise/réel)', r.tva);
check('rendu HTML (profil + régime social)', r.html);
check('intégré au contrôle qualité', r.inQC);
check('aucun pageerror', perr.length === 0);

const ok = results.filter(x => x.ok).length, tot = results.length;
results.forEach(x => { if (!x.ok) console.log('✗ ' + x.n); });
if (perr.length) console.log('pageerrors:', perr.slice(0, 4).join(' | '));
console.log(`\nLAST logique d'avocat fiscaliste : ${ok}/${tot} ` + (ok === tot ? 'OK — tout vert' : 'ÉCHEC'));
process.exit(ok === tot ? 0 : 1);
