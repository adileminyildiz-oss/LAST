/**
 * AEM CONSEIL — Proxy SMS (Google Apps Script)
 * -------------------------------------------------------------
 * But : envoyer des SMS (code de vérification / OTP, notifications)
 * via un prestataire agréé SANS jamais exposer les clés dans le
 * navigateur. Le client LAST appelle ce script avec action=sms ;
 * la clé du prestataire reste ici, côté serveur.
 *
 * INSTALLATION
 * 1. Ouvrez le script Apps Script déjà utilisé pour la boîte mail
 *    (celui dont l'URL /exec est renseignée dans LAST → Configurer la boîte).
 * 2. Collez la fonction handleSms() ci-dessous.
 * 3. Dans doGet(e), ajoutez EN PREMIER le routage :
 *        if (e.parameter.action === 'sms') return handleSms(e);
 * 4. Fichier ▸ Paramètres du projet ▸ Propriétés du script :
 *        SECRET_KEY   = la même clé secrète que pour les mails
 *        SMS_PROVIDER = 'twilio' (défaut) ou 'brevo'
 *      Twilio : TWILIO_SID, TWILIO_TOKEN, TWILIO_FROM (n° +33… ou nom d'expéditeur)
 *      Brevo  : BREVO_KEY
 * 5. Déployer ▸ Gérer les déploiements ▸ Modifier ▸ Nouvelle version.
 *
 * Le client envoie : ?action=sms&key=…&to=+33…&text=…&from=AEM CONSEIL
 * Réponse JSON : {sent:true}  ou  {error:'...'}
 */
function handleSms(e) {
  var P = PropertiesService.getScriptProperties();
  if ((e.parameter.key || '') !== P.getProperty('SECRET_KEY')) {
    return json({ error: 'unauthorized' });
  }
  var to = (e.parameter.to || '').replace(/[^0-9+]/g, '');
  var text = e.parameter.text || '';
  var from = e.parameter.from || 'AEM CONSEIL';
  if (!to || !text) return json({ error: 'missing_params' });

  var provider = P.getProperty('SMS_PROVIDER') || 'twilio';
  try {
    if (provider === 'brevo') {
      var rb = UrlFetchApp.fetch('https://api.brevo.com/v3/transactionalSMS/sms', {
        method: 'post', contentType: 'application/json', muteHttpExceptions: true,
        headers: { 'api-key': P.getProperty('BREVO_KEY') },
        payload: JSON.stringify({ sender: from.substring(0, 11), recipient: to, content: text })
      });
      return json(rb.getResponseCode() < 300 ? { sent: true } : { error: 'brevo_' + rb.getResponseCode() });
    }
    // Défaut : Twilio
    var sid = P.getProperty('TWILIO_SID'), tok = P.getProperty('TWILIO_TOKEN');
    var rt = UrlFetchApp.fetch('https://api.twilio.com/2010-04-01/Accounts/' + sid + '/Messages.json', {
      method: 'post', muteHttpExceptions: true,
      headers: { Authorization: 'Basic ' + Utilities.base64Encode(sid + ':' + tok) },
      payload: { To: to, From: P.getProperty('TWILIO_FROM') || from, Body: text }
    });
    return json(rt.getResponseCode() < 300 ? { sent: true } : { error: 'twilio_' + rt.getResponseCode() });
  } catch (err) {
    return json({ error: String(err) });
  }
}

function json(o) {
  return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
}
