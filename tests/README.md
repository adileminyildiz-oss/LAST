# Tests de non-régression — LAST

`regression.mjs` charge `index.html` hors-ligne dans Chromium (Playwright),
contourne l'écran de connexion, puis vérifie les invariants des flux
principaux : validateurs (SIREN/SIRET/IBAN/TVA/e-mail), devis → facture,
avoir, relance (modèle par défaut), échéancier, filtres/tri, recherche
globale, export CSV, notes internes, attestation, dépôt INPI (payload),
annulation de suppression (undo), rappel de sauvegarde,
**sauvegarde automatique** (instantané + restauration),
**corbeille** (capture, restauration, purge),
**facture électronique Factur-X** (XML CII EN 16931, mentions
obligatoires, cycle de vie), **relances automatiques programmées**
(cadence, détection des relances dues) et **modèles de dossiers par type
de formalité** (détection, pièces, étapes, choix manuel) — le tout sans
erreur JavaScript.

## Lancer

```bash
# Depuis la racine du projet (là où se trouve index.html)
npm i -D playwright          # une fois
npx playwright install chromium
node tests/regression.mjs
```

Sortie attendue : `LAST regression: N/N OK — tout vert` (code de sortie 0).
En cas d'échec, chaque test en défaut est listé et le code de sortie est 1.

Playwright est résolu automatiquement (node_modules). Pour pointer une
installation spécifique : `PLAYWRIGHT_PKG=/chemin/vers/playwright node tests/regression.mjs`.

## Après chaque modification de `index.html`

1. Vérifier la syntaxe des `<script>` et l'équilibre des accolades CSS.
2. Lancer `node tests/regression.mjs` — doit rester tout vert.
3. Incrémenter `LAST_VER` (index.html), `CACHE` (sw.js), `version.json`.
