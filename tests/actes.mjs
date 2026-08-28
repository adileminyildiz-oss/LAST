/**
 * LAST — Phase 4 : pré-remplissage automatique des actes depuis le questionnaire.
 * demande(intake) → creerDossierDepuis → fiche client remplie → actes pré-remplis.
 *   node tests/actes.mjs
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
  window.confirm = () => true;
  const intake = {
    version: 'LASTv1', type: 'sas', numeroDossier: 'DOS-2026-777888',
    societe: { denomination: 'INNOV SAS', sigle: 'INNOV', objet: 'Édition de logiciels et conseil', capital: '1000', regime: 'IS — Impôt sur les sociétés', debut: '2026-09-01' },
    siege: { rue: '10 rue de la Paix', cp: '75002', ville: 'Paris', type: 'Local commercial (bail)', bailleur: 'SCI Paix' },
    direction: { civilite: 'Mme', nom: 'Martin', prenom: 'Claire', naissance: '1990-05-04', lieuNaissance: 'Lyon', nationalite: 'Française', adresse: '5 av. Foch, 75116 Paris', fonction: 'Présidente' },
    associes: [{ nom: 'Martin', prenom: 'Claire', apport: '600', parts: '600', role: 'Présidente' }, { nom: 'Durand', prenom: 'Paul', apport: '400', parts: '400' }],
    contact: { nom: 'Martin', prenom: 'Claire', email: 'claire@innov.fr', tel: '0600000000' }
  };
  const d = { id: 't-actes', clientNom: 'Claire Martin', clientEmail: 'claire@innov.fr', clientTel: '', statut: 'Qualification', intake: intake, formalite: 'sas', numeroDossier: intake.numeroDossier, dossierId: '' };
  DB.demandes.unshift(d);

  const dos = creerDossierDepuis(d.id, true); // noNav
  out.dosCree = !!dos;
  const c = clientById((dos.clientIds || [])[0]) || {};
  out.cli = { denomination: c.denomination, capital: c.capital, siege: c.siege, cp: c.cp, ville: c.ville, forme: c.forme, president: c.president, nbAssoc: (c.associes || []).length, activites: (c.activites || [])[0] };
  out.forme = dos.forme;

  // Actes générés depuis la fiche
  function safe(fn) { try { return (typeof window[fn] === 'function') ? window[fn](dos) : ('NOFN:' + fn); } catch (e) { return 'ERR:' + e; } }
  out.statuts = safe('statutsSasHTML');
  out.sous = safe('souscripteursHTML');
  out.pouvoir = safe('pouvoirHTML');
  out.dnc = safe('dncHTML');
  return out;
});

await browser.close();
check('dossier créé', r.dosCree);
check('fiche client : dénomination', r.cli.denomination === 'INNOV SAS');
check('fiche client : capital 1000', Number(r.cli.capital) === 1000);
check('fiche client : siège (rue/cp/ville)', /Paix/.test(r.cli.siege || '') && r.cli.cp === '75002' && r.cli.ville === 'Paris');
check('fiche client : forme SAS', r.cli.forme === 'SAS' && r.forme === 'SAS');
check('fiche client : président', r.cli.president === 'Claire Martin');
check('fiche client : 2 associés', r.cli.nbAssoc === 2);
check('fiche client : objet social', /logiciels/.test(r.cli.activites || ''));
check('ACTE Statuts pré-rempli (dénomination + président)', typeof r.statuts === 'string' && /INNOV SAS/.test(r.statuts) && /(Claire\s+Martin|MARTIN)/i.test(r.statuts));
check('ACTE Statuts : siège', /Paix/.test(r.statuts || ''));
check('ACTE Liste des souscripteurs (2 associés)', typeof r.sous === 'string' && /(Claire|MARTIN)/i.test(r.sous) && /(Paul|Durand)/i.test(r.sous));
check('ACTE Pouvoir pré-rempli', typeof r.pouvoir === 'string' && r.pouvoir.length > 200 && /(Claire\s+Martin|MARTIN|INNOV)/i.test(r.pouvoir));
check('ACTE DNC pré-rempli (déclarant)', typeof r.dnc === 'string' && /(Claire\s+Martin|MARTIN)/i.test(r.dnc));
check('aucun pageerror', perr.length === 0);

const ok = results.filter(x => x.ok).length, tot = results.length;
results.forEach(x => { if (!x.ok) console.log('✗ ' + x.n + (typeof r !== 'undefined' ? '' : '')); });
if (perr.length) console.log('pageerrors:', perr.slice(0, 4).join(' | '));
console.log(`\nLAST actes (Phase 4) : ${ok}/${tot} ` + (ok === tot ? 'OK — tout vert' : 'ÉCHEC'));
process.exit(ok === tot ? 0 : 1);
