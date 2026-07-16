/**
 * LAST — Passerelle « boîte mail » (aemconseil.sas@gmail.com)
 *  - Lecture des mails reçus  -> deviennent des demandes dans LAST
 *  - Envoi d'un mail (questionnaire, réponse) directement depuis la boîte
 * JSON + JSONP (?callback=) pour appel navigateur sans blocage CORS.
 */

var TOKEN = 'REMPLACE-PAR-UNE-CLE-SECRETE-LONGUE';   // clé partagée avec LAST
var QUERY = 'in:inbox newer_than:60d';                // filtre des mails reçus
var MAX   = 120;

function doGet(e) {
  var p = (e && e.parameter) ? e.parameter : {};
  var payload;

  if (p.key !== TOKEN) {
    payload = { error: 'unauthorized' };

  } else if (p.action === 'send') {
    // Envoi d'un mail depuis aemconseil.sas@gmail.com
    try {
      GmailApp.sendEmail(p.to, p.subject || '(sans objet)', p.body || '', { name: 'AEM CONSEIL' });
      payload = { sent: true };
    } catch (err) {
      payload = { error: String(err) };
    }

  } else {
    // Lecture des mails reçus
    var mails = [];
    try {
      var threads = GmailApp.search(QUERY, 0, MAX);
      for (var t = 0; t < threads.length; t++) {
        var msgs = threads[t].getMessages();
        for (var i = 0; i < msgs.length; i++) {
          var m = msgs[i];
          mails.push({
            id: m.getId(), from: m.getFrom(), subject: m.getSubject(),
            date: m.getDate().toISOString(), body: (m.getPlainBody() || '').slice(0, 4000)
          });
        }
      }
      payload = { mails: mails, count: mails.length };
    } catch (err) {
      payload = { error: String(err) };
    }
  }

  var json = JSON.stringify(payload);
  if (p.callback) {
    return ContentService.createTextOutput(p.callback + '(' + json + ')')
      .setMimeType(ContentService.MimeType.JAVASCRIPT);
  }
  return ContentService.createTextOutput(json).setMimeType(ContentService.MimeType.JSON);
}

/**
 * MISE À JOUR :
 * 1. Colle ce code (remplace l'ancien), garde ton TOKEN.
 * 2. Enregistre (Ctrl+S).
 * 3. Déployer -> Gérer les déploiements -> ✏️ -> Version : « Nouvelle version » -> Déployer.
 *    (Google redemandera l'autorisation car le script ENVOIE maintenant des mails :
 *     Avancé -> Accéder au projet -> Autoriser.)
 * L'URL ne change pas : rien à modifier dans LAST.
 */
