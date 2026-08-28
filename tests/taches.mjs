/**
 * LAST — Entités de suivi : Tâches (prochaines actions) & Notifications (journal).
 *   node tests/taches.mjs
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
  const mkDoss = (id, no, mail) => {
    const intake = { version: 'LASTv1', type: 'sas', numeroDossier: no,
      societe: { denomination: 'T' + id, capital: '1000', objet: 'Conseil', regime: 'IS' },
      siege: { rue: '1 rue', cp: '75001', ville: 'Paris', type: 'Local commercial (bail)', bailleur: 'SCI' },
      direction: { nom: 'N' + id, prenom: 'P', naissance: '1980-01-01', nationalite: 'Française', adresse: '1 rue Paris' },
      associes: [{ nom: 'N' + id, prenom: 'P', apport: '600', parts: '600' }, { nom: 'M' + id, prenom: 'Q', apport: '400', parts: '400' }],
      contact: { nom: 'N' + id, prenom: 'P', email: mail } };
    const dd = { id: 'dd-' + id, clientNom: 'Client ' + id, clientEmail: mail, statut: 'Qualification', intake };
    DB.demandes.unshift(dd);
    return creerDossierDepuis(dd.id, true);
  };

  out.hasFn = ['tacheDossier', 'tachesToutes', 'tachesCount', 'tachesCard', 'notificationsFeed', 'notifsCard'].every(f => typeof window[f] === 'function');

  // A : rien fait → « Demander les pièces »
  const dA = mkDoss('A', 'DOS-2026-TA', 'a@t.fr');
  out.taskDemander = window.tacheDossier(dA).kind === 'demander';
  // pièces demandées → « Relancer »
  dA.docsMailSent = Date.now() - 5 * 86400000;
  out.taskRelancer = window.tacheDossier(dA).kind === 'relancer';

  // B : pièces complètes ; actes effacés → « Générer les actes »
  const dB = mkDoss('B', 'DOS-2026-TB', 'b@t.fr');
  dB.pieces = { identite: { data: 'x' }, domiciliation: { data: 'x' }, edf: { data: 'x' }, impot: { data: 'x' } };
  dB.docs = {}; // actes non générés (les actes sont auto-générés à la création, on les efface pour ce cas)
  out.taskGenerer = window.tacheDossier(dB).kind === 'generer';
  // actes générés → « Lancer la signature »
  dB.docs = { statuts: { genere: true } };
  out.taskSignature = window.tacheDossier(dB).kind === 'signature';

  // C : tout signé + prêt → « Déposer »
  const dC = mkDoss('C', 'DOS-2026-TC', 'c@t.fr');
  dC.pieces = { identite: { data: 'x' }, domiciliation: { data: 'x' }, edf: { data: 'x' }, impot: { data: 'x' } };
  dC.docs = { statuts: { genere: true } };
  sigEnvoyerTous(dC.id); ['statuts', 'pouvoir', 'dnc', 'souscripteurs'].forEach(k => sigSigne(dC.id, k));
  const kC = window.tacheDossier(dC).kind;
  out.taskDeposer = kC === 'deposer' || kC === 'verifier';
  // déposé → « Clôturer »
  dC.inpi = { reference: 'INPI-1' };
  out.taskCloturer = window.tacheDossier(dC).kind === 'cloturer';
  // clôturé → plus de tâche
  dC.clotureLe = '2026-01-01';
  out.taskOk = window.tacheDossier(dC).kind === 'ok';

  // agrégation triée par priorité (relancer=4 avant generer=3)
  const all = window.tachesToutes();
  out.count = window.tachesCount() === all.length && all.length >= 2;
  out.sorted = all.length >= 2 ? all[0].t.prio >= all[all.length - 1].t.prio : true;
  out.excludeOk = !all.some(x => x.d.id === dC.id); // dossier clôturé exclu

  // notifications : journal agrégé depuis les historiques
  (dB.historique = dB.historique || []).push({ d: '2026-02-02', t: 'Test événement notif' });
  const feed = window.notificationsFeed(20);
  out.feed = feed.some(x => /Test événement notif/.test(x.t));

  // rendu sur le Pilotage
  state.page = 'pilotage'; render();
  const html = document.getElementById('view').innerHTML;
  out.rendu = /Prochaines actions/.test(html) && /Journal d'activité/.test(html);
  out.kpi = /Actions en attente/.test(html);
  return out;
});

await browser.close();
check('fonctions Tâches / Notifications présentes', r.hasFn);
check('tâche « Demander les pièces » (rien fait)', r.taskDemander);
check('tâche « Relancer » (pièces demandées)', r.taskRelancer);
check('tâche « Générer les actes » (pièces complètes)', r.taskGenerer);
check('tâche « Lancer la signature » (actes générés)', r.taskSignature);
check('tâche « Déposer » (tout signé)', r.taskDeposer);
check('tâche « Clôturer » (déposé)', r.taskCloturer);
check('dossier clôturé → aucune tâche', r.taskOk);
check('agrégation + compteur', r.count);
check('tri par priorité', r.sorted);
check('dossiers clôturés exclus des tâches', r.excludeOk);
check('journal d’activité agrégé (historiques)', r.feed);
check('cartes rendues sur le Pilotage', r.rendu);
check('KPI « Actions en attente »', r.kpi);
check('aucun pageerror', perr.length === 0);

const ok = results.filter(x => x.ok).length, tot = results.length;
results.forEach(x => { if (!x.ok) console.log('✗ ' + x.n); });
if (perr.length) console.log('pageerrors:', perr.slice(0, 4).join(' | '));
console.log(`\nLAST Tâches & Notifications : ${ok}/${tot} ` + (ok === tot ? 'OK — tout vert' : 'ÉCHEC'));
process.exit(ok === tot ? 0 : 1);
