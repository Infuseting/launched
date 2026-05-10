# Spécification de Design : Redesign Minimaliste du Site Web Launched

**Date :** 2026-04-23
**Statut :** En attente de revue finale
**Auteur :** Gemini CLI

## 1. Vision et Objectifs
Transformer le site vitrine actuel de "Launched" en une expérience web haut de gamme, minimaliste et techniquement convaincante. L'objectif principal est de maximiser le taux de téléchargement tout en rassurant l'utilisateur sur la sécurité et l'efficacité de l'outil.

- **Esthétique :** Minimaliste "Apple-like" (Noir pur, typographie forte, espaces généreux).
- **Action Prioritaire :** Téléchargement immédiat de l'application.
- **Preuves Techniques :** Optimisation disque, sécurité Microsoft OAuth, gestion multi-compte.

## 2. Structure de la Page (Single Page)

### A. Barre de Navigation (Fixe)
- **Logo :** "LAUNCHED" en gras, noir sur fond noir (effet de contraste via la typographie).
- **Liens :** Fonctionnalités, Versions (liant vers `/downloads`), Discord.
- **Style :** Ultra-fine, fond semi-transparent (glassmorphism) lors du scroll.

### B. Section Hero (Impact Maximal)
- **Titre :** "LAUNCHED." en typographie massive (Inter Black, tracking serré, font-size variable selon le viewport ~12vw).
- **Accent :** Le point final est de couleur bleu électrique (#2563eb).
- **Appel à l'action (CTA) :** Bouton blanc massif, coins arrondis (2xl), centré sous le titre.
- **Sous-texte :** Version actuelle et détection automatique de l'OS.

### C. Sections Parallaxe (Preuves Techniques)
Trois sections alternées utilisant un effet de parallaxe discret :
1.  **Optimisation Disque :** Texte à gauche expliquant le moteur de dédoublonnement. Image à droite montrant une barre de progression ou un schéma vectoriel de gain d'espace.
2.  **Sécurité OAuth :** Texte à droite sur l'authentification officielle Microsoft. Image à gauche illustrant le flux de connexion sécurisé (badge Microsoft).
3.  **Gestion Multi-compte :** Texte à gauche sur la fluidité du hub. Image à droite montrant une interface simplifiée de sélection de profil.

### D. Footer
- Liens légaux, GitHub, et rappel discret du CTA de téléchargement.

## 3. Direction Artistique

- **Palette de Couleurs :**
  - Fond : `#000000` (Noir pur)
  - Accents : `#2563eb` (Bleu électrique)
  - Texte : `#FFFFFF` (Blanc), `#71717a` (Zinc-500)
- **Typographie :**
  - Titres : Inter Black (900)
  - Corps : Inter Regular/Medium (400/500)
- **Animations :**
  - Framer Motion pour les entrées en fondu (fade-in-up).
  - Effet de parallaxe sur les images via `useScroll` et `useTransform`.

## 4. Composants à Créer/Modifier

1.  **`Hero.tsx` :** Refonte totale pour adopter le style typographique massif et le nouveau CTA.
2.  **`ParallaxSection.tsx` :** Nouveau composant réutilisable pour les sections de preuves techniques.
3.  **`TechnicalVisuals` :** Série de petits composants SVG ou CSS pour les illustrations (Disque, OAuth, Hub).
4.  **`Navbar.tsx` :** Mise à jour pour correspondre au nouveau style minimaliste.

## 5. Tests et Validation
- Vérification du rendu sur mobile (responsive design critique pour la typo massive).
- Test de la performance des animations (60fps).
- Validation de l'accessibilité (contraste des textes sur fond noir).
