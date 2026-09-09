# Sauvegarde complète — Mar'q v611 · 2026-09-09

Point de restauration de **tout le système** : règles, design et logique métier. Le logiciel tient dans un seul fichier, `index.html` (7 800 Ko, 36 473 lignes, 176 blocs de script), auquel s'ajoutent les scripts Google, le portail et les maquettes.

| | |
|---|---|
| Version | v611 (`version.json` = 611) |
| Commit | `031e235` sur `main` |
| Étiquette Git | `sauvegarde-v611-2026-09-09` |
| Archive | `marq-sauvegarde-v611-2026-09-09.zip` (tous les fichiers suivis, sans l'historique Git) |

## Restaurer
1. **Depuis l'archive** : dézippez, ouvrez `index.html` dans le navigateur (ou publiez le dossier tel quel — c'est ce que GitHub Pages sert).
2. **Depuis Git** : `git checkout sauvegarde-v611-2026-09-09` (ou `git reset --hard sauvegarde-v611-2026-09-09` sur `main` pour revenir définitivement à cet état).
3. **Les données** (dossiers, demandes, paie, clients) ne sont pas dans le code : elles vivent sur chaque poste (localStorage / IndexedDB). Sauvegardez-les depuis le logiciel — bandeau « Sauvegarder maintenant » ou Paramètres → Sauvegarde — et réimportez le fichier `.json` après restauration.

## Ce que contient le code
### Modules (navigation)
Tableau de bord · Demandes (réception, qualification, envoi des mails, réception des pièces, boîte reçue) · Traitement (6 étapes avec verrou humain : analyse, validation, génération, annonce légale, dépôt de capital, clôture) · Fiscal (conformité des abonnés) · Formulaire (création de société, auto-remplissage SIRET/SIREN) · Éditions (accueil par situation du client, 58 modèles en 12 rubriques, applications Factures / Paie / Remboursement de TVA) · Agenda (rendez-vous, Google Agenda) · Clients · Factures prestataires (mail → Mar'q → écritures) · Services (9 modules vendables, abonnements) · Paramètres (barèmes, communication, sauvegarde, modules en pause).

### Modèles de documents par rubrique
- **Constitution** (6) : Statuts · Pouvoir · Déclaration de non-condamnation · Attestation de dépôt des fonds (capital) · Attestation de parution (annonce légale) · Bénéficiaire effectif (RBE)
- **Ressources humaines** (9) : Contrat de travail · Contrat de travail (CDI) · Contrat de travail (CDD) · Convocation à un entretien · Rupture conventionnelle · Promesse d'embauche · Avenant au contrat de travail · Attestation de présence · Lettre de licenciement
- **Paie & social** (6) : Fiche de paie · Certificat de travail · Reçu pour solde de tout compte · Attestation d'employeur · Attestation de salaire · Registre unique du personnel
- **Contrats** (1) : Contrat de sous-traitance
- **Modification** (13) : État des lieux antérieurs · Procès-verbal · Décharge changement de gérant · PV de dissolution anticipée · PV de clôture de liquidation · PV d'approbation des comptes (AGO) · PV d'augmentation de capital · PV de réduction de capital · PV de changement de dénomination · PV de changement d'objet social · PV de transfert de siège · PV de nomination d'un dirigeant · Convocation à l'assemblée générale
- **Cessions** (1) : Cession de parts sociales
- **Comptabilité** (1) : Bilan Prévisionnel
- **Domiciliation** (3) : Contrat de domiciliation · Attestation de domiciliation · Déclaration de domiciliation (siège au domicile)
- **Fiscalité** (6) : Option pour l'impôt sur les sociétés · Attestation de régularité fiscale et sociale · Mise en sommeil · Reprise d'activité · Attestation de non-activité · Option pour le régime réel
- **Cabinet** (3) : Lettre de mission · Mandat de représentation · Attestation d'honoraires
- **Courriers** (6) : Attestation sur l'honneur · Procuration bancaire · Mise en demeure · Lettre de relance · Lettre de résiliation · Mandat de prélèvement SEPA
- **Facturation** (3) : Facture · Facture de situation (BTP) · Devis

### Règles métier figées dans cette version
- **Paie 2026** : barème complet `BAR26` (santé, prévoyance, mutuelle, AT, vieillesse plafonnée/déplafonnée, Agirc-Arrco T1/T2 + CEG, CET, APEC, famille, chômage, AGS, FNAL, CSA, dialogue social, formation, apprentissage, versement mobilité, CSG-CRDS, réduction générale T = 0,3193 / 0,3233 jusqu'à 1,6 SMIC) ; références lues dans Paramètres → Barèmes (SMIC 12,02 €/h · 1 823,07 €/mois · plafond 4 005 €) ; statut cadre ; congés payés 2,5 j/mois, imputation N-1 puis N, remise à zéro au 1er juin ; deux présentations du bulletin (modèle 2026, fond Sage) sur un seul moteur ; plan de travail par exercice (saisie mensuelle, suivis, dépenses de la société).
- **Documents** : SIRET → registre public (dénomination, forme, adresse, CP, ville, SIREN, TVA intracom, APE, ville du RCS) dans factures, devis et modèles ; parcours par situation ; regroupement Paie & social.
- **Communication** : un seul compte Google, aemconseil.sas@gmail.com (authuser forcé partout) ; passerelle Apps Script (mail, factures, agenda, rendez-vous) avec clé partagée ; seuls les envois du formulaire du site deviennent des demandes, les autres mails sont visibles dans « Boîte reçue ».
- **Sécurité** : mot de passe + code à 6 chiffres sur nouveau poste ; verrou humain sur chaque étape du Traitement ; modules en pause (Demandes, Agenda, Fiscal au moment de la sauvegarde).

### Design
Thème sombre « noir sur noir » (couleurs système), accent bleu #4f9dff, typographie système ; barre latérale, cartes, tableaux `.dem-tbl` / `.ps-t`, volets de saisie `.pf-side` (collés en haut, recherche, groupes repliables) ; documents A4 imprimables (`.doc-page`, `.inv-page`, `.p26-page`, fonds scannés calibrés `PF_TPL`).

### Fichiers suivis (89)
- `.github/workflows/deploy-ionos.yml`
- `.github/workflows/deploy-portal.yml`
- `.github/workflows/tests.yml`
- `.gitignore`
- `.htaccess`
- `CNAME`
- `README.md`
- `apercu-logo.svg`
- `depot.html`
- `formulaire.html`
- `gmail-script-factures.gs`
- `gmail-script.gs`
- `gmail-sync.gs`
- `icon-192.png`
- `icon-512-maskable.png`
- `icon-512.png`
- `icon-app.png`
- `icon.svg`
- `index.html`
- `inpi-proxy.gs`
- `logo-m-marq.html`
- `manifest.webmanifest`
- `maquette-agenda.html`
- `maquette-clients.html`
- `maquettes-formulaire.html`
- `mini-logo-marq.html`
- `notifications-marq.html`
- `polices-marq-2.html`
- `polices-marq.html`
- `q-mark-marq.html`
- `refonte-marq.html`
- `registre-grave-marq.html`
- `registre-marq.html`
- `render.yaml`
- `server/portal/.dockerignore`
- `server/portal/.env.example`
- `server/portal/.gitignore`
- `server/portal/Dockerfile`
- `server/portal/README.md`
- `server/portal/fly.toml`
- `server/portal/lib/config.js`
- `server/portal/lib/crypto.js`
- `server/portal/lib/ratelimit.js`
- `server/portal/lib/store.js`
- `server/portal/scripts/smoke.js`
- `server/portal/server.js`
- `sms-proxy.gs`
- `sw.js`
- `tests/README.md`
- `tests/actes.mjs`
- `tests/agents.mjs`
- `tests/archive.mjs`
- `tests/bareme.mjs`
- `tests/configio.mjs`
- `tests/controles.mjs`
- `tests/depot.mjs`
- `tests/depotmsg.mjs`
- `tests/docfolder.mjs`
- `tests/domiciliation.mjs`
- `tests/e2e.mjs`
- `tests/etapesconfig.mjs`
- `tests/fiscaliste.mjs`
- `tests/ged.mjs`
- `tests/intake.mjs`
- `tests/is.mjs`
- `tests/mailtpl.mjs`
- `tests/miseenplace.mjs`
- `tests/mix.mjs`
- `tests/modeles.mjs`
- `tests/modification.mjs`
- `tests/notefiscale.mjs`
- `tests/numconfig.mjs`
- `tests/orientation.mjs`
- `tests/pdffill.mjs`
- `tests/piecesconfig.mjs`
- `tests/pilotage.mjs`
- `tests/portail.mjs`
- `tests/portal.mjs`
- `tests/prestataires.mjs`
- `tests/questionnaire.mjs`
- `tests/regression.mjs`
- `tests/relance.mjs`
- `tests/signatures.mjs`
- `tests/simu.mjs`
- `tests/smoke.mjs`
- `tests/taches.mjs`
- `tests/vue.mjs`
- `version.json`
- `yousign-proxy.gs`

### Maquettes conservées
- Module Éditions (4 dispositions) : https://claude.ai/code/artifact/5e1fec67-be13-4932-b029-27e32dd7f18f
- Plan de travail Paie : https://claude.ai/code/artifact/8cea0910-f31f-47d9-9173-cd8bb7585fb1 · Dispositions Paie : https://claude.ai/code/artifact/d14529a4-c0f9-4057-9be8-2d61c795aa4c
