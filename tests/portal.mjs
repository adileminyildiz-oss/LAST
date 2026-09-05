/**
 * LAST — Test de bout en bout du PORTAIL CLIENT (serveur + front).
 * Démarre le backend server/portal, puis pilote l'app dans Chromium :
 * synchronisation cabinet → connexion client distante → consultation d'un
 * document → dépôt d'une pièce → journal de consultation → suspension d'accès.
 *   node tests/portal.mjs
 */
import path from 'path';
import os from 'os';
import fs from 'fs';
import { spawn } from 'child_process';
import { pathToFileURL } from 'url';

const PORT = 8900 + Math.floor(Math.random() * 90);
const TOKEN = 'ci-cabinet-token';
const DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'marq-portal-ci-'));
const BASE = 'http://localhost:' + PORT;

async function loadChromium() {
  const cands = [process.env.PLAYWRIGHT_PKG, 'playwright',
    '/opt/node22/lib/node_modules/playwright/index.js', '/usr/lib/node_modules/playwright/index.js'].filter(Boolean);
  for (const c of cands) { try { const spec = c.endsWith('.js') ? pathToFileURL(c).href : c; const mod = await import(spec); const ch = mod.chromium || (mod.default && mod.default.chromium); if (ch) return ch; } catch (_) {} }
  throw new Error('Playwright introuvable (PLAYWRIGHT_PKG).');
}

const results = [];
function check(name, cond) { results.push({ name, ok: !!cond }); }
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

// --- Démarrage du serveur portail ---
const srv = spawn('node', ['server.js'], {
  cwd: path.resolve(process.cwd(), 'server/portal'),
  env: Object.assign({}, process.env, { PORT: String(PORT), CABINET_TOKEN: TOKEN, JWT_SECRET: 'ci-jwt-secret', ALLOWED_ORIGIN: '*', DATA_DIR }),
  stdio: ['ignore', 'ignore', 'ignore'],
});
async function waitHealth() {
  for (let i = 0; i < 60; i++) { try { const r = await fetch(BASE + '/health'); if (r.ok) return true; } catch (_) {} await sleep(200); }
  return false;
}

function cleanup() { try { srv.kill(); } catch (_) {} try { fs.rmSync(DATA_DIR, { recursive: true, force: true }); } catch (_) {} }

let browser;
try {
  const healthy = await waitHealth();
  check('serveur démarré (/health)', healthy);
  if (!healthy) throw new Error('serveur injoignable');

  const chromium = await loadChromium();
  const url = pathToFileURL(path.resolve(process.cwd(), 'index.html')).href;
  browser = await chromium.launch({ args: ['--disable-web-security'] });
  const page = await browser.newPage({ viewport: { width: 1200, height: 900 } });
  const perr = [];
  page.on('pageerror', e => { const s = '' + e; if (/ServiceWorker/i.test(s)) return; perr.push(s); });
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(400);

  // Configure le coffre (1 doc partagé) + le serveur, puis synchronise.
  await page.evaluate((cfg) => {
    const svc = JSON.parse(localStorage.getItem('last-svc') || '{}');
    svc.coffre = { items: [{ id: 'f1', client: 'DEMO', cat: 'Comptabilité', nom: 'Bilan 2024.pdf', date: '2024-12-31', shared: true, fileId: 'f1', ftype: 'application/pdf', fsize: 12 }] };
    localStorage.setItem('last-svc', JSON.stringify(svc));
    localStorage.setItem('last-coffre-files', JSON.stringify({ f1: { name: 'Bilan 2024.pdf', type: 'application/pdf', data: 'data:application/pdf;base64,JVBERi0xLjQK' } }));
    localStorage.setItem('last-portal-srv', JSON.stringify({ url: cfg.base, token: cfg.token, auto: false }));
  }, { base: BASE, token: TOKEN });

  const syncMsg = await page.evaluate(async () => { window.svcPortSyncNow(); await new Promise(r => setTimeout(r, 900)); return JSON.parse(localStorage.getItem('last-portal-srv'))._last || ''; });
  check('synchronisation cabinet → serveur', /Synchronis/i.test(syncMsg));

  const code = await page.evaluate(() => JSON.parse(localStorage.getItem('last-svc')).portail.codes['demo']);
  check('code d’accès client généré', !!code && code.length >= 4);

  // Connexion client distante + liste des documents servie par le serveur.
  const login = await page.evaluate(async (code) => {
    const cfg = JSON.parse(localStorage.getItem('last-portal-srv'));
    const r = await fetch(cfg.url + '/portal/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ client: 'DEMO', code }) });
    const j = await r.json(); const tok = j.token;
    const d = await fetch(cfg.url + '/portal/docs', { headers: { 'Authorization': 'Bearer ' + tok } }); const dj = await d.json();
    const f = await fetch(cfg.url + '/portal/file/f1', { headers: { 'Authorization': 'Bearer ' + tok } });
    const up = await fetch(cfg.url + '/portal/upload', { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + tok }, body: JSON.stringify({ nom: 'Facture.pdf', type: 'application/pdf', data: 'data:application/pdf;base64,JVBERi0=' }) });
    return { loginOk: r.status === 200, docs: (dj.docs || []).map(x => x.nom), fileStatus: f.status, uploadOk: up.status === 200 };
  }, code);
  check('connexion client distante (200)', login.loginOk);
  check('documents servis par le serveur', login.docs.indexOf('Bilan 2024.pdf') >= 0);
  check('consultation de fichier (200)', login.fileStatus === 200);
  check('dépôt client (upload 200)', login.uploadOk);

  // Journal + boîte de réception cabinet.
  const admin = await page.evaluate(async () => {
    const cfg = JSON.parse(localStorage.getItem('last-portal-srv'));
    const ev = await (await fetch(cfg.url + '/admin/events?limit=50', { headers: { 'X-Cabinet-Token': cfg.token } })).json();
    const ups = await (await fetch(cfg.url + '/admin/uploads', { headers: { 'X-Cabinet-Token': cfg.token } })).json();
    return { types: (ev.events || []).map(e => e.type), uploads: (ups.uploads || []).map(u => u.nom) };
  });
  check('journal : connexion enregistrée', admin.types.indexOf('login') >= 0);
  check('journal : consultation enregistrée', admin.types.indexOf('file') >= 0);
  check('boîte de réception : dépôt reçu', admin.uploads.indexOf('Facture.pdf') >= 0);

  // Suspension d'accès → login refusé ; réactivation → login rétabli.
  const revoke = await page.evaluate(async (code) => {
    const cfg = JSON.parse(localStorage.getItem('last-portal-srv'));
    await fetch(cfg.url + '/admin/revoke', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Cabinet-Token': cfg.token }, body: JSON.stringify({ client: 'DEMO' }) });
    const after = await fetch(cfg.url + '/portal/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ client: 'DEMO', code }) });
    return { revokedStatus: after.status };
  }, code);
  check('suspension d’accès (login refusé 401)', revoke.revokedStatus === 401);

  check('aucune erreur de page', perr.length === 0);
  if (perr.length) console.log('  pageerror:', perr.slice(0, 3).join(' | '));
} catch (e) {
  check('exécution du test', false);
  console.log('  Exception:', e && e.message);
} finally {
  if (browser) { try { await browser.close(); } catch (_) {} }
  cleanup();
}

const ok = results.filter(r => r.ok).length, total = results.length;
results.forEach(r => console.log((r.ok ? '  ✓ ' : '  ✗ ') + r.name));
console.log('\nLAST portail (bout-en-bout) : ' + ok + '/' + total + (ok === total ? ' OK — tout vert' : ' — ÉCHECS'));
process.exit(ok === total ? 0 : 1);
