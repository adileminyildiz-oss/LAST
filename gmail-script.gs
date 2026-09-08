/**
 * MAR'Q — Passerelle AEM CONSEIL  ·  aemconseil.sas@gmail.com
 * Mail · Factures prestataires · Agenda · Prise de rendez-vous
 *
 * INSTALLATION — remplacez TOUT le contenu de votre fichier par celui-ci :
 *   1. Dans l'éditeur Apps Script, cliquez dans le code, faites Ctrl+A puis collez.
 *   2. Ctrl+S pour enregistrer.
 *   3. Déployer ▸ Gérer les déploiements ▸ ✏️ ▸ Version : « Nouvelle version » ▸ Déployer.
 *   4. À la première exécution, Google demande l'autorisation d'accéder à
 *      Gmail, Drive et Agenda : Paramètres avancés ▸ Accéder à … ▸ Autoriser.
 *
 * La clé ci-dessous doit rester identique à celle enregistrée dans Mar'q
 * (Paramètres ▸ Communication ▸ Boîte mail).
 */

var TOKEN = '__TOKEN__';
var QUERY = 'in:inbox newer_than:60d';
var MAX   = 120;

var FP_LABEL = 'marq-facture-importee';

/* Agenda & rendez-vous */
var CAL_ID     = 'primary';                 // agenda utilisé ('primary' = celui du compte)
var RDV_DUREE  = 45;                        // durée d'un rendez-vous, en minutes
var RDV_JOURS  = 12;                        // nombre de jours ouvrés proposés au client
var RDV_HEURES = [9, 10, 11, 14, 15, 16];   // heures proposées
var RDV_DELAI  = 1;                         // premier jour proposé : J+1
var CABINET    = 'AEM CONSEIL';

/* ==========================================================================
   ROUTAGE
   ========================================================================== */
function doGet(e) {
  var p = (e && e.parameter) ? e.parameter : {};

  /* Page publique de prise de rendez-vous : pas de clé, le jeton du lien fait foi */
  if (p.page === 'rdv') return rdvPage(p);

  var payload;

  if (p.key !== TOKEN) {
    payload = { error: 'unauthorized' };

  } else if (p.action === 'send') {
    try {
      GmailApp.sendEmail(p.to, p.subject || '(sans objet)', p.body || '', { name: CABINET });
      payload = { sent: true };
    } catch (err) { payload = { error: String(err) }; }

  } else if (p.action === 'factures')      { payload = fpFactures(e);
  } else if (p.action === 'facture_lue')   { payload = fpFactureLue(e);

  } else if (p.action === 'agenda_liste')  { payload = agListe(e);
  } else if (p.action === 'agenda_creer')  { payload = agCreer(e);
  } else if (p.action === 'agenda_suppr')  { payload = agSuppr(e);

  } else if (p.action === 'rdv_invite')    { payload = rdvInvite(e);
  } else if (p.action === 'rdv_liste')     { payload = rdvListe(e);
  } else if (p.action === 'rdv_accepter')  { payload = rdvAccepter(e);
  } else if (p.action === 'rdv_refuser')   { payload = rdvRefuser(e);
  } else if (p.action === 'rdv_purge')     { payload = rdvPurge(e);

  } else {
    /* Lecture des mails reçus → deviennent des demandes dans Mar'q */
    var mails = [];
    try {
      var threads = GmailApp.search(QUERY, 0, MAX);
      for (var t = 0; t < threads.length; t++) {
        var msgs = threads[t].getMessages();
        for (var i = 0; i < msgs.length; i++) {
          var m = msgs[i];
          mails.push({
            id: m.getId(), from: m.getFrom(), subject: m.getSubject(),
            date: m.getDate().toISOString(),
            body: (m.getPlainBody() || '').slice(0, 4000)
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

function auth(e) {
  var k = (e && e.parameter && e.parameter.key) || '';
  return !TOKEN || k === TOKEN;
}
function P() { return PropertiesService.getScriptProperties(); }
function cal() {
  try {
    if (CAL_ID && CAL_ID !== 'primary') {
      var c = CalendarApp.getCalendarById(CAL_ID);
      if (c) return c;
    }
  } catch (err) {}
  return CalendarApp.getDefaultCalendar();
}
function fmtD(d)  { return Utilities.formatDate(d, 'Europe/Paris', 'yyyy-MM-dd'); }
function fmtH(d)  { return Utilities.formatDate(d, 'Europe/Paris', 'HH:mm'); }
function fmtFR(d) { return Utilities.formatDate(d, 'Europe/Paris', 'dd/MM/yyyy'); }

/* ==========================================================================
   AGENDA
   ========================================================================== */
function agListe(e) {
  if (!auth(e)) return { error: 'unauthorized' };
  try {
    var j0 = Number(e.parameter.depuis || -7) || -7;
    var j1 = Number(e.parameter.jusqua || 60) || 60;
    var d0 = new Date(); d0.setDate(d0.getDate() + j0); d0.setHours(0, 0, 0, 0);
    var d1 = new Date(); d1.setDate(d1.getDate() + j1); d1.setHours(23, 59, 59, 0);

    var out = cal().getEvents(d0, d1).map(function (ev) {
      var invites = [];
      try { invites = ev.getGuestList().map(function (g) { return g.getEmail(); }); } catch (err) {}
      return {
        id      : ev.getId(),
        titre   : ev.getTitle(),
        date    : fmtD(ev.getStartTime()),
        heure   : ev.isAllDayEvent() ? '' : fmtH(ev.getStartTime()),
        fin     : ev.isAllDayEvent() ? '' : fmtH(ev.getEndTime()),
        lieu    : ev.getLocation() || '',
        notes   : (ev.getDescription() || '').slice(0, 1000),
        invites : invites
      };
    });
    return { evenements: out, agenda: cal().getName() };
  } catch (err) { return { error: String(err) }; }
}

function agCreer(e) {
  if (!auth(e)) return { error: 'unauthorized' };
  try {
    var p = e.parameter;
    var titre = p.titre || 'Rendez-vous';
    var date  = p.date  || fmtD(new Date());
    var h     = p.heure || '09:00';
    var duree = Number(p.duree || RDV_DUREE) || RDV_DUREE;
    var deb   = new Date(date + 'T' + h + ':00');
    var fin   = new Date(deb.getTime() + duree * 60000);
    var opt   = { description: p.notes || '', location: p.lieu || '' };
    var inv   = (p.invites || '').split(/[;,\s]+/).filter(function (x) { return x.indexOf('@') > 0; });
    if (inv.length) opt.guests = inv.join(','), opt.sendInvites = true;
    var ev = cal().createEvent(titre, deb, fin, opt);
    return { ok: true, id: ev.getId(), date: fmtD(deb), heure: fmtH(deb) };
  } catch (err) { return { error: String(err) }; }
}

function agSuppr(e) {
  if (!auth(e)) return { error: 'unauthorized' };
  try {
    var ev = cal().getEventById(e.parameter.id || '');
    if (!ev) return { error: 'introuvable' };
    ev.deleteEvent();
    return { ok: true };
  } catch (err) { return { error: String(err) }; }
}

/* ==========================================================================
   PRISE DE RENDEZ-VOUS
   ========================================================================== */
function rdvKey(t) { return 'RDV_' + t; }
function rdvGet(t) { try { return JSON.parse(P().getProperty(rdvKey(t)) || 'null'); } catch (err) { return null; } }
function rdvPut(o) { P().setProperty(rdvKey(o.token), JSON.stringify(o)); return o; }

/* Mar'q crée l'invitation et récupère le lien à envoyer au client */
function rdvInvite(e) {
  if (!auth(e)) return { error: 'unauthorized' };
  try {
    var p = e.parameter;
    var t = Utilities.getUuid().replace(/-/g, '').slice(0, 16);
    var o = {
      token   : t,
      dossier : p.dossier || '',
      nom     : p.nom     || '',
      email   : p.email   || '',
      objet   : p.objet   || 'Rendez-vous de démarrage du dossier',
      statut  : 'invite',
      creneau : '',
      cree    : new Date().toISOString()
    };
    rdvPut(o);
    return { ok: true, token: t, lien: ScriptApp.getService().getUrl() + '?page=rdv&t=' + t };
  } catch (err) { return { error: String(err) }; }
}

/* Créneaux réellement libres dans l'agenda */
function rdvCreneaux() {
  var c = cal(), out = [], d = new Date();
  d.setDate(d.getDate() + RDV_DELAI); d.setHours(0, 0, 0, 0);
  var jours = 0, garde = 0;
  while (jours < RDV_JOURS && garde++ < 40) {
    var dow = d.getDay();
    if (dow !== 0 && dow !== 6) {
      jours++;
      for (var i = 0; i < RDV_HEURES.length; i++) {
        var deb = new Date(d); deb.setHours(RDV_HEURES[i], 0, 0, 0);
        var fin = new Date(deb.getTime() + RDV_DUREE * 60000);
        if (deb < new Date()) continue;
        var occupe = false;
        try { occupe = c.getEvents(deb, fin).length > 0; } catch (err) {}
        if (!occupe) out.push({ iso: fmtD(deb) + 'T' + fmtH(deb), jour: fmtD(deb), heure: fmtH(deb) });
      }
    }
    d.setDate(d.getDate() + 1);
  }
  return out;
}

function rdvListe(e) {
  if (!auth(e)) return { error: 'unauthorized' };
  try {
    var all = P().getProperties(), out = [];
    Object.keys(all).forEach(function (k) {
      if (k.indexOf('RDV_') !== 0) return;
      try { out.push(JSON.parse(all[k])); } catch (err) {}
    });
    out.sort(function (a, b) { return (b.cree || '') < (a.cree || '') ? -1 : 1; });
    return { demandes: out, enAttente: out.filter(function (x) { return x.statut === 'propose'; }).length };
  } catch (err) { return { error: String(err) }; }
}

function rdvAccepter(e) {
  if (!auth(e)) return { error: 'unauthorized' };
  try {
    var o = rdvGet(e.parameter.t || '');
    if (!o) return { error: 'introuvable' };
    if (!o.creneau) return { error: 'aucun creneau choisi' };
    var deb = new Date(o.creneau.replace('T', ' ').replace(/-/g, '/') + ':00');
    var fin = new Date(deb.getTime() + RDV_DUREE * 60000);
    var opt = { description: (o.objet || '') + (o.dossier ? ('\nDossier : ' + o.dossier) : '') };
    if (o.email && o.email.indexOf('@') > 0) { opt.guests = o.email; opt.sendInvites = true; }
    var ev = cal().createEvent((o.nom || 'Client') + ' — ' + (o.objet || 'Rendez-vous'), deb, fin, opt);
    o.statut = 'accepte'; o.eventId = ev.getId(); o.accepte = new Date().toISOString();
    rdvPut(o);
    if (o.email && o.email.indexOf('@') > 0) {
      try {
        GmailApp.sendEmail(o.email, 'Rendez-vous confirmé — ' + CABINET,
          'Bonjour ' + (o.nom || '') + ',\n\n'
          + 'Votre rendez-vous est confirmé le ' + fmtFR(deb) + ' à ' + fmtH(deb) + '.\n'
          + 'Objet : ' + (o.objet || 'Rendez-vous') + '\n\n'
          + 'Une invitation a été ajoutée à votre agenda.\n\n' + CABINET,
          { name: CABINET });
      } catch (err) {}
    }
    return { ok: true, id: ev.getId(), date: fmtD(deb), heure: fmtH(deb) };
  } catch (err) { return { error: String(err) }; }
}

function rdvRefuser(e) {
  if (!auth(e)) return { error: 'unauthorized' };
  try {
    var o = rdvGet(e.parameter.t || '');
    if (!o) return { error: 'introuvable' };
    o.statut = 'invite'; o.creneau = ''; o.refuse = new Date().toISOString();
    rdvPut(o);
    if (o.email && o.email.indexOf('@') > 0) {
      try {
        GmailApp.sendEmail(o.email, 'Rendez-vous — nouveau créneau à choisir',
          'Bonjour ' + (o.nom || '') + ',\n\n'
          + 'Le créneau que vous aviez retenu ne peut pas être confirmé. '
          + 'Merci d\'en choisir un autre :\n'
          + ScriptApp.getService().getUrl() + '?page=rdv&t=' + o.token + '\n\n' + CABINET,
          { name: CABINET });
      } catch (err) {}
    }
    return { ok: true };
  } catch (err) { return { error: String(err) }; }
}

function rdvPurge(e) {
  if (!auth(e)) return { error: 'unauthorized' };
  try { P().deleteProperty(rdvKey(e.parameter.t || '')); return { ok: true }; }
  catch (err) { return { error: String(err) }; }
}

/* ---------- Page vue par le client ---------- */
function rdvHtml(titre, corps) {
  return HtmlService.createHtmlOutput(
    '<!doctype html><meta charset="utf-8">'
    + '<meta name="viewport" content="width=device-width,initial-scale=1">'
    + '<title>' + titre + '</title><style>'
    + 'body{margin:0;background:#0b0d11;color:#e9ecf2;font:15px/1.55 -apple-system,Segoe UI,Roboto,sans-serif}'
    + '.w{max-width:640px;margin:0 auto;padding:38px 20px 60px}'
    + '.b{font:600 11px/1 ui-monospace,monospace;letter-spacing:.16em;text-transform:uppercase;color:#7b8496}'
    + 'h1{font-size:25px;letter-spacing:-.02em;margin:12px 0 8px}'
    + 'p{color:#9aa3b2;margin:0 0 18px}'
    + '.d{font:600 12px/1 ui-monospace,monospace;letter-spacing:.06em;text-transform:uppercase;color:#8fb4ff;margin:22px 0 9px}'
    + '.g{display:grid;grid-template-columns:repeat(auto-fill,minmax(96px,1fr));gap:8px}'
    + 'a.c{display:block;text-align:center;padding:11px 6px;border:1px solid #253048;border-radius:9px;'
    + 'color:#e9ecf2;text-decoration:none;font-weight:600;background:#111621}'
    + 'a.c:hover{border-color:#4d8dff;background:#16203a}'
    + '.ok{border:1px solid #2c5c44;background:#12241b;border-radius:11px;padding:18px 20px}'
    + '.ok b{color:#6fe0a6}'
    + '.err{border:1px solid #5c2c2c;background:#241212;border-radius:11px;padding:18px 20px}'
    + '.f{margin-top:34px;padding-top:16px;border-top:1px solid #1c2432;color:#646c7c;font-size:12.5px}'
    + '</style><div class="w"><div class="b">' + CABINET + '</div>' + corps
    + '<div class="f">' + CABINET + ' — cette page vous a été envoyée par e-mail.</div></div>')
    .setTitle(titre)
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

function rdvPage(p) {
  var o = rdvGet(p.t || '');
  if (!o) return rdvHtml('Lien expiré',
    '<h1>Lien introuvable</h1><div class="err">Ce lien de prise de rendez-vous n\'est plus valable. '
    + 'Merci de nous contacter pour en recevoir un nouveau.</div>');

  /* le client vient de choisir un créneau */
  if (p.choix) {
    o.creneau = p.choix; o.statut = 'propose'; o.choisi = new Date().toISOString();
    rdvPut(o);
    var d = p.choix.split('T');
    try {
      GmailApp.sendEmail(Session.getEffectiveUser().getEmail(),
        'Demande de rendez-vous — ' + (o.nom || 'client'),
        (o.nom || 'Un client') + ' a choisi le ' + d[0] + ' à ' + d[1] + '.\n'
        + 'Dossier : ' + (o.dossier || '—') + '\n'
        + 'À accepter dans Mar\'q ▸ Agenda.', { name: CABINET });
    } catch (err) {}
    return rdvHtml('Demande enregistrée',
      '<h1>Merci, c\'est noté</h1><div class="ok">Votre demande pour le <b>' + d[0]
      + '</b> à <b>' + d[1] + '</b> a bien été transmise. Vous recevrez un e-mail de confirmation '
      + 'dès que le rendez-vous sera validé par le cabinet.</div>');
  }

  if (o.statut === 'accepte') {
    var c = (o.creneau || '').split('T');
    return rdvHtml('Rendez-vous confirmé',
      '<h1>Votre rendez-vous est confirmé</h1><div class="ok">Le <b>' + c[0] + '</b> à <b>' + c[1]
      + '</b>. Une invitation a été ajoutée à votre agenda.</div>');
  }

  var cre = rdvCreneaux();
  if (!cre.length) return rdvHtml('Aucun créneau',
    '<h1>Aucun créneau disponible</h1><div class="err">Tous les créneaux des prochains jours sont pris. '
    + 'Merci de nous contacter directement.</div>');

  var parJour = {}, ordre = [];
  cre.forEach(function (x) {
    if (!parJour[x.jour]) { parJour[x.jour] = []; ordre.push(x.jour); }
    parJour[x.jour].push(x);
  });

  var corps = '<h1>Choisissez votre rendez-vous</h1>'
    + '<p>' + (o.nom ? (o.nom + ', v') : 'V') + 'otre dossier est accepté. '
    + 'Sélectionnez le créneau qui vous convient — durée ' + RDV_DUREE + ' minutes.</p>';

  ordre.forEach(function (j) {
    var d = new Date(j + 'T12:00:00');
    var jn = ['Dimanche','Lundi','Mardi','Mercredi','Jeudi','Vendredi','Samedi'][d.getDay()];
    corps += '<div class="d">' + jn + ' ' + fmtFR(d) + '</div><div class="g">'
      + parJour[j].map(function (x) {
          return '<a class="c" href="?page=rdv&t=' + o.token + '&choix=' + x.iso + '">' + x.heure + '</a>';
        }).join('') + '</div>';
  });
  return rdvHtml('Prendre rendez-vous', corps);
}

/* ==========================================================================
   FACTURES PRESTATAIRES
   ========================================================================== */
function fpFactures(e) {
  if (!auth(e)) return { error: 'unauthorized' };
  var max   = Math.min(Number(e.parameter.max || 30) || 30, 100);
  var jours = Number(e.parameter.jours || 90) || 90;
  var q = P().getProperty('FP_QUERY') ||
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
          id: m.getId(), from: m.getFrom(), subject: m.getSubject(),
          date: fmtD(m.getDate()), attachment: att[0].getName(),
          link: fpArchive(att[0], m),
          numero: fpNumero(texte), ttc: fpMontant(texte), taux: fpTaux(texte)
        });
      });
    });
  } catch (err) { return { error: String(err) }; }
  return { factures: out, requete: q };
}

function fpFactureLue(e) {
  if (!auth(e)) return { error: 'unauthorized' };
  var id = e.parameter.id || '';
  if (!id) return { error: 'missing_id' };
  try {
    var lab = GmailApp.getUserLabelByName(FP_LABEL) || GmailApp.createLabel(FP_LABEL);
    GmailApp.getMessageById(id).getThread().addLabel(lab);
    return { ok: true, id: id };
  } catch (err) { return { error: String(err) }; }
}

function fpArchive(att, msg) {
  try {
    var nom = P().getProperty('FP_DRIVE_FOLDER') || 'AEM CONSEIL - Factures reçues';
    var it = DriveApp.getFoldersByName(nom);
    var dossier = it.hasNext() ? it.next() : DriveApp.createFolder(nom);
    var nomFichier = fmtD(msg.getDate()) + ' - ' + att.getName();
    var deja = dossier.getFilesByName(nomFichier);
    if (deja.hasNext()) return deja.next().getUrl();
    return dossier.createFile(att.copyBlob().setName(nomFichier)).getUrl();
  } catch (err) {
    return 'https://mail.google.com/mail/u/0/#all/' + msg.getId();
  }
}

var FP_STOP = /^(pour|votre|vos|notre|nos|du|de|des|la|le|les|et|est|en|au|aux|sur|par|avec|sans|dans|ref|no|num|numero|date|datee|client|total|montant|euro|euros|eur|tva|ht|ttc)$/i;

function fpNumero(t) {
  t = String(t || '');
  var cands = [], m, re;
  re = /(?:factures?|invoice)\s*(?:n\s*[°o]?\s*)?[:#]?\s*([A-Za-z0-9][A-Za-z0-9\-\/\.]{2,24})/gi;
  while ((m = re.exec(t)) !== null) cands.push(m[1]);
  re = /\bn\s*[°o]\s*[:#]?\s*([A-Za-z0-9][A-Za-z0-9\-\/\.]{2,24})/gi;
  while ((m = re.exec(t)) !== null) cands.push(m[1]);
  re = /\b([A-Z]{1,4}[-\/][A-Z0-9]{1,4}[-\/][0-9]{3,}[-\/0-9A-Z]*|[A-Z]{2,4}[0-9]{2,}[-\/][0-9]{3,}|[0-9]{8,})\b/g;
  while ((m = re.exec(t)) !== null) cands.push(m[1]);
  for (var i = 0; i < cands.length; i++) {
    var c = String(cands[i]).replace(/[.,;:]$/, '');
    if (c.length < 3) continue;
    if (FP_STOP.test(c)) continue;
    if (!/[0-9]/.test(c)) continue;
    return c;
  }
  return '';
}

function fpMontant(t) {
  var best = 0, m;
  var re = /(?:total\s*ttc|montant\s*ttc|net\s+[àa]\s+payer|total\s+[àa]\s+payer|total\s+g[ée]n[ée]ral|ttc)\s*[:\s]*([0-9][0-9\s., ]{0,14})\s*(?:€|eur)/gi;
  while ((m = re.exec(t)) !== null) { var v = fpNum(m[1]); if (v > best) best = v; }
  if (!best) {
    var re2 = /([0-9][0-9\s., ]{0,14})\s*(?:€|EUR)\b/g;
    while ((m = re2.exec(t)) !== null) { var v2 = fpNum(m[1]); if (v2 > best) best = v2; }
  }
  return best ? best.toFixed(2) : '';
}

function fpTaux(t) {
  var m = t.match(/tva\s*(?:\(?\s*)?([0-9]{1,2}(?:[.,][0-9])?)\s*%/i)
       || t.match(/([0-9]{1,2}(?:[.,][0-9])?)\s*%\s*(?:de\s*)?tva/i);
  return m ? m[1].replace(',', '.') : '20';
}

function fpNum(s) {
  s = String(s).replace(/[\s ]/g, '');
  if (/,\d{1,2}$/.test(s))       s = s.replace(/\./g, '').replace(',', '.');
  else if (/\.\d{1,2}$/.test(s)) s = s.replace(/,/g, '');
  else                           s = s.replace(/[.,]/g, '');
  var n = parseFloat(s);
  return isNaN(n) ? 0 : n;
}

/* ==========================================================================
   TESTS depuis l'éditeur (Exécuter ▸ choisir la fonction)
   ========================================================================== */
function testFactures() { Logger.log(JSON.stringify(fpFactures({ parameter: { key: TOKEN, max: 5 } }), null, 2)); }
function testAgenda()   { Logger.log(JSON.stringify(agListe({ parameter: { key: TOKEN } }), null, 2)); }
function testCreneaux() { Logger.log(JSON.stringify(rdvCreneaux().slice(0, 12), null, 2)); }
function testLienRdv()  {
  Logger.log(JSON.stringify(rdvInvite({ parameter: {
    key: TOKEN, nom: 'Client test', email: '', dossier: 'DOS-2026-001' } }), null, 2));
}
