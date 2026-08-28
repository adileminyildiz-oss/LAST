/**
 * LAST — Message d'accompagnement du portail de dépôt (e-mail de demande de pièces).
 *   node tests/depotmsg.mjs
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
  out.hasFn = ['depotMsgCfg', 'depotMsgResolve', 'depotMsgSave', 'depotMsgReset', 'depotMsgCard'].every(f => typeof window[f] === 'function');

  // demande avec e-mail + numéro (pour le lien de dépôt)
  const d = { id: 'd-msg', clientNom: 'Léa Blanc', clientEmail: 'lea@blanc.fr', serviceSouhaite: 'Création SAS', forme: 'SAS', numeroDossier: 'DOS-2026-050', statut: 'Qualification' };
  DB.demandes = DB.demandes || []; DB.demandes.unshift(d);

  // résolution des variables
  const m = depotMsgResolve(d);
  out.prenom = /Bonjour Léa,/.test(m.corps);
  out.pieces = /•/.test(m.corps); // liste de pièces injectée
  out.lien = /depot\.html\?d=DOS-2026-050/.test(m.corps);
  out.sujet = /AEM CONSEIL/.test(m.sujet);

  // la liste de pièces suit la configuration (step pièces configurables)
  const type = formaliteType(d);
  DB.parametres = DB.parametres || {}; DB.parametres.piecesConfig = DB.parametres.piecesConfig || {};
  DB.parametres.piecesConfig[type] = [{ k: 'x', label: 'Pièce TEST unique' }];
  out.piecesCfg = /• Pièce TEST unique/.test(depotMsgResolve(d).corps);
  delete DB.parametres.piecesConfig[type];

  // sans numéro → la ligne {lien} disparaît
  const d2 = { id: 'd-msg2', clientNom: 'Bo', clientEmail: 'b@b.fr', serviceSouhaite: 'Création SARL', statut: 'Qualification' };
  DB.demandes.unshift(d2);
  const m2 = depotMsgResolve(d2);
  out.noLien = !/\{lien\}/.test(m2.corps) && !/depot\.html/.test(m2.corps);

  // override demDemanderDocs → utilise le message + horodate
  let captured = null;
  window.demOuvrirMessagerie = (to, sujet, corps) => { captured = { to, sujet, corps }; };
  demDemanderDocs('d-msg');
  out.override = captured && /Bonjour Léa/.test(captured.corps) && /depot\.html/.test(captured.corps) && captured.to === 'lea@blanc.fr';
  out.horodate = typeof d.docsMailSent === 'number';

  // personnalisation via la carte + réinitialisation
  document.body.insertAdjacentHTML('beforeend', '<div>' + depotMsgCard() + '</div>');
  document.getElementById('dmsg-sujet').value = 'Vos pièces pour {prenom}';
  document.getElementById('dmsg-corps').value = 'Bonjour {prenom}, merci d’envoyer :\n{pieces}';
  depotMsgSave();
  out.saved = depotMsgCfg().sujet === 'Vos pièces pour {prenom}' && /merci d’envoyer/.test(depotMsgCfg().corps);
  const m3 = depotMsgResolve(d);
  out.savedResolve = /Vos pièces pour Léa/.test(m3.sujet) && /Bonjour Léa, merci d’envoyer/.test(m3.corps);
  depotMsgReset();
  out.reset = /Documents nécessaires/.test(depotMsgCfg().sujet);

  const params = pageParams();
  out.card = /Message de demande de pièces/.test(params) && /dmsg-card/.test(params) && /\{pieces\}/.test(params);
  return out;
});

await browser.close();
check('fonctions message dépôt présentes', r.hasFn);
check('variable {prenom} résolue', r.prenom);
check('variable {pieces} (liste) injectée', r.pieces);
check('variable {lien} (portail sécurisé) injectée', r.lien);
check('objet résolu', r.sujet);
check('la liste suit les pièces configurées', r.piecesCfg);
check('sans numéro → ligne {lien} retirée', r.noLien);
check('« Demander les pièces » utilise le message', r.override);
check('envoi horodaté (docsMailSent)', r.horodate);
check('personnalisation enregistrée', r.saved);
check('résolution après personnalisation', r.savedResolve);
check('réinitialisation au modèle', r.reset);
check('carte « Message de demande de pièces » dans Paramètres', r.card);
check('aucun pageerror', perr.length === 0);

const ok = results.filter(x => x.ok).length, tot = results.length;
results.forEach(x => { if (!x.ok) console.log('✗ ' + x.n); });
if (perr.length) console.log('pageerrors:', perr.slice(0, 4).join(' | '));
console.log(`\nLAST message portail de dépôt : ${ok}/${tot} ` + (ok === tot ? 'OK — tout vert' : 'ÉCHEC'));
process.exit(ok === tot ? 0 : 1);
