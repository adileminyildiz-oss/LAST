/**
 * LAST — Phase 7 : assemblage « Prêt au dépôt », RBE, transmission Guichet unique.
 *   node tests/depot.mjs
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
  const intake = { version: 'LASTv1', type: 'sas', numeroDossier: 'DOS-2026-3',
    societe: { denomination: 'GAMMA', capital: '1000', objet: 'Conseil', regime: 'IS — Impôt sur les sociétés', debut: '2026-11-01' },
    siege: { rue: '7 rue du Port', cp: '44000', ville: 'Nantes', type: 'Local commercial (bail)', bailleur: 'SCI Port' },
    direction: { nom: 'Faure', prenom: 'Léa', naissance: '1987-02-02', nationalite: 'Française', adresse: '7 rue du Port Nantes' },
    associes: [{ nom: 'Faure', prenom: 'Léa', apport: '600', parts: '600' }, { nom: 'Blin', prenom: 'Théo', apport: '400', parts: '400' }],
    contact: { nom: 'Faure', prenom: 'Léa', email: 'lea@gamma.fr' } };
  const dd = { id: 't-dep', clientNom: 'Léa Faure', clientEmail: 'lea@gamma.fr', statut: 'Qualification', intake };
  DB.demandes.unshift(dd);
  const d = creerDossierDepuis(dd.id, true);
  const out = {};

  // RBE : 2 associés > 25 %
  const be = rbeBeneficiaires(d);
  out.beCount = be.length;
  out.bePct = be.map(x => x.pct).sort((a, b) => b - a);
  out.rbeHtml = rbeHTML(d);

  // pas encore prêt (pas de signatures, pas de pièces)
  out.r0 = depotReadiness(d);

  // dépose pièces + signe tout
  d.pieces = { identite: { data: 'x' }, domiciliation: { data: 'x' }, edf: { data: 'x' }, impot: { data: 'x' } };
  sigEnvoyerTous(d.id); ['statuts', 'pouvoir', 'dnc', 'souscripteurs'].forEach(k => sigSigne(d.id, k));
  out.r1 = depotReadiness(d);
  out.pkg = depotPackage(d);
  out.html = depotHTML(d);

  // casser la qualité → non prêt
  const c = clientById(d.clientIds[0]); const dn = c.denomination; c.denomination = '';
  out.r2 = depotReadiness(d);
  c.denomination = dn;
  // enlever une signature → non prêt
  d.signDossier.statuts.statut = 'envoye';
  out.r3 = depotReadiness(d);
  return out;
});

await browser.close();
check('RBE : 2 bénéficiaires effectifs (>25%)', r.beCount === 2);
check('RBE : parts 60% / 40%', r.bePct[0] === 60 && r.bePct[1] === 40);
check('RBE : document contient les noms', /Faure|Blin/.test(r.rbeHtml) && /BÉNÉFICIAIRES EFFECTIFS/.test(r.rbeHtml));
check('non prêt au départ (signatures manquantes)', r.r0.ready === false && r.r0.blockers.length >= 1);
check('prêt après pièces + toutes signatures', r.r1.ready === true && r.r1.blockers.length === 0);
check('assemblage : 5 actes + 4 pièces', r.pkg.filter(x => x.cat === 'Acte').length === 5 && r.pkg.filter(x => x.cat === 'Pièce').length === 4);
check('assemblage : actes signés présents', r.pkg.filter(x => x.cat === 'Acte' && x.present).length >= 5);
check('assemblage : pièces présentes', r.pkg.filter(x => x.cat === 'Pièce' && x.present).length === 4);
check('rapport HTML : verdict Prêt + bouton actif', /Prêt au dépôt/.test(r.html) && /Transmettre au Guichet unique/.test(r.html) && !/disabled/.test(r.html));
check('qualité cassée → non prêt', r.r2.ready === false && /qualité/i.test(r.r2.blockers.join(' ')));
check('signature retirée → non prêt', r.r3.ready === false && /signature/i.test(r.r3.blockers.join(' ')));
check('aucun pageerror', perr.length === 0);

const ok = results.filter(x => x.ok).length, tot = results.length;
results.forEach(x => { if (!x.ok) console.log('✗ ' + x.n); });
if (perr.length) console.log('pageerrors:', perr.slice(0, 4).join(' | '));
console.log(`\nLAST dépôt (Phase 7) : ${ok}/${tot} ` + (ok === tot ? 'OK — tout vert' : 'ÉCHEC'));
process.exit(ok === tot ? 0 : 1);
