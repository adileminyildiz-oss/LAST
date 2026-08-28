/**
 * LAST — smoke « zéro erreur » : rend Demandes / Traitement / Paramètres
 * + ouvre le détail d'une demande, et vérifie l'absence de pageerror.
 *   node tests/smoke.mjs
 */
import path from 'path';
import url from 'url';
import { pathToFileURL } from 'url';
async function loadChromium() {
  const cands = [process.env.PLAYWRIGHT_PKG, 'playwright',
    '/opt/node22/lib/node_modules/playwright/index.js', '/usr/lib/node_modules/playwright/index.js'].filter(Boolean);
  for (const c of cands) { try { const spec = c.endsWith('.js') ? pathToFileURL(c).href : c; const mod = await import(spec); const ch = mod.chromium || (mod.default && mod.default.chromium); if (ch) return ch; } catch (_) {} }
  throw new Error('Playwright introuvable');
}
const chromium = await loadChromium();
const here = path.dirname(url.fileURLToPath(import.meta.url));
const file = pathToFileURL(path.join(here, '..', 'index.html')).href;

const browser = await chromium.launch();
const page = await browser.newPage();
const perr = [];
page.on('pageerror', e => { const s = '' + e; if (/ServiceWorker/i.test(s)) return; perr.push(s); });
page.on('console', m => { if (m.type() === 'error') { const s = m.text(); if (!/ServiceWorker|Failed to load resource/i.test(s)) perr.push('console:' + s); } });
await page.addInitScript(() => { try { localStorage.setItem('last-gate-ok', '1'); } catch (e) {} });
await page.goto(file, { waitUntil: 'networkidle' });

const res = await page.evaluate(() => {
  const out = {};
  ['demandes', 'espace', 'params'].forEach(p => {
    try { state.page = p; render(); out[p] = document.getElementById('view').innerHTML.length; }
    catch (e) { out[p] = 'ERR:' + e; }
  });
  // ouvrir le détail de la première demande
  try {
    state.page = 'demandes'; render();
    var d = (DB.demandes || [])[0];
    if (d && typeof demVue === 'function') { demVue(d.id); out.detail = document.getElementById('view').innerHTML.length; }
    else if (d) { state.demView = d.id; render(); out.detail = document.getElementById('view').innerHTML.length; }
  } catch (e) { out.detail = 'ERR:' + e; }
  return out;
});

await browser.close();
let ok = true;
for (const k in res) { const v = res[k]; const good = typeof v === 'number' && v > 50; if (!good) ok = false; console.log(`${good ? '✓' : '✗'} ${k}: ${v}`); }
if (perr.length) { ok = false; console.log('PAGEERRORS:', perr.slice(0, 6).join('\n  ')); }
console.log(ok && !perr.length ? '\nSMOKE OK — 3 pages rendues, 0 erreur' : '\nSMOKE ÉCHEC');
process.exit(ok && !perr.length ? 0 : 1);
