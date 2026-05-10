# DESIGN.md - Launcher Desktop (React + Tauri)

Date: 2026-04-24  
Scope: Application launcher desktop (pas le site web dans le dossier web/)

## 1. Vision Produit

Le launcher adopte une direction "immersive gaming UI":

- Fond plein ecran dynamique, derive de chaque session.
- Interface superposee minimale (top bar + action area basse + overlays).
- Contraste fort (noir, blanc, verts de statut) pour maintenir la lisibilite.
- Interactions premium via animations Framer Motion (apparitions, transitions, feedback hover/tap).

Le design vise un usage principal tres clair: choisir une session et lancer le jeu rapidement.

## 2. Fondations Visuelles

### 2.1 Palette et atmosphere

Couleurs dominantes observees:

- Base: noirs et neutres profonds (`bg-neutral-950`, overlays noirs transparents).
- Texte: blanc et blancs attenues (`text-white`, `text-white/40`, `text-white/60`).
- Actions primaires: vert (bouton Play + indicateurs online).
- Etats d'erreur: rouge (erreurs update / statut offline).
- Accent secondaire ponctuel: cyan (action OAuth "Ouvrir l'URL").

Le rendu global repose sur:

- Glassmorphism discret (`bg-black/20`, `backdrop-blur-xl`, bordures blanches faibles).
- Vignettes et gradients sur le fond pour garantir contraste et profondeur.
- Grain overlay pour casser l'aplat numerique.

### 2.2 Typographie

- Police: Inter (Google Fonts) en 400/500/700/900.
- Hierarchie marquee par `font-black` sur les actions et titres critiques.
- Labels secondaires en uppercase + tracking large pour lecture UI "system".

### 2.3 Formes et surfaces

- Rayon de coin eleve: `rounded-xl`, `rounded-2xl`, `rounded-3xl`, jusqu'a `rounded-[2.5rem]`.
- Grandes ombres diffuses pour separation de plans.
- Bordures fines `border-white/10` pour structurer sans alourdir.

## 3. Architecture Layout

Le layout principal est compose de 3 plans:

1. Plan fond: image de session (ou pool d'images) animee.
2. Plan contenu: top bar, centre (logo), bottom action area.
3. Plan overlays: modales settings, selection session, OAuth device code, update prompt.

Implementation de reference:

- [src/screens/MainScreen.tsx](src/screens/MainScreen.tsx)
- [src/components/TopBar.tsx](src/components/TopBar.tsx)
- [src/components/BottomBar.tsx](src/components/BottomBar.tsx)
- [src/components/Layout.tsx](src/components/Layout.tsx)

## 4. Ecran Principal

### 4.1 Fond dynamique

- La session active fournit `assetsData.background` (string ou liste).
- Si plusieurs backgrounds: rotation aleatoire toutes les 10 secondes.
- Transition cross-fade + scale legere pour effet cinematique.
- Couches additionnelles:
  - gradient vertical sombre,
  - voile blur,
  - grain global faible opacite.

Effet UX: l'identite de la session domine visuellement, l'UI reste legere.

### 4.2 Zone centrale

- Si `assetsData.logo` existe: logo central anime (fade + blur + scale).
- Sinon: fallback typographique "LAUNCHED" geant, tres faible opacite.

### 4.3 Top Bar

- Gauche: capsule compte (avatar Minecraft, pseudo, type de compte).
- Droite: bouton settings circulaire/arrondi avec rotation au hover.
- Position fixe, pointer-events bloques globalement sauf elements interactifs.

### 4.4 Bottom Action Area

- Bloc session cliquable au centre:
  - nom de session,
  - dot online/offline,
  - hint de changement de version.
- Tooltip etendu avec:
  - statut serveur (online, joueurs),
  - statut services Mojang (auth/session/api).
- Bouton principal Play:
  - style hero vert,
  - grande taille et tracking large,
  - etat alternatif "syncing" avec label fichier + progression.

## 5. Overlays et Modales

### 5.1 Settings Modal

- Grande modale centree, fond noir translucide blur.
- Header + tabs internes (Accounts / General / Advanced).
- Tab General:
  - allocation RAM min/max (sl-range),
  - show logs,
  - JVM args,
  - wrapper command.
- Sauvegarde debouncee pour limiter les ecritures.

Reference:

- [src/components/SettingsModal.tsx](src/components/SettingsModal.tsx)
- [src/components/AccountSwitcher.tsx](src/components/AccountSwitcher.tsx)

### 5.2 Server Select Modal

- Liste des sessions en cartes.
- Session active en contraste inverse (fond blanc, texte sombre).
- Metadonnees visibles: version Minecraft, Forge, badge default.

Reference:

- [src/components/ServerSelectModal.tsx](src/components/ServerSelectModal.tsx)

### 5.3 Microsoft Device Code Modal

- UX guidee en 2 infos centrales: URL + code.
- Actions directes: ouvrir URL, copier code.
- Etat erreur dedie visible dans un bloc rouge.

Reference:

- [src/components/MicrosoftDeviceCodeModal.tsx](src/components/MicrosoftDeviceCodeModal.tsx)

### 5.4 Update Prompt Modal

- Modale prioritaire (z-index le plus eleve des overlays).
- Theme vert/emerald pour signaler une action positive systeme.
- Notes de release scrollables + progression d'installation.
- CTA principal "Installer maintenant" + secondaire "Plus tard".

Reference:

- [src/components/UpdatePromptModal.tsx](src/components/UpdatePromptModal.tsx)

## 6. Micro-interactions et Motion

Le motion design est structurel, pas decoratif:

- Entrees/sorties de modales avec scale + y-offset + fade.
- Reveals sequentiels des liens sociaux.
- Feedback controls: hover scale, tap compression, transitions de couleur.
- Etats de progression animes (sync + update).

Librairie: Framer Motion.

## 7. Systeme d'etats UX

Les etats principaux pilotes par le state global:

- Idle: affichage normal de la session.
- Syncing: bouton Play remplace par panneau de progression.
- Auth Required: modal device code ouverte.
- Settings Open / Server Select Open: overlays modaux.
- Update Available: prompt update visible tant que non dismiss.
- Installing Update: progression d'installation dans la modale update.

References:

- [src/state.ts](src/state.ts)
- [src/types.ts](src/types.ts)
- [src/app/launcher-controller.ts](src/app/launcher-controller.ts)

## 8. Stack UI

- React pour la composition d'interfaces.
- Tailwind CSS v4 pour les utilitaires de style.
- Shoelace (theme dark) pour composants web standards (`sl-icon`, `sl-range`, `sl-tooltip`).
- Framer Motion pour animations.

Bootstrap UI:

- [src/main.tsx](src/main.tsx)
- [src/assets/tailwind.css](src/assets/tailwind.css)
- [src/assets/style.css](src/assets/style.css)

## 9. Principes de Design a conserver

1. Immersion first: le visuel de session reste l'element dominant.
2. Clarte d'action: le bouton Play doit rester la priorite visuelle.
3. Information contextualisee: statuts serveur/Mojang disponibles sans encombrer.
4. Overlays consistants: meme grammaire (blur, bordure fine, coins tres arrondis).
5. Motion lisible: transitions fluides mais rapides, sans surcharge.

## 10. Notes de coherence

- Le launcher desktop suit deja une direction "ultra clean" tres proche de la spec Material redesign.
- Le dossier web/ suit une logique differente (site marketing) et n'entre pas dans ce document.
- `style.css` contient aussi des styles historiques lies a une ancienne UI; la surface active actuelle repose majoritairement sur les composants React + Tailwind.
