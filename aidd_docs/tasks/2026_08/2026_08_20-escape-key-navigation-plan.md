---
objective: "Fermeture systématique et hiérarchique de tous les menus, vues plein écran et modales du launcher avec la touche Échap (Escape)."
status: completed
plan_kind: master
confidence: 10/10
architecture_projection:
  components:
    - name: App.tsx
      description: "Gestionnaire global d'écoute de la touche Escape avec détection ordonnée des modales actives."
---

# Plan d'Exécution - Touche Échap (Escape)

## 1. Contexte & Objectif
Permettre à l'utilisateur de quitter n'importe quel menu ou boîte de dialogue (Paramètres, Hub de serveurs, Modale Microsoft, Modale Crack, Modale de mise à jour) d'un simple appui sur la touche **Échap** (`Escape`), selon un ordre de priorité évitant les fermetures intempestives multiples.

## 2. Ordre de Priorité
1. `crackModalOpen` -> `handleCrackModalResolve(null)`
2. `deviceCodeModalOpen` -> `handleDeviceCodeModalToggle(false)`
3. `updateManifest` (si non `isInstallingUpdate`) -> `handleDismissUpdatePrompt()`
4. `isServerSelectOpen` -> `handleServerSelectToggle(false)`
5. `isSettingsOpen` -> `handleSettingsToggle(false)`

## 3. Validation
- `npm run build`
