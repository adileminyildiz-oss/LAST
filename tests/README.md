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
auto-assignation rapide au collaborateur courant) et **poste de travail
des demandes** (numéro de série visible sur toutes les demandes, pièces
jointes des mails transférées et rattachées à la demande — le parseur
transporte le champ `att`, récupération automatique du contenu après
synchro, affichage/téléchargement — et contexte : bandeau « Mon poste »
avec la charge du collaborateur + prochaine étape par demande) et
**file d'attente priorisée + SLA** (ancienneté de chaque demande,
badge d'échéance vert/ambre/rouge au-delà d'un délai cible réglable,
score de priorité et tri « file d'attente », compteur « en retard »
dans le bandeau du poste) et **checklist de traitement par formalité +
réponses types** (étapes cochables tirées du modèle de la formalité avec
progression %, et réponses en 1 clic — accusé de réception, demande de
pièces, point d'avancement, relance — pré-remplies avec le numéro de
série), **notification en barre latérale** (le badge « Demandes » passe
au rouge quand des demandes dépassent le délai SLA) et **auto-cochage
des étapes** (demander les pièces coche automatiquement l'étape
« Collecte des pièces ») et **classement automatique des pièces jointes**
(reconnaissance du type de chaque pièce reçue — CNI, domicile, K-bis,
statuts, RIB… — d'après son nom, correction manuelle, couverture des
pièces requises par la formalité, et aperçu inline image/PDF sans quitter
la fiche) et **statistiques du poste** (onglet dédié : volumes, taux de
conversion demande→dossier, part traitée dans les délais SLA, âge moyen,
et répartitions par canal / état / formalité / collaborateur ;
**filtre de période** — tout / cette année / ce trimestre / ce mois —
et **export CSV** des demandes de la période) et **fondation IA**
(moteur unifié `iaAsk` vers un proxy Mistral — clé côté serveur —
avec mode démonstration hors-ligne, réglages dans Paramètres et code
du proxy Apps Script fourni) et **IA — analyse de la demande entrante**
(résumé + extraction structurée : contact, projet juridique, structure,
commercial ; carte « Analyse IA » dans la fiche, analyse automatique,
et pré-remplissage proposé puis validé avant application) et
**IA — brouillon de réponse + reformulation** (« Rédiger la réponse (IA) »
au ton chaleureux depuis la fiche, ouverture du composeur pré-rempli ;
barre IA dans le composeur : corriger, raccourcir, plus pro, traduire)
et **IA — signaux & traduction** (détection urgence/intention(spam)/
sentiment/langue affichée en pastilles dans la fiche et la messagerie,
urgence IA qui remonte la priorité de la file d'attente, et traduction
française à la demande) et **IA — lecture des pièces (vision)** (bouton
par pièce + global, extraction CNI/K-bis/domicile, contrôles de
conformité — lisibilité, recto+verso, expiration, justificatif récent —
et pré-remplissage proposé) — le tout sans erreur JavaScript.

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
