'use strict';
/*
 * crypto.js — Primitives de sécurité (aucune dépendance externe).
 *  - Hachage des codes d'accès au repos via scrypt + sel aléatoire.
 *  - Jetons de session opaques signés HMAC-SHA256 (format « JWT-like » compact,
 *    mais volontairement minimal : payload base64url + signature).
 * Toutes les comparaisons de secrets utilisent timingSafeEqual.
 */
const crypto = require('crypto');

/* ---- Encodage base64url ---- */
function b64urlEncode(buf) {
  return Buffer.from(buf).toString('base64')
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function b64urlDecode(str) {
  str = String(str).replace(/-/g, '+').replace(/_/g, '/');
  while (str.length % 4) str += '=';
  return Buffer.from(str, 'base64');
}

/* ---- Hachage d'un code d'accès (scrypt) ---- */
// Retourne une chaîne « scrypt$<selHex>$<hashHex> » stockable telle quelle.
function hasherCode(code) {
  const sel = crypto.randomBytes(16);
  const hash = crypto.scryptSync(String(code), sel, 32);
  return 'scrypt$' + sel.toString('hex') + '$' + hash.toString('hex');
}

// Vérifie un code en clair contre le condensé stocké (comparaison constante).
function verifierCode(code, stocke) {
  try {
    const parts = String(stocke || '').split('$');
    if (parts.length !== 3 || parts[0] !== 'scrypt') return false;
    const sel = Buffer.from(parts[1], 'hex');
    const attendu = Buffer.from(parts[2], 'hex');
    const calcule = crypto.scryptSync(String(code), sel, attendu.length);
    return attendu.length === calcule.length && crypto.timingSafeEqual(attendu, calcule);
  } catch (e) {
    return false;
  }
}

/* ---- Comparaison constante de deux chaînes (ex. CABINET_TOKEN) ---- */
function egaliteConstante(a, b) {
  const ba = Buffer.from(String(a || ''), 'utf8');
  const bb = Buffer.from(String(b || ''), 'utf8');
  if (ba.length !== bb.length) return false;
  return crypto.timingSafeEqual(ba, bb);
}

/* ---- Jetons de session (HMAC-SHA256) ---- */
// payload : objet quelconque (on y met { c: ckey, exp: epochSeconds }).
function signerJeton(payload, secret) {
  const corps = b64urlEncode(JSON.stringify(payload));
  const sig = crypto.createHmac('sha256', secret).update(corps).digest();
  return corps + '.' + b64urlEncode(sig);
}

// Retourne le payload si le jeton est valide et non expiré, sinon null.
function verifierJeton(jeton, secret) {
  try {
    const pts = String(jeton || '').split('.');
    if (pts.length !== 2) return null;
    const attendue = crypto.createHmac('sha256', secret).update(pts[0]).digest();
    const fournie = b64urlDecode(pts[1]);
    if (attendue.length !== fournie.length || !crypto.timingSafeEqual(attendue, fournie)) return null;
    const payload = JSON.parse(b64urlDecode(pts[0]).toString('utf8'));
    if (payload.exp && Math.floor(Date.now() / 1000) > payload.exp) return null; // expiré
    return payload;
  } catch (e) {
    return null;
  }
}

module.exports = {
  hasherCode, verifierCode, egaliteConstante,
  signerJeton, verifierJeton, b64urlEncode, b64urlDecode,
};
