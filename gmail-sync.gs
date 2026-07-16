/**
 * LAST — Passerelle « boîte mail → demandes »
 * Compte : aemconseil.sas@gmail.com
 *
 * Ce script expose en JSON les mails reçus, pour que le site LAST
 * (last.aemconseil.eu) les récupère automatiquement et les transforme en demandes.
 *
 * Voir la méthode d'installation en bas de ce fichier.
 */

// 1) Mot de passe partagé avec LAST (à recopier dans LAST > Importer les mails > Clé secrète).
//    Choisis une longue chaîne aléatoire. NE PAS la publier ailleurs.
var TOKEN = 'REMPLACE-PAR-UNE-CLE-SECRETE-LONGUE';

// 2) Filtre Gmail des mails à transmettre.
//    - Tout l'inbox récent :            'in:inbox newer_than:60d'
//    - Seulement le formulaire du site : 'in:inbox from:formulaire@aemconseil.eu newer_than:60d'
//    - Seulement un libellé "Site" :     'label:Site newer_than:90d'
var QUERY = 'in:inbox newer_than:60d';

// 3) Nombre maximum de fils de discussion lus par appel.
var MAX = 120;

function doGet(e) {
  var out = ContentService.createTextOutput().setMimeType(ContentService.MimeType.JSON);
  if (!e || !e.parameter || e.parameter.key !== TOKEN) {
    return out.setContent(JSON.stringify({ error: 'unauthorized' }));
  }
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
  } catch (err) {
    return out.setContent(JSON.stringify({ error: String(err) }));
  }
  return out.setContent(JSON.stringify({ mails: mails, count: mails.length }));
}

/**
 * ── MÉTHODE D'INSTALLATION ──────────────────────────────────────────────
 * 1. Connecte-toi à la boîte  aemconseil.sas@gmail.com  (c'est important : le
 *    script lit les mails du compte qui l'exécute).
 * 2. Va sur  https://script.google.com  → « Nouveau projet ».
 * 3. Colle tout ce fichier dans l'éditeur (remplace le contenu par défaut).
 * 4. Remplace la valeur de TOKEN par une clé secrète longue (ex. 32 caractères).
 *    Ajuste QUERY si tu veux filtrer (voir commentaires ci-dessus).
 * 5. Clique « Déployer » → « Nouveau déploiement » → type « Application Web » :
 *       • Description  : LAST sync mails
 *       • Exécuter en tant que : Moi (aemconseil.sas@gmail.com)
 *       • Qui a accès  : « Tout le monde »   (la clé TOKEN protège l'accès)
 *    → « Déployer ». Autorise les accès Gmail quand Google le demande
 *      (Avancé → Accéder au projet … → Autoriser).
 * 6. Copie l'URL fournie (elle finit par …/exec).
 * 7. Dans LAST → onglet « Demandes » → bouton « 📥 Importer les mails » :
 *       • colle l'URL dans « URL du script »
 *       • colle le TOKEN dans « Clé secrète »
 *       • clique « 💾 Enregistrer & synchroniser ».
 *    → À partir de là, LAST récupère les nouveaux mails à l'ouverture,
 *      toutes les 3 minutes, et via le bouton « 🔄 Synchroniser la boîte ».
 *      Les mails déjà traités ne sont jamais réimportés (dédoublonnage par ID).
 *
 * (Facultatif) Pour un ajout instantané : dans script.google.com → « Déclencheurs »
 * → aucun n'est nécessaire ici, car c'est LAST qui interroge le script.
 * ────────────────────────────────────────────────────────────────────────
 */
