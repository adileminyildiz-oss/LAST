/**
 * LAST — Passerelle « boîte mail → demandes »
 * Compte : aemconseil.sas@gmail.com
 *
 * Expose en JSON (et JSONP) les mails reçus, pour que LAST (last.aemconseil.eu)
 * les récupère AUTOMATIQUEMENT et les transforme en demandes.
 * Le JSONP (paramètre ?callback=) permet l'appel depuis le navigateur sans blocage CORS.
 */

// 1) Clé secrète partagée avec LAST (à recopier dans LAST > Configurer la boîte > Clé secrète).
var TOKEN = 'REMPLACE-PAR-UNE-CLE-SECRETE-LONGUE';

// 2) Filtre Gmail des mails à transmettre.
//    Tout l'inbox récent : 'in:inbox newer_than:60d'
//    Un expéditeur précis : 'in:inbox from:formulaire@aemconseil.eu newer_than:60d'
//    Un libellé "Site"     : 'label:Site newer_than:90d'
var QUERY = 'in:inbox newer_than:60d';

// 3) Nombre maximum de fils lus par appel.
var MAX = 120;

function doGet(e) {
  var p = (e && e.parameter) ? e.parameter : {};
  var payload;
  if (p.key !== TOKEN) {
    payload = { error: 'unauthorized' };
  } else {
    var mails = [];
    try {
      var threads = GmailApp.search(QUERY, 0, MAX);
      for (var t = 0; t < threads.length; t++) {
        var msgs = threads[t].getMessages();
        for (var i = 0; i < msgs.length; i++) {
          var m = msgs[i];
          mails.push({
            id: m.getId(),
            from: m.getFrom(),
            subject: m.getSubject(),
            date: m.getDate().toISOString(),
            body: (m.getPlainBody() || '').slice(0, 4000)
          });
        }
      }
      payload = { mails: mails, count: mails.length };
    } catch (err) {
      payload = { error: String(err) };
    }
  }
  var json = JSON.stringify(payload);
  // JSONP si un callback est demandé (appel depuis LAST) — sinon JSON simple.
  if (p.callback) {
    return ContentService.createTextOutput(p.callback + '(' + json + ')')
      .setMimeType(ContentService.MimeType.JAVASCRIPT);
  }
  return ContentService.createTextOutput(json)
    .setMimeType(ContentService.MimeType.JSON);
}

/**
 * ── INSTALLATION / MISE À JOUR ───────────────────────────────────────────
 * 1. Connecte-toi UNIQUEMENT à aemconseil.sas@gmail.com (fenêtre InPrivate conseillée).
 * 2. script.google.com → ouvre ton projet (ou Nouveau projet) → colle ce fichier.
 * 3. Remplace TOKEN par ta clé secrète. Ajuste QUERY si besoin.
 * 4. Déployer :
 *    - 1re fois : « Nouveau déploiement » → Application Web →
 *        Exécuter en tant que : Moi · Qui a accès : « Tout le monde » → Déployer.
 *    - Mise à jour (garde la MÊME URL) : « Gérer les déploiements » → ✏️ (modifier)
 *        → Version : « Nouvelle version » → Déployer.
 * 5. Dans LAST → Demandes → « ⚙ Configurer la boîte » : colle l'URL …/exec + le TOKEN,
 *    puis « 💾 Enregistrer & synchroniser ». C'est tout — la synchro est ensuite automatique.
 * ────────────────────────────────────────────────────────────────────────
 */
