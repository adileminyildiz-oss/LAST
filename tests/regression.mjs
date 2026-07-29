/**
 * LAST — Suite de non-régression (Playwright / Chromium)
 * ------------------------------------------------------
 * Charge index.html hors-ligne, contourne la porte (mot de passe),
 * puis exerce les flux principaux et vérifie leurs invariants.
 *
 * Lancement :
 *   node tests/regression.mjs
 *
 * Playwright : résolu via la variable d'environnement PLAYWRIGHT_PKG
 * (chemin du package), sinon depuis node_modules, sinon quelques
 * emplacements courants. Chromium doit être installé
 * (npx playwright install chromium).
 */
import path from 'path';
import { pathToFileURL } from 'url';

async function loadChromium() {
  const cands = [
    process.env.PLAYWRIGHT_PKG,
    'playwright',
    '/opt/node22/lib/node_modules/playwright/index.js',
    '/usr/lib/node_modules/playwright/index.js',
  ].filter(Boolean);
  for (const c of cands) {
    try {
      const spec = c.endsWith('.js') ? pathToFileURL(c).href : c;
      const mod = await import(spec);
      const chromium = mod.chromium || (mod.default && mod.default.chromium);
      if (chromium) return chromium;
    } catch (_) {}
  }
  throw new Error('Playwright introuvable. Installez-le (npm i -D playwright) ou définissez PLAYWRIGHT_PKG.');
}

const results = [];
function check(name, cond) { results.push({ name, ok: !!cond }); }

const chromium = await loadChromium();
const url = pathToFileURL(path.resolve(process.cwd(), 'index.html')).href;
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 1000 } });
const perr = [];
// Le service worker ne peut pas s'enregistrer sous file:// (SecurityError) —
// bruit d'environnement sans rapport avec l'app : on l'ignore.
page.on('pageerror', e => { const s = '' + e; if (/ServiceWorker/i.test(s)) return; perr.push(s); });
await page.addInitScript(() => { try { localStorage.setItem('last-gate-ok', '1'); } catch (e) {} });
await page.goto(url, { waitUntil: 'networkidle' });
await page.waitForTimeout(400);

const r = await page.evaluate(async () => {
  const out = {};
  window.confirm = () => true;
  DB.parametres = DB.parametres || {}; DB.parametres.mailSync = { url: 'https://s.invalid/exec', key: 'K' };
  window.__mail = null;
  window.fetch = (u, opt) => { const s = decodeURIComponent('' + u); if (opt && opt.method === 'POST') window.__post = opt.body; else window.__mail = s; return Promise.resolve({ text: () => Promise.resolve(JSON.stringify({ sent: true, reference: 'R1', status: 'déposé', signerUrl: 'https://y/s' })) }); };

  // Validateurs
  out.validSiren = validSiren('552081317') && !validSiren('123456789');
  out.validSiret = validSiret('55208131700018') && !validSiret('12345678900000');
  out.validIBAN = validIBAN('FR7630006000011234567890189') && !validIBAN('FR7630006000011234567890188');
  out.validTva = validTvaFr('FR40303265045') && !validTvaFr('FR00');
  out.validEmail = validEmail('a.b@ex.fr') && !validEmail('a@b');

  // Devis -> facture
  DB.clients = [{ id: 'c1', prenom: 'Claire', nom: 'Moreau', email: 'claire@ex.fr' }];
  DB.devis = [{ id: 'dv1', num: 'DEV-1', tiers: 'Claire Moreau', date: '2026-05-01', ech: '2026-06-01', ht: 1000, tva: 200, ttc: 1200, statut: 'Émis', doc: { type: 'devis', numero: 'DEV-1', clientId: 'c1', lignes: [{ desc: 'X', qte: 1, pu: 1000, taux: 20 }] } }];
  DB.factures = [];
  devisTransformer('dv1');
  const dv = DB.devis.find(x => x.id === 'dv1');
  out.devisTransform = dv.statut === 'Transformé' && DB.factures.some(f => f.devisId === 'dv1' && f.ttc === 1200 && f.doc.type === 'facture');

  // Avoir
  const fac = DB.factures.find(f => f.devisId === 'dv1'); fac.statut = 'Impayée';
  factAvoir(fac.id);
  const av = DB.factures.find(f => f.avoir);
  out.avoir = av && av.ttc === -1200 && av.statut === 'Avoir' && fac.avoirNum === av.num;

  // Relance (modèle par défaut)
  const imp = { id: 'fx', type: 'client', num: 'FV-9', tiers: 'Claire Moreau', date: '2026-06-01', ech: '2026-06-15', ttc: 1200, statut: 'Impayée', relances: [], doc: { clientEmail: 'claire@ex.fr' } };
  DB.factures.push(imp);
  factRelancer('fx');
  out.relance = imp.relances.length === 1 && /Relance facture FV-9/.test(window.__mail || '');

  // Échéancier (facture à venir + devis)
  const iso = (n) => { const d = new Date(); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); };
  DB.factures.push({ id: 'fA', type: 'client', num: 'FV-A', tiers: 'X', ttc: 500, statut: 'Impayée', ech: iso(5) });
  const ech = echeancierAVenir(45);
  out.echeancier = ech.some(e => e.num === 'FV-A' && e.jours >= 4 && e.jours <= 6) && !ech.some(e => e.num === 'FV-9');

  // Filtres + tri facturation
  state.factFilter = 'avoirs'; render();
  out.filtreAvoirs = /AV-/.test(document.querySelector('#view').innerHTML);
  state.factFilter = 'tous'; state.factSort = null; factSort('ttc'); factSort('ttc');
  out.tri = (state.factSort.col === 'ttc' && state.factSort.dir === 1);

  // Recherche globale
  gSearchRender('claire');
  out.recherche = document.getElementById('gsearch').classList.contains('show') && /Claire Moreau/.test(document.getElementById('gsearch').innerHTML);
  gsClose();

  // CSV export
  let csvBlob = null; const oc = URL.createObjectURL; URL.createObjectURL = (b) => { csvBlob = b; return 'blob:x'; };
  const ocl = HTMLAnchorElement.prototype.click; HTMLAnchorElement.prototype.click = () => {};
  exportFacturesCSV();
  URL.createObjectURL = oc; HTMLAnchorElement.prototype.click = ocl;
  out.csv = !!csvBlob && csvBlob.type.indexOf('text/csv') === 0;

  // Notes internes
  DB.dossiers = [{ id: 'd1', ref: 'DOS-1', clientNom: 'Claire Moreau', clientEmail: 'claire@ex.fr', serviceSouhaite: 'Création SAS', denom: 'MOREAU SAS', clientIds: [], serviceIds: [], docs: {}, piecesRecues: {} }];
  document.body.insertAdjacentHTML('beforeend', '<textarea id="esp-notes-d1">note test</textarea>');
  espNotesSave('d1');
  out.notes = DB.dossiers[0].notes === 'note test' && !!DB.dossiers[0].notesTs;

  // Attestation (via la modale publique)
  espAttestation('d1');
  let attOk = /ATTESTATION/.test(document.getElementById('ov').innerHTML) && /pris en charge/.test(document.getElementById('ov').innerHTML);
  document.getElementById('att-type').value = 'depot'; attMaj('d1');
  attOk = attOk && /déposée auprès/.test(document.getElementById('att-prev').innerHTML);
  closeModal();
  out.attestation = attOk;

  // INPI payload
  const pl = inpiPayload('d1');
  out.inpiPayload = pl.reference === 'DOS-1' && pl.societe.denomination === 'MOREAU SAS' && Array.isArray(pl.pieces);

  // Undo (facture)
  const before = DB.factures.length;
  factDel('fA');
  const midway = DB.factures.length;
  __toastUndoRun();
  out.undo = (midway === before - 1) && (DB.factures.length === before) && DB.factures.some(f => f.id === 'fA');

  // Backup reminder
  delete DB.params.lastBackup; out.backupNever = backupJours() === null;

  // Sauvegarde automatique (instantané + restauration)
  if (typeof LBackup === 'object' && typeof LBackup._snapshot === 'function') {
    DB.params = DB.params || {}; DB.params.__bk = 'A';
    await LBackup._snapshot('manuel');
    DB.params.__bk = 'B'; await LBackup._snapshot('manuel');
    const lst = await LBackup.list();
    window.confirm = () => true;
    const oldest = lst[lst.length - 1];
    await LBackup.restore(oldest.ts);
    await new Promise(r => setTimeout(r, 350));
    const lst2 = await LBackup.list();
    out.sauvegarde = lst.length >= 2 && DB.params.__bk === 'A' && lst2.some(x => x.reason === 'avant-restauration');
  } else out.sauvegarde = false;

  // Corbeille (capture suppression + restauration + purge)
  DB.corbeille = [];
  DB.factures.push({ id: 'fcorb', type: 'client', num: 'FV-CORB', tiers: 'X', ttc: 100, statut: 'Émise' });
  factDel('fcorb');
  const inCorb = (DB.corbeille || []).some(x => x.type === 'facture' && x.data.id === 'fcorb') && !DB.factures.some(f => f.id === 'fcorb');
  const rec = DB.corbeille.find(x => x.data.id === 'fcorb');
  Corbeille.restore(rec.cid);
  const back = DB.factures.some(f => f.id === 'fcorb') && !DB.corbeille.some(x => x.cid === rec.cid);
  factDel('fcorb'); const rec2 = DB.corbeille.find(x => x.data.id === 'fcorb');
  Corbeille.purge(rec2.cid);
  const purged = !DB.corbeille.some(x => x.cid === rec2.cid) && !DB.factures.some(f => f.id === 'fcorb');
  out.corbeille = inCorb && back && purged;

  // Facture électronique (Factur-X : XML CII + mentions + cycle)
  DB.societe = { raison: 'AEM CONSEIL', formeJur: 'SAS', siret: '55208131700018', tvaIntra: 'FR40303265045', adresse: '10 rue X', cp: '75001', ville: 'Paris' };
  DB.clients.push({ id: 'cfx', prenom: 'Léa', nom: 'Fx', adresse: '3 rue Z', cp: '69001', ville: 'Lyon', siret: '44306184100047' });
  DB.factures.push({ id: 'ffx', type: 'client', num: 'FV-FX', tiers: 'Léa Fx', date: '2026-05-01', ech: '2026-05-31', ht: 1000, tva: 200, ttc: 1200, statut: 'Émise',
    doc: { type: 'facture', numero: 'FV-FX', clientId: 'cfx', date: '2026-05-01', echeance: '2026-05-31', lignes: [{ desc: 'Création SAS', qte: 1, pu: 1000, taux: 20 }], ht: 1000, tva: 200, ttc: 1200 } });
  const fx = DB.factures.find(f => f.id === 'ffx');
  const xml = facturxXML(fx);
  const wf = (() => { try { return !new DOMParser().parseFromString(xml, 'application/xml').querySelector('parsererror'); } catch (e) { return false; } })();
  const xmlOk = wf && /CrossIndustryInvoice/.test(xml) && /55208131700018/.test(xml) && /GrandTotalAmount>1200\.00/.test(xml) && /TypeCode>380/.test(xml);
  const mentOk = factMentions(fx).every(m => m.ok);
  efactTransmettre('ffx'); efactAvancer('ffx'); efactAvancer('ffx'); efactAvancer('ffx'); efactAvancer('ffx');
  const cycleOk = fx.efact && fx.efact.statut === 'Encaissée' && fx.statut === 'Payée';
  out.facturx = xmlOk && mentOk && cycleOk;

  // Toutes les pages se rendent sans erreur
  let pageErr = '';
  ['dash', 'demandes', 'espace', 'clients', 'facturation', 'devis', 'marge', 'params'].forEach(function (pg) {
    try { state.page = pg; render(); const v = document.querySelector('#view'); if (!v || v.innerHTML.length < 50) pageErr += pg + ' '; }
    catch (e) { pageErr += pg + '! '; }
  });
  out.pagesRender = pageErr === '';

  return out;
});

for (const [k, v] of Object.entries(r)) check(k, v);
check('aucune erreur JS', perr.length === 0);

await browser.close();

const pass = results.filter(x => x.ok).length;
const fail = results.filter(x => !x.ok);
for (const f of fail) console.log('  ✗ ' + f.name);
console.log(`\nLAST regression: ${pass}/${results.length} OK` + (fail.length ? ` — ${fail.length} ÉCHEC(S)` : ' — tout vert'));
if (perr.length) console.log('pageerrors:', perr.slice(0, 3).join(' | '));
process.exit(fail.length ? 1 : 0);
