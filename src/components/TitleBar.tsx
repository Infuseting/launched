import React from 'react';
import { getCurrentWindow } from '@tauri-apps/api/window';

interface TitleBarProps {
  isMaximized: boolean;
  onMaximizedChange?: (maximized: boolean) => void;
}

export const TitleBar: React.FC<TitleBarProps> = ({
  isMaximized,
  onMaximizedChange,
}) => {
  const handleMinimize = async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await getCurrentWindow().minimize();
    } catch {
      // Unavailable in browser preview.
    }
  };

  const handleToggleMaximize = async (e?: React.MouseEvent) => {
    e?.stopPropagation();
    try {
      const win = getCurrentWindow();
      await win.toggleMaximize();
      onMaximizedChange?.(await win.isMaximized());
    } catch {
      // Unavailable in browser preview.
    }
  };

  const handleClose = async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await getCurrentWindow().close();
    } catch {
      // Unavailable in browser preview.
    }
  };

  return (
    <div
      data-tauri-drag-region
      onDoubleClick={() => void handleToggleMaximize()}
      className="relative z-[100] h-8 w-full bg-neutral-950/80 backdrop-blur-xl border-b border-white/5 flex items-center justify-between select-none flex-shrink-0"
    >
      <div
        data-tauri-drag-region
        className="flex items-center gap-2.5 px-3 h-full pointer-events-auto"
      >
        <img
          src="/icon.png"
          alt=""
          width={20}
          height={20}
          className="size-5 object-contain pointer-events-none"
        />
        <span
          data-tauri-drag-region
          className="text-[11px] font-black uppercase tracking-[0.18em] text-white/50 hover:text-white/80 transition-colors"
        >
          Launched
        </span>
      </div>

      <div data-tauri-drag-region className="flex-1 h-full cursor-default" />

      <div className="flex items-center h-full no-drag">
        <button
          type="button"
          onClick={(e) => void handleMinimize(e)}
          title="Réduire"
          aria-label="Réduire"
          className="w-11 h-8 flex items-center justify-center text-white/60 hover:text-white hover:bg-white/10 active:bg-white/15 transition-colors cursor-default"
        >
          <svg width="10" height="1" viewBox="0 0 10 1" fill="currentColor">
            <rect width="10" height="1" />
          </svg>
        </button>

        <button
          type="button"
          onClick={(e) => void handleToggleMaximize(e)}
          title={isMaximized ? 'Niveau inf.' : 'Agrandir'}
          aria-label={isMaximized ? 'Niveau inf.' : 'Agrandir'}
          className="w-11 h-8 flex items-center justify-center text-white/60 hover:text-white hover:bg-white/10 active:bg-white/15 transition-colors cursor-default"
        >
          {isMaximized ? (
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

        <button
          type="button"
          onClick={(e) => void handleClose(e)}
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
