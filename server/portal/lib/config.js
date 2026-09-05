'use strict';
/*
 * config.js — Lecture de la configuration du serveur portail.
 * Charge les variables d'environnement (avec un mini-parseur .env, pour ne
 * dépendre d'aucun paquet externe comme dotenv), applique des valeurs par
 * défaut raisonnables et valide les secrets indispensables en production.
 */
const fs = require('fs');
const path = require('path');

/* Mini-chargeur de fichier .env (KEY=VALEUR par ligne, # = commentaire).
 * Ne surcharge jamais une variable déjà présente dans process.env. */
function chargerDotEnv(fichier) {
  try {
    if (!fs.existsSync(fichier)) return;
    const contenu = fs.readFileSync(fichier, 'utf8');
    contenu.split(/\r?\n/).forEach(function (ligne) {
      const l = ligne.trim();
      if (!l || l[0] === '#') return;
      const i = l.indexOf('=');
      if (i < 0) return;
      const cle = l.slice(0, i).trim();
      let val = l.slice(i + 1).trim();
      // Retire d'éventuels guillemets entourant la valeur.
      if ((val[0] === '"' && val.slice(-1) === '"') || (val[0] === "'" && val.slice(-1) === "'")) {
        val = val.slice(1, -1);
      }
      if (cle && !(cle in process.env)) process.env[cle] = val;
    });
  } catch (e) {
    /* .env optionnel : on ignore les erreurs de lecture. */
  }
}

// Charge le .env situé à la racine de server/portal (un niveau au-dessus de lib/).
chargerDotEnv(path.join(__dirname, '..', '.env'));

const config = {
  // Port d'écoute HTTP.
  PORT: parseInt(process.env.PORT || '8787', 10),

  // Secret partagé du cabinet : requis pour appeler les endpoints /admin/*.
  CABINET_TOKEN: process.env.CABINET_TOKEN || '',

  // Secret de signature des jetons de session client (HMAC-SHA256).
  JWT_SECRET: process.env.JWT_SECRET || '',

  // Origine(s) autorisée(s) pour le CORS. Liste séparée par des virgules.
  // Exemple : "https://last.aemconseil.eu". "*" autorise toutes les origines
  // (à réserver au développement).
  ALLOWED_ORIGIN: (process.env.ALLOWED_ORIGIN || 'http://localhost:8787')
    .split(',')
    .map(function (s) { return s.trim(); })
    .filter(Boolean),

  // Dossier de stockage sur disque (JSON + fichiers).
  DATA_DIR: process.env.DATA_DIR || path.join(__dirname, '..', 'data'),

  // Durée de validité d'un jeton de session client (en secondes). 2 h par défaut.
  SESSION_TTL: parseInt(process.env.SESSION_TTL || '7200', 10),

  // Limite de tentatives de connexion échouées par IP+client sur la fenêtre.
  LOGIN_MAX_ATTEMPTS: parseInt(process.env.LOGIN_MAX_ATTEMPTS || '8', 10),
  LOGIN_WINDOW_MS: parseInt(process.env.LOGIN_WINDOW_MS || '600000', 10), // 10 min

  // Taille maximale d'un corps de requête admin (JSON), en octets. 32 Mo.
  MAX_ADMIN_BODY: parseInt(process.env.MAX_ADMIN_BODY || String(32 * 1024 * 1024), 10),

  // Taille maximale d'un dépôt client (corps JSON de /portal/upload), en octets.
  // 12 Mo (~9 Mo de fichier réel après encodage base64).
  MAX_UPLOAD_BODY: parseInt(process.env.MAX_UPLOAD_BODY || String(12 * 1024 * 1024), 10),
};

/* Vérifie la présence des secrets critiques. En développement on tolère des
 * secrets générés à la volée (avec un avertissement) pour démarrer vite. */
function verifierSecrets() {
  const avertissements = [];
  if (!config.CABINET_TOKEN) {
    avertissements.push('CABINET_TOKEN absent — les endpoints /admin/* seront REFUSÉS tant qu\'il n\'est pas défini.');
  }
  if (!config.JWT_SECRET) {
    // On génère un secret éphémère : les jetons ne survivront pas à un redémarrage.
    config.JWT_SECRET = require('crypto').randomBytes(32).toString('hex');
    avertissements.push('JWT_SECRET absent — un secret ÉPHÉMÈRE a été généré (les sessions seront invalidées à chaque redémarrage). Définissez JWT_SECRET en production.');
  }
  return avertissements;
}

module.exports = { config, verifierSecrets };
