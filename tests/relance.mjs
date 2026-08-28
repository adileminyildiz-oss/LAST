/**
 * LAST — Étape 3 / Agents : Agent Relance (relances automatiques des pièces).
 *   node tests/relance.mjs
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
  window.confirm = () => true; window.toast = () => {}; window.open = () => null;
  window.demOuvrirMessagerie = () => {}; // ne pas ouvrir de fenêtre
  const out = {};
  const DAY = 86400000;

  // Demande avec pièces demandées il y a 5 jours, aucune pièce reçue
  const d = { id: 't-rel1', clientNom: 'Léa Blanc', clientEmail: 'lea@blanc.fr', statut: 'Qualification',
    docsMailSent: Date.now() - 5 * DAY, docs: {}, piecesRecues: {} };
  DB.demandes.unshift(d);

  out.hasFn = ['relanceEtat', 'relanceCandidats', 'relanceEnvoyer', 'relanceTout', 'relanceCard', 'relanceCount'].every(f => typeof window[f] === 'function');
  out.manque = relancePiecesManquantes(d).length > 0;
  let e = relanceEtat(d);
  out.due0 = e.due === true && e.niveau === 0;
  out.inCandidats = relanceCandidats().some(x => x.d.id === 't-rel1');
  out.count = relanceCount() >= 1;

  // email de niveau 1
  const m1 = relanceEmail(d, 1); out.mail1 = /Rappel/.test(m1.sujet) && /Léa/.test(m1.corps);
  const m3 = relanceEmail(d, 3); out.mail3 = /Dernier rappel/.test(m3.sujet);

  // envoi d'une relance (silencieux) → historisé, niveau incrémenté, plus due immédiatement
  const res = relanceEnvoyer('t-rel1', true);
  out.envoye = res && res.niveau === 1;
  out.histo = (d.relances || []).length === 1 && d.relances[0].niveau === 1;
  e = relanceEtat(d);
  out.notDue = e.due === false && e.niveau === 1; // jSince=0 < délai suivant

  // faire « vieillir » la relance de 5 jours → de nouveau due, niveau 1 → prochain envoi n°2
  d.relances[0].ts = Date.now() - 5 * DAY;
  e = relanceEtat(d);
  out.dueAgain = e.due === true && e.niveau === 1;
  const m2 = relanceEmail(d, e.niveau + 1); out.mail2 = /2ᵉ rappel/.test(m2.sujet);

  // plafond : après max relances, plus de relance due
  d.relances = [{ ts: Date.now() - 9 * DAY, niveau: 1 }, { ts: Date.now() - 6 * DAY, niveau: 2 }, { ts: Date.now() - 5 * DAY, niveau: 3 }];
  out.plafond = relanceEtat(d).due === false;

  // pièces reçues → sort des candidats
  const d2 = { id: 't-rel2', clientNom: 'Max Noir', clientEmail: 'max@noir.fr', statut: 'Qualification', docsMailSent: Date.now() - 8 * DAY, docs: {}, piecesRecues: {} };
  DB.demandes.unshift(d2);
  out.d2due = relanceEtat(d2).due === true;
  (piecesRequises(d2) || []).forEach(p => { d2.piecesRecues[p.k] = true; });
  out.d2complete = relanceEtat(d2).due === false && relancePiecesManquantes(d2).length === 0;

  // carte + KPI sur le Pilotage
  const card = relanceCard(); out.card = /Agent Relance/.test(card) && /à relancer/i.test(card);
  const s = pilotageStats(); out.kpi = typeof s.aRelancer === 'number';
  state.page = 'pilotage'; render();
  out.rendu = /Agent Relance/.test(document.getElementById('view').innerHTML);
  return out;
});

await browser.close();
check('fonctions de l’Agent Relance présentes', r.hasFn);
check('pièces manquantes détectées', r.manque);
check('relance due après le délai (niveau 0)', r.due0);
check('demande dans la liste des candidats', r.inCandidats);
check('compteur de relances', r.count);
check('e-mail niveau 1 (rappel, prénom repris)', r.mail1);
check('e-mail niveau 3 (dernier rappel)', r.mail3);
check('envoi relance → niveau 1', r.envoye);
check('relance historisée sur la demande', r.histo);
check('plus due juste après envoi (délai suivant)', r.notDue);
check('de nouveau due après le délai suivant', r.dueAgain);
check('e-mail niveau 2 (2ᵉ rappel)', r.mail2);
check('plafond de relances respecté (max)', r.plafond);
check('2ᵉ demande due', r.d2due);
check('pièces reçues → sort des relances', r.d2complete);
check('carte Agent Relance rendue', r.card);
check('KPI « à relancer » agrégé', r.kpi);
check('carte greffée sur le Pilotage', r.rendu);
check('aucun pageerror', perr.length === 0);

const ok = results.filter(x => x.ok).length, tot = results.length;
results.forEach(x => { if (!x.ok) console.log('✗ ' + x.n); });
if (perr.length) console.log('pageerrors:', perr.slice(0, 4).join(' | '));
console.log(`\nLAST Agent Relance (Étape 3) : ${ok}/${tot} ` + (ok === tot ? 'OK — tout vert' : 'ÉCHEC'));
process.exit(ok === tot ? 0 : 1);
