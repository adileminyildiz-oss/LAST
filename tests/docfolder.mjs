/**
 * LAST — Dossier de documents : génération → vérification/approbation → téléchargement (.zip).
 *   node tests/docfolder.mjs
 */
import path from 'path'; import { pathToFileURL } from 'url';
async function loadChromium(){
  const cands=[process.env.PLAYWRIGHT_PKG,'playwright','/opt/node22/lib/node_modules/playwright/index.js','/usr/lib/node_modules/playwright/index.js'].filter(Boolean);
  for(const c of cands){ try{ const spec=c.endsWith('.js')?pathToFileURL(c).href:c; const mod=await import(spec); const ch=mod.chromium||(mod.default&&mod.default.chromium); if(ch)return ch; }catch(_){} }
  throw new Error('Playwright introuvable');
}
const chromium=await loadChromium();
const url=pathToFileURL(path.resolve('index.html')).href;
const b=await chromium.launch(); const p=await b.newPage({viewport:{width:1280,height:1000}});
const perr=[]; p.on('pageerror',e=>{const s=''+e; if(!/ServiceWorker/.test(s))perr.push(s);});
await p.addInitScript(()=>{try{localStorage.setItem('last-gate-ok','1');localStorage.setItem('last-role','admin');}catch(e){}});
await p.goto(url,{waitUntil:'networkidle'}); await p.waitForTimeout(300);
const r=await p.evaluate(()=>{
  window.confirm=()=>true; window.toast=()=>{};
  DB.clients=DB.clients||[]; DB.clients.push({id:'c-df',denomination:'DOCFOLDER',forme:'SAS',capital:'5000',president:'A',associes:[{nom:'A',parts:'1000'}],activites:['Conseil'],email:'a@d.fr'});
  const d={id:'d-df',clientIds:['c-df'],ref:'AEM-DF',statut:'Qualification',pieces:{},docs:{}};
  DB.dossiers=DB.dossiers||[]; DB.dossiers.unshift(d);
  const out={};
  const panel=espPanel(d,DB.dossiers,'d-df');
  out.cardInPanel=/tr-doccard/.test(panel)&&/Dossier de documents/.test(panel)&&/docDownloadFolder/.test(panel);
  out.hasFns=['docFolderCard','docGenAll','docApprove','docApproveAll','docDownloadFolder'].every(f=>typeof window[f]==='function');
  out.dlOffInit=docFolderCard(d).indexOf('dfd-dl-on')<0;
  docGenAll('d-df');
  const c1=docFolderCard(d); out.genThenWarn=/À vérifier/.test(c1)&&c1.indexOf('dfd-dl-on')<0;
  out.approvedZero=(d.docFolder.approved&&Object.values(d.docFolder.approved).every(v=>v===false));
  docApproveAll('d-df');
  const c2=docFolderCard(d); out.dlOn=c2.indexOf('dfd-dl-on')>=0&&/Approuvé/.test(c2)&&/prêt à télécharger/.test(c2);
  const firstK=ESP_DOCS.filter(dc=>espDocReq(d,dc.k))[0].k;
  espDocGen('d-df',firstK);
  out.regenResets=d.docFolder.approved[firstK]===false;
  let dl=false; const _cr=URL.createObjectURL; URL.createObjectURL=(x)=>{dl=x instanceof Blob&&x.size>0; return 'blob:x';};
  const _click=HTMLAnchorElement.prototype.click; HTMLAnchorElement.prototype.click=function(){};
  docApproveAll('d-df'); docDownloadFolder('d-df');
  URL.createObjectURL=_cr; HTMLAnchorElement.prototype.click=_click;
  out.zipBuilt=dl===true;
  return out;
});
await b.close();
const checks=[['carte « Dossier de documents » dans le panneau Traitement',r.cardInPanel],['fonctions présentes (docFolderCard/docGenAll/docApprove…)',r.hasFns],['non téléchargeable avant génération',r.dlOffInit],['génération → statut « À vérifier »',r.genThenWarn],['approbations remises à zéro à la génération',r.approvedZero],['approbation de tous → prêt à télécharger',r.dlOn],["régénération d'un doc → son approbation réinitialisée",r.regenResets],['ZIP construit (Blob non vide) au téléchargement',r.zipBuilt],['aucun pageerror',perr.length===0]];
let ok=0; checks.forEach(([n,c])=>{if(c)ok++;else console.log('✗ '+n);});
if(perr.length)console.log('pageerrors:',perr.slice(0,3).join(' | '));
console.log(`\nLAST dossier de documents : ${ok}/${checks.length} `+(ok===checks.length?'OK — tout vert':'ÉCHEC'));
process.exit(ok===checks.length?0:1);
