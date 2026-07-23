/**
 * AEM CONSEIL — Proxy Signature QUALIFIÉE / AVANCÉE (Yousign)
 * -------------------------------------------------------------
 * Étape supérieure : signature à valeur probante renforcée (eIDAS
 * avancée / qualifiée) via un prestataire agréé — Yousign (France).
 * La clé API Yousign reste ICI, côté serveur.
 *
 * Ce proxy crée une "Signature Request", y attache un document PDF
 * (envoyé en base64 par le client), ajoute un signataire, active la
 * demande et renvoie l'URL de signature à ouvrir par le client.
 *
 * INSTALLATION
 * 1. Compte Yousign + clé API (https://yousign.com — API v3).
 * 2. Collez handleYousign() dans le script Apps Script de la boîte.
 * 3. doGet(e) : if (e.parameter.action === 'yousign_status') return handleYousignStatus(e);
 *    doPost(e): if ((JSON.parse(e.postData.contents||'{}')).action === 'yousign') return handleYousign(e);
 * 4. Propriétés du script : SECRET_KEY, YOUSIGN_KEY, YOUSIGN_BASE
 *      (YOUSIGN_BASE = 'https://api-sandbox.yousign.app/v3' en test,
 *                      'https://api.yousign.app/v3' en production)
 * 5. Déployer une nouvelle version.
 *
 * Requête client (POST JSON) :
 *   { action:'yousign', key:'…', filename:'contrat.pdf', pdfB64:'…',
 *     signerNom:'Jean', signerPrenom:'Dupont',
 *     signerEmail:'jean@ex.fr', signerTel:'+33…' }
 * Réponse : { signatureRequestId:'…', signerUrl:'https://…' }  ou { error:'…' }
 */
function handleYousign(e) {
  var body = {};
  try { body = JSON.parse(e.postData.contents || '{}'); } catch (x) {}
  var P = PropertiesService.getScriptProperties();
  if ((body.key || '') !== P.getProperty('SECRET_KEY')) return json({ error: 'unauthorized' });
  var API = P.getProperty('YOUSIGN_BASE') || 'https://api-sandbox.yousign.app/v3';
  var KEY = P.getProperty('YOUSIGN_KEY');
  var H = { Authorization: 'Bearer ' + KEY };
  try {
    // 1) Créer la demande de signature (niveau avancé)
    var sr = post(API + '/signature_requests', H, { name: 'Signature ' + (body.filename || 'document'), delivery_mode: 'none', timezone: 'Europe/Paris' });
    var srId = sr.id;
    // 2) Uploader le document
    var boundary = '----aem' + Date.now();
    var blob = Utilities.newBlob(Utilities.base64Decode(body.pdfB64 || ''), 'application/pdf', body.filename || 'document.pdf');
    var payload = Utilities.newBlob(
      '--' + boundary + '\r\nContent-Disposition: form-data; name="nature"\r\n\r\nsignable_document\r\n' +
      '--' + boundary + '\r\nContent-Disposition: form-data; name="file"; filename="' + (body.filename || 'doc.pdf') + '"\r\n' +
      'Content-Type: application/pdf\r\n\r\n').getBytes()
      .concat(blob.getBytes())
      .concat(Utilities.newBlob('\r\n--' + boundary + '--\r\n').getBytes());
    var docRes = UrlFetchApp.fetch(API + '/signature_requests/' + srId + '/documents', {
      method: 'post', muteHttpExceptions: true,
      headers: { Authorization: 'Bearer ' + KEY, 'Content-Type': 'multipart/form-data; boundary=' + boundary },
      payload: payload
    });
    var docId = JSON.parse(docRes.getContentText()).id;
    // 3) Ajouter le signataire (authentification par SMS = niveau avancé)
    var signer = post(API + '/signature_requests/' + srId + '/signers', H, {
      info: { first_name: body.signerPrenom || '', last_name: body.signerNom || '', email: body.signerEmail || '', phone_number: body.signerTel || '', locale: 'fr' },
      signature_level: 'electronic_signature',
      signature_authentication_mode: 'otp_sms',
      fields: [{ document_id: docId, type: 'signature', page: 1, x: 350, y: 700, width: 180, height: 80 }]
    });
    // 4) Activer la demande
    post(API + '/signature_requests/' + srId + '/activate', H, {});
    return json({ signatureRequestId: srId, signerId: signer.id, signerUrl: signer.signature_link || '' });
  } catch (err) { return json({ error: String(err) }); }
}

function handleYousignStatus(e) {
  var P = PropertiesService.getScriptProperties();
  if ((e.parameter.key || '') !== P.getProperty('SECRET_KEY')) return json({ error: 'unauthorized' });
  var API = P.getProperty('YOUSIGN_BASE') || 'https://api-sandbox.yousign.app/v3';
  var KEY = P.getProperty('YOUSIGN_KEY');
  var r = UrlFetchApp.fetch(API + '/signature_requests/' + e.parameter.id, {
    muteHttpExceptions: true, headers: { Authorization: 'Bearer ' + KEY }
  });
  return json(JSON.parse(r.getContentText()));
}

function post(url, headers, obj) {
  var r = UrlFetchApp.fetch(url, {
    method: 'post', contentType: 'application/json', muteHttpExceptions: true,
    headers: headers, payload: JSON.stringify(obj)
  });
  return JSON.parse(r.getContentText());
}
function json(o) { return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }
