import React, { useState, useEffect, useCallback } from 'react';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { invoke } from '@tauri-apps/api/core';

interface TitleBarProps {
  isMaximized: boolean;
  onToggleMaximize?: () => void;
}

export const TitleBar: React.FC<TitleBarProps> = ({ isMaximized: propIsMaximized, onToggleMaximize }) => {
  const [isMaximized, setIsMaximized] = useState<boolean>(propIsMaximized);

  // Sync state with Tauri window
  const syncMaximizedState = useCallback(async () => {
    try {
      const win = getCurrentWindow();
      const maximized = await win.isMaximized();
      setIsMaximized(maximized);
    } catch {
      try {
        const maximized = await invoke<boolean>('window_is_maximized');
        setIsMaximized(maximized);
      } catch {
        // Fallback to prop
      }
    }
  }, []);

  useEffect(() => {
    setIsMaximized(propIsMaximized);
  }, [propIsMaximized]);

  useEffect(() => {
    syncMaximizedState();

    let unlisten: (() => void) | undefined;
    try {
      const win = getCurrentWindow();
      win.onResized(() => {
        syncMaximizedState();
      }).then(fn => {
        unlisten = fn;
      }).catch(() => {
        // Ignore if unsupported
      });
    } catch {
      // Ignore
    }

    return () => {
      if (unlisten) unlisten();
    };
  }, [syncMaximizedState]);

  const handleMinimize = async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      const win = getCurrentWindow();
      await win.minimize();
    } catch {
      await invoke('window_minimize');
    }
  };

  const handleToggleMaximize = async (e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    try {
      const win = getCurrentWindow();
      await win.toggleMaximize();
      const maximized = await win.isMaximized();
      setIsMaximized(maximized);
      if (onToggleMaximize) onToggleMaximize();
    } catch {
      try {
        const maximized = await invoke<boolean>('window_toggle_maximize');
        setIsMaximized(maximized);
        if (onToggleMaximize) onToggleMaximize();
      } catch {
        // ignore
      }
    }
  };

  const handleClose = async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      const win = getCurrentWindow();
      await win.close();
    } catch {
      await invoke('window_close');
    }
  };

  return (
    <div
      data-tauri-drag-region
      onDoubleClick={() => handleToggleMaximize()}
      className="relative z-[100] h-8 w-full bg-neutral-950/80 backdrop-blur-xl border-b border-white/5 flex items-center justify-between select-none flex-shrink-0"
    >
      {/* Left: App Branding (Draggable) */}
      <div
        data-tauri-drag-region
        className="flex items-center gap-2.5 px-3 h-full pointer-events-auto"
      >
        <img
          src="/icon.png"
          alt="Launched"
          className="w-3.5 h-3.5 object-contain pointer-events-none drop-shadow-sm"
          onError={(e) => {
            // Fallback to 128x128.png if icon.png fails
            (e.target as HTMLImageElement).src = '/128x128.png';
          }}
        />
        <span
          data-tauri-drag-region
          className="text-[11px] font-black uppercase tracking-[0.18em] text-white/50 hover:text-white/80 transition-colors"
        >
          Launched
        </span>
      </div>

      {/* Center: Draggable empty space */}
      <div
        data-tauri-drag-region
        className="flex-1 h-full cursor-default"
      />

      {/* Right: Window Controls Trio (Not Draggable) */}
      <div className="flex items-center h-full no-drag">
        {/* Minimize Button */}
        <button
          type="button"
          onClick={handleMinimize}
          title="Réduire"
          aria-label="Réduire"
          className="w-11 h-8 flex items-center justify-center text-white/60 hover:text-white hover:bg-white/10 active:bg-white/15 transition-colors cursor-default"
        >
          <svg width="10" height="1" viewBox="0 0 10 1" fill="currentColor">
            <rect width="10" height="1" />
          </svg>
        </button>

        {/* Maximize / Restore Button */}
        <button
          type="button"
          onClick={handleToggleMaximize}
          title={isMaximized ? 'Niveau inf.' : 'Agrandir'}
          aria-label={isMaximized ? 'Niveau inf.' : 'Agrandir'}
          className="w-11 h-8 flex items-center justify-center text-white/60 hover:text-white hover:bg-white/10 active:bg-white/15 transition-colors cursor-default"
        >
          {isMaximized ? (
            /* Restore icon (overlapping squares) */
            <svg
              width="10"
              height="10"
              viewBox="0 0 10 10"
              fill="none"
              stroke="currentColor"
              strokeWidth="1"
              strokeLinejoin="round"
            >
              <path d="M2.5 7.5H1V1h6.5v1.5" />
              <rect x="2.5" y="2.5" width="6.5" height="6.5" rx="0.5" />
            </svg>
          ) : (
            /* Maximize icon (single square) */
            <svg
              width="10"
              height="10"
              viewBox="0 0 10 10"
              fill="none"
              stroke="currentColor"
              strokeWidth="1"
            >
              <rect x="0.5" y="0.5" width="9" height="9" rx="0.5" />
            </svg>
          )}
        </button>

        {/* Close Button */}
        <button
          type="button"
          onClick={handleClose}
          title="Fermer"
          aria-label="Fermer"
          className="w-11 h-8 flex items-center justify-center text-white/60 hover:text-white hover:bg-red-500 active:bg-red-600 transition-colors cursor-default"
        >
          <svg
            width="10"
            height="10"
            viewBox="0 0 10 10"
            stroke="currentColor"
            strokeWidth="1.2"
            strokeLinecap="round"
          >
            <line x1="1" y1="1" x2="9" y2="9" />
            <line x1="9" y1="1" x2="1" y2="9" />
          </svg>
        </button>
      </div>
    </div>
  );
};

export default TitleBar;
