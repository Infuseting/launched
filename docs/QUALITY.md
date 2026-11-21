# Nettoyage du code — 21 novembre 2026

Le travail couvre les deux dépôts locaux `launched` et `launched-site`. Les
changements sont locaux : aucune migration de base, publication ou release n'a
été effectuée. La suppression préexistante de `launched-site/public/hero.png`
est conservée.

## Application

- TypeScript strict, types React déclarés explicitement, ESLint sans
  avertissement, Prettier et conventions de fins de ligne partagés.
- Snapshots React indépendants des mutations suivantes ; notifications des
  suppressions ; sélecteurs conservant les branches inchangées.
- Modales nommées, focus contenu et restitué, ordre de priorité cohérent avec
  Échap. Champs, sliders et interrupteurs nommés pour les lecteurs d'écran.
- Statuts réseau tardifs ignorés, chargements d'assets dédupliqués et liens
  malformés gérés. Allocation RAM minimale toujours inférieure ou égale au maximum.
- Code d'envoi des skins mutualisé, nettoyage des ressources et chargement du
  studio 3D à la demande. Shoelace retiré car aucun composant actif ne l'utilisait.
- Téléchargements contrôlés par taille avant remplacement du fichier ; contrôle
  SHA-1/MD5 en blocs de 64 Ko. Un répertoire ne vaut jamais fichier téléchargé.
- Erreurs de lecture des comptes distinguées d'une liste vide, compatibilité
  de l'ancien format et suppression des codes de connexion Microsoft des logs.
- README et guide de contribution décrivent l'architecture et les invariants.

Le JavaScript initial est passé d'environ **1 464 Ko à 468 Ko** minifiés. Le
studio de skins et Three.js sont des chunks séparés, chargés à leur ouverture.
Il s'agit du poids initial, pas d'une réduction équivalente de toute l'application.

## Site

- Formatage partagé, lint sans avertissement, types et tests accessibles par
  `npm run check`, génération du client Prisma et contrôles CI documentés.
- Champs absents des mises à jour partielles préservés ; `false`, texte vide et
  liste vide restent des valeurs explicites. Booléens et limites de listes validés.
- Écritures de paramètres, accès et liens regroupées dans une écriture Prisma
  imbriquée pour éviter les mises à jour partielles en cas d'échec.
- Modales du tableau de bord mutualisées avec Base UI ; champs nommés,
  erreurs annoncées et retours de copie presse-papier fiables.
- Authentification navigateur centralisée ; requêtes annulables et erreurs de
  mutation capturées. Les erreurs serveur inattendues ne sont plus exposées telles quelles.
- Cookie OAuth prioritaire sur les anciens jetons locaux ; repli legacy conservé,
  y compris pour l'administration. Un refus de rôle ne change jamais de compte.
- Métadonnées GitHub bornées par un délai réseau et validées ; téléchargement
  orienté vers la page dédiée lorsque l'asset demandé est absent.
- Next.js et sa configuration ESLint mis à jour dans la même version majeure.

## Vérification

Dans l'application : formatage, lint du code et des tests, TypeScript strict,
**35 tests Node**, build Vite sans avertissement de taille de chunk, rustfmt,
Clippy tous targets avec `-D warnings`, **51 tests unitaires Rust et 23 tests
d'intégration** réussis. Le smoke test Windows/Java 21 de préparation des
commandes Fabric/Forge/NeoForge passe aussi.

L'interface React a été examinée dans une prévisualisation locale avec des données
de démonstration, notamment à **800 × 600** : ouverture des paramètres, bouclage
Tab, retour du focus après Échap, noms accessibles et cohérence des sliders RAM.
Le site public a été examiné sur grand écran et à **390 px** de largeur. Les modales
de création de session et SFTP ont été vérifiées avec des données locales : focus,
Tab, Échap et retour à leur bouton d'ouverture. Le sélecteur Discord imbriqué se
ferme avant la modale qui le contient. La page de démonstration a été supprimée.

Côté site, les contrôles de formatage, lint et types, **45 tests Node** et le build
Next.js de production passent. Les quatre régressions d'administration vérifient
les statuts 401/403 et le repli legacy sans changement d'identité sur un refus de rôle.

Les tests Rust dépendant du service public Prism restent explicitement ignorés par
défaut. Le smoke Galade en jeu, un lancement réel de Minecraft et les parcours
complets avec PostgreSQL, Discord et SFTPGo ne font pas partie de ces résultats.
Les tests isolés des routes ne remplacent pas ces essais d'intégration.

## Audit des dépendances

`npm audit` ne signale aucune vulnérabilité dans l'application après les mises à
jour compatibles. Côté site, les 22 alertes initiales sont réduites à **4 alertes
élevées** dans la chaîne `prisma` / `@prisma/config` / `deepmerge-ts` / `effect`.
Elles figurent aussi dans `npm audit --omit=dev`, Prisma étant une dépendance peer
du client : elles ne sont pas présentées comme exclusivement liées au développement.

Les corrections de cette chaîne demandent des changements majeurs de dépendances
ou des overrides hors des versions prévues par Prisma 6. Elles restent documentées
dans le README du site ; aucune migration majeure de Prisma n'a été appliquée.

Les workflows ajoutés sont configurés mais n'ont pas été exécutés sur GitHub
depuis cette session. Les essais locaux ont été réalisés sous Windows ; les
paquets de distribution macOS et Linux n'ont pas été générés.
