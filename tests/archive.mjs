/**
 * LAST — Phase 8 : archivage intelligent (arborescence DOS-AAAA-xxx).
 *   node tests/archive.mjs
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
  const intake = { version: 'LASTv1', type: 'sas', numeroDossier: 'DOS-2026-000145',
    societe: { denomination: 'DELTA', capital: '1000', objet: 'Conseil', regime: 'IS' },
    siege: { rue: '2 quai Ouest', cp: '33000', ville: 'Bordeaux', type: 'Local commercial (bail)', bailleur: 'SCI O' },
    direction: { nom: 'Noël', prenom: 'Eva', naissance: '1990-01-01', nationalite: 'Française', adresse: '2 quai Ouest Bordeaux' },
    associes: [{ nom: 'Noël', prenom: 'Eva', apport: '600', parts: '600' }, { nom: 'Roux', prenom: 'Sami', apport: '400', parts: '400' }],
    contact: { nom: 'Noël', prenom: 'Eva', email: 'eva@delta.fr' } };
  const dd = { id: 't-arch', clientNom: 'Eva Noël', clientEmail: 'eva@delta.fr', statut: 'Qualification', intake };
  DB.demandes.unshift(dd);
  const d = creerDossierDepuis(dd.id, true);
  d.pieces = { identite: { data: 'x' }, domiciliation: { data: 'x' }, edf: { data: 'x' }, impot: { data: 'x' } };
  sigEnvoyerTous(d.id); ['statuts', 'pouvoir', 'dnc', 'souscripteurs'].forEach(k => sigSigne(d.id, k));
  d.inpi = { reference: 'INPI-2026-777', status: 'déposé', ts: Date.now() };

  const out = {};
  out.no = archiveNumero(d);
  out.an = archiveAnnee(d);
  const arbo = archiveArbo(d);
  out.folders = arbo.map(f => f.folder);
  out.sigFolder = (arbo.find(f => f.folder === 'Signatures') || {}).items;
  out.formFolder = (arbo.find(f => f.folder === 'Formalités') || {}).items;
  out.idFolder = (arbo.find(f => f.folder === 'Identité') || {}).items;
  out.html = archiveHTML(d);

  // classement automatique : clôture après dépôt
  const d2 = { id: 't-arch2', clientIds: d.clientIds, statut: 'Prêt au dépôt', inpi: { reference: 'X' } };
  archiveClasser(d2);
  out.classe = { no: !!d2.numeroDossier, cloture: !!d2.clotureLe };
  return out;
});

await browser.close();
check('numéro DOS-2026-000145', r.no === 'DOS-2026-000145');
check('année 2026', r.an === '2026');
check('7 dossiers', r.folders.length === 7);
check('arborescence : Client/Identité/Statuts/Signatures/Facturation/Formalités/Archive',
  JSON.stringify(r.folders) === JSON.stringify(['Client', 'Identité', 'Statuts', 'Signatures', 'Facturation', 'Formalités', 'Archive']));
check('Signatures : 4 actes tous présents', r.sigFolder.length === 4 && r.sigFolder.every(i => i.present));
check('Identité : pièce d’identité classée', r.idFolder.some(i => /identité/i.test(i.label) && i.present));
check('Formalités : RBE présent', r.formFolder.some(i => /bénéficiaires/i.test(i.label) && i.present));
check('Formalités : dépôt Guichet unique (réf INPI)', r.formFolder.some(i => /guichet/i.test(i.label) && i.present && /INPI-2026-777/.test(i.meta)));
check('vue HTML : numéro + année + dossiers', /DOS-2026-000145/.test(r.html) && /2026/.test(r.html) && /Signatures/.test(r.html) && /Archive/.test(r.html));
check('classement auto : numéro + clôture posés', r.classe.no && r.classe.cloture);
check('aucun pageerror', perr.length === 0);

const ok = results.filter(x => x.ok).length, tot = results.length;
results.forEach(x => { if (!x.ok) console.log('✗ ' + x.n); });
if (perr.length) console.log('pageerrors:', perr.slice(0, 4).join(' | '));
console.log(`\nLAST archivage (Phase 8) : ${ok}/${tot} ` + (ok === tot ? 'OK — tout vert' : 'ÉCHEC'));
process.exit(ok === tot ? 0 : 1);
