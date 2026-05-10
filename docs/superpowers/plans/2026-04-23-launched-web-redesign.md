# Redesign Minimaliste du Site Web Launched - Plan d'Implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refondre le site web de Launched pour adopter une esthétique minimaliste premium (Apple-like) avec une typographie massive et des effets de parallaxe discrets.

**Architecture:** Utilisation de Next.js avec Tailwind CSS pour le styling et Framer Motion pour les animations fluides et les effets de parallaxe.

**Tech Stack:** Next.js, TypeScript, Tailwind CSS, Framer Motion, Lucide React.

---

### Task 1: Mise à jour de la Navigation (Navbar)

**Files:**
- Modify: `web/src/components/Hero.tsx` (Extraction de la Navbar si nécessaire ou mise à jour directe)
- Create: `web/src/components/Navbar.tsx` (Pour une meilleure modularité)

- [ ] **Step 1: Créer le composant Navbar minimaliste**
```tsx
'use client';

import Link from 'next/link';

export default function Navbar() {
  return (
    <header className="fixed top-0 left-0 right-0 z-50 flex justify-between items-center px-8 py-6 bg-black/50 backdrop-blur-xl border-b border-white/5">
      <div className="text-xl font-black tracking-tighter">LAUNCHED</div>
      <nav className="flex items-center gap-8 text-[10px] font-bold tracking-[0.2em] uppercase text-zinc-500">
        <a href="#features" className="hover:text-white transition-colors">Fonctionnalités</a>
        <Link href="/downloads" className="hover:text-white transition-colors">Versions</Link>
        <a href="https://discord.gg/launched" className="hover:text-white transition-colors">Discord</a>
      </nav>
    </header>
  );
}
```

- [ ] **Step 2: Supprimer la Navbar interne de Hero.tsx et importer la nouvelle Navbar dans layout.tsx**
```tsx
// web/src/app/layout.tsx
import Navbar from "@/components/Navbar";
// ... dans RootLayout
<body className="min-h-full flex flex-col">
  <Navbar />
  {children}
  <div className="noise-overlay" />
</body>
```

- [ ] **Step 3: Commit**
```bash
git add web/src/components/Navbar.tsx web/src/app/layout.tsx web/src/components/Hero.tsx
git commit -m "style: add minimalist navbar and extract from hero"
```

---

### Task 2: Refonte de la section Hero (Impact Typographique)

**Files:**
- Modify: `web/src/components/Hero.tsx`

- [ ] **Step 1: Implémenter le nouveau design Hero avec typographie massive**
```tsx
'use client';

import { useOSDetection } from '@/hooks/useOSDetection';
import { GitHubRelease } from '@/lib/github';
import { motion } from 'framer-motion';
import { ChevronDown } from 'lucide-react';

export default function Hero({ release }: { release: GitHubRelease | null }) {
  const os = useOSDetection();
  // ... logique info (réutilisée)

  return (
    <section className="relative h-screen w-full flex flex-col items-center justify-center bg-black overflow-hidden pt-20">
      <motion.h1 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
        className="text-[15vw] md:text-[12vw] font-black tracking-tighter leading-none text-white text-center"
      >
        LAUNCHED<span className="text-blue-600">.</span>
      </motion.h1>

      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ delay: 0.4, duration: 0.8 }}
        className="mt-12"
      >
        <a href={info.url} className="px-12 py-5 bg-white text-black rounded-full font-black text-lg hover:scale-105 active:scale-95 transition-all">
          TÉLÉCHARGER
        </a>
      </motion.div>

      <div className="absolute bottom-12 flex flex-col items-center gap-2 text-zinc-600">
        <span className="text-[10px] font-bold tracking-widest uppercase">{info.sub}</span>
        <motion.div animate={{ y: [0, 5, 0] }} transition={{ repeat: Infinity, duration: 2 }}>
          <ChevronDown size={20} />
        </motion.div>
      </div>
    </section>
  );
}
```

- [ ] **Step 2: Commit**
```bash
git add web/src/components/Hero.tsx
git commit -m "style: implement massive typography hero design"
```

---

### Task 3: Création du composant ParallaxSection

**Files:**
- Create: `web/src/components/ParallaxSection.tsx`

- [ ] **Step 1: Créer le composant avec Framer Motion**
```tsx
'use client';

import { motion, useScroll, useTransform } from 'framer-motion';
import { useRef, ReactNode } from 'react';

interface ParallaxSectionProps {
  title: string;
  description: string;
  visual: ReactNode;
  reverse?: boolean;
}

export default function ParallaxSection({ title, description, visual, reverse }: ParallaxSectionProps) {
  const ref = useRef(null);
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ["start end", "end start"]
  });

  const y = useTransform(scrollYProgress, [0, 1], [50, -50]);

  return (
    <section ref={ref} className={`py-32 px-12 flex flex-col ${reverse ? 'md:flex-row-reverse' : 'md:flex-row'} items-center gap-16 max-w-7xl mx-auto`}>
      <div className="flex-1 space-y-6">
        <h2 className="text-4xl md:text-5xl font-black tracking-tighter uppercase leading-none">{title}</h2>
        <p className="text-zinc-500 text-lg leading-relaxed">{description}</p>
      </div>
      <motion.div style={{ y }} className="flex-1 w-full aspect-square bg-zinc-900/50 border border-white/5 rounded-[40px] flex items-center justify-center overflow-hidden">
        {visual}
      </motion.div>
    </section>
  );
}
```

- [ ] **Step 2: Commit**
```bash
git add web/src/components/ParallaxSection.tsx
git commit -m "feat: add reusable ParallaxSection component"
```

---

### Task 4: Implémentation des Visuels Techniques

**Files:**
- Create: `web/src/components/TechnicalVisuals.tsx`

- [ ] **Step 1: Créer les composants visuels (Disque, OAuth, Hub)**
```tsx
'use client';

export const DiskVisual = () => (
  <div className="relative w-full h-full flex items-center justify-center p-12">
    <div className="w-full h-4 bg-zinc-800 rounded-full overflow-hidden">
      <div className="h-full bg-blue-600 w-2/3 shadow-[0_0_20px_rgba(37,99,235,0.5)]" />
    </div>
    <span className="absolute bottom-1/3 text-[10px] font-bold text-blue-500 tracking-widest uppercase">Dédoublonnement Actif</span>
  </div>
);

export const OAuthVisual = () => (
  <div className="w-32 h-32 border-4 border-blue-600 rounded-full flex items-center justify-center">
    <div className="w-16 h-16 bg-white rounded-lg" /> {/* Placeholder Microsoft Logo */}
  </div>
);

export const HubVisual = () => (
  <div className="grid grid-cols-2 gap-4 w-48">
    <div className="h-12 bg-white/10 rounded-xl" />
    <div className="h-12 bg-white/10 rounded-xl" />
    <div className="h-12 bg-blue-600 rounded-xl" />
    <div className="h-12 bg-white/10 rounded-xl" />
  </div>
);
```

- [ ] **Step 2: Commit**
```bash
git add web/src/components/TechnicalVisuals.tsx
git commit -m "feat: add SVG/CSS technical visuals"
```

---

### Task 5: Intégration finale sur la page d'accueil

**Files:**
- Modify: `web/src/app/page.tsx`
- Delete: `web/src/components/Features.tsx` (Remplacé par ParallaxSection)

- [ ] **Step 1: Assembler les sections dans Home()**
```tsx
import { getLatestRelease } from "@/lib/github";
import Hero from "@/components/Hero";
import ParallaxSection from "@/components/ParallaxSection";
import { DiskVisual, OAuthVisual, HubVisual } from "@/components/TechnicalVisuals";

export default async function Home() {
  const release = await getLatestRelease();

  return (
    <main className="flex min-h-screen flex-col bg-black overflow-x-hidden">
      <Hero release={release} />
      <div id="features" className="space-y-32 pb-64">
        <ParallaxSection 
          title="Optimisation Intelligente"
          description="Économisez jusqu'à 60% d'espace disque grâce à notre moteur de dédoublonnement qui détecte les fichiers communs entre vos instances."
          visual={<DiskVisual />}
        />
        <ParallaxSection 
          title="Sécurité Native"
          description="Connexion officielle Microsoft OAuth. Nous n'avons jamais accès à vos identifiants, tout se passe entre vous et Microsoft."
          visual={<OAuthVisual />}
          reverse
        />
        <ParallaxSection 
          title="Hub Multi-Launcher"
          description="Gérez toutes vos configurations Minecraft depuis un point central unique, optimisé pour la vitesse."
          visual={<HubVisual />}
        />
      </div>
    </main>
  );
}
```

- [ ] **Step 2: Supprimer l'ancien composant Features.tsx et FeatureCard.tsx**
```bash
rm web/src/components/Features.tsx web/src/components/FeatureCard.tsx
```

- [ ] **Step 3: Commit final**
```bash
git add web/src/app/page.tsx
git commit -m "feat: integrate all sections into home page and cleanup"
```
