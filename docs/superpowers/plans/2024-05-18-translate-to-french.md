# Unify Website Language to French Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Translate all remaining English text in the website to French and update metadata.

**Architecture:** Update static text in components and metadata in Next.js layout.

**Tech Stack:** Next.js, React, TypeScript, Tailwind CSS.

---

### Task 1: Update Metadata and Language in `layout.tsx`

**Files:**
- Modify: `web/src/app/layout.tsx`

- [ ] **Step 1: Translate title and description, and set lang="fr"**

```tsx
export const metadata: Metadata = {
  title: "Launched - Portail de Launcher Immersif",
  description: "Découvrez le hub Minecraft ultime avec support multi-launcher et optimisation intelligente du disque.",
};

// ... in RootLayout return:
<html lang="fr" className={`${inter.variable} font-sans h-full antialiased`}>
```

- [ ] **Step 2: Commit**

```bash
git add web/src/app/layout.tsx
git commit -m "i18n: update layout metadata and language to French"
```

### Task 2: Translate `Hero.tsx` components

**Files:**
- Modify: `web/src/components/Hero.tsx`

- [ ] **Step 1: Translate download labels and description**

```tsx
    if (os === 'windows') {
      targetAsset = assets.find(a => a.name.endsWith('.exe'));
      return {
        label: 'Télécharger pour Windows (.exe)',
        url: targetAsset?.browser_download_url || '#',
        icon: <Monitor className="w-5 h-5" />
      };
    } else if (os === 'macos') {
      targetAsset = assets.find(a => a.name.endsWith('.dmg'));
      return {
        label: 'Télécharger pour macOS (.dmg)',
        url: targetAsset?.browser_download_url || '#',
        icon: <Apple className="w-5 h-5" />
      };
    } else if (os === 'linux') {
      targetAsset = assets.find(a => a.name.endsWith('.AppImage'));
      return {
        label: 'Télécharger pour Linux (.AppImage)',
        url: targetAsset?.browser_download_url || '#',
        icon: <Terminal className="w-5 h-5" />
      };
    }

    return {
      label: 'Télécharger la dernière version',
      url: release?.assets?.[0]?.browser_download_url || '#',
      icon: <Download className="w-5 h-5" />
    };
```

and 

```tsx
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.4, duration: 0.8 }}
          className="text-xl md:text-2xl text-zinc-400 mb-12 max-w-2xl mx-auto font-light tracking-wide"
        >
          Un launcher Minecraft minimaliste et performant pour l'ère moderne.
        </motion.p>
```

- [ ] **Step 2: Commit**

```bash
git add web/src/components/Hero.tsx
git commit -m "i18n: translate Hero component to French"
```

### Task 3: Verification

- [ ] **Step 1: Check if any other files in web/src contain English text**

Run: `grep -r "[a-zA-Z]" web/src` (This might be too broad, maybe search for specific English words or just manual check of what I've seen).
I've already checked `Features.tsx`, `FeatureCard.tsx`, `page.tsx` and `downloads/page.tsx`.

- [ ] **Step 2: Final Commit (if any more changes)**
