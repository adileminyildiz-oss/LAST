/* ============================================================================
   AEM CONSEIL — Mar'q · action « factures »
   Repère les factures reçues sur aemconseil.sas@gmail.com et les renvoie à Mar'q.

   À COLLER dans le MÊME script Google Apps Script que la boîte mail
   (celui dont l'URL est renseignée dans Mar'q → Demandes → ⚙ Configurer la boîte).

   ── INSTALLATION ────────────────────────────────────────────────────────────
   1. Ouvrez le script, collez TOUT ce fichier à la fin.
   2. Dans doGet(e), ajoutez les 2 lignes de routage (voir ci-dessous).
   3. Paramètres du projet ▸ Propriétés du script :
        SECRET_KEY       = la clé secrète saisie dans Mar'q   (obligatoire)
        FP_DRIVE_FOLDER  = nom du dossier Drive d'archivage   (facultatif)
                           défaut : "AEM CONSEIL - Factures reçues"
        FP_QUERY         = requête Gmail personnalisée        (facultatif)
   4. Déployer ▸ Gérer les déploiements ▸ ✏️ Modifier
        ▸ Version : « Nouvelle version » ▸ Déployer.
        (sans ce redéploiement, Mar'q continue d'appeler l'ancienne version)
   5. Dans Mar'q : Factures prestataires ▸ « ↻ Relever la boîte ».

   ── ROUTAGE : À L'INTÉRIEUR de doGet(e), JAMAIS APRÈS SON ACCOLADE ! ────────

   ⚠️  Coller les branches HORS de doGet provoque :
       « SyntaxError: Illegal return statement »

   ▸ CAS A — votre doGet construit une variable `payload` puis la sérialise
     à la fin (c'est le cas du script de la boîte AEM CONSEIL).
     Ajoutez ces 2 branches dans la chaîne if / else if,
     JUSTE AVANT le `} else {` qui lit les mails :

         } else if (p.action === 'factures') {
           payload = fpFactures(e);

         } else if (p.action === 'facture_lue') {
           payload = fpFactureLue(e);

         } else {
           // ... lecture des mails (code existant, ne pas toucher)

     Rien d'autre à faire : la fin de votre doGet gère déjà le JSON et le
     JSONP (p.callback). La fonction fpReply ci-dessous n'est alors pas
     utilisée — vous pouvez la laisser, elle ne gêne pas.

   ▸ CAS B — votre doGet fait directement des `return`.
     Ajoutez ces 2 lignes tout au DÉBUT du corps de doGet(e) :

         if (e.parameter.action === 'factures')    return fpReply(e, fpFactures(e));
         if (e.parameter.action === 'facture_lue') return fpReply(e, fpFactureLue(e));
   ============================================================================ */

var FP_LABEL = 'marq-facture-importee';

/* Réponse JSON — supporte le repli JSONP utilisé par Mar'q (&callback=…). */
function fpReply(e, obj) {
  var s = JSON.stringify(obj);
  var cb = (e && e.parameter && e.parameter.callback) || '';
  if (cb) {
    return ContentService.createTextOutput(cb + '(' + s + ')')
      .setMimeType(ContentService.MimeType.JAVASCRIPT);
  }
  return ContentService.createTextOutput(s)
    .setMimeType(ContentService.MimeType.JSON);
}

/* ---------------------------------------------------------------------------
   ACTION PRINCIPALE : liste les mails de facture avec pièce jointe.
   --------------------------------------------------------------------------- */
function fpFactures(e) {
  var P = PropertiesService.getScriptProperties();
  if ((e.parameter.key || '') !== P.getProperty('SECRET_KEY')) {
    return { error: 'unauthorized' };
  }

  var max   = Math.min(Number(e.parameter.max || 30) || 30, 100);
  var jours = Number(e.parameter.jours || 90) || 90;

  /* in:anywhere → attrape aussi Spam et Promotions (les factures y tombent souvent).
     -label:… → ne resert pas ce qui a déjà été importé dans Mar'q. */
  var q = P.getProperty('FP_QUERY') ||
      ('in:anywhere -in:trash has:attachment newer_than:' + jours + 'd ' +
       '(facture OR factures OR invoice OR "note d\'honoraires" OR "avis d\'échéance" OR "votre relevé") ' +
       '-label:' + FP_LABEL);

  var out = [];
  try {
    GmailApp.search(q, 0, max).forEach(function (th) {
      th.getMessages().forEach(function (m) {
        var att = m.getAttachments().filter(function (a) {
          return /pdf|image\/(jpe?g|png)/i.test(a.getContentType());
        });
        if (!att.length) return;

        var corps = '';
        try { corps = m.getPlainBody().substring(0, 4000); } catch (err) { corps = ''; }
        var texte = m.getSubject() + '\n' + corps;

        out.push({
          id         : m.getId(),
          from       : m.getFrom(),
          subject    : m.getSubject(),
          date       : Utilities.formatDate(m.getDate(), 'Europe/Paris', 'yyyy-MM-dd'),
          attachment : att[0].getName(),
          link       : fpArchive(att[0], m),
          numero     : fpNumero(texte),
          ttc        : fpMontant(texte),
          taux       : fpTaux(texte)
        });
      });
    });
  } catch (err) {
    return { error: String(err) };
  }
  return { factures: out, requete: q };
}

/* ---------------------------------------------------------------------------
   Marque un message comme importé (il ne remontera plus dans la relève).
   Appelé par Mar'q : action=facture_lue&id=<messageId>
   --------------------------------------------------------------------------- */
function fpFactureLue(e) {
  var P = PropertiesService.getScriptProperties();
  if ((e.parameter.key || '') !== P.getProperty('SECRET_KEY')) {
    return { error: 'unauthorized' };
  }
  var id = e.parameter.id || '';
  if (!id) return { error: 'missing_id' };
  try {
    var lab = GmailApp.getUserLabelByName(FP_LABEL) || GmailApp.createLabel(FP_LABEL);
    GmailApp.getMessageById(id).getThread().addLabel(lab);
    return { ok: true, id: id };
  } catch (err) {
    return { error: String(err) };
  }
}

/* ---------------------------------------------------------------------------
   Archivage Drive de la pièce jointe → renvoie un lien consultable.
   Si l'archivage échoue, on renvoie le permalien Gmail du message.
   --------------------------------------------------------------------------- */
function fpArchive(att, msg) {
  try {
    var P = PropertiesService.getScriptProperties();
    var nom = P.getProperty('FP_DRIVE_FOLDER') || 'AEM CONSEIL - Factures reçues';
    var it = DriveApp.getFoldersByName(nom);
    var dossier = it.hasNext() ? it.next() : DriveApp.createFolder(nom);

    /* évite de recréer le même fichier à chaque relève */
    var nomFichier = Utilities.formatDate(msg.getDate(), 'Europe/Paris', 'yyyy-MM-dd')
                   + ' - ' + att.getName();
    var deja = dossier.getFilesByName(nomFichier);
    if (deja.hasNext()) return deja.next().getUrl();

    var f = dossier.createFile(att.copyBlob().setName(nomFichier));
    return f.getUrl();
  } catch (err) {
    return 'https://mail.google.com/mail/u/0/#all/' + msg.getId();
  }
}

/* ---------------------------------------------------------------------------
   Extractions (pré-remplissage dans Mar'q — toujours vérifiable à l'écran).
   --------------------------------------------------------------------------- */
function fpNumero(t) {
  var m = t.match(/(?:facture|invoice)\s*(?:n\s*[°o]?)?\s*[:#]?\s*([A-Z0-9][A-Z0-9\-\/\.]{2,24})/i)
       || t.match(/\bn\s*[°o]\s*[:#]?\s*([A-Z0-9][A-Z0-9\-\/\.]{2,24})/i);
  return m ? m[1].replace(/[.,;]$/, '') : '';
}

function fpMontant(t) {
  /* privilégie un montant explicitement TTC / total / net à payer */
  var best = 0;
  var re = /(?:total\s*ttc|montant\s*ttc|net\s+[àa]\s+payer|total\s+[àa]\s+payer|total\s+g[ée]n[ée]ral|ttc)\s*[:\s]*([0-9][0-9\s., ]{0,14})\s*(?:€|eur)/gi;
  var m;
  while ((m = re.exec(t)) !== null) {
    var v = fpNum(m[1]);
    if (v > best) best = v;
  }
  if (!best) {
    /* repli : le plus gros montant en euros du message */
    var re2 = /([0-9][0-9\s., ]{0,14})\s*(?:€|EUR)\b/g;
    while ((m = re2.exec(t)) !== null) {
      var v2 = fpNum(m[1]);
      if (v2 > best) best = v2;
    }
  }
  return best ? best.toFixed(2) : '';
}

function fpTaux(t) {
  var m = t.match(/tva\s*(?:\(?\s*)?([0-9]{1,2}(?:[.,][0-9])?)\s*%/i)
       || t.match(/([0-9]{1,2}(?:[.,][0-9])?)\s*%\s*(?:de\s*)?tva/i);
  return m ? m[1].replace(',', '.') : '20';
}

function fpNum(s) {
  s = String(s).replace(/[\s ]/g, '');
  /* 1.234,56 → 1234.56   |   1,234.56 → 1234.56 */
  if (/,\d{1,2}$/.test(s))      s = s.replace(/\./g, '').replace(',', '.');
  else if (/\.\d{1,2}$/.test(s)) s = s.replace(/,/g, '');
  else                           s = s.replace(/[.,]/g, '');
  var n = parseFloat(s);
  return isNaN(n) ? 0 : n;
}

/* ---------------------------------------------------------------------------
   Test manuel depuis l'éditeur Apps Script (Exécuter ▸ fpTest).
   Affiche dans les journaux ce que Mar'q recevra.
   --------------------------------------------------------------------------- */
function fpTest() {
  var P = PropertiesService.getScriptProperties();
  var r = fpFactures({ parameter: { key: P.getProperty('SECRET_KEY'), max: 5 } });
  Logger.log(JSON.stringify(r, null, 2));
}
