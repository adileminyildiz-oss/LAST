/**
 * LAST — test du questionnaire adaptatif (formulaire.html)
 * Parcourt un flux Création SAS (2 associés) et vérifie la charge structurée.
 *   node tests/questionnaire.mjs
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
const file = pathToFileURL(path.resolve('formulaire.html')).href;
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 900, height: 1100 } });
const perr = []; page.on('pageerror', e => perr.push('' + e));
// empêche la navigation du POST FormSubmit et capture la soumission
await page.addInitScript(() => { HTMLFormElement.prototype.submit = function () { window.__submitted = true; }; });
await page.goto(file, { waitUntil: 'domcontentloaded' });

const set = async (sel, val) => { await page.fill(sel, val); };
const step = async () => { await page.click('#next'); await page.waitForTimeout(60); };

// Étape 1 — type SAS
check('étape 1 affiche les 7 types', (await page.$$('.type')).length === 7);
await page.click('.type[data-t="sas"]');
await step();

// Étape 2 — société
check('étape société', await page.$('[data-o="societe"][data-k="denomination"]') !== null);
await set('[data-o="societe"][data-k="denomination"]', 'INNOV SAS');
await set('[data-o="societe"][data-k="objet"]', 'Édition de logiciels');
await set('[data-o="siege"][data-k="rue"]', '10 rue de la Paix');
await set('[data-o="siege"][data-k="cp"]', '75002');
await set('[data-o="siege"][data-k="ville"]', 'Paris');
await set('[data-o="societe"][data-k="capital"]', '1000');
await page.selectOption('[data-o="societe"][data-k="regime"]', { index: 1 });
await step();

// Étape 3 — direction + associés
check('étape direction (Président)', (await page.textContent('#body')).includes('Président'));
await set('[data-o="direction"][data-k="nom"]', 'Martin');
await set('[data-o="direction"][data-k="prenom"]', 'Claire');
// 2 associés par défaut
await set('[data-a="0"][data-k="nom"]', 'Martin');
await set('[data-a="0"][data-k="prenom"]', 'Claire');
await set('[data-a="0"][data-k="apport"]', '600');
await set('[data-a="1"][data-k="nom"]', 'Durand');
await set('[data-a="1"][data-k="prenom"]', 'Paul');
await set('[data-a="1"][data-k="apport"]', '400');
await page.waitForTimeout(60);
const cap = await page.textContent('#capbar');
check('contrôle capital = somme apports (1000 = 600+400)', /Répartition correcte/.test(cap));
// ajout puis suppression d'un associé
await page.click('#addAsso'); await page.waitForTimeout(40);
check('ajout d’un associé → 3', (await page.$$('.asso')).length === 3);
await page.click('[data-del="2"]'); await page.waitForTimeout(40);
check('suppression → 2', (await page.$$('.asso')).length === 2);
await step();

// Étape 4 — siège (conditionnel)
check('étape siège', await page.$('[data-o="siege"][data-k="type"]') !== null);
await page.selectOption('[data-o="siege"][data-k="type"]', { label: 'Local commercial (bail)' });
await page.waitForTimeout(60);
check('siège conditionnel (bailleur) affiché', await page.$('[data-o="siege"][data-k="bailleur"]') !== null);
await step();

// Étape 5 — contact
await set('[data-o="contact"][data-k="nom"]', 'Martin');
await set('[data-o="contact"][data-k="prenom"]', 'Claire');
await set('[data-o="contact"][data-k="email"]', 'claire@innov.fr');
await step();

// Étape 6 — récap + envoi
const recap = await page.textContent('#body');
check('récap contient la dénomination', /INNOV SAS/.test(recap));
check('récap liste les associés', /Durand|Paul/.test(recap));
await page.click('#send');
await page.waitForTimeout(80);

const sub = await page.evaluate(() => {
  const submitted = !!window.__submitted;
  const el = document.querySelector('#postfields [name="LAST_DATA"]');
  const no = (document.querySelector('#postfields [name="Numéro de dossier"]') || {}).value || '';
  let data = null;
  if (el && /^LASTv1:/.test(el.value)) { try { data = JSON.parse(decodeURIComponent(escape(atob(el.value.slice(7))))); } catch (e) { data = 'ERR:' + e; } }
  const readable = [...document.querySelectorAll('#postfields input')].map(i => i.name);
  return { submitted, no, data, readable };
});
check('formulaire soumis (FormSubmit)', sub.submitted);
check('numéro de dossier DOS-AAAA-xxxxxx', /^DOS-\d{4}-\d{6}$/.test(sub.no));
check('charge structurée LAST_DATA décodable', sub.data && typeof sub.data === 'object');
check('structure : type=sas', sub.data && sub.data.type === 'sas');
check('structure : société INNOV SAS', sub.data && sub.data.societe && sub.data.societe.denomination === 'INNOV SAS');
check('structure : 2 associés', sub.data && Array.isArray(sub.data.associes) && sub.data.associes.filter(a => a.nom).length === 2);
check('structure : siège Paris 75002', sub.data && sub.data.siege && sub.data.siege.cp === '75002');
check('champs lisibles pour l’e-mail (Dénomination, Associé 1…)', sub.readable.includes('Dénomination') && sub.readable.some(n => /Associé 1/.test(n)));

await browser.close();
const ok = results.filter(x => x.ok).length, tot = results.length;
results.forEach(x => { if (!x.ok) console.log('✗ ' + x.n); });
if (perr.length) console.log('pageerrors:', perr.slice(0, 4).join(' | '));
console.log(`\nLAST questionnaire : ${ok}/${tot} ` + (ok === tot && !perr.length ? 'OK — tout vert' : 'ÉCHEC'));
process.exit(ok === tot && !perr.length ? 0 : 1);
