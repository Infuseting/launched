# Launched Website Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build an immersive Next.js website for the "Launched" project with OS detection, GitHub integration, and a dedicated Git repository in the `web/` directory.

**Architecture:** Next.js 15 App Router with a clean separation between UI components and data fetching. The site uses a "Portal" Hero section followed by a "Feature Showcase" scroll experience.

**Tech Stack:** Next.js, TypeScript, Tailwind CSS v4, Framer Motion, Lucide React.

---

### Task 1: Project Scaffolding & Git Setup

**Files:**
- Create: `web/` (directory)
- Create: `web/.gitignore`

- [ ] **Step 1: Create Next.js project**
Run: `npx create-next-app@latest web --typescript --tailwind --eslint --app --src-dir --import-alias "@/*" --use-npm --yes`

- [ ] **Step 2: Initialize Git and add remote**
Run: `cd web && git init && git remote add origin https://github.com/Infuseting/launched-site.git`

- [ ] **Step 3: Initial Commit**
Run: `cd web && git add . && git commit -m "chore: initial next.js scaffold"`

---

### Task 2: Global Styles & Design Tokens

**Files:**
- Modify: `web/src/app/globals.css`
- Modify: `web/src/app/layout.tsx`

- [ ] **Step 1: Configure Tailwind v4 & Global CSS**
```css
/* web/src/app/globals.css */
@import "tailwindcss";

:root {
  --background: #050505;
  --foreground: #ffffff;
  --accent: #2563eb;
}

body {
  background-color: var(--background);
  color: var(--foreground);
  font-family: 'Inter', sans-serif;
  overflow-x: hidden;
}

.noise-overlay {
  position: fixed;
  inset: 0;
  opacity: 0.03;
  z-index: 50;
  pointer-events: none;
  background-image: url('https://grainy-gradients.vercel.app/noise.svg');
}

.glass {
  background: rgba(255, 255, 255, 0.03);
  backdrop-filter: blur(12px);
  border: 1px solid rgba(255, 255, 255, 0.08);
}
```

- [ ] **Step 2: Commit**
Run: `cd web && git add src/app/globals.css src/app/layout.tsx && git commit -m "style: add global design tokens and noise overlay"`

---

### Task 3: OS Detection Hook

**Files:**
- Create: `web/src/hooks/useOSDetection.ts`

- [ ] **Step 1: Implement OS detection logic**
```typescript
import { useState, useEffect } from 'react';

export type OS = 'windows' | 'macos' | 'linux' | 'unknown';

export function useOSDetection() {
  const [os, setOs] = useState<OS>('unknown');

  useEffect(() => {
    const platform = window.navigator.platform.toLowerCase();
    const userAgent = window.navigator.userAgent.toLowerCase();

    if (platform.includes('win') || userAgent.includes('win')) setOs('windows');
    else if (platform.includes('mac') || userAgent.includes('mac')) setOs('macos');
    else if (platform.includes('linux') || userAgent.includes('linux')) setOs('linux');
  }, []);

  return os;
}
```

- [ ] **Step 2: Commit**
Run: `cd web && git add src/hooks/useOSDetection.ts && git commit -m "feat: add useOSDetection hook"`

---

### Task 4: GitHub API Integration

**Files:**
- Create: `web/src/lib/github.ts`

- [ ] **Step 1: Implement GitHub release fetcher**
```typescript
export interface GitHubRelease {
  version: string;
  assets: {
    name: string;
    browser_download_url: string;
  }[];
}

export async function getLatestRelease(): Promise<GitHubRelease | null> {
  try {
    const res = await fetch('https://api.github.com/repos/Infuseting/launched/releases/latest', {
      next: { revalidate: 3600 } // Cache for 1 hour
    });
    const data = await res.json();
    return {
      version: data.tag_name,
      assets: data.assets.map((a: any) => ({
        name: a.name,
        browser_download_url: a.browser_download_url
      }))
    };
  } catch (e) {
    console.error('Failed to fetch GitHub release', e);
    return null;
  }
}
```

- [ ] **Step 2: Commit**
Run: `cd web && git add src/lib/github.ts && git commit -m "feat: add github api integration"`

---

### Task 5: Immersive Hero Section

**Files:**
- Modify: `web/src/app/page.tsx`

- [ ] **Step 1: Build the Hero UI**
- [ ] **Step 2: Commit**
Run: `cd web && git add src/app/page.tsx && git commit -m "feat: implement immersive hero section with smart download"`

---

### Task 6: Feature Showcase (Scroll)

**Files:**
- Create: `web/src/components/FeatureCard.tsx`
- Modify: `web/src/app/page.tsx`

- [ ] **Step 1: Create FeatureCard component**
- [ ] **Step 2: Add features section to Home page**
- [ ] **Step 3: Commit**
Run: `cd web && git add . && git commit -m "feat: add feature showcase section"`

---

### Task 7: Downloads Page

**Files:**
- Create: `web/src/app/downloads/page.tsx`

- [ ] **Step 1: Build the advanced downloads grid**
- [ ] **Step 2: Commit**
Run: `cd web && git add . && git commit -m "feat: add advanced downloads page"`