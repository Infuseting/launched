# Spec: Site Web Immersif "Launched"

**Date:** 2026-04-22  
**Statut:** En attente de revue  
**Stack:** Next.js 15 (App Router), TypeScript, Tailwind CSS v4, Framer Motion

## 1. Vision du Produit
Un site vitrine moderne et immersif servant de point d'entrée unique pour le launcher "Launched". Le site doit refléter l'esthétique "Ultra Clean" du launcher et faciliter l'installation immédiate du jeu selon l'OS de l'utilisateur.

## 2. Design & Esthétique
- **Style Visuel :** "Portal Experience". Fond sombre (`#050505`), grain de film (Noise), flous de mouvement et Glassmorphism.
- **Typographie :** Inter (Bold/Black pour les titres).
- **Animations :** Transitions fluides au scroll (Framer Motion) pour passer de l'immersion visuelle à l'explication technique.

## 3. Structure des Pages
### A. Page d'Accueil (Home)
- **Section Hero (Plein écran) :**
    - Fond dynamique (Image/Vidéo haute qualité).
    - Titre "LAUNCHED" massif.
    - **Smart Download :** Bouton central détectant l'OS (Windows, macOS, Linux) via `navigator.platform` ou user-agent.
- **Section Features (Scroll) :**
    - **Hub Multi-Launcher :** Capacité à gérer plusieurs launchers au sein d'une seule interface.
    - **Connexion Microsoft :** Authentification OAuth sécurisée.
    - **Optimisation Disque :** Mutualisation intelligente des fichiers (assets/libraries) entre les différents launchers pour économiser de l'espace.

### B. Page Téléchargement (Downloads)
- Accès via un lien "Toutes les versions".
- Liste épurée des exécutables finaux :
    - Windows (`.exe`)
    - macOS (`.dmg`)
    - Linux (`.AppImage`)
- **Source des données :** Récupération automatique de la dernière release via l'API GitHub (`/repos/{owner}/{repo}/releases/latest`).

## 4. Architecture Technique
- **Frontend :** Next.js avec rendu côté serveur (SSR) pour la récupération des releases.
- **Style :** Tailwind CSS v4 pour une gestion moderne du design système.
- **Détection OS :** Hook React personnalisé `useOSDetection`.
- **Intégration GitHub :** Client API pour parser les assets des releases et extraire les liens directs de téléchargement.

## 5. Assets nécessaires
- Image de fond cinématique (Minecraft/Artwork).
- Screenshots du launcher (Interface multi-launcher, login).
- Logo "Launched" en format SVG.

## 6. Critères de Succès
- [ ] Détection automatique de l'OS correcte à 100%.
- [ ] Cohérence visuelle parfaite avec le launcher.
- [ ] Temps de chargement ultra-rapide (< 1s pour le LCP).
- [ ] Liens de téléchargement toujours à jour via GitHub.