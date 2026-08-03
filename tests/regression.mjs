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
  const cmdkPages = [...document.querySelectorAll('#cmdk .cmdk-it b')].some(x => /Tableau de bord/.test(x.textContent));
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
