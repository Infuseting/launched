# Contribuer à Launched

## Démarrer une modification

Lire le README et les contrats de `src/types.ts`. Garder les changements dans la
couche responsable : composants pour le rendu, contrôleur pour la coordination,
services pour le pont Tauri, Rust pour les opérations natives. Le site dispose de
son propre dépôt, de ses propres dépendances et de ses propres contrôles.

## Lisibilité et contrats

- Utiliser des noms explicites et des fonctions centrées sur une responsabilité.
- Garder TypeScript strict ; préférer `unknown` puis une validation aux types
  `any` et aux assertions qui masquent une erreur.
- Documenter avec JSDoc ou `///` les contrats publics, les invariants et les
  raisons d'un choix non évident. Éviter les commentaires qui répètent le code.
- Retourner des erreurs contextualisées. Ne pas transformer silencieusement une
  lecture corrompue en données vides, ni journaliser des jetons.
- Pour une opération asynchrone, prévoir l'annulation, une réponse devenue
  obsolète et la libération des listeners, timers et ressources 3D.
- Garder les snapshots de `src/state.ts` immuables pour React. Les mutations
  passent par `state` ; ne pas modifier un objet reçu depuis un hook de lecture.
- Valider les entrées externes au niveau de leur frontière (réseau, disque,
  arguments de lancement), avant d'agir sur les fichiers ou lancer un processus.

## Interface

Conserver les choix documentés dans DESIGN.md : fond immersif, hiérarchie du
bouton Jouer, surfaces sombres et états clairement visibles. Réutiliser les
contrôles et hooks existants. Toute modale doit avoir un nom accessible, recevoir
le focus, contenir la navigation Tab et restituer le focus à sa fermeture.
Vérifier aussi le clavier, le zoom, les messages d'erreur et la réduction des
animations. Un état ne doit pas être compréhensible uniquement par sa couleur.

## Avant une revue

Exécuter les commandes du README et ajouter une régression lorsqu'un comportement
important est corrigé. Les tests doivent vérifier ce comportement, pas copier
l'implémentation. Les tests Node du contrôleur isolent les adaptateurs Tauri ;
ils ne remplacent pas une vérification du programme natif.

Décrire le problème, le résultat observable, les contrôles exécutés et leurs
limites. Pour une modification visuelle, essayer la fenêtre Tauri à sa taille
minimale et avec plusieurs modales. Pour une modification du lancement, indiquer
les combinaisons Minecraft/loader réellement essayées. Ne pas publier de release
depuis un simple nettoyage local.
