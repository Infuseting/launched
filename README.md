# Launched

Launcher Minecraft de bureau en React, TypeScript et Tauri (Rust). Il permet de
choisir une session, synchroniser ses fichiers, gérer ses comptes et lancer le jeu.
Le site et son API sont dans le dépôt voisin `../launched-site`.

## Installation

Prérequis : Node.js 24, npm, Rust stable et JDK 21 (`java` et `javac` dans le PATH).
Le JDK compile l'agent Java de présence Discord pendant le build Rust.
Sous Windows, installer également les outils C++ MSVC et WebView2 nécessaires à
Tauri. Les builds Linux et macOS demandent les bibliothèques système Tauri de
leur plateforme (voir `.github/workflows/release.yml` pour Linux).

```powershell
npm ci
npm run dev:app
```

`npm run dev` lance seulement Vite. Les commandes natives ne fonctionnent que dans
la fenêtre Tauri ; un navigateur sert à examiner le rendu et les composants.
`npm run dev:app` (ou `npm run tauri dev`) ouvre le launcher complet. Le serveur
utilise `127.0.0.1:5173` ; si ce port est occupé, arrêter l'autre instance avant
de relancer la commande.

Pour construire l'interface : `npm run build`. Pour créer les paquets natifs :
`npm run tauri build` (la signature de publication demande les secrets configurés
dans le workflow de release).

## Repères dans le code

| Dossier                          | Responsabilité                                                     |
| -------------------------------- | ------------------------------------------------------------------ |
| `src/components`, `src/screens`  | Interface, contrôles et modales                                    |
| `src/app/launcher-controller.ts` | Coordination des actions utilisateur et des opérations asynchrones |
| `src/state.ts`, `src/types.ts`   | État réactif, snapshots React et contrats TypeScript               |
| `src/services`                   | Adaptateurs TypeScript des commandes Tauri                         |
| `src-tauri/src/commands`         | Entrées du pont natif exposées à l'interface                       |
| `src-tauri/src/auth`             | Connexions Microsoft et Discord, stockage des comptes              |
| `src-tauri/src/core`             | Installation, téléchargement, synchronisation et lancement         |
| `src-tauri/java`                 | Agent de présence Discord chargé dans Minecraft                    |
| `tests`, `src-tauri/tests`       | Régressions du contrôleur et intégration native                    |

Les réglages sont stockés dans le répertoire de données de
`com.infuseting.launched` résolu par Tauri. Les sessions Discord et Minecraft
(jetons d'accès et de renouvellement Microsoft inclus) sont chiffrées par DPAPI
sous Windows, avec une protection liée au compte Windows. Sous macOS et Linux,
elles sont stockées dans le trousseau système (Keychain / Secret Service).
Les anciens fichiers en clair sont migrés automatiquement au démarrage ; si le
stockage sécurisé échoue, aucune nouvelle session n'est écrite en clair et
l'erreur est remontée. Ne jamais joindre les fichiers de connexion à un rapport
de bug. Les ressources Minecraft
partagées se trouvent dans `.minecraft` ; chaque session a ses fichiers propres.

Le backend accepte `LAUNCHED_SITE_URL` pour l'origine du site d'authentification
et `LAUNCHED_SERVERS_URL` pour la source des sessions. Ces valeurs sont lues au
lancement du processus ; les valeurs publiques par défaut sont dans
`src-tauri/src/auth/discord.rs` et `src-tauri/src/commands/session.rs`.

## Vérification et contribution

```powershell
npm run check
cargo fmt --manifest-path src-tauri/Cargo.toml -- --check
cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets -- -D warnings
cargo test --manifest-path src-tauri/Cargo.toml
```

`npm run check` contrôle le formatage, ESLint, les types stricts, les tests et le
build Vite. `npm run format` applique le formatage ; les contrôles Rust demandent
les mêmes prérequis natifs que l'application.

Les tests ignorés par défaut peuvent dépendre du réseau, d'une installation
Minecraft, ou de services locaux. Voir [les loaders](docs/LOADERS.md) avant de
les exécuter. Un build réussi ne remplace pas un essai en jeu.

Lire [CONTRIBUTING.md](CONTRIBUTING.md) pour les conventions et
[DESIGN.md](DESIGN.md) pour la direction visuelle existante.
Le [rapport de nettoyage](docs/QUALITY.md) détaille les corrections, les
vérifications et les limites constatées sur les deux dépôts.
