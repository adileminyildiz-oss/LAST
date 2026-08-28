/**
 * LAST — Phase 5 : 3 agents IA de contrôle (Juridique / Formalités / Fiscal).
 *   node tests/agents.mjs
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
  window.confirm = () => true;
  function find(list, sub) { return (list.find(x => x.label.toLowerCase().includes(sub)) || {}).statut; }
  const intake = { version: 'LASTv1', type: 'sas', numeroDossier: 'DOS-2026-9',
    societe: { denomination: 'OMEGA', capital: '1000', objet: 'Conseil', regime: 'IS — Impôt sur les sociétés', debut: '2026-10-01' },
    siege: { rue: '3 rue Neuve', cp: '69001', ville: 'Lyon', type: 'Local commercial (bail)', bailleur: 'SCI Neuve' },
    direction: { nom: 'Roy', prenom: 'Ana', naissance: '1988-01-01', nationalite: 'Française', adresse: '3 rue Neuve Lyon' },
    associes: [{ nom: 'Roy', prenom: 'Ana', apport: '600', parts: '600' }, { nom: 'Sy', prenom: 'Omar', apport: '400', parts: '400' }],
    contact: { nom: 'Roy', prenom: 'Ana', email: 'ana@omega.fr' } };
  const d = { id: 't-ag', clientNom: 'Ana Roy', clientEmail: 'ana@omega.fr', statut: 'Qualification', intake };
  DB.demandes.unshift(d);
  const dos = creerDossierDepuis(d.id, true);
  const c = clientById(dos.clientIds[0]);
  const out = {};

  let j = agentJuridique(dos);
  out.jDenom = find(j, 'dénomination'); out.jCap = find(j, 'capital social'); out.jNb = find(j, "nombre d'associés");
  out.jRep = find(j, 'répartition'); out.jDir = find(j, 'dirigeant désigné'); out.jId = find(j, 'identité');
  let fi = agentFiscal(dos);
  out.fiReg = find(fi, 'régime fiscal'); out.fiCoh = find(fi, 'cohérence'); out.fiTva = find(fi, 'tva');
  let fo = agentFormalites(dos);
  out.foManq = find(fo, 'pièces requises'); out.foDoc = find(fo, 'documents juridiques'); out.foSign = find(fo, 'signatures');
  out.foLocal = find(fo, 'justificatif du local');

  out.qc1 = controleQualite(dos); // ko attendu (pièces manquantes)
  const html = controleQualiteHTML(dos);
  out.html = /Agent Juridique/.test(html) && /Agent Formalités/.test(html) && /Agent Fiscal/.test(html) && /Verdict global/.test(html);

  // Répartition incohérente
  c.capital = 2000; out.repKo = find(agentJuridique(dos), 'répartition');
  c.capital = 1000;
  // SASU avec 2 associés → nombre ko
  c.forme = 'SASU'; out.sasuKo = find(agentJuridique(dos), "nombre d'associés");
  c.forme = 'SAS';
  // Dénomination manquante → ko
  const dn = c.denomination; c.denomination = ''; out.denomKo = find(agentJuridique(dos), 'dénomination'); c.denomination = dn;
  // Régime atypique : EURL à l'IS
  c.forme = 'EURL'; c.regime = 'IS — Impôt sur les sociétés'; out.eurlIS = find(agentFiscal(dos), 'cohérence');
  return out;
});

await browser.close();
check('Juridique : dénomination ok', r.jDenom === 'ok');
check('Juridique : capital ok', r.jCap === 'ok');
check('Juridique : nombre d’associés ok (SAS, 2)', r.jNb === 'ok');
check('Juridique : répartition capital ok (600+400=1000)', r.jRep === 'ok');
check('Juridique : dirigeant désigné ok', r.jDir === 'ok');
check('Juridique : identité dirigeant ok', r.jId === 'ok');
check('Fiscal : régime ok (IS)', r.fiReg === 'ok');
check('Fiscal : cohérence SAS↔IS ok', r.fiCoh === 'ok');
check('Fiscal : TVA à définir (warn)', r.fiTva === 'warn');
check('Formalités : pièces manquantes (ko)', r.foManq === 'ko');
check('Formalités : documents générables (ok)', r.foDoc === 'ok');
check('Formalités : signatures à recueillir (warn)', r.foSign === 'warn');
check('Formalités : justificatif du local ok (bailleur)', r.foLocal === 'ok');
check('Verdict global = À corriger (pièces manquantes)', r.qc1.verdict === 'À corriger' && r.qc1.ko >= 1);
check('Rapport HTML = 3 agents + verdict', r.html);
check('Répartition incohérente → warn', r.repKo === 'warn');
check('SASU à 2 associés → ko', r.sasuKo === 'ko');
check('Dénomination manquante → ko', r.denomKo === 'ko');
check('EURL à l’IS → cohérence warn (option)', r.eurlIS === 'warn');
check('aucun pageerror', perr.length === 0);

const ok = results.filter(x => x.ok).length, tot = results.length;
results.forEach(x => { if (!x.ok) console.log('✗ ' + x.n); });
if (perr.length) console.log('pageerrors:', perr.slice(0, 4).join(' | '));
console.log(`\nLAST agents de contrôle (Phase 5) : ${ok}/${tot} ` + (ok === tot ? 'OK — tout vert' : 'ÉCHEC'));
process.exit(ok === tot ? 0 : 1);
