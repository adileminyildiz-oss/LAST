/**
 * LAST — Prestataires & activation du mode réel (paramétrage unifié).
 *   node tests/prestataires.mjs
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

  out.hasFn = ['LAST_PROVIDERS', 'systemeReadiness', 'paiementCfg', 'paiementActif', 'paiementCfgCard', 'integStatusCard'].every(f => typeof window[f] === 'function');

  // registre : toutes les capacités présentes
  const ids = LAST_PROVIDERS().map(p => p.id);
  out.registry = ['serveur', 'email', 'sms', 'ia', 'ocr', 'signature', 'guichet', 'paiement', 'donnees'].every(k => ids.includes(k));

  // au départ : rien de configuré → tout en simulation, 0 %
  const P0 = LAST_PROVIDERS();
  out.allSim = P0.every(p => p.reel === false);
  out.ready0 = systemeReadiness().pct === 0;

  // le panneau unifié affiche la barre + Simulation
  const card0 = integStatusCard();
  out.cardSim = /Simulation/.test(card0) && /activation du mode réel/i.test(card0) && /Système prêt pour le mode réel/.test(card0);

  // configurer le serveur (Apps Script) → e-mails + données passent en réel
  DB.parametres = DB.parametres || {};
  DB.parametres.mailSync = { url: 'https://script.google.com/exec', key: 'k' };
  const after = {};
  LAST_PROVIDERS().forEach(p => after[p.id] = p.reel);
  out.serveurReel = after.serveur === true && after.email === true && after.donnees === true;
  out.readyUp = systemeReadiness().pct > 0;

  // paiement : non configuré → sim ; configuré → réel
  out.payOff = paiementActif() === false;
  const c = paiementCfg(); c.enabled = true; c.publicKey = 'pk_test_123'; c.provider = 'stripe'; c.mode = 'test';
  out.payOn = paiementActif() === true;
  out.payInReg = LAST_PROVIDERS().find(p => p.id === 'paiement').reel === true;

  // paiement sans clé publique → repasse en sim
  c.publicKey = '';
  out.payNeedsKey = paiementActif() === false;

  // la carte paiement est injectée dans la page Paramètres
  const params = pageParams();
  out.payCard = /Paiement en ligne/.test(params) && /pay-enabled/.test(params) && /pay-pubkey/.test(params);
  out.paramsUnified = /activation du mode réel/i.test(params);

  // signature / INPI / IA restent en simulation tant que non activés
  const byId = {}; LAST_PROVIDERS().forEach(p => byId[p.id] = p);
  out.simDefaults = byId.signature.reel === false && byId.guichet.reel === false && byId.ia.reel === false;
  out.simLabels = /Tesseract/.test(integStatusCard()) && /workflow de signature interne/.test(integStatusCard());
  return out;
});

await browser.close();
check('fonctions du paramétrage unifié présentes', r.hasFn);
check('registre : 9 capacités (serveur…paiement…données)', r.registry);
check('au départ : tout en simulation', r.allSim);
check('readiness initiale : 0 %', r.ready0);
check('panneau unifié : barre + « Simulation »', r.cardSim);
check('serveur configuré → e-mails + données en réel', r.serveurReel);
check('readiness augmente après config serveur', r.readyUp);
check('paiement désactivé au départ', r.payOff);
check('paiement configuré (clé publique) → réel', r.payOn && r.payInReg);
check('paiement sans clé publique → simulation', r.payNeedsKey);
check('carte Paiement injectée dans Paramètres', r.payCard);
check('page Paramètres : panneau unifié présent', r.paramsUnified);
check('signature / INPI / IA en simulation par défaut', r.simDefaults);
check('libellés de simulation (Tesseract, signature interne)', r.simLabels);
check('aucun pageerror', perr.length === 0);

const ok = results.filter(x => x.ok).length, tot = results.length;
results.forEach(x => { if (!x.ok) console.log('✗ ' + x.n); });
if (perr.length) console.log('pageerrors:', perr.slice(0, 4).join(' | '));
console.log(`\nLAST prestataires & mode réel : ${ok}/${tot} ` + (ok === tot ? 'OK — tout vert' : 'ÉCHEC'));
process.exit(ok === tot ? 0 : 1);
