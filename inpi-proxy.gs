/**
 * AEM CONSEIL — Proxy Guichet unique des formalités (INPI)
 * -------------------------------------------------------------
 * Dépôt dématérialisé des formalités d'entreprise (création,
 * modification, cessation) auprès du Guichet unique géré par l'INPI.
 * Les identifiants API restent ICI, côté serveur.
 *
 * ⚠️ IMPORTANT : l'accès à l'API du Guichet unique nécessite une
 * habilitation INPI (compte + convention). Les URL et le schéma de
 * payload ci-dessous sont à adapter à votre habilitation et à la
 * documentation officielle en vigueur.
 *
 * INSTALLATION
 * 1. Ouvrez le script Apps Script déjà utilisé pour la boîte mail.
 * 2. Collez handleInpiDepot() / handleInpiStatus() ci-dessous.
 * 3. Routage :
 *      doPost(e): var b=JSON.parse(e.postData.contents||'{}');
 *                if(b.action==='inpi') return handleInpiDepot(e);
 *      doGet(e):  if(e.parameter.action==='inpi_status') return handleInpiStatus(e);
 * 4. Propriétés du script :
 *      SECRET_KEY   (= la clé secrète du client)
 *      INPI_USER, INPI_PASSWORD   (ou INPI_TOKEN si jeton fourni)
 *      INPI_BASE    (URL de base de l'API selon votre habilitation)
 * 5. Déployer une nouvelle version.
 *
 * Requête client (POST JSON) :
 *   { action:'inpi', key:'…', reference:'DOS-1', typeFormalite:'Création SAS',
 *     societe:{denomination,forme,siren,adresse,ville}, dirigeant:'…',
 *     pieces:[{code,libelle,fournie}], mandataire:{cabinet,siret} }
 * Réponse : { reference:'…', status:'déposé' }  ou { error:'…' }
 */
function handleInpiDepot(e) {
  var body = {};
  try { body = JSON.parse(e.postData.contents || '{}'); } catch (x) {}
  var P = PropertiesService.getScriptProperties();
  if ((body.key || '') !== P.getProperty('SECRET_KEY')) return json({ error: 'unauthorized' });

  var BASE = P.getProperty('INPI_BASE'); // ex. https://registre-national-entreprises.inpi.fr/api
  if (!BASE) return json({ error: 'inpi_base_manquant' });

  try {
    // 1) Authentification — récupérer un jeton (schéma à adapter à l'habilitation)
    var token = P.getProperty('INPI_TOKEN');
    if (!token) {
      var auth = UrlFetchApp.fetch(BASE + '/sso/login', {
        method: 'post', contentType: 'application/json', muteHttpExceptions: true,
        payload: JSON.stringify({ username: P.getProperty('INPI_USER'), password: P.getProperty('INPI_PASSWORD') })
      });
      if (auth.getResponseCode() >= 300) return json({ error: 'inpi_auth_' + auth.getResponseCode() });
      token = JSON.parse(auth.getContentText()).token;
    }

    // 2) Déposer la formalité (endpoint & schéma à adapter à la documentation INPI)
    var res = UrlFetchApp.fetch(BASE + '/formalites', {
      method: 'post', contentType: 'application/json', muteHttpExceptions: true,
      headers: { Authorization: 'Bearer ' + token },
      payload: JSON.stringify({
        reference: body.reference,
        typeFormalite: body.typeFormalite,
        societe: body.societe,
        dirigeant: body.dirigeant,
        pieces: body.pieces,
        mandataire: body.mandataire
      })
    });
    if (res.getResponseCode() >= 300) return json({ error: 'inpi_depot_' + res.getResponseCode() });
    var out = JSON.parse(res.getContentText());
    return json({ reference: out.id || out.reference || '', status: out.status || 'déposé' });
  } catch (err) {
    return json({ error: String(err) });
  }
}

function handleInpiStatus(e) {
  var P = PropertiesService.getScriptProperties();
  if ((e.parameter.key || '') !== P.getProperty('SECRET_KEY')) return json({ error: 'unauthorized' });
  var BASE = P.getProperty('INPI_BASE'), token = P.getProperty('INPI_TOKEN');
  try {
    var r = UrlFetchApp.fetch(BASE + '/formalites/' + e.parameter.id, {
      muteHttpExceptions: true, headers: { Authorization: 'Bearer ' + token }
    });
    return json(JSON.parse(r.getContentText()));
  } catch (err) { return json({ error: String(err) }); }
}

function json(o) { return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }
