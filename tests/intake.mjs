/**
 * LAST — test de l'ingestion structurée (Phase 1 · 1b)
 * Vérifie le décodage LAST_DATA → enrichissement + fiche prospect qualifiée.
 *   node tests/intake.mjs
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
  const out = {};
  const o = {
    version: 'LASTv1', type: 'sas', numeroDossier: 'DOS-2026-123456',
    societe: { denomination: 'INNOV SAS', sigle: 'INNOV', objet: 'Édition de logiciels', capital: '1000', regime: 'IS — Impôt sur les sociétés', debut: '2026-09-01' },
    siege: { rue: '10 rue de la Paix', cp: '75002', ville: 'Paris', type: 'Local commercial (bail)', bailleur: 'SCI Paix' },
    direction: { civilite: 'Mme', nom: 'Martin', prenom: 'Claire', nationalite: 'Française', adresse: '5 av. Foch, Paris' },
    associes: [{ nom: 'Martin', prenom: 'Claire', apport: '600', parts: '600', role: 'Présidente' }, { nom: 'Durand', prenom: 'Paul', apport: '400', parts: '400' }],
    contact: { nom: 'Martin', prenom: 'Claire', email: 'claire@innov.fr', tel: '0600000000', message: 'Merci' }
  };
  const b64 = btoa(unescape(encodeURIComponent(JSON.stringify(o))));

  // 1) demande "propre"
  const body1 = 'Bonjour,\nType de formalité: Création SAS\nLAST_DATA: LASTv1:' + b64 + '\n</td></tr>';
  const d1 = { id: 't-intake-1', clientNom: '', clientEmail: '', clientTel: '', statut: 'Nouveau', rawBody: body1, message: '', rawHtml: '' };
  DB.demandes.unshift(d1);
  out.enrich = lastEnrichDemande(d1);
  out.hasIntake = !!d1.intake;
  out.type = d1.formalite; out.svc = d1.serviceSouhaite; out.no = d1.numeroDossier;
  out.nom = d1.clientNom; out.email = d1.clientEmail;
  out.assoc = d1.intake && d1.intake.associes && d1.intake.associes.filter(a => a.nom).length;

  // 2) robustesse : base64 coupé par des sauts de ligne + quoted-printable
  const wrapped = b64.replace(/(.{40})/g, '$1=\r\n').replace(/(.{20})/g, '$1 \n');
  const body2 = 'x\nLAST_DATA: LASTv1:' + wrapped + '\n<div>fin</div>';
  const d2 = { id: 't-intake-2', statut: 'Nouveau', rawBody: body2, message: '', rawHtml: '' };
  DB.demandes.unshift(d2);
  out.enrich2 = lastEnrichDemande(d2);
  out.no2 = d2.intake && d2.intake.numeroDossier;

  // 3) demande sans payload → non enrichie
  const d3 = { id: 't-intake-3', statut: 'Nouveau', rawBody: 'simple email sans données', message: '' };
  DB.demandes.unshift(d3);
  out.enrich3 = lastEnrichDemande(d3); // doit être false

  // 4) fiche + détail
  out.fiche = intakeFicheHTML(d1);
  try { state.page = 'demandes'; state.demView = d1.id; render(); out.detail = document.getElementById('view').innerHTML; } catch (e) { out.detail = 'ERR:' + e; }
  return out;
});

await browser.close();
check('enrichissement réussi', r.enrich === true && r.hasIntake);
check('type = sas', r.type === 'sas');
check('service déduit = Création SAS', r.svc === 'Création SAS');
check('n° dossier repris (DOS-2026-123456)', r.no === 'DOS-2026-123456');
check('contact → nom (Claire Martin)', r.nom === 'Claire Martin');
check('contact → email', r.email === 'claire@innov.fr');
check('2 associés décodés', r.assoc === 2);
check('robustesse : base64 coupé/wrappé décodé', r.enrich2 === true && r.no2 === 'DOS-2026-123456');
check('demande sans payload non enrichie', r.enrich3 === false);
check('fiche : dénomination', /INNOV SAS/.test(r.fiche));
check('fiche : associés', /Associé 1/.test(r.fiche) && /Durand/.test(r.fiche));
check('fiche : n° dossier', /DOS-2026-123456/.test(r.fiche));
check('détail : vue demande allégée (blocs client/traitement retirés)', !/dem-view-cards/.test(r.detail) && /Mail reçu/.test(r.detail));
check('aucun pageerror', perr.length === 0);

const ok = results.filter(x => x.ok).length, tot = results.length;
results.forEach(x => { if (!x.ok) console.log('✗ ' + x.n); });
if (perr.length) console.log('pageerrors:', perr.slice(0, 4).join(' | '));
console.log(`\nLAST ingestion structurée : ${ok}/${tot} ` + (ok === tot ? 'OK — tout vert' : 'ÉCHEC'));
process.exit(ok === tot ? 0 : 1);
