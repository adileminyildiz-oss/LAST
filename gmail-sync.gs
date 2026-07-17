/**
 * LAST — Passerelle boîte mail (aemconseil.sas@gmail.com)
 *  - Lecture des mails (+ noms des pièces jointes)  -> demandes dans LAST
 *  - Envoi d'un mail                                 -> action=send
 *  - Récupération des fichiers joints d'un message   -> action=attachments&id=...
 * JSON + JSONP (?callback=) pour appel navigateur sans blocage CORS.
 */

var TOKEN = '0310132025080282';        // clé (identique à celle de LAST)
var QUERY = 'in:inbox newer_than:60d';
var MAX   = 120;

function doGet(e) {
  var p = (e && e.parameter) ? e.parameter : {};
  var payload;

  if (p.key !== TOKEN) {
    payload = { error: 'unauthorized' };

  } else if (p.action === 'send') {
    try {
      GmailApp.sendEmail(p.to, p.subject || '(sans objet)', p.body || '', { name: 'AEM CONSEIL' });
      payload = { sent: true };
    } catch (err) { payload = { error: String(err) }; }

  } else if (p.action === 'attachments') {
    // Renvoie les fichiers joints d'UN message (base64), à la demande
    try {
      var msg = GmailApp.getMessageById(p.id);
      var out = [];
      if (msg) {
        var A = msg.getAttachments();
        for (var i = 0; i < A.length; i++) {
          out.push({ name: A[i].getName(), type: A[i].getContentType(),
                     dataB64: Utilities.base64Encode(A[i].getBytes()) });
        }
      }
      payload = { attachments: out };
    } catch (err) { payload = { error: String(err) }; }

  } else {
    // Lecture des mails reçus (+ noms des pièces jointes)
    var mails = [];
    try {
      var threads = GmailApp.search(QUERY, 0, MAX);
      for (var t = 0; t < threads.length; t++) {
        var msgs = threads[t].getMessages();
        for (var j = 0; j < msgs.length; j++) {
          var m = msgs[j];
          var atts = [];
          try {
            var G = m.getAttachments();
            for (var k = 0; k < G.length; k++) atts.push({ name: G[k].getName(), size: G[k].getSize() });
          } catch (e2) {}
          mails.push({
            id: m.getId(), from: m.getFrom(), subject: m.getSubject(),
            date: m.getDate().toISOString(), body: (m.getPlainBody() || '').slice(0, 4000),
            att: atts
          });
        }
      }
      payload = { mails: mails, count: mails.length };
    } catch (err) { payload = { error: String(err) }; }
  }

  var json = JSON.stringify(payload);
  if (p.callback) {
    return ContentService.createTextOutput(p.callback + '(' + json + ')')
      .setMimeType(ContentService.MimeType.JAVASCRIPT);
  }
  return ContentService.createTextOutput(json).setMimeType(ContentService.MimeType.JSON);
}
