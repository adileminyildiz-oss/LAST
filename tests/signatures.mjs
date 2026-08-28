/**
 * LAST — Phase 6 : signature électronique (suivi par acte).
 *   node tests/signatures.mjs
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
  const intake = { version: 'LASTv1', type: 'sas', numeroDossier: 'DOS-2026-5',
    societe: { denomination: 'OMEGA', capital: '1000', objet: 'Conseil' },
    siege: { rue: '3 rue Neuve', cp: '69001', ville: 'Lyon' },
    direction: { nom: 'Roy', prenom: 'Ana', adresse: '3 rue Neuve Lyon' },
    associes: [{ nom: 'Roy', prenom: 'Ana', apport: '600' }, { nom: 'Sy', prenom: 'Omar', apport: '400' }],
    contact: { nom: 'Roy', prenom: 'Ana', email: 'ana@omega.fr' } };
  const dd = { id: 't-sig', clientNom: 'Ana Roy', clientEmail: 'ana@omega.fr', statut: 'Qualification', intake };
  DB.demandes.unshift(dd);
  const d = creerDossierDepuis(dd.id, true);
  const out = {};

  out.signer = sigSigner(d);
  out.docs = sigDocsList().length;
  out.p0 = sigProgress(d);                     // 0/4
  out.aff0 = sigStatutAffiche(sigState(d, 'statuts')); // À envoyer

  sigEnvoyerTous(d.id);
  out.affEnvoye = sigStatutAffiche(sigState(d, 'statuts')); // Envoyé
  out.sentAt = !!sigState(d, 'statuts').sentAt;

  sigAvancer(d.id, 'statuts');                 // envoye → ouvert
  out.affOuvert = sigStatutAffiche(sigState(d, 'statuts'));
  sigAvancer(d.id, 'statuts');                 // ouvert → signe
  out.affSigne = sigStatutAffiche(sigState(d, 'statuts'));
  out.p1 = sigProgress(d);                     // 1/4

  sigRelancer(d.id, 'pouvoir');                // relance
  const sp = sigState(d, 'pouvoir');
  out.relance = sp.relances === 1 && sigStatutAffiche(sp) === 'Relancé';

  // tout signer
  ['pouvoir', 'dnc', 'souscripteurs'].forEach(k => sigSigne(d.id, k));
  out.pFinal = sigProgress(d);                 // 4/4 tous

  out.html = signaturesHTML(d);
  return out;
});

await browser.close();
check('signataire depuis la fiche (nom + email)', r.signer && r.signer.nom === 'Ana Roy' && r.signer.email === 'ana@omega.fr');
check('4 actes à signer', r.docs === 4);
check('progression initiale 0/4', r.p0.signes === 0 && r.p0.total === 4);
check('statut initial « À envoyer »', r.aff0 === 'À envoyer');
check('après envoi → « Envoyé » + horodatage', r.affEnvoye === 'Envoyé' && r.sentAt);
check('étape → « Ouvert »', r.affOuvert === 'Ouvert');
check('étape → « Signé »', r.affSigne === 'Signé');
check('progression 1/4 après 1 signé', r.p1.signes === 1);
check('relance → compteur + statut « Relancé »', r.relance);
check('tout signé → 4/4 (tous)', r.pFinal.signes === 4 && r.pFinal.tous === true);
check('rapport HTML : 4 actes + progression + signataire', /Statuts/.test(r.html) && /Pouvoir/.test(r.html) && /signés/.test(r.html) && /Ana Roy/.test(r.html));
check('aucun pageerror', perr.length === 0);

const ok = results.filter(x => x.ok).length, tot = results.length;
results.forEach(x => { if (!x.ok) console.log('✗ ' + x.n); });
if (perr.length) console.log('pageerrors:', perr.slice(0, 4).join(' | '));
console.log(`\nLAST signatures (Phase 6) : ${ok}/${tot} ` + (ok === tot ? 'OK — tout vert' : 'ÉCHEC'));
process.exit(ok === tot ? 0 : 1);
