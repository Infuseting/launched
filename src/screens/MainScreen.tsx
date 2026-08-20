import React from 'react';
import { useLauncherState } from '../state';
import type { AppHandlers } from '../types';
import TopBar from '../components/TopBar';
import BottomBar from '../components/BottomBar';
import SocialLinks from '../components/SocialLinks';
import { motion, AnimatePresence } from 'framer-motion';

interface MainScreenProps {
  handlers: Pick<AppHandlers, 'syncAndLoad' | 'handleSettingsToggle' | 'handleServerSelectToggle' | 'handleTabChange'>;
}

export const MainScreen: React.FC<MainScreenProps> = ({ handlers }) => {
  const state = useLauncherState();
  const session = state.globalSessions[state.activeSessionIndex];

  const backgroundSource = session?.assetsData?.background;

  const backgroundPool = React.useMemo(() => {
    if (Array.isArray(backgroundSource)) {
      return backgroundSource.filter((url): url is string => typeof url === 'string' && url.length > 0);
    }

    if (typeof backgroundSource === 'string' && backgroundSource.length > 0) {
      return [backgroundSource];
    }

    return [];
  }, [backgroundSource]);

  const pickRandomBackground = React.useCallback((exclude?: string) => {
    if (backgroundPool.length === 0) {
      return undefined;
    }

    if (backgroundPool.length === 1) {
      return backgroundPool[0];
    }

    const choices = exclude ? backgroundPool.filter(bg => bg !== exclude) : backgroundPool;
    const pool = choices.length > 0 ? choices : backgroundPool;
    const index = Math.floor(Math.random() * pool.length);
    return pool[index];
  }, [backgroundPool]);

  const [activeBackground, setActiveBackground] = React.useState<string | undefined>(undefined);

  React.useEffect(() => {
    setActiveBackground(pickRandomBackground());
  }, [pickRandomBackground]);

  React.useEffect(() => {
    if (backgroundPool.length <= 1) {
      return;
    }

    const intervalId = setInterval(() => {
      setActiveBackground(previous => pickRandomBackground(previous));
    }, 10_000);

    return () => clearInterval(intervalId);
  }, [backgroundPool.length, pickRandomBackground]);

  // Combine links from session and assetsData
  const links = [...(session?.links || []), ...(session?.assetsData?.links || [])];

  return (
    <div className="relative w-full h-screen overflow-hidden bg-neutral-950 font-sans antialiased select-none">
      {/* Immersive Dynamic Background */}
      <AnimatePresence mode="wait">
        <motion.div
          key={activeBackground ?? 'no-background'}
          initial={{ opacity: 0, scale: 1.04 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 1.2, ease: 'easeOut' }}
          className="absolute inset-0 z-0 pointer-events-none"
        >
          {/* Multi-layered Vignette & Gradients for contrast */}
          <div className="absolute inset-0 bg-gradient-to-t from-neutral-950 via-neutral-950/40 to-neutral-950/80 z-[2]" />
          <div className="absolute inset-0 bg-radial-gradient from-transparent via-neutral-950/20 to-neutral-950/70 z-[2]" />

          {activeBackground && (
            <img
              src={activeBackground}
              alt="Session Background"
              className="w-full h-full object-cover select-none brightness-85"
              draggable={false}
            />
          )}
        </motion.div>
      </AnimatePresence>

      {/* Main UI Layers */}
      <div className="relative z-10 w-full h-full flex flex-col justify-between">
        <TopBar
          onSettingsClick={() => handlers.handleSettingsToggle(true)}
          onAccountClick={() => {
            handlers.handleTabChange('account');
            handlers.handleSettingsToggle(true);
          }}
        />

        {/* Social Links on the right */}
        <div className="absolute right-8 top-28 z-20">
          <SocialLinks links={links} assetsPath={session?.assetsPath} />
        </div>

        {/* Center monumental typographic title "LAUNCHED" with 50% opacity */}
        <div className="flex-1 flex items-center justify-center p-6 pointer-events-none select-none">
          <motion.h1
            initial={{ opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.8, ease: 'easeOut' }}
            className="text-[14vw] font-black text-white/50 tracking-tighter leading-none select-none drop-shadow-[0_25px_60px_rgba(0,0,0,0.8)] text-center"
          >
            LAUNCHED
          </motion.h1>
        </div>

        <BottomBar
          onPlayClick={() => handlers.syncAndLoad()}
          onServerSelectClick={() => handlers.handleServerSelectToggle(true)}
          isSyncing={state.isSyncing}
        />
      </div>
    </div>
  );
};

export default MainScreen;
