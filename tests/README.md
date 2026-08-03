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
(cadence, détection des relances dues), **modèles de dossiers par type
de formalité** (détection, pièces, étapes, choix manuel) et
**prévisionnel de trésorerie** (encaissements attendus, solde projeté)
**PDF/A-3 Factur-X** (PDF avec XML CII embarqué, xref valide),
**accessibilité** (lien d'évitement, ARIA, sémantique modale),
**documents adaptés à la forme juridique** (statuts SAS/SARL/SCI/EURL),
**tableau de bord conformité** (échéances légales : AGO, dépôt au greffe),
**actes & procès-verbaux par forme** (PV d'AGO, PV de modification),
**rapprochement des paiements** (relevé bancaire → lettrage des factures) et
**messagerie & informations du formulaire du site** (les champs saisis par
le client sur aemconseil.eu — nom, e-mail, téléphone, type de société,
message — sont extraits, affichés dans une boîte de réception « Messagerie »
avec suivi des non-lus par canal, et repris dans la fiche de traitement de
la demande) et **facturation récurrente automatique** (abonnements :
à chaque ouverture, toute échéance arrivée à terme génère
automatiquement sa facture client et reporte la date suivante selon
la cadence — mensuelle, trimestrielle, semestrielle, annuelle) et
**actes complémentaires** (feuille de présence avec quote-part par
associé/actionnaire et registre des décisions/assemblées, adaptés à la
forme juridique : actions vs parts sociales, associé unique vs
assemblée générale) et **palette de commandes** (Ctrl/Cmd+K :
navigation vers les pages, actions rapides et recherche instantanée
des clients, dossiers, devis, factures et demandes ; ouverture ciblée
d'un dossier depuis la recherche) et **espace de travail par
collaborateur** (identité active mémorisée « Je travaille en tant
que… », filtre « Mes demandes » sur les demandes assignées, et
auto-assignation rapide au collaborateur courant) — le tout sans
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
