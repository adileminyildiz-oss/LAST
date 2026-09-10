# LAST — logiciel interne AEM CONSEIL

Application web interne d'AEM CONSEIL (accompagnement administratif : création /
modification de sociétés, formalités). Réception & tri des demandes, Espace de
traitement des dossiers, génération des documents (statuts, souscripteurs,
pouvoir, non-condamnation…), mails avec pièces jointes + logo, facturation.

## Site en ligne
**https://marq.aemconseil.eu** — hébergé sur **GitHub Pages** (ce dépôt).
Le fichier `CNAME` fixe le domaine ; `index.html` est l'application (fichier
unique, autonome, sans build ni serveur ; données locales à chaque appareil).

## Déploiement
Pousser sur `main` suffit : GitHub Pages reconstruit et publie automatiquement.
- Source Pages : *Settings → Pages → Deploy from a branch → `main` / `/root`*
- Domaine : `marq.aemconseil.eu` (fichier `CNAME`) + **Enforce HTTPS**

## Accès
Une page de connexion (mot de passe) protège l'outil. Seule l'empreinte
**SHA-256** du mot de passe est stockée dans `index.html` (constante
`LAST_PWD_HASH`) — le mot de passe n'apparaît jamais en clair.
Changer le mot de passe : calculer l'empreinte du nouveau
(`printf '%s' 'MONMOTDEPASSE' | sha256sum`) et remplacer `LAST_PWD_HASH`.

## Structure
- `index.html` — l'application complète (HTML/CSS/JS en un seul fichier)
- `formulaire.html` — formulaire public d'ouverture de dossier (client)
- `infos.html` — questionnaire client en ligne : identité du dirigeant (filiation, n° de sécurité sociale, coordonnées professionnelles, pièce d'identité, hébergement), associés, société (activité, code APE), dépôt des documents (pièce d'identité, justificatif de domicile, attestation d'hébergement). Deux usages : **lien par dossier** (envoyé depuis Mar'q, réponses rattachées au dossier) ou **lien public** `questionnaire.html` (story, site, SMS : la réponse crée la demande dans Mar'q)
- `questionnaire.html` — lien court public vers le questionnaire (`https://marq.aemconseil.eu/questionnaire.html`)
- `depot.html` — portail public de dépôt sécurisé des pièces
- `CNAME` — domaine personnalisé GitHub Pages
- `README.md` — ce fichier

Ce dépôt est **dédié au site LAST** : tout l'avancement de LAST se fait ici.
