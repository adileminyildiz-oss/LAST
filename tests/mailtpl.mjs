/**
 * LAST — Modèles d'e-mails (réponses types) éditables.
 *   node tests/mailtpl.mjs
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
  window.confirm = () => true; window.toast = () => {}; window.render = window.render || (() => {});
  const out = {};
  out.hasFn = ['mailTplGet', 'mailTplEffective', 'mailTplResolve', 'mailTplModelSave', 'mailTplModelReset', 'mailModelesCard'].every(f => typeof window[f] === 'function');

  const d = { id: 'd-mt', clientNom: 'Léa Blanc', clientEmail: 'lea@blanc.fr', code: 'AEM-77', serviceSouhaite: 'Création SAS', forme: 'SAS', numeroDossier: 'DOS-2026-060', statut: 'Qualification' };
  DB.demandes = DB.demandes || []; DB.demandes.unshift(d);

  // 4 modèles par défaut
  out.keys = ['accuse', 'pieces', 'suivi', 'relance'].every(k => mailTplEffective(k) && mailTplEffective(k).sujet && mailTplEffective(k).corps);

  // résolution variables : accusé
  const acc = mailTplResolve(d, 'accuse');
  out.accuse = /Bonjour Léa,/.test(acc.corps) && /AEM-77/.test(acc.corps) && /référence AEM-77/.test(acc.sujet + acc.corps);

  // pièces : {pieces} + {lien} (suit la config des pièces)
  const pcs = mailTplResolve(d, 'pieces');
  out.pieces = /•/.test(pcs.corps) && /depot\.html\?d=DOS-2026-060/.test(pcs.corps);

  // suivi/relance : {serie}
  out.suivi = /DOS-|AEM-77/.test(mailTplResolve(d, 'suivi').corps) && /AEM-77/.test(mailTplResolve(d, 'relance').sujet);

  // override demReponseType → utilise le modèle
  let captured = null; window.demOuvrirMessagerie = (to, s, c) => { captured = { to, s, c }; };
  demReponseType('d-mt', 'suivi');
  out.override = captured && /Léa/.test(captured.c) && captured.to === 'lea@blanc.fr';

  // personnalisation d'un modèle + résolution
  document.body.insertAdjacentHTML('beforeend', '<div id="mm">' + mailModelesCard() + '</div>');
  // la carte affiche « accuse » par défaut ; on personnalise l'accusé
  document.getElementById('mt-sujet').value = 'Reçu {serie}';
  document.getElementById('mt-corps').value = 'Salut {prenom}, dossier {serie} bien reçu.';
  mailTplModelSave('accuse');
  out.saved = !!mailTplGet('accuse') && /Salut \{prenom\}/.test(mailTplGet('accuse').corps);
  const acc2 = mailTplResolve(d, 'accuse');
  out.savedResolve = acc2.sujet === 'Reçu AEM-77' && /Salut Léa, dossier AEM-77 bien reçu\./.test(acc2.corps);

  // les autres modèles restent standard
  out.othersDefault = !mailTplGet('suivi') && !mailTplGet('relance');

  // réinitialisation
  mailTplModelReset('accuse');
  out.reset = !mailTplGet('accuse') && /Nous accusons bonne réception/.test(mailTplResolve(d, 'accuse').corps);

  const params = pageParams();
  out.card = /Modèles d'e-mails/.test(params) && /mailmod-card/.test(params) && /\{serie\}/.test(params);
  return out;
});

await browser.close();
check('fonctions modèles d’e-mails présentes', r.hasFn);
check('4 modèles par défaut (accusé/pièces/suivi/relance)', r.keys);
check('accusé : {prenom} + {serie} + {ref} résolus', r.accuse);
check('pièces : {pieces} + {lien} résolus', r.pieces);
check('suivi/relance : {serie} résolu', r.suivi);
check('réponse type utilise le modèle (override)', r.override);
check('personnalisation enregistrée', r.saved);
check('résolution après personnalisation', r.savedResolve);
check('les autres modèles restent standard', r.othersDefault);
check('réinitialisation au modèle', r.reset);
check('carte « Modèles d’e-mails » dans Paramètres', r.card);
check('aucun pageerror', perr.length === 0);

const ok = results.filter(x => x.ok).length, tot = results.length;
results.forEach(x => { if (!x.ok) console.log('✗ ' + x.n); });
if (perr.length) console.log('pageerrors:', perr.slice(0, 4).join(' | '));
console.log(`\nLAST modèles d'e-mails : ${ok}/${tot} ` + (ok === tot ? 'OK — tout vert' : 'ÉCHEC'));
process.exit(ok === tot ? 0 : 1);
