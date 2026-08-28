/**
 * LAST — Mise en place du logiciel interne : checklist + paramètres de production.
 *   node tests/miseenplace.mjs
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

  out.hasFn = ['mepEtat', 'mepCard', 'prodParamsCard', 'prodParamsSave', 'mepGo'].every(f => typeof window[f] === 'function');

  // état de départ : quelques étapes déjà faites (démo) mais serveur/mode réel non configurés
  const e0 = mepEtat();
  out.steps6 = e0.total === 6 && e0.steps.map(s => s.k).join(',') === 'cabinet,rib,services,serveur,reel,sauvegarde';
  const st = {}; e0.steps.forEach(s => st[s.k] = s.done);
  out.serveurUndone = st.serveur === false && st.reel === false;

  // compléter l'identité du cabinet → étape « cabinet » validée
  DB.societe = DB.societe || {};
  DB.societe.raison = 'AEM CONSEIL'; DB.societe.siret = '12345678900011'; DB.societe.iban = 'FR7630001007941234567890185';
  const e1 = mepEtat(); const st1 = {}; e1.steps.forEach(s => st1[s.k] = s.done);
  out.cabinetDone = st1.cabinet === true && st1.rib === true;
  out.pctUp = e1.pct > e0.pct;

  // configurer le serveur → étapes serveur + mode réel validées, % augmente
  DB.parametres = DB.parametres || {};
  DB.parametres.mailSync = { url: 'https://script.google.com/exec', key: 'k' };
  const e2 = mepEtat(); const st2 = {}; e2.steps.forEach(s => st2[s.k] = s.done);
  out.serveurDone = st2.serveur === true && st2.reel === true;

  // carte rendue + barre + % dans la page Paramètres (en tête)
  const params = pageParams();
  out.cardTop = /mep-card/.test(params) && params.indexOf('mep-card') < params.indexOf('Réglages');
  out.progress = /Mise en place/.test(params) && /mep-bar/.test(params);

  // paramètres de production : relances + SLA éditables et persistés
  out.prodCard = /Paramètres de production/.test(params) && /pp-delai1/.test(params) && /pp-sla/.test(params);
  state.page = 'params'; render();
  const g = id => document.getElementById(id);
  out.hasInputs = !!(g('pp-delai1') && g('pp-delaisuiv') && g('pp-max') && g('pp-sla'));
  if (out.hasInputs) {
    g('pp-delai1').value = '5'; g('pp-delaisuiv').value = '7'; g('pp-max').value = '4'; g('pp-sla').value = '3';
    prodParamsSave();
  }
  out.saved = DB.parametres.relance && DB.parametres.relance.delai1 === 5 && DB.parametres.relance.delaiSuiv === 7 && DB.parametres.relance.max === 4;
  out.slaSaved = (DB.parametres.slaJours === 3);

  // la cadence enregistrée est bien utilisée par l'Agent Relance
  const d = { id: 't-mep', clientNom: 'X', clientEmail: 'x@y.fr', statut: 'Qualification', docsMailSent: Date.now() - 4 * 86400000, docs: {}, piecesRecues: {} };
  DB.demandes.unshift(d);
  // 4 jours écoulés < nouveau délai 5 → pas encore due
  out.cadenceUsed = relanceEtat(d).due === false;
  d.docsMailSent = Date.now() - 6 * 86400000; // 6 ≥ 5 → due
  out.cadenceUsed2 = relanceEtat(d).due === true;
  return out;
});

await browser.close();
check('fonctions de mise en place présentes', r.hasFn);
check('checklist : 6 étapes ordonnées', r.steps6);
check('serveur / mode réel non faits au départ', r.serveurUndone);
check('identité cabinet complétée → étapes validées', r.cabinetDone);
check('progression augmente', r.pctUp);
check('serveur configuré → serveur + mode réel validés', r.serveurDone);
check('checklist affichée en tête des Paramètres', r.cardTop);
check('barre de progression rendue', r.progress);
check('carte « Paramètres de production » présente', r.prodCard);
check('champs relances + SLA rendus', r.hasInputs);
check('paramètres de relance enregistrés', r.saved);
check('SLA enregistré', r.slaSaved);
check('cadence utilisée par l’Agent Relance (4 j < 5 → pas due)', r.cadenceUsed);
check('cadence utilisée par l’Agent Relance (6 j ≥ 5 → due)', r.cadenceUsed2);
check('aucun pageerror', perr.length === 0);

const ok = results.filter(x => x.ok).length, tot = results.length;
results.forEach(x => { if (!x.ok) console.log('✗ ' + x.n); });
if (perr.length) console.log('pageerrors:', perr.slice(0, 4).join(' | '));
console.log(`\nLAST mise en place & paramètres : ${ok}/${tot} ` + (ok === tot ? 'OK — tout vert' : 'ÉCHEC'));
process.exit(ok === tot ? 0 : 1);
