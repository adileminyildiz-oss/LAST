/**
 * LAST — Étape 8 : tableau de bord temps réel (Pilotage).
 *   node tests/pilotage.mjs
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
  // dossier « complet » (pièces + signatures + prêt au dépôt)
  const intake = { version: 'LASTv1', type: 'sas', numeroDossier: 'DOS-2026-P1',
    societe: { denomination: 'PILOT', capital: '1000', objet: 'Conseil', regime: 'IS' },
    siege: { rue: '1 rue A', cp: '75001', ville: 'Paris', type: 'Local commercial (bail)', bailleur: 'SCI A' },
    direction: { nom: 'Roy', prenom: 'Max', naissance: '1980-01-01', nationalite: 'Française', adresse: '1 rue A Paris' },
    associes: [{ nom: 'Roy', prenom: 'Max', apport: '600', parts: '600' }, { nom: 'Sol', prenom: 'Ida', apport: '400', parts: '400' }],
    contact: { nom: 'Roy', prenom: 'Max', email: 'max@pilot.fr' } };
  const dd = { id: 't-pil1', clientNom: 'Max Roy', clientEmail: 'max@pilot.fr', statut: 'Qualification', intake };
  DB.demandes.unshift(dd);
  const d1 = creerDossierDepuis(dd.id, true);
  d1.pieces = { identite: { data: 'x' }, domiciliation: { data: 'x' }, edf: { data: 'x' }, impot: { data: 'x' } };
  d1.verif = { extract: { nom: 'Roy' } };
  d1.docs = { statuts: { genere: true } };
  sigEnvoyerTous(d1.id); ['statuts', 'pouvoir', 'dnc', 'souscripteurs'].forEach(k => sigSigne(d1.id, k));

  // dossier « en attente de pièces » (rien de fait)
  const dd2 = { id: 't-pil2', clientNom: 'Zoé Vent', clientEmail: 'zoe@v.fr', statut: 'Qualification',
    intake: { version: 'LASTv1', type: 'sci', numeroDossier: 'DOS-2026-P2',
      societe: { denomination: 'VENT', capital: '500', objet: 'Immo', regime: 'IR' },
      siege: { rue: '2 rue B', cp: '75002', ville: 'Paris' }, direction: { nom: 'Vent', prenom: 'Zoé' },
      associes: [{ nom: 'Vent', prenom: 'Zoé', apport: '500', parts: '500' }], contact: { nom: 'Vent', prenom: 'Zoé', email: 'zoe@v.fr' } } };
  DB.demandes.unshift(dd2);
  const d2 = creerDossierDepuis(dd2.id, true);

  out.hasFn = typeof pagePilotage === 'function' && typeof pilotageStats === 'function' && typeof tauxAutomatisation === 'function';
  const s = pilotageStats();
  out.total = s.total >= 2;
  out.attente = s.attente >= 1;   // d2
  out.complet = s.complets >= 1;  // d1
  out.signes = s.signes >= 1;     // d1
  out.taux100d1 = tauxAutomatisation() > 0 && tauxAutomatisation() <= 100;
  out.ca = typeof s.ca === 'number' && s.ca >= 0;

  // page rendue via le routeur
  state.page = 'pilotage'; render();
  const html = document.getElementById('view').innerHTML;
  out.rendu = /Taux d'automatisation/.test(html) && /Chiffre d'affaires estimé/.test(html) && /Répartition par étape/.test(html);
  out.nav = !!Array.from(document.querySelectorAll('#nav .nav-btn')).find(b => /Pilotage/.test(b.textContent));
  out.gauge = !!document.querySelector('#view .pil-gauge-fill');
  return out;
});

await browser.close();
check('fonctions pagePilotage / pilotageStats / tauxAutomatisation', r.hasFn);
check('total dossiers actifs comptés', r.total);
check('dossier en attente de pièces détecté', r.attente);
check('dossier complet détecté (pièces+signatures)', r.complet);
check('dossier signé détecté', r.signes);
check('taux d’automatisation calculé (0–100 %)', r.taux100d1);
check('chiffre d’affaires estimé (nombre)', r.ca);
check('page Pilotage rendue (CA + taux + répartition)', r.rendu);
check('entrée « Pilotage » dans la navigation', r.nav);
check('jauge d’automatisation affichée', r.gauge);
check('aucun pageerror', perr.length === 0);

const ok = results.filter(x => x.ok).length, tot = results.length;
results.forEach(x => { if (!x.ok) console.log('✗ ' + x.n); });
if (perr.length) console.log('pageerrors:', perr.slice(0, 4).join(' | '));
console.log(`\nLAST tableau de bord (Étape 8) : ${ok}/${tot} ` + (ok === tot ? 'OK — tout vert' : 'ÉCHEC'));
process.exit(ok === tot ? 0 : 1);
