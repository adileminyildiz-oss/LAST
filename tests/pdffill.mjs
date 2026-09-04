/**
 * LAST — Filet de tests des documents remplissables (Playwright / Chromium)
 * Couvre : ouverture de tous les documents remplissables sur PDF (bilan,
 * contrats de sous-traitance, fiche de paie, factures), chiffres EXACTS de la
 * fiche de paie (garde-fou de calibration), API + routage de l'outil de
 * calibration, et auto-remplissage depuis la fiche client.
 *   node tests/pdffill.mjs
 */
import path from 'path';
import { pathToFileURL } from 'url';

async function loadChromium() {
  const cands = [process.env.PLAYWRIGHT_PKG, 'playwright',
    '/opt/node22/lib/node_modules/playwright/index.js', '/usr/lib/node_modules/playwright/index.js'].filter(Boolean);
  for (const c of cands) { try { const spec = c.endsWith('.js') ? pathToFileURL(c).href : c; const mod = await import(spec); const ch = mod.chromium || (mod.default && mod.default.chromium); if (ch) return ch; } catch (_) {} }
  throw new Error('Playwright introuvable (PLAYWRIGHT_PKG).');
}
const results = [];
function check(name, cond) { results.push({ name, ok: !!cond }); }

const chromium = await loadChromium();
const url = pathToFileURL(path.resolve(process.cwd(), 'index.html')).href;
const browser = await chromium.launch({ args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 1000 } });
const perr = [];
page.on('pageerror', e => { const s = '' + e; if (/ServiceWorker/i.test(s)) return; perr.push(s); });
await page.addInitScript(() => { try { localStorage.setItem('last-gate-ok', '1'); localStorage.setItem('last-role', 'admin'); localStorage.setItem('last-device-ok', '1'); } catch (e) {} });
await page.goto(url, { waitUntil: 'load' });
await page.waitForTimeout(500);

const r = await page.evaluate(async () => {
  const out = {};
  const wait = ms => new Promise(r => setTimeout(r, ms));

  // 1) API des documents remplissables présente
  out.api = ['pdfFillOpen', 'pfPaieExactOpen', 'pfFactureOpen', 'pdfCalOpen', 'pdfCalActivate', 'pdfCalExport', 'pfClientPrefill']
    .every(f => typeof window[f] === 'function');

  // 2) Ouverture de chaque document remplissable (sans client sélectionné)
  window.__edClientSel = '';
  function opened() { const ov = document.getElementById('pf-ov'); return ov ? ov.querySelectorAll('input,textarea,.pf-cb,.pex-c,[data-k]').length : 0; }
  out.open = {};
  window.pdfFillOpen('bilan', { id: 'b', k: 'bilanprev', data: {} }); out.open.bilan = opened(); if (window.pfClose) pfClose();
  window.pdfFillOpen('stbtp', { id: 's', k: 'soustrait', forme: 'BTP', data: {} }); out.open.stbtp = opened(); if (window.pfClose) pfClose();
  window.pdfFillOpen('ststd', { id: 't', k: 'soustrait', forme: 'Standard', data: {} }); out.open.ststd = opened(); if (window.pfClose) pfClose();
  window.pfPaieExactOpen({ id: 'p', k: 'fichepaie', data: {} }); out.open.paie = opened(); if (window.pfClose) pfClose();
  ['factnorm', 'factbtp', 'factacpt', 'devis'].forEach(k => { try { window.pfFactureOpen({ id: k, k, data: {} }, k); out.open[k] = opened(); if (window.pfClose) pfClose(); } catch (e) { out.open[k] = -1; } });

  // 3) Fiche de paie — chiffres EXACTS (garde-fou de calibration ALR CONSEIL)
  const doc = { id: 'pg', k: 'fichepaie', data: { tauxH: '12.50', heures: '151.67', at: '0.70', pas: '0', reduc: '463.09', navBase: '90.80', navPct: '50', abs: [{ lib: 'Absence', h: '49' }] } };
  window.pfPaieExactOpen(doc); await wait(150);
  const live = (document.querySelector('#pf-ov .pe-live') || {}).textContent || '';
  const norm = s => s.replace(/ | |\s/g, ''); // enlève espaces (fines incluses)
  const L = norm(live);
  out.paie = {
    brut: L.indexOf('1283,38') >= 0,
    netImp: (L.indexOf('1052,49') >= 0 || L.indexOf('1052,50') >= 0),
    netPay: L.indexOf('1015,93') >= 0,
    raw: live
  };
  if (window.pfClose) pfClose();

  // 4) Modèle calibré : enregistrement PF_TPL + marqueur __calTpls + ouverture
  window.PF_TPL = window.PF_TPL || {};
  window.PF_TPL['__test_cal'] = { titre: 'Test calibré', pages: [{ name: 'Page 1', key: 'p1', img: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', fields: [['raison_sociale', 20, 20, 40, 4, { al: 'left' }], ['siret_client', 20, 30, 40, 4, { al: 'left' }]], side: [{ g: 'Page 1', rows: [['raison_sociale', 'Raison sociale'], ['siret_client', 'SIRET']] }], sideName: 'Test calibré' }] };
  window.__calTpls = window.__calTpls || {}; window.__calTpls['__test_cal'] = true;
  window.pdfFillOpen('__test_cal', { id: 'c', k: '__test_cal', data: {} });
  out.calOpen = opened() > 0;
  if (window.pfClose) pfClose();

  // 5) Auto-remplissage depuis la fiche client
  window.clientById = function () { return { denomination: 'ACME BTP', forme: 'SARL', siret: '12345678900011', siren: '123456789', adresse: '10 rue des Tests', cp: '75001', ville: 'PARIS', codeAPE: '4120A', tvaIntra: 'FR00123456789', president: 'Jean Dupont' }; };
  window.__edClientSel = 'c1';
  const dp = { id: 'fp', k: 'fichepaie', data: {} }; window.pfPaieExactOpen(dp); if (window.pfClose) pfClose();
  const dc = { id: 'fb', k: 'soustrait', forme: 'BTP', data: {} }; window.pdfFillOpen('stbtp', dc); if (window.pfClose) pfClose();
  const dcal = { id: 'fc', k: '__test_cal', data: {} }; window.pdfFillOpen('__test_cal', dcal); if (window.pfClose) pfClose();
  const dov = { id: 'fo', k: 'soustrait', forme: 'BTP', data: { p1: { desEntre_raison: 'DEJA' } } }; window.pdfFillOpen('stbtp', dov); if (window.pfClose) pfClose();
  window.__edClientSel = '';
  const dn = { id: 'fn', k: 'soustrait', forme: 'BTP', data: {} }; window.pdfFillOpen('stbtp', dn); if (window.pfClose) pfClose();
  out.fill = {
    paieEmp: (dp.data.emp && dp.data.emp.nom) === 'ACME BTP' && (dp.data.emp && dp.data.emp.siret) === '12345678900011',
    btpFirst: (dc.data.p1 && dc.data.p1.desEntre_raison) === 'ACME BTP',
    btpSecondEmpty: !(dc.data.p1 && dc.data.p1.desEt_raison),
    calByKey: (dcal.data.p1 && dcal.data.p1.raison_sociale) === 'ACME BTP' && (dcal.data.p1 && dcal.data.p1.siret_client) === '12345678900011',
    noOverwrite: (dov.data.p1 && dov.data.p1.desEntre_raison) === 'DEJA',
    noClient: !(dn.data.p1 && dn.data.p1.desEntre_raison)
  };
  // 6) Service « Marge & bénéfices » — calcul de rentabilité prestataire
  out.marge = { ok: false };
  try {
    if (window.__svcSaveStore) { const o = window.__svcStore(); delete o.marge; window.__svcSaveStore(o); }
    window.svcGo('marge');
    const V = document.getElementById('view');
    const tab = V && V.querySelector('table.svc-mg-t');
    const norm = s => parseFloat(('' + (s || '')).replace(/[^\d,.-]/g, '').replace(/\./g, '').replace(',', '.'));
    const g = id => (document.getElementById(id) || {}).textContent || '';
    // ligne 0 par défaut : coût 150, marge 60, TVA 20 → prix 375 / TTC 450 / TVA à payer 45 / prestataire 180 / bénéfice 225
    const prix = norm(g('mg-prix-0')), ttc = norm(g('mg-ttc-0')), tvp = norm(g('mg-tvp-0')), prest = norm(g('mg-prest-0')), ben = norm(g('mg-ben-0'));
    const identity = Math.abs((ttc - tvp - prest) - ben) < 0.02; // encaissement net = bénéfice
    // édition en direct : coût 200 / marge 50 → prix 400 / bénéfice 200
    window.svcMgSet(0, 'cout', '200'); window.svcMgSet(0, 'marge', '50');
    const prixAfter = norm(g('mg-prix-0')), benAfter = norm(g('mg-ben-0'));
    out.marge = {
      ok: !!tab,
      table: (tab ? getComputedStyle(V.querySelector('.svc-mg-t tbody tr')).display : '') === 'table-row',
      calc: Math.abs(prix - 375) < 0.01 && Math.abs(ttc - 450) < 0.01 && Math.abs(tvp - 45) < 0.01 && Math.abs(prest - 180) < 0.01 && Math.abs(ben - 225) < 0.01,
      identity,
      live: Math.abs(prixAfter - 400) < 0.01 && Math.abs(benAfter - 200) < 0.01
    };
    if (window.__svcSaveStore) { const o2 = window.__svcStore(); delete o2.marge; window.__svcSaveStore(o2); }
  } catch (e) { out.marge = { ok: false, err: '' + e }; }

  // 7) Service « Abonnements & revenu récurrent » (MRR)
  out.abo = { ok: false };
  try {
    if (window.__svcSaveStore) { const o = window.__svcStore(); delete o.abo; window.__svcSaveStore(o); }
    window.svcGo('abo');
    const V = document.getElementById('view');
    const tab = V && V.querySelector('table.svc-mg-t');
    const norm = s => parseFloat(('' + (s || '')).replace(/[^\d,.-]/g, '').replace(/\./g, '').replace(',', '.'));
    const g = id => (document.getElementById(id) || {}).textContent || '';
    // défaut : 4 actifs, MRR = 29+19+15+290/12 = 87,17 ; suspendu exclu
    const mrr = norm(g('abo-s-mrr')), nb = norm(g('abo-s-nb'));
    const mrrOk = Math.abs(mrr - (29 + 19 + 15 + 290 / 12)) < 0.02 && nb === 4;
    const annual = Math.abs(norm(g('abo-m-3')) - 290 / 12) < 0.02; // annuel ramené au mois
    window.svcAboSet(0, 'statut', 'suspendu'); // suspend → -29
    const live = Math.abs(norm(g('abo-s-mrr')) - (19 + 15 + 290 / 12)) < 0.02 && norm(g('abo-s-nb')) === 3;
    out.abo = { ok: !!tab, calc: mrrOk, annual, live };
    if (window.__svcSaveStore) { const o2 = window.__svcStore(); delete o2.abo; window.__svcSaveStore(o2); }
  } catch (e) { out.abo = { ok: false, err: '' + e }; }

  // 8) Service « Tableau de bord dirigeant » — agrégation isolée + pilotage
  out.cockpit = { ok: false };
  try {
    if (window.__svcSaveStore) { const o = window.__svcStore(); delete o.cockpit; delete o.abo; delete o.marge; window.__svcSaveStore(o); }
    window.svcGo('abo'); window.svcGo('marge'); // seed defaults (abo MRR 87,17)
    window.svcGo('cockpit');
    const V = document.getElementById('view');
    const norm = s => parseFloat(('' + (s || '')).replace(/[^\d,.-]/g, '').replace(/\./g, '').replace(',', '.'));
    const g = id => (document.getElementById(id) || {}).textContent || '';
    const mrrCard = [].slice.call(V.querySelectorAll('.cok-card')).filter(c => /récurrent/i.test(c.textContent))[0];
    const mrr = mrrCard ? norm(mrrCard.querySelector('.cok-card-v').textContent) : 0;
    window.svcCokSet('caMois', '10000'); window.svcCokSet('chargesMois', '6000'); window.svcCokSet('objectifCA', '12000');
    const bar = document.getElementById('cok-obj-bar');
    out.cockpit = {
      ok: !!document.getElementById('cok-treso'),
      aggMrr: Math.abs(mrr - (29 + 19 + 15 + 290 / 12)) < 0.05,      // MRR repris du service Abonnements
      result: Math.abs(norm(g('cok-res')) - 4000) < 0.01,           // CA − charges
      objective: !!bar && /8[23]%/.test(bar.style.width),           // 10000/12000 ≈ 83 %
      eche: V.querySelectorAll('.cok-eche-row').length > 0
    };
    if (window.__svcSaveStore) { const o2 = window.__svcStore(); delete o2.cockpit; delete o2.abo; delete o2.marge; window.__svcSaveStore(o2); }
  } catch (e) { out.cockpit = { ok: false, err: '' + e }; }

  return out;
});

await browser.close();

check('API documents remplissables présente', r.api);
check('ouverture Bilan prévisionnel', r.open.bilan > 0);
check('ouverture Contrat sous-traitance BTP', r.open.stbtp > 0);
check('ouverture Contrat sous-traitance Standard', r.open.ststd > 0);
check('ouverture Fiche de paie', r.open.paie > 0);
check('ouverture Facture', r.open.factnorm > 0);
check('ouverture Facture de situation BTP', r.open.factbtp > 0);
check('ouverture Facture d’acompte', r.open.factacpt > 0);
check('ouverture Devis', r.open.devis > 0);
check('paie : brut exact 1 283,38', r.paie.brut);
check('paie : net imposable exact 1 052,49', r.paie.netImp);
check('paie : net à payer exact 1 015,93', r.paie.netPay);
check('modèle calibré : ouverture via PF_TPL/__calTpls', r.calOpen);
check('auto-remplissage : fiche de paie (employeur)', r.fill.paieEmp);
check('auto-remplissage : contrat BTP 1re partie', r.fill.btpFirst);
check('auto-remplissage : contrat BTP 2e partie laissée vide', r.fill.btpSecondEmpty);
check('auto-remplissage : modèle calibré par nom de champ', r.fill.calByKey);
check('auto-remplissage : champ déjà saisi non écrasé', r.fill.noOverwrite);
check('auto-remplissage : rien sans client sélectionné', r.fill.noClient);
check('service Marge : table rendue en ligne', r.marge.ok && r.marge.table);
check('service Marge : calculs exacts (prix/TTC/TVA/prestataire/bénéfice)', r.marge.calc);
check('service Marge : encaissement net = bénéfice (identité TVA neutre)', r.marge.identity);
check('service Marge : recalcul en direct', r.marge.live);
check('service Abonnements : table rendue', r.abo.ok);
check('service Abonnements : MRR/ARR exacts (annuel ramené au mois)', r.abo.calc && r.abo.annual);
check('service Abonnements : recalcul en direct (suspension)', r.abo.live);
check('tableau de bord : KPIs rendus', r.cockpit.ok);
check('tableau de bord : MRR repris du service Abonnements', r.cockpit.aggMrr);
check('tableau de bord : résultat du mois (CA − charges) + objectif', r.cockpit.result && r.cockpit.objective);
check('tableau de bord : prochaines échéances listées', r.cockpit.eche);
check('aucun pageerror', perr.length === 0);

const ok = results.filter(x => x.ok).length, tot = results.length;
results.forEach(x => { if (!x.ok) console.log('✗ ' + x.name); });
if (!r.paie.brut || !r.paie.netImp || !r.paie.netPay) console.log('  → pe-live paie :', r.paie.raw);
if (perr.length) console.log('pageerrors:', perr.slice(0, 4).join(' | '));
console.log(`\nLAST tests documents remplissables : ${ok}/${tot} ` + (ok === tot ? 'OK — tout vert' : 'ÉCHEC'));
process.exit(ok === tot ? 0 : 1);
