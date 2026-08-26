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
  state.factFilter = 'avoirs';
  out.filtreAvoirs = /AV-/.test(pageFacturation());
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

  // Relances automatiques programmées (cadence + détection des dues)
  const isoR = n => { const d = new Date(); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); };
  DB.params = DB.params || {}; DB.params.relance = { enabled: true, auto: false, plan: [3, 8, 15, 30], repeat: 15 };
  DB.clients.push({ id: 'crel', prenom: 'Rel', nom: 'Ance', email: 'r@ex.fr' });
  DB.factures.push({ id: 'frl1', type: 'client', num: 'FV-RL1', tiers: 'Rel Ance', ech: isoR(-10), ttc: 1200, statut: 'Impayée', relances: [], doc: { clientEmail: 'r@ex.fr' } });
  DB.factures.push({ id: 'frl2', type: 'client', num: 'FV-RL2', tiers: 'Rel Ance', ech: isoR(-2), ttc: 300, statut: 'Impayée', relances: [], doc: { clientEmail: 'r@ex.fr' } });
  const due = relancesDues();
  const dueOk = due.some(x => x.f.id === 'frl1' && x.step === 1) && !due.some(x => x.f.id === 'frl2');
  const nextOk = /^\d{4}-\d{2}-\d{2}$/.test(relanceProchaine(DB.factures.find(f => f.id === 'frl2')));
  out.relancesAuto = dueOk && nextOk && typeof relancesProgPanel === 'function' && typeof relancesAutoCard === 'function';

  // Modèles de dossiers par type de formalité (détection + pièces + override)
  DB.dossiers.push({ id: 'dmod', ref: 'DOS-MOD', clientNom: 'X', serviceSouhaite: 'Transfert de siège social', clientIds: [], docs: {}, piecesRecues: {} });
  const dmod = DB.dossiers.find(x => x.id === 'dmod');
  const detOk = formaliteType(dmod) === 'transfert_siege';
  dmod.serviceSouhaite = 'Création SAS';
  const prSas = piecesRequises(dmod);
  const pcOk = prSas.length >= 8 && prSas.some(x => x.k === 'be');
  modeleSetType('dmod', 'dissolution');
  const ovOk = formaliteType(dmod) === 'dissolution' && piecesRequises(dmod).some(x => /dissolution/i.test(x.label));
  modeleEtape('dmod', 0, true);
  const etOk = dmod.etapesFait && dmod.etapesFait[0] === true;
  out.modeles = detOk && pcOk && ovOk && etOk && typeof modeleDossierCard === 'function' && /Modèle de dossier/.test(modeleDossierCard(dmod));

  // Prévisionnel de trésorerie (retard + attendu + solde projeté)
  const isoT = n => { const d = new Date(); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); };
  DB.params = DB.params || {}; DB.params.tresoSolde = '5000'; DB.params.devisProb = 50;
  DB.factures = [
    { id: 'tra', type: 'client', num: 'T-A', tiers: 'X', ttc: 1200, statut: 'Impayée', ech: isoT(-5) },
    { id: 'trb', type: 'client', num: 'T-B', tiers: 'Y', ttc: 2000, statut: 'Impayée', ech: isoT(10) },
    { id: 'trc', type: 'client', num: 'T-C', tiers: 'Z', ttc: 3000, statut: 'Émise', ech: isoT(70) },
    { id: 'trd', type: 'client', num: 'T-D', tiers: 'W', ttc: 9999, statut: 'Payée', ech: isoT(15) }
  ];
  DB.devis = [{ id: 'tdv', num: 'TDV', tiers: 'Q', ttc: 4000, statut: 'Émis', ech: isoT(20) }];
  const pv = tresoPrevision(6);
  out.treso = Math.round(pv.retard) === 1200 && Math.round(pv.m1) === 3200 && Math.round(pv.m3) === 6200
    && Math.round(pv.potTot) === 2000 && Math.round(pv.soldeFin) === 11200 && typeof tresoPrevisionCard === 'function';

  // Factur-X PDF (PDF/A-3 avec XML embarqué + xref valide)
  DB.societe = DB.societe || { raison: 'AEM CONSEIL', siret: '55208131700018', tvaIntra: 'FR40303265045', adresse: '10 rue X', cp: '75001', ville: 'Paris' };
  const fpdf = DB.factures.find(f => f.id === 'ffx') || { id: 'fpdfx', num: 'FV-PDF', ttc: 1200, ht: 1000, tva: 200, date: '2026-05-01', ech: '2026-05-31', doc: { lignes: [{ desc: 'X', qte: 1, pu: 1000, taux: 20 }] } };
  const blob = facturxPDF(fpdf);
  const buf = new Uint8Array(await blob.arrayBuffer());
  let ps = ''; for (let i = 0; i < buf.length; i++) ps += String.fromCharCode(buf[i]);
  let xrefOk = false;
  try {
    const sx = ps.lastIndexOf('startxref'); const xoff = parseInt(ps.slice(sx + 9).trim(), 10);
    const blk = ps.slice(xoff).split('\n');
    xrefOk = ps.slice(xoff, xoff + 4) === 'xref';
    for (let n = 1; n <= 9; n++) { const o = parseInt(blk[2 + n].slice(0, 10), 10); if (ps.slice(o, o + (n + ' 0 obj').length) !== (n + ' 0 obj')) { xrefOk = false; break; } }
  } catch (e) { xrefOk = false; }
  out.facturxPdf = blob.type === 'application/pdf' && ps.slice(0, 8) === '%PDF-1.7' && ps.trim().endsWith('%%EOF')
    && ps.indexOf('factur-x.xml') >= 0 && ps.indexOf('/EmbeddedFile') >= 0 && ps.indexOf('CrossIndustryInvoice') >= 0 && ps.indexOf('pdfaid:part>3') >= 0 && xrefOk;

  // Accessibilité (lien d'évitement, ARIA, sémantique modale)
  out.a11y = !!document.querySelector('.skip-link')
    && document.querySelector('.skip-link').getAttribute('href') === '#view'
    && document.getElementById('toast').getAttribute('aria-live') === 'polite'
    && document.getElementById('toast').getAttribute('role') === 'status'
    && document.querySelector('#ov .modal').getAttribute('role') === 'dialog'
    && document.querySelector('#ov .modal').getAttribute('aria-modal') === 'true'
    && document.querySelector('#ov .x').getAttribute('aria-label') === 'Fermer'
    && !!document.querySelector('.burger').getAttribute('aria-label')
    && !!document.getElementById('q').getAttribute('aria-label');

  // Documents adaptés à la forme juridique (statuts SAS / SARL / SCI / EURL)
  DB.clients.push({ id: 'csarl', prenom: 'C', nom: 'D', forme: 'SARL', denomination: 'BETA', capital: 2000, siege: '2 rue Y', cp: '69001', ville: 'Lyon', activites: ['restauration'], associes: [{ nom: 'C D', parts: 100 }, { nom: 'E F', parts: 100 }], president: 'C D' });
  DB.clients.push({ id: 'csci', prenom: 'G', nom: 'H', forme: 'SCI', denomination: 'GAMMA', capital: 1500, siege: '3 rue Z', cp: '33000', ville: 'Bordeaux', activites: ['immobilier'], associes: [{ nom: 'G H', parts: 150 }], president: 'G H' });
  DB.dossiers.push({ id: 'dsarl', ref: 'DOS-SARL', clientIds: ['csarl'], docs: {}, piecesRecues: {} });
  DB.dossiers.push({ id: 'dsci', ref: 'DOS-SCI', clientIds: ['csci'], docs: {}, piecesRecues: {} });
  const stSarl = statutsHTML(DB.dossiers.find(x => x.id === 'dsarl'));
  const stSci = statutsHTML(DB.dossiers.find(x => x.id === 'dsci'));
  out.statutsForme = /SOCIÉTÉ À RESPONSABILITÉ LIMITÉE/.test(stSarl) && /parts sociales/.test(stSarl) && !/par actions simplifiée/i.test(stSarl)
    && /SOCIÉTÉ CIVILE IMMOBILIÈRE/.test(stSci) && /1857 du Code civil/.test(stSci)
    && /parts sociales/.test(souscripteursHTML(DB.dossiers.find(x => x.id === 'dsarl')));

  // Actes & procès-verbaux adaptés à la forme (PV AGO, PV de modification)
  const aSarl = acteHTML(DB.dossiers.find(x => x.id === 'dsarl'), 'approbation');
  const aTr = acteHTML(DB.dossiers.find(x => x.id === 'dsarl'), 'transfert');
  out.actes = /ASSEMBLÉE GÉNÉRALE ORDINAIRE/.test(aSarl) && /parts sociales/.test(aSarl) && /gérant/.test(aSarl)
    && /EXTRAORDINAIRE/.test(aTr) && /transférer le siège/.test(aTr)
    && typeof actesCard === 'function' && typeof actesButtons === 'function';

  // Actes complémentaires : feuille de présence + registre des décisions (adaptés à la forme)
  const fpSarl = feuillePresenceHTML(DB.dossiers.find(x => x.id === 'dsarl'));
  const regSarl = registreHTML(DB.dossiers.find(x => x.id === 'dsarl'));
  const regSci = registreHTML(DB.dossiers.find(x => x.id === 'dsci'));
  const btnsSarl = actesButtons(DB.dossiers.find(x => x.id === 'dsarl'));
  out.actesComplement = /FEUILLE DE PRÉSENCE/.test(fpSarl) && /Nombre de parts/.test(fpSarl) && /Quote-part/.test(fpSarl) && /100 %/.test(fpSarl)
    && /REGISTRE DES ASSEMBLÉES GÉNÉRALES/.test(regSarl) && /Nature de la décision/.test(regSarl)
    && /ASSOCIÉ UNIQUE/.test(regSci)
    && /Feuille de présence/.test(btnsSarl) && /Registre des décisions/.test(btnsSarl)
    && typeof feuillePresenceHTML === 'function' && typeof registreHTML === 'function' && typeof acteDocHTML === 'function';

  // Tableau de bord conformité (échéances légales)
  const isoC = n => { const d = new Date(); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); };
  DB.clients.push({ id: 'ccf1', prenom: 'A', nom: 'B', forme: 'SARL' });
  DB.clients.push({ id: 'ccf2', prenom: 'C', nom: 'D', forme: 'SCI' });
  DB.dossiers.push({ id: 'dcf1', ref: 'DOS-CF1', clientNom: 'Sarl CF', clientIds: ['ccf1'], clotureDate: isoC(-200) });
  DB.dossiers.push({ id: 'dcf2', ref: 'DOS-CF2', clientNom: 'Sci CF', clientIds: ['ccf2'], clotureDate: isoC(-160) });
  const oCf = conformiteObligations(DB.dossiers.find(x => x.id === 'dcf1'));
  const oSci = conformiteObligations(DB.dossiers.find(x => x.id === 'dcf2'));
  const Ccf = conformiteData();
  conformiteToggle('dcf1', oCf[0].key, true);
  out.conformite = oCf.length === 2 && oCf.some(x => /Dépôt/.test(x.label))
    && oSci.length === 1 && !oSci.some(x => /Dépôt/.test(x.label))
    && Ccf.retard >= 1 && DB.dossiers.find(x => x.id === 'dcf1').conformiteFait[oCf[0].key] === true
    && typeof conformiteCard === 'function';

  // Rapprochement des paiements (parsing relevé + match + lettrage)
  const rl = rapproParse('15/05/2026 ; VIREMENT CLAIRE MOREAU FV-RAP ; 1200,00\n18/05/2026 ; INCONNU ; 42,00');
  DB.factures.push({ id: 'frap', type: 'client', num: 'FV-RAP', tiers: 'Claire Moreau', date: '2026-05-01', ttc: 1200, statut: 'Impayée' });
  const sug = rapproSuggest(rl[0]);
  state.rapproLines = rl;
  const beforeR = state.rapproLines.length;
  rapproMatchSilent(0, 'frap');
  out.rappro = Math.round(rl[0] ? rl[0].montant : 0) === 42 && sug.id === 'frap' && sug.sur === true
    && DB.factures.find(f => f.id === 'frap').statut === 'Payée'
    && (DB.rapprochements || []).some(x => x.factId === 'frap')
    && state.rapproLines.length === beforeR - 1
    && typeof pageRappro === 'function';
  state.rapproLines = null;

  // Messagerie & informations du formulaire du site (aemconseil.eu)
  const rMsg = demIngest([{ from: 'AEM CONSEIL <submissions@formsubmit.co>', subject: 'Nouvelle soumission du formulaire', date: '2026-08-01T10:30:00Z', id: 'reg-msg-1',
    body: 'New submission from your form via FormSubmit\n*Nom* Testeur\n*Email* testeur@example.org\n*Telephone* 0600000000\n*Type de societe* SAS\n*Message* Bonjour, je veux creer.\nsubmitted at 2026-08-01 10:30:00' }]);
  const dMsg = DB.demandes.find(x => x.msgKey === 'reg-msg-1');
  const fMsg = dMsg ? demFields(dMsg) : [];
  const labs = fMsg.map(x => x.label);
  state.page = 'demandes'; state.demMode = 'messagerie'; state.demCanal = 'site'; state.demView = ''; render();
  const msgItem = !!document.querySelector('#view .msg-item');
  const msgChips = document.querySelectorAll('#view .msg-chip').length;
  demMsgOuvrir(dMsg.id);
  const infCard = [...document.querySelectorAll('#view .card h2')].some(h => /Informations transmises/.test(h.textContent));
  const dinfRows = document.querySelectorAll('#view .dinf-row').length;
  out.messagerie = rMsg.add === 1 && !!dMsg && dMsg.fields && labs.indexOf('E-mail') >= 0 && labs.indexOf('Type de société') >= 0
    && msgItem && msgChips >= 3 && dMsg.lu === true && infCard && dinfRows >= 4
    && typeof demMessagerieView === 'function' && typeof demInfosCard === 'function';
  state.demMode = 'traitement'; state.demCanal = 'tous'; state.demView = '';

  // Demandes — 4 onglets : Réception · Qualification · Envoi des mails · Réception des pièces
  if (!DB.demandes.some((d) => !d.archived)) DB.demandes.push({ id: 'DTG', code: 'DEM-DTG', clientNom: 'Tab G', clientEmail: 'g@ex.fr', serviceSouhaite: 'Création SAS', statut: 'Nouveau', date: '2026-08-01' });
  state.page = 'demandes'; state.demView = ''; state.demMode = 'reception'; render();
  const demBar = document.querySelectorAll('#view .dem-mode-b').length;
  const demBarTxt = (document.querySelector('#view .dem-mode') || {}).textContent || '';
  const demTabsOk = demBar === 4 && /Réception/.test(demBarTxt) && /Qualification/.test(demBarTxt) && /Envoi des mails/.test(demBarTxt) && /Réception des pièces/.test(demBarTxt);
  state.demMode = 'envoi'; render();
  const demEnvoiOk = typeof demEnvoiView === 'function' && [...document.querySelectorAll('#view .dem-tbl th')].some((h) => /Envoyer un e-mail/.test(h.textContent)) && /demReponseType\([^)]*'accuse'\)/.test(document.querySelector('#view').innerHTML);
  state.demMode = 'pieces'; render();
  const demPiecesOk = typeof demPiecesView === 'function' && /Complétude globale/.test(document.querySelector('#view').innerHTML) && !!document.querySelector('#view .dem-pcbar');
  state.demMode = 'traitement'; state.demView = '';
  out.demTabs = demTabsOk && demEnvoiOk && demPiecesOk;

  // Vue détail réorganisée : mail + analyse en haut, cartes de travail en maçonnerie pleine largeur
  const dvId = (DB.demandes.find((d) => !d.archived) || {}).id || '';
  state.page = 'demandes'; state.demView = dvId; render();
  const dvTop = document.querySelector('#view .dem-view-top');
  const dvCards = document.querySelector('#view .dem-view-cards');
  const dvOk = !!dvTop && !!dvCards && dvTop.children.length >= 1 && dvCards.children.length >= 1 && !document.querySelector('#view .dem-view-grid');
  state.demView = '';
  out.demDetail = dvOk;

  // Navigation réduite : uniquement Demandes, Traitement, Paramètres (les autres pages retirées redirigent)
  const navIds = PAGES.map((x) => x.id).sort().join(',');
  buildNav();
  const navLbls = [...document.querySelectorAll('#nav .nav-btn-lbl')].map((x) => x.textContent);
  const navTrimOk = navIds === 'demandes,espace,params'
    && navLbls.length === 3 && navLbls.indexOf('Demandes') >= 0 && navLbls.indexOf('Traitement') >= 0 && navLbls.indexOf('Paramètres') >= 0
    && !['Clients', 'Facturation', 'Devis', 'Rentabilité', 'Pilotage IA', 'Suivi collaborateurs', 'Rapprochement'].some((l) => navLbls.indexOf(l) >= 0);
  state.page = 'facturation'; render(); const navRemovedRedirect = state.page === 'demandes';
  state.page = 'demandes';
  out.navTrim = navTrimOk && navRemovedRedirect;

  // Facturation récurrente automatique (abonnement → génération des échéances dues)
  const isoM = (off) => { const d = new Date(); d.setMonth(d.getMonth() + off); return d.toISOString().slice(0, 10); };
  const fBefore = DB.factures.length;
  DB.recurrences = [{ id: 'recTest', clientNom: 'ACME SARL', label: 'Honoraires', ht: 1000, taux: 20, cadence: 'mensuelle', prochaine: isoM(-2), fin: '', actif: true, count: 0 }];
  const recMade = recGenererDues(true);
  const recF = DB.factures.filter(f => f.recId === 'recTest');
  const recR = DB.recurrences[0];
  const recMade2 = recGenererDues(true);
  state.page = 'facturation'; state.factFilter = 'tous'; render();
  const recCardOk = [...document.querySelectorAll('#view .card h2')].some(h => /Facturation récurrente/.test(h.textContent));
  out.recurrence = recMade === 3 && DB.factures.length - fBefore === 3
    && recF.every(f => f.ttc === 1200 && f.statut === 'Émise' && f.tiers === 'ACME SARL')
    && recR.count === 3 && recR.prochaine > isoM(0) && recMade2 === 0
    && recCardOk && typeof recCard === 'function' && typeof recModal === 'function';

  // Palette de commandes (Ctrl/Cmd+K) + ouverture ciblée d'un dossier depuis la recherche
  gsGo('dossier', 'dsarl');
  const gsDoss = state.page === 'espace' && state.espaceDossier === 'dsarl';
  cmdkOpen();
  const cmdkShown = !!document.querySelector('#cmdk.show');
  const cmdkGroups = [...document.querySelectorAll('#cmdk .cmdk-grp')].map(g => g.textContent);
  const cmdkPages = [...document.querySelectorAll('#cmdk .cmdk-it b')].some(x => /Traitement/.test(x.textContent)) && ![...document.querySelectorAll('#cmdk .cmdk-it b')].some(x => /Pilotage IA/.test(x.textContent));
  const cmdkInp = document.getElementById('cmdk-input');
  cmdkInp.value = 'DOS-SARL'; cmdkInp.dispatchEvent(new Event('input', { bubbles: true }));
  const cmdkFound = [...document.querySelectorAll('#cmdk .cmdk-it b')].some(x => /DOS-SARL/.test(x.textContent));
  cmdkClose();
  out.cmdk = gsDoss && cmdkShown && cmdkFound && cmdkGroups.indexOf('Aller à') >= 0 && cmdkGroups.indexOf('Actions') >= 0
    && cmdkPages && typeof cmdkOpen === 'function' && typeof cmdkClose === 'function';

  // Espace de travail par collaborateur (identité active + Mes demandes + auto-assignation)
  const collabU = DB.users.find(u => u.role === 'collab');
  meSet(collabU.id);
  const meOk = meGet() === collabU.id && meUser() && meUser().role === 'collab';
  DB.demandes.unshift({ id: 'dmine1', clientNom: 'CA', canal: 'Formulaire du site', serviceSouhaite: 'X', statut: 'Nouveau', assigneA: collabU.id, date: '2026-08-01', lu: false });
  DB.demandes.unshift({ id: 'dmine2', clientNom: 'CB', canal: 'Formulaire du site', serviceSouhaite: 'Y', statut: 'Nouveau', assigneA: '', date: '2026-08-01', lu: false });
  const allV = DB.demandes.filter(d => !d.archived);
  state.demMine = true;
  const mineV = demMineFilter(allV);
  const mineSem = mineV.every(d => d.assigneA === collabU.id) && mineV.some(d => d.id === 'dmine1') && !mineV.some(d => d.id === 'dmine2');
  demMeAssigner('dmine2');
  const mineV2 = demMineFilter(DB.demandes.filter(d => !d.archived));
  const selfOk = DB.demandes.find(d => d.id === 'dmine2').assigneA === collabU.id && mineV2.some(d => d.id === 'dmine2');
  state.demMine = false;
  state.page = 'demandes'; render();
  const chipOk = !!document.getElementById('me-chip');
  meSet(DB.users.find(u => u.role === 'admin').id);
  out.collab = meOk && mineSem && selfOk && chipOk
    && typeof meGet === 'function' && typeof demMineBtn === 'function' && typeof mePick === 'function' && typeof demMeAssigner === 'function';

  // Poste de travail des demandes : n° de série, pièces jointes transférées, contexte
  const payloadA = { mails: [{ id: 'mid-reg', from: 'AEM <submissions@formsubmit.co>', subject: 'Nouvelle soumission', date: '2026-08-02T09:15:00Z', body: 'via FormSubmit\n*Nom* Durand\n*Email* d@ex.fr\n*Message* Bonjour.', att: [{ name: 'kbis.pdf', size: 12000 }, { name: 'cni.jpg', size: 8000 }] }] };
  const parsedA = demParseMails(JSON.stringify(payloadA));
  const attCarried = parsedA[0] && parsedA[0].att && parsedA[0].att.length === 2;
  demIngest(parsedA);
  const dReg = DB.demandes.find(x => x.msgKey === 'mid-reg');
  const attStored = dReg && (dReg.attachments || []).length === 2 && dReg.attachments.every(a => a.msgId === 'mid-reg');
  const serieOk = /^DC-\d{4}$/.test(demSerie(dReg));
  const attBlockOk = /Pièces jointes reçues/.test(demAttBlock(dReg.id)) && /kbis\.pdf/.test(demAttBlock(dReg.id));
  const ctxOk = typeof demContexte(dReg) === 'string' && demContexte(dReg).length > 3;
  const banOk = /Mon poste/.test(demPosteBanner());
  out.demPoste = attCarried && attStored && serieOk && attBlockOk && ctxOk && banOk
    && typeof demSerie === 'function' && typeof demAttBlock === 'function' && typeof demAutoFetchAtts === 'function' && typeof demPosteBanner === 'function';

  // File d'attente priorisée + SLA
  const isoOff = (off) => { const dd = new Date(); dd.setDate(dd.getDate() + off); return dd.toISOString(); };
  DB.demandes.push({ id: 'sla-old', code: 'DC-9001', clientNom: 'Old', canal: 'Formulaire du site', serviceSouhaite: 'X', statut: 'Nouveau', assigneA: '', dateTime: isoOff(-5), date: isoOff(-5).slice(0, 10), lu: false });
  DB.demandes.push({ id: 'sla-mid', code: 'DC-9002', clientNom: 'Mid', canal: 'Formulaire du site', serviceSouhaite: 'Y', statut: 'Nouveau', assigneA: '', dateTime: isoOff(-2), date: isoOff(-2).slice(0, 10), lu: false });
  DB.demandes.push({ id: 'sla-new', code: 'DC-9003', clientNom: 'New', canal: 'Formulaire du site', serviceSouhaite: 'Z', statut: 'Nouveau', assigneA: '', dateTime: isoOff(0), date: isoOff(0).slice(0, 10), lu: false });
  demSetSla(2);
  const stt = id => demSlaState(DB.demandes.find(d => d.id === id));
  const slaLevels = stt('sla-old').level === 'late' && stt('sla-mid').level === 'warn' && stt('sla-new').level === 'ok';
  const prioOrder = demPriority(DB.demandes.find(d => d.id === 'sla-old')) > demPriority(DB.demandes.find(d => d.id === 'sla-new'));
  state.demSort = 'priorite';
  const sortedIds = demSortApply([DB.demandes.find(d => d.id === 'sla-new'), DB.demandes.find(d => d.id === 'sla-old'), DB.demandes.find(d => d.id === 'sla-mid')]).map(d => d.id);
  state.demSort = 'recent';
  const sortOk = sortedIds[0] === 'sla-old' && sortedIds[2] === 'sla-new';
  const badgeOk = /sla-late/.test(demSlaBadge(DB.demandes.find(d => d.id === 'sla-old'))) && /en retard/.test(demSlaBadge(DB.demandes.find(d => d.id === 'sla-old')));
  const retardOk = demRetardCount() >= 1;
  demSetSla(7);
  const cfgOk = demSlaCfg() === 7 && demSlaState(DB.demandes.find(d => d.id === 'sla-old')).level !== 'late';
  demSetSla(2);
  out.demSla = slaLevels && prioOrder && sortOk && badgeOk && retardOk && cfgOk
    && typeof demSlaState === 'function' && typeof demPriority === 'function' && typeof demSortApply === 'function' && typeof demSlaBadge === 'function';

  // Checklist de traitement par formalité + réponses types
  DB.demandes.unshift({ id: 'dchk', code: 'DC-0500', clientNom: 'Marie Client', clientEmail: 'marie@ex.fr', canal: 'Formulaire du site', serviceSouhaite: 'Création SCI', statut: 'Nouveau', assigneA: '', date: '2026-08-01', lu: false });
  const dChk = DB.demandes.find(d => d.id === 'dchk');
  const etapes = demEtapes(dChk);
  const p0 = demChkProgress(dChk).pct;
  demChkToggle('dchk', demChkKey(etapes[0]));
  demChkToggle('dchk', demChkKey(etapes[1]));
  const pr2 = demChkProgress(dChk);
  const cardChk = demChecklistCard('dchk');
  const repBuilt = demReponses.map(t => t.build(dChk));
  out.demChecklist = etapes.length >= 4 && /SCI/.test((templateOf(dChk) || {}).label || '')
    && p0 === 0 && pr2.done === 2 && pr2.pct === Math.round(2 / etapes.length * 100)
    && /Étapes de traitement/.test(cardChk)
    && demReponses.length >= 3 && repBuilt.every(m => /DC-0500/.test(m.c)) && /Accusé/.test(demReponsesBar('dchk'))
    && typeof demChecklistCard === 'function' && typeof demReponseType === 'function' && typeof demReponsesBar === 'function';

  // Notification barre latérale (retard) + auto-cochage des étapes
  const isoN = (off) => { const dd = new Date(); dd.setDate(dd.getDate() + off); return dd.toISOString(); };
  DB.demandes.unshift({ id: 'navlate', code: 'DC-0700', clientNom: 'Retard', canal: 'Formulaire du site', serviceSouhaite: 'Création SAS', statut: 'Nouveau', assigneA: '', dateTime: isoN(-5), date: isoN(-5).slice(0, 10), lu: false });
  demSetSla(2);
  buildNav();
  const navLate = !!document.querySelector('#nav .nav-badge-late');
  const dNav = DB.demandes.find(d => d.id === 'navlate');
  const chkBefore = demChkProgress(dNav).done;
  const autoDid = demChkAutoDone('navlate', /collecte|pi[eè]ce|document/i);
  const chkAfter = demChkProgress(dNav).done;
  const autoAgain = demChkAutoDone('navlate', /collecte|pi[eè]ce|document/i);
  out.demNotifAuto = navLate && chkBefore === 0 && autoDid === true && chkAfter === 1 && autoAgain === false
    && typeof demChkAutoDone === 'function';

  // Classement automatique des pièces jointes + couverture + aperçu inline
  const g = n => demAttGuess(n).key;
  const guessOk = g('CNI_recto.pdf') === 'cni' && g('facture-EDF.pdf') === 'domicile' && g('extrait-kbis.pdf') === 'kbis'
    && g('statuts-signes.pdf') === 'statuts' && g('RIB_banque.pdf') === 'rib' && g('scan001.pdf') === 'autre';
  DB.demandes.unshift({ id: 'dcl', code: 'DC-0800', clientNom: 'Léa', clientEmail: 'lea@ex.fr', canal: 'Formulaire du site', serviceSouhaite: 'Création SAS', statut: 'Nouveau', assigneA: '', date: '2026-08-01', lu: false,
    attachments: [{ name: 'CNI_lea.png', type: 'image/png', dataB64: 'iVBORw0KGgoAAAANSUhEUg==', msgId: 'm1' }, { name: 'facture-mobile.pdf', type: 'application/pdf', dataB64: 'JVBERi0=', msgId: 'm1' }, { name: 'scan_x.pdf', type: 'application/pdf', dataB64: 'JVBERi0=', msgId: 'm1' }] });
  const dCl = DB.demandes.find(d => d.id === 'dcl');
  const cats = dCl.attachments.map(a => demAttCat(a).key);
  const cov = demAttCouverture(dCl);
  const cniCovered = cov.some(c => /identit/i.test(c.label) && c.ok);
  const domCovered = cov.some(c => /domicile/i.test(c.label) && c.ok);
  const blk = demAttBlock('dcl');
  demAttSetCat('dcl', 2, 'statuts');
  const catFixed = demAttCat(dCl.attachments[2]).key === 'statuts';
  out.demClass = guessOk && cats[0] === 'cni' && cats[1] === 'domicile' && cniCovered && domCovered
    && /Couverture des pièces requises/.test(blk) && /datt-cat/.test(blk) && catFixed
    && typeof demAttGuess === 'function' && typeof demAttPreview === 'function' && typeof demAttCouverture === 'function';

  // Statistiques du poste (volumes, conversion, SLA, breakdowns)
  const st0 = demStats();
  DB.demandes.unshift({ id: 'statconv', code: 'DC-STAT', clientNom: 'Conv', canal: 'Formulaire du site', serviceSouhaite: 'Création SAS', statut: 'Accepté', assigneA: '', dossierId: 'dosStat', date: '2026-08-01', lu: true });
  const st1 = demStats();
  const statView = demStatsView();
  out.demStats = typeof demStats === 'function' && st1.total === st0.total + 1 && st1.withDossier === st0.withDossier + 1
    && st1.conv >= 0 && st1.conv <= 100 && st1.dansDelais >= 0 && st1.dansDelais <= 100 && Object.keys(st1.byForm).length >= 1
    && /Statistiques des demandes/.test(statView) && /stat-bar/.test(statView) && /stat-k/.test(statView)
    && typeof demStatsCard === 'function' && typeof demStatsView === 'function';

  // Filtre de période + export CSV des statistiques
  const nowD = new Date();
  const thisMonthISO = new Date(nowD.getFullYear(), nowD.getMonth(), 5).toISOString();
  const oldISO = new Date(nowD.getFullYear() - 2, 0, 1).toISOString();
  DB.demandes.unshift({ id: 'permonth', code: 'DC-PM', clientNom: 'PM', canal: 'Formulaire du site', serviceSouhaite: 'Création SAS', statut: 'Nouveau', assigneA: '', dateTime: thisMonthISO, date: thisMonthISO.slice(0, 10), lu: false });
  DB.demandes.unshift({ id: 'perold', code: 'DC-PO', clientNom: 'PO', canal: 'Formulaire du site', serviceSouhaite: 'Création SCI', statut: 'Nouveau', assigneA: '', dateTime: oldISO, date: oldISO.slice(0, 10), lu: false });
  const totTout = demStats('tout').total, totMois = demStats('mois').total;
  const perFilterOk = demInPeriode(DB.demandes.find(d => d.id === 'permonth'), 'mois') === true
    && demInPeriode(DB.demandes.find(d => d.id === 'perold'), 'mois') === false && totMois <= totTout;
  state.demStatsPeriode = 'mois';
  const sv = demStatsView();
  out.demPeriode = perFilterOk && /Exporter \(CSV\)/.test(sv) && /dem-nat-b/.test(sv) && /ce mois/.test(demPeriodeInfo('mois').label)
    && typeof demStatsExport === 'function' && typeof demInPeriode === 'function' && typeof demStatsSetPeriode === 'function';
  state.demStatsPeriode = 'tout';

  // Fondation IA (config, modes démo/off, carte réglages, proxy Mistral)
  const iaC = iaCfg();
  const iaDefaultDemo = iaMode() === 'demo' && iaC.demo === true && iaC.model === 'mistral-small-latest' && iaLiveReady() === false;
  iaCfg().demo = false; iaCfg().enabled = false;
  const iaOff = iaMode() === 'off';
  iaCfg().demo = false; iaCfg().enabled = true; iaCfg().url = 'https://x/exec'; iaCfg().key = 'k';
  const iaLive = iaMode() === 'live' && iaLiveReady() === true;
  iaCfg().demo = true; iaCfg().enabled = false; iaCfg().url = ''; iaCfg().key = '';
  const iaCardHTML = iaConfigCard();
  out.iaFoundation = iaDefaultDemo && iaOff && iaLive
    && /Assistant IA/.test(iaCardHTML) && /ia-demo/.test(iaCardHTML) && /ia-model/.test(iaCardHTML)
    && /api\.mistral\.ai/.test(IA_PROXY_SRC) && /MISTRAL_KEY/.test(IA_PROXY_SRC)
    && typeof iaAsk === 'function' && typeof iaCfg === 'function' && typeof iaConfigCard === 'function' && typeof iaTest === 'function';

  // IA — analyse de la demande entrante (carte fiche + rendu structuré)
  DB.demandes.unshift({ id: 'iaAn', code: 'DC-IA', clientNom: 'Ana', canal: 'Formulaire du site', serviceSouhaite: 'Création SAS', statut: 'Nouveau', assigneA: '', date: '2026-08-01', lu: false, message: 'Créer une SAS' });
  const dIA = DB.demandes.find(d => d.id === 'iaAn');
  dIA.iaAnalyse = { data: { resume: 'Résumé test', nom: 'Ana', forme: 'SAS', type_formalite: 'création', urgence: 'moyenne', autres: 'note utile' }, ts: 1, demo: true };
  const anaCard = demAnalyseCard('iaAn');
  out.iaAnalyse = /Analyse IA/.test(anaCard) && /iana-resume/.test(anaCard) && /Résumé test/.test(anaCard)
    && /Contact/.test(anaCard) && /Projet juridique/.test(anaCard) && /Proposer le pré-remplissage/.test(anaCard) && /note utile/.test(anaCard)
    && typeof demAnalyse === 'function' && typeof demAnalyseCard === 'function' && typeof demAnalyseAppliquer === 'function' && typeof demAnalyseAuto === 'function';

  // IA — brouillon de réponse + reformulation dans le composeur
  DB.demandes.unshift({ id: 'drepReg', code: 'DC-REP', clientNom: 'Rep', canal: 'Formulaire du site', serviceSouhaite: 'Création SARL', statut: 'Nouveau', assigneA: '', date: '2026-08-01', lu: false, message: 'test' });
  const ficheHTML = demVueDetail('drepReg');
  const reformBar = iaReformBar();
  demSmtpModal('x@y.fr', 'S', 'C');
  const compReform = !!document.querySelector('#ov .ia-reform') && document.querySelectorAll('#ov .ia-reform button').length === 4 && !!document.getElementById('ml-corps');
  closeModal();
  out.iaReponse = /Rédiger la réponse \(IA\)/.test(ficheHTML) && /ia-reform/.test(reformBar) && (reformBar.match(/<button/g) || []).length === 4 && compReform
    && typeof demReponseIA === 'function' && typeof iaReformuler === 'function' && typeof iaReformBar === 'function';

  // IA — signaux (urgence/intention/sentiment/langue) + priorité + traduction
  const mkSig = (id, over) => Object.assign({ id, code: 'SIG' + id, clientNom: id, canal: 'Formulaire du site', statut: 'Nouveau', assigneA: '', date: '2026-08-01', lu: false }, over);
  DB.demandes.unshift(mkSig('sigU', { message: 'x', iaAnalyse: { data: { urgence: 'haute' }, ts: 1, demo: true } }));
  DB.demandes.unshift(mkSig('sigN', { message: 'x', iaAnalyse: { data: { sentiment: 'négatif' }, ts: 1, demo: true } }));
  DB.demandes.unshift(mkSig('sigE', { message: 'x', iaAnalyse: { data: { langue: 'en' }, ts: 1, demo: true } }));
  DB.demandes.unshift(mkSig('sigS', { message: 'x', iaAnalyse: { data: { intention: 'spam' }, ts: 1, demo: true } }));
  DB.demandes.unshift(mkSig('sigNone', { message: 'x' }));
  const sigLabels = id => demSignaux(DB.demandes.find(d => d.id === id)).map(s => s.label).join('|');
  const priU = demPriority(DB.demandes.find(d => d.id === 'sigU'));
  const priS = demPriority(DB.demandes.find(d => d.id === 'sigS'));
  const cardU = demAnalyseCard('sigE'); // EN → bouton traduire
  out.iaSignaux = /Urgent/.test(sigLabels('sigU')) && /Mécontent/.test(sigLabels('sigN')) && /EN/.test(sigLabels('sigE')) && /Spam/.test(sigLabels('sigS'))
    && demSignaux(DB.demandes.find(d => d.id === 'sigNone')).length === 0
    && priU > priS && /Traduire en français/.test(cardU)
    && typeof demSignaux === 'function' && typeof demTraduire === 'function' && typeof demSignauxHTML === 'function';

  // IA — lecture des pièces (vision) + conformité + apply
  DB.demandes.unshift({ id: 'dpcReg', code: 'DC-PC', clientNom: 'Julie Bernard', canal: 'Formulaire du site', serviceSouhaite: 'Création SAS', statut: 'Nouveau', assigneA: '', date: '2026-08-01', lu: false,
    attachments: [
      { name: 'CNI.jpg', type: 'image/jpeg', dataB64: 'x', msgId: 'm', cat: 'cni', iaLu: { data: { nom: 'BERNARD', prenom: 'Julie', face: 'recto-verso', lisible: true, expiree: false }, cat: 'cni', ts: 1, demo: true } },
      { name: 'edf.pdf', type: 'application/pdf', dataB64: 'y', msgId: 'm', cat: 'domicile' }] });
  const blkPc = demAttBlock('dpcReg');
  out.iaPiece = /datt-fields/.test(blkPc) && /BERNARD/.test(blkPc) && /Recto \+ verso/.test(blkPc) && /En cours de validité/.test(blkPc) && /Lisible/.test(blkPc)
    && /Lire toutes les pièces/.test(blkPc) && /Utiliser ces infos/.test(blkPc) && /Lire \(IA\)/.test(blkPc)
    && typeof demPieceLire === 'function' && typeof demAttIAResult === 'function' && typeof demPieceAppliquer === 'function' && typeof demPieceLireToutes === 'function';

  // IA — formalités : objet social, cohérence, clauses
  DB.clients.push({ id: 'cfReg', prenom: 'Léa', nom: 'M', forme: 'EURL', denomination: 'BETA', capital: 1000, siege: 'x', ville: 'Paris', president: 'Léa M', activites: ['conseil'], associes: [{ nom: 'Léa M', parts: 100 }, { nom: 'Tom', parts: 100 }] });
  DB.dossiers.push({ id: 'dfReg', ref: 'DOS-FR', clientIds: ['cfReg'], forme: 'EURL', docs: {}, piecesRecues: {} });
  const dfR = DB.dossiers.find(d => d.id === 'dfReg');
  dfR.iaCoherence = { issues: [{ gravite: 'err', texte: 'Forme unipersonnelle (EURL) mais plusieurs associés.' }, { gravite: 'warn', texte: 'Objet social non rédigé.' }], ts: 1, demo: true };
  const fcard = iaFormaliteCard(dfR);
  out.iaFormalite = /Assistant IA — formalités/.test(fcard) && /Proposer un objet social/.test(fcard) && /(Vérifier la cohérence|Revérifier)/.test(fcard) && /Suggérer les clauses/.test(fcard)
    && /ia-coh-row/.test(fcard) && /Forme unipersonnelle/.test(fcard)
    && typeof demObjetSocial === 'function' && typeof demCoherence === 'function' && typeof demClauses === 'function' && typeof iaFormaliteCard === 'function';

  // IA — facturation : anomalies (doublon + montant) + boutons + fonctions
  DB.factures.push({ id: 'ano1', type: 'client', num: 'FV-ANO', tiers: 'ANOTEST', date: '2026-01-01', ht: 100, tva: 20, ttc: 120, statut: 'Émise' });
  DB.factures.push({ id: 'ano2', type: 'client', num: 'FV-ANO', tiers: 'ANOTEST', date: '2026-02-01', ht: 100, tva: 20, ttc: 120, statut: 'Émise' });
  DB.factures.push({ id: 'anb1', type: 'client', num: 'B1', tiers: 'ANOBIG', date: '2026-01-01', ht: 100, tva: 20, ttc: 120, statut: 'Émise' });
  DB.factures.push({ id: 'anb2', type: 'client', num: 'B2', tiers: 'ANOBIG', date: '2026-02-01', ht: 100, tva: 20, ttc: 120, statut: 'Émise' });
  DB.factures.push({ id: 'anb3', type: 'client', num: 'B3', tiers: 'ANOBIG', date: '2026-03-01', ht: 100, tva: 20, ttc: 120, statut: 'Émise' });
  DB.factures.push({ id: 'anb4', type: 'client', num: 'B4', tiers: 'ANOBIG', date: '2026-04-01', ht: 5000, tva: 1000, ttc: 6000, statut: 'Émise' });
  const anoList = factAnomalies('client');
  const anoCard = factAnomaliesCard('client');
  const anoBadge = factAnomalieBadge(DB.factures.find(f => f.id === 'ano2')).length > 0;
  state.page = 'facturation'; state.factTab = 'client';
  const factPage = pageFacturation();
  out.iaFacture = anoList.some(a => a.tiers === 'ANOTEST' && a.type === 'doublon') && anoList.some(a => a.tiers === 'ANOBIG' && a.type === 'montant')
    && /Anomalies détectées/.test(anoCard) && anoBadge
    && /Désignation \(IA\)/.test(factPage) && /Lire une facture \(IA\)/.test(factPage)
    && typeof demDesignationIA === 'function' && typeof demRelanceIA === 'function' && typeof iaLireFacture === 'function' && typeof factAnomalies === 'function';

  // IA — copilote (⌘K) : fonctions, affichage avec action, exécution avec confirmation
  if (typeof iaCfg === 'function') { iaCfg().demo = true; iaCfg().enabled = false; }
  iaCopiloteAfficher('quelles pièces pour une SAS ?', { reponse: 'Réponse test copilote', action: { type: 'go', page: 'clients' } });
  const copBody = (document.getElementById('ov-b') || {}).innerHTML || '';
  const copActionSet = !!(window.__iaCopAction && window.__iaCopAction.type === 'go');
  // Exécution directe d'une action (navigation)
  state.page = 'demandes'; iaCopiloteExec({ type: 'go', page: 'espace' });
  const copExec = state.page === 'espace';
  if (typeof closeModal === 'function') closeModal();
  out.iaCopilote = typeof iaCopilote === 'function' && typeof iaCopiloteExec === 'function' && typeof iaCopiloteAfficher === 'function' && typeof iaCopiloteConfirmer === 'function'
    && /Réponse test copilote/.test(copBody) && /Action proposée/.test(copBody) && copActionSet && copExec;

  // IA — pilotage : page dédiée, recommandations (signaux) + rapport (KPIs + synthèse)
  DB.factures.push({ id: 'pilf', type: 'client', num: 'FV-PILO', tiers: 'PILRET', statut: 'Impayée', ech: '2020-01-01', ttc: 1500 });
  DB.devis = DB.devis || []; DB.devis.push({ id: 'pildv', num: 'DV-PILO', tiers: 'X', statut: 'Émis', date: '2020-01-01', ttc: 900 });
  const piloInPages = typeof pagePilotage === 'function';
  const piloSig = piloSignaux();
  const piloReco = piloSig.impayes.n >= 1 && piloSig.devisSansSuite.n >= 1;
  const piloK = piloKPIs('annee');
  const piloKok = typeof piloK.recues === 'number' && typeof piloK.tauxConversion === 'number' && typeof piloK.caEmis === 'number';
  piloRapportGen('mois', true);
  await new Promise(r => setTimeout(r, 500)); // laisse la synthèse démo se remplir
  const piloRap = piloCfg().rapports.find(x => x.periode === 'mois'); // (le rapport hebdo auto peut coexister)
  const piloRapOk = !!(piloRap && piloRap.kpis && piloRap.synthese && piloRap.synthese.length > 10);
  const piloPage = pagePilotage();
  out.iaPilotage = piloInPages && piloReco && piloKok && piloRapOk
    && /Recommandations/.test(piloPage) && /Rapport d.activité/.test(piloPage) && /Synthèse/.test(piloPage)
    && typeof pagePilotage === 'function' && typeof piloRapportGen === 'function' && typeof piloAutoHebdo === 'function' && typeof piloRecoCount === 'function';

  // IA — transverse : barre IA + dictée sur les zones de texte, résumé demande/dossier
  document.body.insertAdjacentHTML('beforeend', '<textarea id="trta">bonjour   ceci  est   un test.  deuxieme phrase longue ici. troisieme phrase.  quatrieme phrase finale.</textarea>');
  iaDecorerTextareas();
  const trBar = document.querySelector('.iatb[data-for="trta"]');
  const trBarOk = !!trBar && /Corriger/.test(trBar.innerHTML) && /Raccourcir/.test(trBar.innerHTML) && /Plus pro/.test(trBar.innerHTML);
  const trBefore = document.getElementById('trta').value.length;
  iaTA('trta', 'raccourcir');
  await new Promise(r => setTimeout(r, 450));
  const trShort = document.getElementById('trta').value.length < trBefore && document.getElementById('trta').value.length > 0;
  DB.demandes = DB.demandes || [];
  DB.demandes.push({ id: 'trdem', clientNom: 'Résumé Prospect', clientEmail: 't@ex.fr', serviceSouhaite: 'Création SAS', message: 'Créer ma société', date: '2026-01-01' });
  iaResumeDemande('trdem');
  await new Promise(r => setTimeout(r, 450));
  const trResD = /Résumé de la demande/.test((document.getElementById('ov-t') || {}).innerHTML || '') && (document.getElementById('iares-out') || {}).innerHTML.length > 20;
  if (typeof closeModal === 'function') closeModal();
  iaResumeDossier('d1'); // dossier créé plus haut dans la suite
  await new Promise(r => setTimeout(r, 450));
  const trResDoss = /Résumé du dossier/.test((document.getElementById('ov-t') || {}).innerHTML || '') && (document.getElementById('iares-out') || {}).innerHTML.length > 20;
  if (typeof closeModal === 'function') closeModal();
  out.iaTransverse = typeof iaTA === 'function' && typeof iaMic === 'function' && typeof iaResumeDemande === 'function' && typeof iaResumeDossier === 'function' && typeof iaDecorerTextareas === 'function'
    && trBarOk && trShort && trResD && trResDoss;

  // IA — guide de mise en service du proxy Mistral (bouton dans la carte + modale pas à pas)
  const iaCard = iaConfigCard();
  iaGuideProxy();
  const guideBody = (document.getElementById('ov-b') || {}).innerHTML || '';
  out.iaGuide = typeof iaGuideProxy === 'function' && typeof iaGuideCopierCode === 'function'
    && /Guide de mise en service/.test(iaCard) && /iaGuideProxy\(\)/.test(iaCard)
    && /console.mistral.ai/.test(guideBody) && /MISTRAL_KEY/.test(guideBody) && /SHARED_KEY/.test(guideBody) && /RGPD/.test(guideBody);
  if (typeof closeModal === 'function') closeModal();

  // FLUX — pipeline argent (4 étapes + € potentiel) + acceptation → devis + lien dossier↔facture
  const svc0 = (DB.services || [])[0];
  DB.demandes = DB.demandes || []; DB.demandes.push({ id: 'flxd', clientNom: 'Prospect Flux', clientEmail: 'p@ex.fr', serviceSouhaite: 'Création SARL', message: 'créer ma sarl', date: '2026-07-01' });
  DB.devis = DB.devis || []; DB.devis.push({ id: 'flxv', num: 'DEV-FLX', tiers: 'Client Devis', date: '2026-06-01', ech: '2026-07-01', ht: 1000, tva: 200, ttc: 1200, statut: 'Émis' });
  DB.dossiers = DB.dossiers || []; DB.dossiers.push({ id: 'flxo', ref: 'DOS-FLX', clientIds: [], serviceIds: svc0 ? [svc0.id] : [], statut: 'Transmis greffe', createdAt: '2026-06-01', historique: [] });
  DB.factures = DB.factures || []; DB.factures.push({ id: 'flxi', type: 'client', num: 'FV-FLXI', tiers: 'Retardataire', date: '2020-01-01', ech: '2020-02-01', ht: 500, tva: 100, ttc: 600, statut: 'Impayée', relances: [], doc: { clientEmail: 'r@ex.fr' } });
  const flxStages = fluxStages();
  const flxStagesOk = flxStages.demandes.some((x) => x.id === 'flxd') && flxStages.devis.some((x) => x.id === 'flxv') && flxStages.facturer.some((x) => x.id === 'flxo') && flxStages.impayes.some((x) => x.id === 'flxi');
  const flxTot = fluxTotals();
  const flxTotOk = flxTot.impayes.eur >= 600 && flxTot.facturer.n >= 1 && typeof flxTot.demandes.eur === "number";
  const dashHTML = pagePilotage();
  const flxCardOk = /Pipeline commercial/.test(dashHTML) && /Demandes à qualifier/.test(dashHTML) && /Dossiers à facturer/.test(dashHTML) && /Impayés à relancer/.test(dashHTML);
  const flxFicheBtn = !/flux-accdev/.test(demVueDetail('flxd')); // bouton « établir le devis » retiré de la fiche
  demAccepterDevis('flxd');
  const flxAccepted = (DB.demandes.find((x) => x.id === 'flxd') || {}).decision === 'accepte';
  if (typeof closeModal === 'function') closeModal();
  if (typeof FactureVente !== 'undefined' && FactureVente.fermer) FactureVente.fermer();
  // lien dossier↔facture : une facture liée retire le dossier de « à facturer »
  DB.factures.push({ id: 'flxf', type: 'client', num: 'FV-FLXF', tiers: 'X', ttc: 390, statut: 'Émise', dossierId: 'flxo' });
  const flxLinkOk = !fluxStages().facturer.some((x) => x.id === 'flxo');
  out.fluxPipeline = typeof fluxPipelineCard === 'function' && typeof fluxStages === 'function' && typeof fluxTotals === 'function' && typeof fluxFacturerDossier === 'function'
    && flxStagesOk && flxTotOk && flxCardOk && flxLinkOk;
  // Tableau de bord — résultats (missions complétées, ventes, missions clôturées) + tableaux opérationnels déplacés vers Pilotage IA + pleine largeur
  // Module « Tableau de bord » supprimé : absent de la nav/route ; contenu clé relocalisé dans Pilotage IA
  const noDashInPages = !PAGES.some((x) => x.id === 'dash');
  state.page = 'dash'; render(); const dashFallback = state.page === 'demandes';
  const piloTbl = typeof piloTablesHTML === 'function' && typeof pagePilotage === 'function';
  const piloHTML = piloTbl ? pagePilotage() : '';
  const piloHasAll = /Santé financière/.test(piloHTML) && /Pipeline commercial/.test(piloHTML) && />À relancer</.test(piloHTML) && /Échéances à venir/.test(piloHTML) && /Dernières demandes/.test(piloHTML) && /Revenus récurrents/.test(piloHTML);
  out.dashRefresh = noDashInPages && dashFallback && piloTbl && piloHasAll;
  out.fluxAccepterDevis = typeof demAccepterDevis === 'function' && flxFicheBtn && flxAccepted;

  // FLUX — anti-fuite débours : détection des frais officiels manquants + ajout
  const svcCrea = (DB.services || []).find((s) => s.famille === 'Création' && s.type !== 'debours');
  const dDeb = { id: 'flxdeb', ref: 'DOS-DEB', clientIds: [], serviceIds: svcCrea ? [svcCrea.id] : [], statut: 'Transmis greffe', createdAt: '2026-01-01', historique: [] };
  DB.dossiers.push(dDeb);
  const debMiss = fluxDeboursRequis(dDeb);
  const debMissOk = debMiss.length === 2 && debMiss.some((s) => /annonce/i.test(s.nom)) && debMiss.some((s) => /greffe/i.test(s.nom));
  const debBefore = (dDeb.serviceIds || []).length;
  fluxAjouterDebours(dDeb, debMiss);
  const debAddOk = (dDeb.serviceIds.length - debBefore) === 2 && fluxDeboursRequis(dDeb).length === 0;
  const svcAnnuel = (DB.services || []).find((s) => s.famille === 'Annuel' && s.type !== 'debours');
  const dAnn = { id: 'flxann', ref: 'DOS-ANN', clientIds: [], serviceIds: svcAnnuel ? [svcAnnuel.id] : [], statut: 'Clôturé' };
  DB.dossiers.push(dAnn);
  const debAnnualOk = svcAnnuel ? (fluxDeboursRequis(dAnn).length === 1 && /greffe/i.test(fluxDeboursRequis(dAnn)[0].nom)) : true;
  out.fluxDebours = typeof fluxDeboursRequis === 'function' && typeof fluxAjouterDebours === 'function' && debMissOk && debAddOk && debAnnualOk;

  // RÉCURRENCE — MRR/ARR + opportunités d'abonnement + carte sur le dashboard
  DB.recurrences = DB.recurrences || [];
  const mrrBefore = recMRR().mrr; // d'autres abonnements peuvent préexister → on mesure le delta
  DB.recurrences.push({ id: 'rr1', clientNom: 'Client Mensuel', ht: 100, taux: 20, cadence: 'mensuelle', prochaine: '2099-01-01', actif: true });
  DB.recurrences.push({ id: 'rr2', clientNom: 'Client Annuel', ht: 1200, taux: 0, cadence: 'annuelle', prochaine: '2099-01-01', actif: true });
  const mrr = recMRR();
  const mrrOk = Math.round(mrr.mrr - mrrBefore) === 220 && Math.round(mrr.arr) === Math.round(mrr.mrr * 12) && mrr.n >= 2; // +120 mensuel +100 (1200/12)
  DB.clients = DB.clients || []; DB.clients.push({ id: 'rcx', prenom: 'Nadia', nom: 'Recur', email: 'n@ex.fr' });
  DB.dossiers.push({ id: 'rdo', ref: 'DOS-REC', clientIds: ['rcx'], serviceIds: [], statut: 'Clôturé', createdAt: '2026-01-01' });
  const oppHas = recOpportunites().some((x) => /Nadia Recur/.test(x.nom));
  DB.recurrences.push({ id: 'rr3', clientNom: 'Nadia Recur', ht: 150, taux: 20, cadence: 'annuelle', prochaine: '2099-01-01', actif: true });
  const oppExcl = !recOpportunites().some((x) => /Nadia Recur/.test(x.nom));
  const dashRec = pagePilotage();
  const recDashOk = /Revenus récurrents/.test(dashRec) && /MRR/.test(dashRec);
  out.recurrence = typeof recMRR === 'function' && typeof recOpportunites === 'function' && typeof recFromClient === 'function' && typeof recOpportunitesCard === 'function'
    && mrrOk && oppHas && oppExcl && recDashOk;

  // AUTH 2FA — TOTP (vecteurs RFC 4226) + chiffrement du secret par mot de passe + anti-force-brute
  const RFCSEC = 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ'; // base32 de "12345678901234567890"
  const hotp0 = await _hotp(RFCSEC, 0); // doit valoir 755224
  const hotp1 = await _hotp(RFCSEC, 1); // doit valoir 287082
  const encSec = await _authEnc('motdepasse', RFCSEC);
  const decOk = (await _authDec('motdepasse', encSec)) === RFCSEC;
  const decBad = (await _authDec('faux', encSec)) === null;
  const nowCode = await _totp(RFCSEC, Math.floor(Date.now() / 1000));
  const totpAccept = await _totpValide(RFCSEC, nowCode);
  const totpReject = (await _totpValide(RFCSEC, 'abc')) === false;
  _authOk(); for (let i = 0; i < 5; i++) _authFail();
  const lockOn = _authLockLeft() > 0; _authOk(); const lockOff = _authLockLeft() === 0;
  out.auth2fa = hotp0 === '755224' && hotp1 === '287082' && decOk && decBad && totpAccept && totpReject && lockOn && lockOff
    && typeof lastGateOtp === 'function' && typeof lastGateEnrollVerify === 'function' && typeof has2fa === 'function';

  // SÉCURITÉ — carte dans Paramètres + mot de passe modifiable (override localStorage) + guide
  const secCardHTML = (typeof secCard === 'function') ? secCard() : '';
  const secInParams = pageParams().indexOf('Sécurité') >= 0 && /double authentification/.test(pageParams());
  const newHash = await _sha256('MotDePasseFort!2026');
  localStorage.setItem('last-pwd', newHash);
  const pwdOverrideOk = getPwdHash() === newHash;
  localStorage.removeItem('last-pwd');
  const pwdDefaultOk = getPwdHash() === LAST_PWD_HASH;
  // Code de verrouillage universel : 2 lignes source (empreinte + blob 2FA chiffré)
  localStorage.setItem('last-2fa', await _authEnc('pw', 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ'));
  secExportLock();
  const lockBody = (document.getElementById('ov-b') || {}).innerHTML || '';
  const lockOk = /var LAST_PWD_HASH='[0-9a-f]{64}'/.test(lockBody) && /var LAST_2FA_ENC='[^']{20,}'/.test(lockBody);
  if (typeof closeModal === 'function') closeModal();
  localStorage.removeItem('last-2fa');
  // bannière d'état du verrouillage universel : non activé / local en attente / universel actif
  window.LAST_2FA_ENC = '';
  const lockNone = /sec-lock warn/.test(secCard());
  localStorage.setItem('last-2fa', 'enc' + 'A'.repeat(48));
  const lockPend = /sec-lock pend/.test(secCard()) && /btn-pri" onclick="secExportLock/.test(secCard());
  window.LAST_2FA_ENC = 'enc' + 'A'.repeat(48);
  const lockCommit = /sec-lock ok/.test(secCard());
  window.LAST_2FA_ENC = ''; localStorage.removeItem('last-2fa');
  const dlFn = typeof secDownloadLock === 'function';
  out.securite = typeof secCard === 'function' && typeof sec2FAStart === 'function' && typeof secChangePwdSave === 'function' && typeof secGuide === 'function' && typeof getPwdHash === 'function' && typeof secExportLock === 'function'
    && /Sécurité/.test(secCardHTML) && secInParams && pwdOverrideOk && pwdDefaultOk && lockOk
    && lockNone && lockPend && lockCommit && dlFn;

  // COMPTES admin/collaborateur — auth collab, périmètre assigné, nav restreinte, garde de modification
  const sofia = (DB.users || []).find((u) => u.id === 'u-sofia');
  sofia.login = 'sofia.b'; sofia.actif = true; sofia.pwdHash = await _sha256('travail2026');
  const authGood = await collabAuth('SOFIA.B', 'travail2026'); // insensible à la casse
  const authBad = await collabAuth('sofia.b', 'nope');
  sofia.actif = false; const authInactif = await collabAuth('sofia.b', 'travail2026'); sofia.actif = true;
  // bascule collaborateur
  localStorage.setItem('last-role', 'collab'); localStorage.setItem('last-user', 'u-sofia');
  DB.dossiers = [{ id: 'rda', ref: 'DOS-RA', clientIds: [], serviceIds: [], statut: 'En cours', assigneA: 'u-sofia' }, { id: 'rdb', ref: 'DOS-RB', clientIds: [], serviceIds: [], statut: 'En cours', assigneA: 'u-karim' }];
  const scopeOk = espDoss().length === 1 && espDoss()[0].id === 'rda';
  buildNav(); const navC = (document.getElementById('nav') || {}).innerHTML || '';
  const navRestricted = /Demandes/.test(navC) && /Traitement/.test(navC) && !/Clients|Facturation|Rentabilité|Pilotage|Paramètres/.test(navC);
  state.page = 'params'; render(); const redirectOk = state.page === 'demandes';
  const dBefore = DB.dossiers.length; delDossier('rda'); const guardOk = DB.dossiers.length === dBefore; // suppression bloquée
  const roleFlagsOk = isCollab() === true && isAdmin() === false && (currentCollab() || {}).id === 'u-sofia';
  // restauration ADMIN (indispensable pour la suite des tests)
  localStorage.setItem('last-role', 'admin'); localStorage.removeItem('last-user');
  state.page = 'demandes'; render();
  out.comptes = typeof collabAuth === 'function' && typeof collabAccess === 'function' && typeof isCollab === 'function' && typeof lastRole === 'function'
    && (authGood && authGood.id === 'u-sofia') && authBad === null && authInactif === null
    && scopeOk && navRestricted && redirectOk && guardOk && roleFlagsOk && isAdmin() === true;

  // SUIVI DES COLLABORATEURS (admin) — page dédiée, tâches par collaborateur, activité, retards
  DB.demandes = [{ id: 'svd', clientNom: 'Client Suivi', assigneA: 'u-sofia', serviceSouhaite: 'Création SARL', date: '2020-01-01' }];
  DB.dossiers = [{ id: 'svo1', ref: 'DOS-SV1', clientIds: [], serviceIds: [], statut: 'En cours', assigneA: 'u-sofia' }, { id: 'svo2', ref: 'DOS-SV2', clientIds: [], serviceIds: [], statut: 'Clôturé', assigneA: 'u-sofia' }];
  DB.audit = [{ ts: Date.now(), user: 'Sofia B.', action: 'Relance facture', detail: 'FV-9' }];
  const suiviInPages = typeof pageSuivi === 'function';
  const suiviHTML = pageSuivi();
  const suiviOk = /Suivi des collaborateurs/.test(suiviHTML) && /Sofia B\./.test(suiviHTML) && /DOS-SV1/.test(suiviHTML) && /Client Suivi/.test(suiviHTML) && /Relance facture/.test(suiviHTML) && /En retard/.test(suiviHTML);
  // dispatch : rendu via render() sans erreur
  const suiviRendered = /Suivi des collaborateurs/.test(pageSuivi());
  // admin-only : un collaborateur est redirigé hors de 'suivi'
  localStorage.setItem('last-role', 'collab'); localStorage.setItem('last-user', 'u-sofia'); state.page = 'suivi'; render();
  const suiviCollabBlocked = state.page !== 'suivi';
  localStorage.setItem('last-role', 'admin'); localStorage.removeItem('last-user'); state.page = 'demandes'; render();
  // barre d'outils : période + tri + export
  DB.audit = [{ ts: Date.now(), user: 'Sofia B.', action: 'Envoi mail', detail: 'ok' }, { ts: Date.now() - 40 * 86400000, user: 'Sofia B.', action: 'Vieille action', detail: 'x' }];
  const suiviToolbar = /Période/.test(pageSuivi()) && /Trier/.test(pageSuivi()) && /Export CSV/.test(pageSuivi());
  window.__suivi = { periode: '7j', tri: 'nom' };
  const suiviPeriode = /Envoi mail/.test(pageSuivi()) && !/Vieille action/.test(pageSuivi());
  window.__suivi = { periode: 'tout', tri: 'nom' };
  let suiviCsvName = '', suiviCsvType = ''; const ocsu = URL.createObjectURL; URL.createObjectURL = (bl) => { suiviCsvType = bl.type; return 'blob:x'; };
  const oclsu = HTMLAnchorElement.prototype.click; HTMLAnchorElement.prototype.click = function () { suiviCsvName = this.download; };
  suiviExportCSV(); URL.createObjectURL = ocsu; HTMLAnchorElement.prototype.click = oclsu;
  const suiviExport = /suivi-collaborateurs-\d{4}-\d{2}-\d{2}\.csv/.test(suiviCsvName) && suiviCsvType.indexOf('text/csv') === 0;
  // réattribution + charge cible + alerte de surcharge (admin)
  localStorage.setItem('last-role', 'admin'); localStorage.removeItem('last-user');
  const suiviReassignFns = typeof suiviReassign === 'function' && typeof suiviDoReassign === 'function' && typeof suiviSetCible === 'function';
  suiviSetCible(1); const suiviCibleSet = (DB.parametres && DB.parametres.suiviCible) === 1;
  const suiviCibleUI = /suivi-cible-in/.test(pageSuivi());
  const suiviOverload = /suivi-charge over/.test(pageSuivi());
  const demSv = (DB.demandes || []).find((d) => d.assigneA === 'u-sofia');
  let suiviReassignWorks = false;
  if (demSv) { const other = (DB.users || []).find((u) => u.role === 'collab' && u.id !== 'u-sofia'); if (other) { suiviDoReassign('demande', demSv.id, other.id); suiviReassignWorks = demSv.assigneA === other.id; suiviDoReassign('demande', demSv.id, 'u-sofia'); } }
  // historique des réattributions : registre structuré + carte + compteurs flux
  const suiviHistStore = Array.isArray(DB.reassignments) && DB.reassignments.length >= 1 && !!DB.reassignments[0].fromNom && !!DB.reassignments[0].toNom && !!DB.reassignments[0].nom;
  window.suiviHistOpen = true;
  const suiviHistCardOk = /Historique des réattributions/.test(pageSuivi()) && /suivi-hist-row/.test(pageSuivi());
  const suiviFluxOk = /suivi-flux/.test(pageSuivi());
  window.suiviHistOpen = false; const suiviHistCollapse = !/suivi-hist-list/.test(pageSuivi());
  // rééquilibrage automatique : surchargé → collègue sous la cible (jamais vers inactif)
  DB.users = (DB.users || []).filter((u) => u.role !== 'collab');
  DB.users.push({ id: 'RB-OV', nom: 'Charge', role: 'collab', login: 'rbov', actif: true, pwdHash: 'x' });
  DB.users.push({ id: 'RB-LO', nom: 'Libre', role: 'collab', login: 'rblo', actif: true, pwdHash: 'x' });
  DB.users.push({ id: 'RB-OFF', nom: 'Off', role: 'collab', login: 'rboff', actif: false, pwdHash: 'x' });
  DB.demandes = (DB.demandes || []).map((d) => ({ ...d, assigneA: '' }));
  DB.dossiers = (DB.dossiers || []).map((d) => ({ ...d, assigneA: '' }));
  for (let i = 1; i <= 4; i++) DB.demandes.push({ id: 'RB-D' + i, clientNom: 'C' + i, assigneA: 'RB-OV', service: 'SAS' });
  DB.reassignments = []; suiviSetCible(2);
  const rbPlan = suiviRebalancePlan();
  const suiviRebalPlan = rbPlan.moves.length === 2 && rbPlan.moves.every((m) => m.fromId === 'RB-OV' && m.toId === 'RB-LO');
  window.__suiviPlan = rbPlan.moves; suiviDoRebalance();
  const suiviRebalApply = DB.demandes.filter((d) => d.assigneA === 'RB-OV').length === 2 && DB.demandes.filter((d) => d.assigneA === 'RB-LO').length === 2 && suiviRebalancePlan().moves.length === 0;
  const suiviRebalBtn = /suiviRebalance\(\)/.test(pageSuivi()) && typeof suiviRebalance === 'function' && typeof suiviDoRebalance === 'function';
  // réattribution en masse par filtre (De / Type / Service / Vers)
  DB.demandes = [
    { id: 'BM1', clientNom: 'C1', assigneA: 'RB-OV', serviceSouhaite: 'Création SASU' },
    { id: 'BM2', clientNom: 'C2', assigneA: 'RB-OV', serviceSouhaite: 'Création SARL' },
    { id: 'BM3', clientNom: 'C3', assigneA: 'RB-OV', serviceSouhaite: 'SASU modif' },
  ];
  DB.dossiers = [];
  document.body.insertAdjacentHTML('beforeend', '<input id="sb-from" value="RB-OV"><select id="sb-type"><option value="demande" selected>d</option></select><input id="sb-q" value="sasu"><select id="sb-to"><option value="RB-LO" selected>t</option></select><b id="sb-count"></b><div id="sb-list"></div><button id="sb-apply"></button>');
  const bulkMatch = suiviBulkMatch(); const suiviBulkMatchOk = bulkMatch.length === 2 && bulkMatch.every((m) => m.id === 'BM1' || m.id === 'BM3');
  suiviBulkApply();
  const suiviBulkApplyOk = DB.demandes.find((d) => d.id === 'BM1').assigneA === 'RB-LO' && DB.demandes.find((d) => d.id === 'BM3').assigneA === 'RB-LO' && DB.demandes.find((d) => d.id === 'BM2').assigneA === 'RB-OV';
  ['sb-from', 'sb-type', 'sb-q', 'sb-to', 'sb-count', 'sb-list', 'sb-apply'].forEach((id) => { const e = document.getElementById(id); if (e) e.remove(); });
  const suiviBulkBtn = /suiviBulk\(\)/.test(pageSuivi()) && typeof suiviBulk === 'function' && typeof suiviBulkMatch === 'function';
  // cible individuelle par collaborateur (temps partiel) : override + reset + impact rééquilibrage
  DB.demandes = []; DB.dossiers = [];
  for (let i = 1; i <= 3; i++) { DB.demandes.push({ id: 'CI-O' + i, clientNom: 'o' + i, assigneA: 'RB-OV', service: 'X' }); DB.demandes.push({ id: 'CI-L' + i, clientNom: 'l' + i, assigneA: 'RB-LO', service: 'X' }); }
  suiviSetCible(5);
  const ciDefault = suiviRebalancePlan().moves.length === 0; // 3<5 both → rien
  const ovU = DB.users.find((u) => u.id === 'RB-OV');
  suiviSetCibleOf('RB-OV', 2);
  const ciStored = ovU.chargeCible === 2 && /suivi-cible-mini/.test(pageSuivi()) && /↺ défaut/.test(pageSuivi());
  const ciPlan = suiviRebalancePlan().moves; const ciRebal = ciPlan.length === 1 && ciPlan[0].fromId === 'RB-OV' && ciPlan[0].toId === 'RB-LO';
  suiviSetCibleOf('RB-OV', ''); const ciReset = ovU.chargeCible === undefined && suiviRebalancePlan().moves.length === 0;
  const suiviCibleIndiv = typeof suiviSetCibleOf === 'function' && ciDefault && ciStored && ciRebal && ciReset;
  out.suivi = typeof pageSuivi === 'function' && typeof suiviExportCSV === 'function' && typeof suiviSet === 'function'
    && suiviInPages && suiviOk && suiviRendered && suiviCollabBlocked && suiviToolbar && suiviPeriode && suiviExport
    && suiviReassignFns && suiviCibleSet && suiviCibleUI && suiviOverload && suiviReassignWorks
    && suiviHistStore && suiviHistCardOk && suiviFluxOk && suiviHistCollapse
    && suiviRebalPlan && suiviRebalApply && suiviRebalBtn
    && suiviBulkMatchOk && suiviBulkApplyOk && suiviBulkBtn
    && suiviCibleIndiv;

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
