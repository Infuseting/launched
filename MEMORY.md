# Project Memory: Launched (React + Tauri / Rust)

## 1. Architecture actuelle
- **Frontend local React + TypeScript** (`src/`), sans chargement HTML distant ni pont d'injection DOM.
- **Orchestration UI** : `src/app/launcher-controller.ts`, état réactif dans `src/state.ts`, contrats typés dans `src/types.ts`, adaptateurs Tauri dans `src/services/`.
- **Backend Rust / Tauri** (`src-tauri/src/`) :
  - `commands/` : commandes IPC Tauri (`auth`, `game`, `session`, `settings`, `skin`).
  - `auth/` : OAuth Discord (PKCE + deep-link `launched://`) et Microsoft Device Code + Xbox Live + Minecraft (`DPAPI` sous Windows / `keyring` sous macOS et Linux).
  - `core/` : installation Vanilla / Fabric / Forge / NeoForge (`core/install/`), moteur de téléchargement SHA-1/MD5 (`core/download/`), synchronisation MD5 et fichiers optionnels (`core/sync.rs`, `core/optional_files.rs`), construction sécurisée d'arguments JVM/jeu et lancement (`core/launch/`), agent Java Discord Rich Presence (`src-tauri/java/`).
- **Site & API compagnon** : dépôt `../launched-site` (Next.js 16 + Prisma + PostgreSQL + SFTPGo).
- **Bot Discord compagnon** : dépôt `../launched-bot` (Node.js 24 + MongoDB).

## 2. Règles techniques clés
- Stockage `.minecraft` partagé (`versions`, `libraries`, `assets`, `runtime`) avec données de session isolées par instance.
- Les réglages et comptes utilisent des écritures atomiques et ne dégradent jamais des données corrompues en listes vides silencieuses.
- Toujours valider côté serveur/Rust : versions Minecraft/loaders sans traversée de chemin, archives ZIP via `enclosed_name()`, et filtrage des flags JVM distants dangereux (`-javaagent`, `-agentlib`, etc.).
- Voir `README.md`, `CONTRIBUTING.md` et `DESIGN.md` pour l'installation, les vérifications qualité et le design.
