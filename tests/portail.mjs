/**
 * LAST — Phase 2 : portail de dépôt sécurisé des pièces.
 *   node tests/portail.mjs
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
const browser = await chromium.launch();
const perr = [];

// ---- Partie A : LAST (index.html) ----
const pageA = await browser.newPage({ viewport: { width: 1280, height: 1000 } });
pageA.on('pageerror', e => { const s = '' + e; if (!/ServiceWorker/.test(s)) perr.push('A:' + s); });
await pageA.addInitScript(() => { try { localStorage.setItem('last-gate-ok', '1'); } catch (e) {} });
await pageA.goto(pathToFileURL(path.resolve('index.html')).href, { waitUntil: 'networkidle' });
await pageA.waitForTimeout(300);

const a = await pageA.evaluate(() => {
  window.confirm = () => true; window.toast = () => {};
  const out = {};
  const no = 'DOS-2026-77';
  const d = { id: 't-portail', clientNom: 'Zoé Klein', clientEmail: 'zoe@k.fr', statut: 'Qualification', numeroDossier: no, dossierId: '' };
  DB.demandes.unshift(d);

  out.tokenStable = depotToken(no) === depotToken(no) && depotToken(no).length === 8;
  out.tokenUniq = depotToken(no) !== depotToken('DOS-2026-99');
  const lien = depotLien(d);
  out.lien = /depot\.html\?d=DOS-2026-77&k=/.test(lien);

  // e-mail de dépôt (marqueur structuré)
  const payload = { version: 'LASTDEP1', dossier: no, pieces: { identite: ['cni-recto.jpg', 'cni-verso.jpg'], domiciliation: ['facture-edf.pdf'] } };
  const b64 = btoa(unescape(encodeURIComponent(JSON.stringify(payload))));
  const mail = { subject: 'DÉPÔT PIÈCES — DOS-2026-77 — AEM CONSEIL', body: 'Bonjour,\nLAST_DEPOT: LASTDEP1:' + b64 + '\n</div>' };

  const info = depotDetectEmail(mail);
  out.detect = info && info.dossier === no && info.pieces && info.pieces.identite && info.pieces.identite.length === 2;

  const res = depotTraiterMail(mail);
  out.attach = res && res.ok === true;
  out.recu = d.piecesRecues && d.piecesRecues.identite === true && d.piecesRecues.domiciliation === true;
  out.docs = (d.docs && d.docs.identite || []).some(x => x.name === 'cni-recto.jpg' && x.portail);
  out.portail = d.depotPortail && d.depotPortail.statut === 'reçu' && d.depotPortail.nb === 2;

  // repli : sujet seul (sans marqueur)
  const info2 = depotDetectEmail({ subject: 'DÉPÔT PIÈCES — DOS-2026-77', body: '' });
  out.detectSujet = info2 && info2.dossier === no;

  // e-mail normal → non détecté
  out.detectRien = depotDetectEmail({ subject: 'Bonjour', body: 'question' }) === null;
  return out;
});
await pageA.close();

// ---- Partie B : page cliente (depot.html) ----
const pageB = await browser.newPage({ viewport: { width: 900, height: 1100 } });
pageB.on('pageerror', e => { const s = '' + e; if (!/ServiceWorker/.test(s)) perr.push('B:' + s); });
await pageB.goto(pathToFileURL(path.resolve('depot.html')).href + '?d=DOS-2026-77&k=abc123', { waitUntil: 'domcontentloaded' });
await pageB.waitForTimeout(150);
const b = await pageB.evaluate(() => ({
  dosno: (document.getElementById('dosno').textContent || ''),
  pieces: document.querySelectorAll('#pieces .piece').length,
  subject: (document.getElementById('p_subject').value || ''),
  dossierField: (document.getElementById('p_dossier').value || ''),
  sendDisabled: document.getElementById('send').disabled
}));
// page sans dossier → message d'erreur
await pageB.goto(pathToFileURL(path.resolve('depot.html')).href, { waitUntil: 'domcontentloaded' });
await pageB.waitForTimeout(100);
const bErr = await pageB.evaluate(() => document.getElementById('cardErr').style.display);
await pageB.close();
await browser.close();

check('token sécurisé stable (8 car.)', a.tokenStable);
check('token unique par dossier', a.tokenUniq);
check('lien sécurisé depot.html?d=…&k=…', a.lien);
check('détection e-mail de dépôt (marqueur)', a.detect);
check('liaison au dossier réussie', a.attach);
check('pièces marquées reçues (identité + domicile)', a.recu);
check('fichiers rattachés (nom + portail)', a.docs);
check('statut portail « reçu » (2 pièces)', a.portail);
check('repli : détection par le sujet seul', a.detectSujet);
check('e-mail normal non détecté', a.detectRien);
check('page cliente : n° de dossier affiché', /DOS-2026-77/.test(b.dosno));
check('page cliente : 4 pièces à déposer', b.pieces === 4);
check('page cliente : sujet + dossier pré-remplis', /DOS-2026-77/.test(b.subject) && b.dossierField === 'DOS-2026-77');
check('page cliente : bouton désactivé sans fichier', b.sendDisabled === true);
check('page cliente : lien sans dossier → erreur', bErr === 'block');
check('aucun pageerror', perr.length === 0);

const ok = results.filter(x => x.ok).length, tot = results.length;
results.forEach(x => { if (!x.ok) console.log('✗ ' + x.n); });
if (perr.length) console.log('pageerrors:', perr.slice(0, 4).join(' | '));
console.log(`\nLAST portail de dépôt (Phase 2) : ${ok}/${tot} ` + (ok === tot ? 'OK — tout vert' : 'ÉCHEC'));
process.exit(ok === tot ? 0 : 1);
