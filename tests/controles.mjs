/**
 * LAST — Phase 3 : contrôles automatiques des pièces.
 * Vérifie pieceControles : manquantes · expiration · cohérence adresse · lisibilité.
 *   node tests/controles.mjs
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
  // dossier pré-rempli (adresse dirigeant depuis intake)
  const intake = { version: 'LASTv1', type: 'sasu', numeroDossier: 'DOS-2026-1',
    societe: { denomination: 'ALPHA', capital: '1000', objet: 'Conseil' },
    siege: { rue: '5 avenue Foch', cp: '75116', ville: 'Paris', type: 'Domiciliation chez le dirigeant' },
    direction: { nom: 'Bernard', prenom: 'Luc', adresse: '5 avenue Foch, 75116 Paris', naissance: '1985-03-02', nationalite: 'Française' },
    contact: { nom: 'Bernard', prenom: 'Luc', email: 'luc@alpha.fr' } };
  const d = { id: 't-ctrl', clientNom: 'Luc Bernard', clientEmail: 'luc@alpha.fr', statut: 'Qualification', intake: intake, dossierId: '' };
  DB.demandes.unshift(d);
  const dos = creerDossierDepuis(d.id, true);

  out.hasExpField = (typeof EXTRACT_FIELDS !== 'undefined') && EXTRACT_FIELDS.some(f => f.k === 'dateExpiration');

  function ctrl(setup) { setup(dos); const c = pieceControles(dos); const by = {}; c.forEach(x => by[x.k] = x); return by; }

  // A) rien déposé, pas d'expiration
  out.a = ctrl(d0 => { d0.pieces = {}; d0.verif = { extract: {} }; });
  // B) toutes pièces déposées + expiration future + adresse cohérente + champs extraits
  const future = new Date(Date.now() + 400 * 864e5).toISOString().slice(0, 10);
  out.b = ctrl(d0 => {
    d0.pieces = { identite: { data: 'x' }, domiciliation: { data: 'x' }, edf: { data: 'x' }, impot: { data: 'x' } };
    d0.verif = { extract: { nom: 'Bernard', prenom: 'Luc', dateNaissance: '02/03/1985', nationalite: 'Française', adresse: '5 avenue Foch 75116 Paris', dateExpiration: future } };
  });
  // C) pièce expirée
  out.c = ctrl(d0 => { d0.verif.extract.dateExpiration = '2020-01-01'; });
  // D) adresse incohérente
  out.d = ctrl(d0 => { d0.verif.extract.dateExpiration = future; d0.verif.extract.adresse = '99 rue Inconnue, Marseille'; });
  // E) illisible : peu de champs
  out.e = ctrl(d0 => { d0.pieces = { identite: { data: 'x' } }; d0.verif = { extract: { nom: 'Bernard' } }; });

  out.anoB = pieceAnomalies(dos.id ? dos : dos).length; // placeholder
  // recompte propre
  dos.pieces = { identite: { data: 'x' }, domiciliation: { data: 'x' }, edf: { data: 'x' }, impot: { data: 'x' } };
  dos.verif = { extract: { nom: 'Bernard', prenom: 'Luc', dateNaissance: '02/03/1985', nationalite: 'Française', adresse: '5 avenue Foch 75116 Paris', dateExpiration: future } };
  out.anoClean = pieceAnomalies(dos).length;
  dos.verif.extract.dateExpiration = '2019-01-01';
  out.anoExpired = pieceAnomalies(dos).filter(x => x.k === 'expiration').length;
  return out;
});

await browser.close();
check('champ « date d’expiration » ajouté', r.hasExpField);
check('A · pièces manquantes détectées (ko)', r.a.manquantes.statut === 'ko');
check('A · expiration non renseignée (warn)', r.a.expiration.statut === 'warn');
check('B · toutes pièces déposées (ok)', r.b.manquantes.statut === 'ok');
check('B · pièce valide (ok)', r.b.expiration.statut === 'ok');
check('B · adresse cohérente (ok)', r.b.adresse.statut === 'ok');
check('B · lisibilité ok (≥2 champs)', r.b.lisible.statut === 'ok');
check('C · pièce EXPIRÉE (ko)', r.c.expiration.statut === 'ko' && /EXPIR/i.test(r.c.expiration.detail));
check('D · adresse incohérente (warn)', r.d.adresse.statut === 'warn');
check('E · document peu lisible (warn)', r.e.lisible.statut === 'warn');
check('E · pièces manquantes (ko)', r.e.manquantes.statut === 'ko');
check('anomalies : dossier propre = 0', r.anoClean === 0);
check('anomalies : pièce expirée détectée', r.anoExpired === 1);
check('aucun pageerror', perr.length === 0);

const ok = results.filter(x => x.ok).length, tot = results.length;
results.forEach(x => { if (!x.ok) console.log('✗ ' + x.n); });
if (perr.length) console.log('pageerrors:', perr.slice(0, 4).join(' | '));
console.log(`\nLAST contrôles pièces (Phase 3) : ${ok}/${tot} ` + (ok === tot ? 'OK — tout vert' : 'ÉCHEC'));
process.exit(ok === tot ? 0 : 1);
