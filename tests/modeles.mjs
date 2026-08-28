/**
 * LAST — Plusieurs modèles de documents choisissables (DOC_MODELS).
 *   node tests/modeles.mjs
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
  const mk = (forme) => {
    const mail = 'jean.' + forme.toLowerCase() + '@m.fr';
    const intake = { version: 'LASTv1', type: forme.toLowerCase(), numeroDossier: 'DOS-2026-M' + forme,
      societe: { denomination: 'MODELE ' + forme, capital: '1000', objet: 'Conseil', regime: 'IS' },
      siege: { rue: '3 rue Test', cp: '75001', ville: 'Paris', type: 'Local commercial (bail)', bailleur: 'SCI T' },
      direction: { nom: 'Martin', prenom: 'Jean', naissance: '1985-05-05', nationalite: 'Française', adresse: '3 rue Test Paris' },
      associes: [{ nom: 'Martin', prenom: 'Jean', apport: '600', parts: '600' }, { nom: 'Petit', prenom: 'Ana', apport: '400', parts: '400' }],
      contact: { nom: 'Martin', prenom: 'Jean', email: mail } };
    const dd = { id: 't-mod-' + forme, clientNom: 'Jean Martin ' + forme, clientEmail: mail, statut: 'Qualification', intake };
    DB.demandes.unshift(dd);
    return creerDossierDepuis(dd.id, true);
  };
  const d = mk('SAS');

  // 1. Registre : nombre de modèles par clé
  const cnt = k => (window.DOC_MODELS[k] || []).length;
  out.multi = { statuts: cnt('statuts'), pouvoir: cnt('pouvoir'), dnc: cnt('dnc'), souscripteurs: cnt('souscripteurs'), decladomicile: cnt('decladomicile'), cession: cnt('cession'), acceptation: cnt('acceptation') };

  // 2. Sélecteur affiché dès qu'il y a ≥2 modèles
  out.selPouvoir = /<select/.test(espDocModelSelect(d, 'pouvoir'));
  out.selDnc = /<select/.test(espDocModelSelect(d, 'dnc'));
  out.selSous = /<select/.test(espDocModelSelect(d, 'souscripteurs'));
  out.selAccept = /<select/.test(espDocModelSelect(d, 'acceptation'));

  // 3. Choix d'un modèle → persistance + rendu du modèle choisi
  const base = espDocRender(d, 'pouvoir');
  espDocSetModel(d.id, 'pouvoir', 'formalites');
  out.persist = d.docModel && d.docModel.pouvoir === 'formalites';
  const chosen = espDocRender(d, 'pouvoir');
  out.renduFormalites = /Guichet unique/.test(chosen) && /POUVOIR SPÉCIAL/.test(chosen);
  out.renduChange = chosen !== base;
  // revenir au standard
  espDocSetModel(d.id, 'pouvoir', 'standard');
  out.renduStd = /POUVOIR<\/div>/.test(espDocRender(d, 'pouvoir'));

  // 4. Contenu des nouveaux modèles
  out.dncSimple = /atteste sur l'honneur/i.test(dncSimpleHTML(d)) && /FILIATION/.test(dncSimpleHTML(d));
  out.sousListe = /LISTE DES SOUSCRIPTEURS/.test(souscripteursListeHTML(d));
  out.heberg = /ATTESTATION DE DOMICILIATION/.test(attestationHebergementHTML(d)) && /hébergeant/i.test(attestationHebergementHTML(d));
  out.cessSimple = /CESSION DE ACTIONS/.test(cessionSimpleHTML(d)) && /quittance/i.test(cessionSimpleHTML(d));
  out.acceptPres = /ACCEPTATION DES FONCTIONS/.test(acceptationDirigeantHTML(d)) && /Président/.test(acceptationDirigeantHTML(d));
  out.acceptDG = /Directeur Général/.test(acceptationDGHTML(d));

  // 5. Défaut selon la forme : SARL → statuts SARL, SCI → statuts SCI
  const dSarl = mk('SARL'); const dSci = mk('SCI');
  out.defSarl = espDocModelId(dSarl, 'statuts') === 'sarl';
  out.defSci = espDocModelId(dSci, 'statuts') === 'sci';
  out.defSas = espDocModelId(d, 'statuts') === 'sas';
  // acceptation d'un gérant pour une SARL
  out.acceptGerant = /Gérant/.test(acceptationDirigeantHTML(dSarl));

  // 6. ESP_DOCS contient le nouveau document (opt-in)
  out.espDoc = (typeof ESP_DOCS !== 'undefined') && ESP_DOCS.some(x => x.k === 'acceptation');

  // 6b. Étape 5 — documents manquants désormais générables
  out.e5keys = ['lettremission', 'convention', 'filiation', 'rbe'].every(k => (window.DOC_MODELS[k] || []).length >= 1);
  out.e5esp = ['lettremission', 'convention', 'filiation', 'rbe'].every(k => ESP_DOCS.some(x => x.k === k));
  out.lettreMission = /LETTRE DE MISSION/.test(lettreMissionHTML(d)) && /Honoraires/.test(lettreMissionHTML(d));
  out.lettreMissionModif = /Modification/.test(lettreMissionModifHTML(d));
  out.lmMulti = (window.DOC_MODELS.lettremission || []).length === 2;
  out.convention = /CONVENTION DE PRESTATION/.test(conventionPrestationHTML(d)) && /RGPD/.test(conventionPrestationHTML(d));
  out.filiation = /ATTESTATION DE FILIATION/.test(attestationFiliationHTML(d)) && /père/.test(attestationFiliationHTML(d));
  // rendu via le registre (respecte le modèle)
  out.e5render = /LETTRE DE MISSION/.test(espDocRender(d, 'lettremission')) && /CONVENTION/.test(espDocRender(d, 'convention'));
  // RBE générable via le registre
  out.rbeDoc = /BÉNÉFICIAIRES EFFECTIFS/.test(espDocRender(d, 'rbe'));
  // génération marque d.docs (détecté par la GED)
  espDocGen(d.id, 'lettremission'); espDocGen(d.id, 'convention');
  out.gedDetect = !!(d.docs && (d.docs.lettremission || d.docs.lettreMission) && d.docs.convention);

  // 7. Sélecteur injecté dans l'aperçu de vérification
  d.verif = d.verif || {}; d.verif.docSel = 'pouvoir';
  espVerifRender(d.id);
  const ov = document.getElementById('esp-verif');
  out.overlaySel = !!(ov && ov.querySelector('.ev-modelsel select'));
  espVerifClose();
  return out;
});

await browser.close();
check('statuts : ≥5 modèles (SAS/SASU/SCI/SARL/EURL)', r.multi.statuts >= 5);
check('pouvoir : 2 modèles', r.multi.pouvoir === 2);
check('non-condamnation : 2 modèles', r.multi.dnc === 2);
check('souscripteurs : 2 modèles', r.multi.souscripteurs === 2);
check('domiciliation : 2 modèles', r.multi.decladomicile === 2);
check('cession : 2 modèles', r.multi.cession === 2);
check('acceptation des fonctions : 2 modèles', r.multi.acceptation === 2);
check('sélecteur affiché (pouvoir/dnc/souscripteurs/acceptation)', r.selPouvoir && r.selDnc && r.selSous && r.selAccept);
check('choix persisté (d.docModel.pouvoir=formalites)', r.persist);
check('rendu du modèle choisi (Guichet unique)', r.renduFormalites && r.renduChange);
check('retour au modèle standard', r.renduStd);
check('modèle DNC simplifié (attestation + filiation)', r.dncSimple);
check('modèle souscripteurs liste simplifiée', r.sousListe);
check('modèle domiciliation par un tiers', r.heberg);
check('modèle cession simplifié (quittance)', r.cessSimple);
check('modèle acceptation Président + variante DG', r.acceptPres && r.acceptDG);
check('défaut suit la forme (SAS→sas, SARL→sarl, SCI→sci)', r.defSas && r.defSarl && r.defSci);
check('acceptation Gérant pour une SARL', r.acceptGerant);
check('nouveau document dans ESP_DOCS (opt-in)', r.espDoc);
check('Étape 5 : lettre de mission / convention / filiation / RBE enregistrés', r.e5keys);
check('Étape 5 : documents dans ESP_DOCS (opt-in)', r.e5esp);
check('Lettre de mission générée (honoraires)', r.lettreMission && r.lmMulti);
check('Lettre de mission — variante modification', r.lettreMissionModif);
check('Convention de prestation générée (RGPD)', r.convention);
check('Attestation de filiation générée', r.filiation);
check('rendu Étape 5 via le registre', r.e5render);
check('RBE générable comme document', r.rbeDoc);
check('génération détectée par la GED (d.docs)', r.gedDetect);
check('sélecteur de modèle injecté dans l’aperçu de vérification', r.overlaySel);
check('aucun pageerror', perr.length === 0);

const ok = results.filter(x => x.ok).length, tot = results.length;
results.forEach(x => { if (!x.ok) console.log('✗ ' + x.n); });
if (perr.length) console.log('pageerrors:', perr.slice(0, 4).join(' | '));
console.log(`\nLAST modèles de documents choisissables : ${ok}/${tot} ` + (ok === tot ? 'OK — tout vert' : 'ÉCHEC'));
process.exit(ok === tot ? 0 : 1);
