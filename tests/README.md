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
et pré-remplissage proposé) et **IA — formalités** (objet social en
plusieurs formulations à choisir, relecture de cohérence du dossier sur
bouton — forme/associés, capital, mentions manquantes — et suggestion de
clauses pour les gabarits) et **IA — facturation** (désignation de
prestation générée, relances d'impayés personnalisées à ton progressif,
lecture de facture fournisseur par vision — fournisseur/date/HT/TVA/TTC —
et détection d'anomalies : doublons et montants inhabituels, badge +
liste) et **IA — copilote interne (⌘K)** (assistant intégré à la palette
de commandes : répond aux questions métier — pièces d'une formalité,
tarifs, procédures — cherche dans les données, et propose une action à
**exécuter avec confirmation** : ouvrir une page, créer une facture/un
devis, synchroniser la boîte, aller aux impayés, ou ouvrir un
client/dossier/facture/demande ; base de connaissances tirée des modèles
de formalités et des prestations, mode démonstration hors-ligne) et
**IA — pilotage** (page dédiée « Pilotage IA » : recommandations d'actions
« à faire maintenant » sur quatre signaux — impayés échus à relancer,
demandes en retard SLA, devis sans suite, dossiers bloqués par des pièces
manquantes — chacune avec un bouton menant à l'écran concerné ; et rapport
d'activité — KPIs locaux (demandes reçues/finalisées, taux de conversion,
CA facturé, impayés, âge moyen de la file, répartitions par canal/formalité)
+ synthèse rédigée par l'IA — généré automatiquement chaque semaine et à la
demande sur la période choisie ; mode démonstration hors-ligne) et
**IA — transverse** (barre IA — corriger, raccourcir, plus pro — greffée
automatiquement sous chaque zone de texte longue, avec un bouton de dictée
vocale 🎤 quand le navigateur le permet — la parole est transcrite dans le
champ ; et résumé de situation en un clic dans la fiche demande et la fiche
dossier — l'IA synthétise état, pièces reçues/manquantes, prochaine étape et
points d'attention ; mode démonstration hors-ligne) et
**IA — guide de mise en service** (assistant pas à pas, depuis Paramètres →
Assistant IA, pour passer du mode démonstration à l'IA réelle : obtenir la
clé Mistral, créer le proxy Apps Script — code copiable en un clic —,
renseigner les secrets `MISTRAL_KEY`/`SHARED_KEY`, déployer, brancher LAST et
tester la connexion ; rappel RGPD, clé serveur jamais exposée au navigateur) et
**flux commercial anti-fuite** (bouton « Accepter & établir le devis » dans la
fiche demande — l'acceptation marque la demande et ouvre le devis pré-rempli,
plus de devis oublié — et carte « Pipeline commercial » en tête du tableau de
bord : les quatre étapes du tunnel de vente — demandes à qualifier, devis en
attente, dossiers à facturer, impayés — avec compteur, montant potentiel et
action rapide par étape ; le lien dossier↔facture retire un dossier de « à
facturer » dès qu'une facture lui est rattachée) et **anti-fuite débours**
(détection des frais officiels manquants d'un dossier — annonce légale et
frais de greffe/INPI selon la nature création/modification/annuelle — signalés
par un ⚠ dans le pipeline et proposés à l'ajout au moment de facturer, pour
qu'ils soient refacturés au client et ne rognent pas la marge) et
**pousser la récurrence** (revenu récurrent rendu visible — MRR mensuel et ARR
annuel normalisés depuis les abonnements actifs — carte « Revenus récurrents &
opportunités » sur le tableau de bord listant les clients au dossier livré sans
abonnement actif, avec proposition d'abonnement en 1 clic pré-remplie — client +
offre suggérée — et bouton « Proposer un abonnement » dans la fiche dossier ;
le moteur de génération automatique des factures d'abonnement reste inchangé) et
**cockpit santé financière** (bandeau en tête du tableau de bord consolidant tout
l'argent : encaissé total et du mois, reste dû, potentiel du pipeline, revenu
récurrent MRR/ARR, taux de recouvrement, plus un entonnoir visuel potentiel →
facturé → encaissé) et **double authentification (2FA)** (accès verrouillé au
titulaire : mot de passe — étape 1 — puis code TOTP à 6 chiffres d'une
application d'authentification — étape 2 ; TOTP conforme RFC 6238/4226 calculé
hors-ligne via WebCrypto, secret 2FA chiffré par le mot de passe — AES-256-GCM +
PBKDF2, clé d'ancrage portable — enrôlement guidé — QR/clé — au premier accès, et
verrouillage temporaire anti-force-brute après cinq échecs) et
**gestion de la sécurité** (carte « Sécurité & accès » dans les Paramètres :
statut 2FA, (re)configuration guidée de la double authentification — QR/clé +
vérification —, changement de mot de passe — nouvelle empreinte SHA-256 stockée
localement, prise en compte par le gate via un mot de passe modifiable —, affichage
de la clé d'ancrage portable, et guide pas à pas d'enrôlement) et
**comptes Admin / Collaborateur** (deux formats d'accès : l'Admin — mot de passe +
2FA — a tout pouvoir ; les collaborateurs se connectent avec un identifiant + mot
de passe créés par l'Admin (carte Équipe → Accès), sans 2FA, et sont limités au
travail : ils ne voient que les demandes/dossiers qui leur sont assignés, un menu
restreint — Demandes, Traitement, Clients (consultation), documents — le reste
masqué, et n'ont aucun pouvoir de modification structurelle — suppressions,
finances, réglages bloqués — uniquement l'édition des dossiers et l'envoi de mails ;
identifiant insensible à la casse, comptes activables/désactivables, périmètre par
assignation, redirection hors des pages interdites) et **suivi des collaborateurs**
(module d'administration dédié, invisible aux collaborateurs : présentation en liste —
un collaborateur par ligne — avec ses tâches assignées — demandes + dossiers ouverts,
cliquables —, ses compteurs, sa barre d'avancement des dossiers, ses retards SLA et
son activité récente ; KPIs globaux collaborateurs actifs / tâches en cours / en retard ;
barre d'outils : filtre par période — tout / 7 jours / 30 jours / ce mois — appliqué à
l'activité, tri — par nom / charge / retard / avancement — et export CSV du suivi sur
la période courante)
— le tout sans erreur JavaScript.

## Deux niveaux de test

- **`regression.mjs`** — vérifie des **invariants isolés** de chaque flux
  (fonction par fonction). C'est le filet de sécurité principal.
- **`e2e.mjs`** — rejoue un **parcours utilisateur de bout en bout** :
  navigation de toutes les pages (dont Pilotage IA), puis exercice réel de
  chaque fonction IA (analyse, réponse, signaux, pièces/vision, formalités,
  facturation, copilote ⌘K, pilotage, transverse, guide proxy) et du cœur
  métier (devis → facture), en surveillant **toute erreur JavaScript** (page
  et console). L'IA tourne en mode démonstration (hors-ligne). Le bruit lié
  au protocole `file://` (service worker, `version.json`) est filtré, et les
  confirmations natives sont neutralisées (le headless refuse `confirm()`).

## Lancer

```bash
# Depuis la racine du projet (là où se trouve index.html)
npm i -D playwright          # une fois
npx playwright install chromium
node tests/regression.mjs     # invariants  → LAST regression: N/N OK
node tests/e2e.mjs            # parcours réel → LAST e2e: N/N OK
```

Sortie attendue : `… N/N OK — tout vert` (code de sortie 0).
En cas d'échec, chaque test en défaut est listé et le code de sortie est 1.

Playwright est résolu automatiquement (node_modules). Pour pointer une
installation spécifique : `PLAYWRIGHT_PKG=/chemin/vers/playwright node tests/e2e.mjs`.

## Après chaque modification de `index.html`

1. Vérifier la syntaxe des `<script>` et l'équilibre des accolades CSS.
2. Lancer `node tests/regression.mjs` **et** `node tests/e2e.mjs` — les deux
   doivent rester tout vert.
3. Incrémenter `LAST_VER` (index.html), `CACHE` (sw.js), `version.json`.
