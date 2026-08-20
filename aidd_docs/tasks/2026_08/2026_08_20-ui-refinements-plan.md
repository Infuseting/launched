---
objective: "Améliorations majeures de l'UI du launcher : passage des paramètres et de la sélection de serveurs en Vues Plein Écran immersives, infobulle détaillée sur le téléchargement de fichiers, et typographie monumentale LAUNCHED à 50% d'opacité au centre de l'écran."
status: completed
plan_kind: master
confidence: 10/10
architecture_projection:
  modify:
    - "src/App.tsx - Intégration des vues plein écran pour les paramètres et le sélecteur de serveurs avec transitions AnimatePresence"
    - "src/screens/MainScreen.tsx - Remplacement du centre par la typographie monumentale 'LAUNCHED' en font-black à 50% d'opacité (text-white/50)"
    - "src/components/BottomBar.tsx - Ajout du tooltip de téléchargement détaillé au survol (nom complet avec wrap propre, ratio de fichiers done/total, pourcentage)"
    - "src/components/settings/SettingsModal.tsx - Transformation en vue plein écran SettingsView avec navigation latérale élégante, studio Skin 3D grand format et bouton retour"
    - "src/components/ServerSelectModal.tsx - Transformation en vue plein écran ServerSelectView avec grande grille de serveurs immersifs et bouton retour"
    - "src/components/skin/SkinTab.tsx - Adaptation du studio de skin 3D pour le grand format plein écran"
    - "DESIGN.md - Mise à jour de la documentation du système de design"
  create: []
  delete: []
applicable_rules: []
---

# Plan d'Implémentation : Vues Plein Écran & Perfectionnements UI

## 1. Contexte & Objectifs

Suite aux retours utilisateur :
1. **Suppression du système de modales popup** au profit de **Vues Plein Écran Immersives (Full-Page Views)** pour les Paramètres, le Studio de Skin 3D et le Sélecteur de Serveurs.
2. **Infobulle de Téléchargement Détaillée** : Affichage au survol d'un tooltip élégant en verre dépoli contenant le nom complet du fichier sans coupure tronquée, le ratio de fichiers (`files_done / total_files`) et le pourcentage.
3. **Typographie Monumentale "LAUNCHED"** : Titre géant au centre de l'écran occupant l'espace avec une opacité de 50% (`text-white/50`) pour sublimer l'arrière-plan cinématique de chaque session.

---

## 2. Parcours Utilisateur

```mermaid
flowchart TD
    A[Écran Principal Immersif] -->|Texte Central| B[LAUNCHED Géant à 50% d'alpha]
    
    A -->|Clic Paramètres / Profil| C[Vue Plein Écran : Paramètres & Studio Skin 3D]
    subgraph Vue_Settings [Vue Plein Écran Paramètres]
        C --> C1[Barre Latérale : Comptes, Skin Studio 3D géant, Général, Avancé]
        C --> C2[Bouton ← Retour au Launcher]
    end

    A -->|Clic Changer de Version| D[Vue Plein Écran : Hub Serveurs & Versions]
    subgraph Vue_Servers [Vue Plein Écran Serveurs]
        D --> D1[Grille de Serveurs Immersifs avec fond, ping et joueurs]
        D --> D2[Bouton ← Retour au Launcher]
    end

    A -->|Clic Jouer / Téléchargement| E[Bouton Synchronisation]
    E -->|Survol| F[Tooltip Détaillé : Nom complet fichier, 142/380 fichiers, % exact]
```

---

## 3. Découpage des Tâches

### Phase 1 : Typographie Monumentale LAUNCHED & Tooltip Téléchargement
- [ ] Modifier `src/screens/MainScreen.tsx` pour afficher systématiquement `LAUNCHED` en grand format (taille géante, `text-white/50`, `font-black tracking-tighter drop-shadow-2xl`).
- [ ] Modifier `src/components/BottomBar.tsx` pour intégrer un tooltip détaillé au survol de la barre de progression/bouton affichant le nom de fichier complet (`break-all`), le ratio de fichiers et le pourcentage.

### Phase 2 : Vue Plein Écran des Paramètres & Studio Skin 3D
- [ ] Transformer `src/components/settings/SettingsModal.tsx` en une vue plein écran immersive avec sidebar latérale de navigation, grand espace dédié pour le Studio de Skin 3D, formulaires aérés et bouton de retour élégant.
- [ ] Ajuster `src/components/skin/SkinTab.tsx` pour exploiter l'espace plein écran (viewer 3D agrandi, galerie plus spacieuse).

### Phase 3 : Vue Plein Écran du Sélecteur de Serveurs
- [ ] Transformer `src/components/ServerSelectModal.tsx` en une vue plein écran immersive (Hub Serveurs) avec grille de cartes riches et bouton de retour.

### Phase 4 : Validation & Tests
- [ ] Vérifier la compilation TypeScript (`npm run build`).
- [ ] Mettre à jour `DESIGN.md`.
