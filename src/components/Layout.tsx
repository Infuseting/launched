import React, { useState, useEffect } from 'react';
import TitleBar from './TitleBar';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { invoke } from '@tauri-apps/api/core';

interface LayoutProps {
  children: React.ReactNode;
}

const Layout: React.FC<LayoutProps> = ({ children }) => {
  const [isMaximized, setIsMaximized] = useState(false);

  useEffect(() => {
    const checkState = async () => {
      try {
        const win = getCurrentWindow();
        const max = await win.isMaximized();
        setIsMaximized(max);
      } catch {
        try {
          const max = await invoke<boolean>('window_is_maximized');
          setIsMaximized(max);
        } catch {
          // ignore
        }
      }
    };

    checkState();

    let unlisten: (() => void) | undefined;
    try {
      const win = getCurrentWindow();
      win.onResized(() => {
        checkState();
      }).then((fn) => {
        unlisten = fn;
      }).catch(() => {});
    } catch {}

    return () => {
      if (unlisten) unlisten();
    };
  }, []);

  return (
    <div
      className={`h-screen w-screen flex flex-col bg-neutral-950 font-sans antialiased selection:bg-blue-500/30 overflow-hidden ${
        isMaximized ? 'rounded-none border-0' : 'rounded-xl border border-white/10 shadow-2xl'
      }`}
    >
      <TitleBar isMaximized={isMaximized} onToggleMaximize={() => setIsMaximized((prev) => !prev)} />
      <main className="flex-1 relative overflow-hidden flex flex-col">
        {children}
      </main>
    </div>
  );
};

export default Layout;
