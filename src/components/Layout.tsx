import React, { useState, useEffect } from 'react';
import TitleBar from './TitleBar';
import { getCurrentWindow } from '@tauri-apps/api/window';

interface LayoutProps {
  children: React.ReactNode;
}

const Layout: React.FC<LayoutProps> = ({ children }) => {
  const [isMaximized, setIsMaximized] = useState(false);

  useEffect(() => {
    let unlisten: (() => void) | undefined;
    let disposed = false;

    const syncMaximized = async () => {
      try {
        const maximized = await getCurrentWindow().isMaximized();
        if (!disposed) setIsMaximized(maximized);
      } catch {
        // Window APIs are unavailable when previewing the UI in a browser.
      }
    };

    void syncMaximized();

    try {
      getCurrentWindow()
        .onResized(() => {
          void syncMaximized();
        })
        .then((fn) => {
          if (disposed) fn();
          else unlisten = fn;
        })
        .catch(() => {
          // Ignore when running outside Tauri.
        });
    } catch {
      // Ignore when running outside Tauri.
    }

    return () => {
      disposed = true;
      unlisten?.();
    };
  }, []);

  return (
    <div
      className={`h-screen w-screen flex flex-col bg-neutral-950 font-sans antialiased selection:bg-blue-500/30 overflow-hidden ${
        isMaximized
          ? 'rounded-none border-0'
          : 'rounded-xl border border-white/10 shadow-2xl'
      }`}
    >
      <TitleBar isMaximized={isMaximized} onMaximizedChange={setIsMaximized} />
      <main className="flex-1 relative overflow-hidden flex flex-col">
        {children}
      </main>
    </div>
  );
};

export default Layout;
