/**
 * LAST — dossier de domiciliation : générateurs + assemblage + carte.
 *   node tests/domiciliation.mjs
 */
import path from 'path'; import { pathToFileURL } from 'url';
async function loadChromium(){const c=[process.env.PLAYWRIGHT_PKG,'playwright','/opt/node22/lib/node_modules/playwright/index.js'].filter(Boolean);for(const x of c){try{const s=x.endsWith('.js')?pathToFileURL(x).href:x;const m=await import(s);const ch=m.chromium||(m.default&&m.default.chromium);if(ch)return ch;}catch(_){}}throw new Error('Playwright introuvable');}
const results=[];const check=(n,c)=>results.push({n,ok:!!c});
const chromium=await loadChromium();
const url=pathToFileURL(path.resolve('index.html')).href;
const browser=await chromium.launch();
const page=await browser.newPage({viewport:{width:1280,height:1000}});
const perr=[];page.on('pageerror',e=>{const s=''+e;if(!/ServiceWorker/.test(s))perr.push(s);});
await page.addInitScript(()=>{try{localStorage.setItem('last-gate-ok','1');}catch(e){}});
await page.goto(url,{waitUntil:'networkidle'});await page.waitForTimeout(300);
const r=await page.evaluate(()=>{
  const out={};
  const d=(DB.dossiers&&DB.dossiers.filter(x=>!x.archived)[0]);
  out.hasFns=['contratDomiciliationHTML','attestationDomiciliationHTML','dossierDomiciliationHTML','domicilCard','domicilEtablir'].every(f=>typeof window[f]==='function');
  d.domicil={type:'societe',domiciliataire:'DOMICILIATION PARIS',agrement:'75-2021-42',adrDom:'10 rue de la Paix',cpDom:'75002',villeDom:'PARIS',representant:'M. Berger',duree:'3 mois',redevance:'30',dateDebut:'2026-09-01'};
  const contrat=window.contratDomiciliationHTML(d);
  out.contrat=/CONTRAT DE DOMICILIATION/.test(contrat)&&/DOMICILIATION PARIS/.test(contrat)&&/10 rue de la Paix/.test(contrat)&&/75-2021-42/.test(contrat)&&/Article 3 — Durée/.test(contrat);
  const att=window.attestationDomiciliationHTML(d);
  out.att=/ATTESTATION DE DOMICILIATION/.test(att)&&/atteste/.test(att)&&/DOMICILIATION PARIS/.test(att);
  const doss=window.dossierDomiciliationHTML(d);
  out.doss=/DOSSIER DE DOMICILIATION/.test(doss)&&/CONTRAT DE DOMICILIATION/.test(doss)&&/ATTESTATION DE DOMICILIATION/.test(doss)&&/30 € \/ mois/.test(doss);
  // type domicile → utilise la déclaration au domicile
  d.domicil.type='domicile';
  const doss2=window.dossierDomiciliationHTML(d);
  out.dossDomicile=/DÉCLARATION SUR L/.test(doss2)&&!/ATTESTATION DE DOMICILIATION/.test(doss2);
  d.domicil.type='societe';
  // enregistrement moteur de docs
  out.registered=typeof ESP_DOCS!=='undefined'&&ESP_DOCS.some(x=>x.k==='contratdomicil')&&ESP_DOCS.some(x=>x.k==='attestdomicil')&&!!(window.DOC_MODELS&&window.DOC_MODELS.contratdomicil);
  // carte + établir
  out.card=/dom-card/.test(window.domicilCard(d))&&/Établir le dossier de domiciliation/.test(window.domicilCard(d));
  window.domicilEtablir(d.id);out.done=!!(d.domicil&&d.domicil.done);
  // Éditions : groupe Domiciliation + génération du contrat
  try{ state.page='editions'; if(state.edOpenType!==undefined)state.edOpenType=''; render();
    var ev=document.getElementById('view').innerHTML;
    out.edGroup=/Domiciliation/.test(ev)&&/Contrat de domiciliation/.test(ev)&&/Attestation de domiciliation/.test(ev)&&/Déclaration de domiciliation/.test(ev);
    edLibNew('contratdomicil');
  }catch(e){out.edGroup='ERR:'+e;}
  return out;
});
await page.waitForTimeout(250);
const r2=await page.evaluate(()=>({edContrat:/CONTRAT DE DOMICILIATION/.test(document.getElementById('view').innerHTML)}));
r.edContrat=r2.edContrat;
await browser.close();
check('générateurs présents',r.hasFns);
check('contrat de domiciliation généré (parties, locaux, agrément, articles)',r.contrat);
check('attestation de domiciliation générée',r.att);
check('dossier assemblé (recap + contrat + attestation + redevance)',r.doss);
check('type « domicile » → déclaration au domicile (pas d’attestation société)',r.dossDomicile);
check('documents enregistrés dans le moteur (ESP_DOCS + DOC_MODELS)',r.registered);
check('carte « Domiciliation du siège » + bouton établir',r.card);
check('« Établir » marque le dossier',r.done);
check('Éditions : groupe Domiciliation (contrat + attestation + déclaration)',r.edGroup===true);
check('Éditions : ouverture du contrat de domiciliation',r.edContrat===true);
check('aucun pageerror',perr.length===0);
const ok=results.filter(x=>x.ok).length,tot=results.length;
results.forEach(x=>{if(!x.ok)console.log('✗ '+x.n);});
if(perr.length)console.log('pageerrors:',perr.slice(0,4).join(' | '));
console.log(`\nLAST dossier de domiciliation : ${ok}/${tot} `+(ok===tot?'OK — tout vert':'ÉCHEC'));
process.exit(ok===tot?0:1);
