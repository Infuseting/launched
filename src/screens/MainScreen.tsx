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

const MainScreen: React.FC<MainScreenProps> = ({ handlers }) => {
  const state = useLauncherState();
  const session = state.globalSessions[state.activeSessionIndex];

  // Use a default background if none is provided by session
  const background = session?.assetsData?.background;

  // Combine links from session and assetsData
  const links = [...(session?.links || []), ...(session?.assetsData?.links || [])];

  return (
    <div className="relative w-full h-screen overflow-hidden bg-neutral-950 font-sans antialiased">
      {/* Immersive Dynamic Background */}
      <AnimatePresence mode="wait">
        <motion.div
          key={background}
          initial={{ opacity: 0, scale: 1.05 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 1.5, ease: "easeOut" }}
          className="absolute inset-0 z-0 pointer-events-none"
        >
          {/* Multi-layered Vignette & Overlay */}
          <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/20 to-black/60 z-[2]" />
          <div className="absolute inset-0 bg-neutral-950/20 backdrop-blur-[2px] z-[1]" />

          <img
            src={background}
            alt="Background"
            className="w-full h-full object-cover select-none brightness-75 scale-[1.02]"
            draggable={false}
          />
        </motion.div>
      </AnimatePresence>

      {/* Main UI Layers */}
      <div className="relative z-10 w-full h-full flex flex-col">
        <TopBar
          onSettingsClick={() => handlers.handleSettingsToggle(true)}
          onAccountClick={() => {
            handlers.handleTabChange('account');
            handlers.handleSettingsToggle(true);
          }}
        />

        {/* Social Links on the right */}
        <div className="absolute right-12 top-28 z-20">
          <SocialLinks links={links} assetsPath={session?.assetsPath} />
        </div>

        {/* Center content (empty or Logo) */}
        <div className="flex-1 flex items-center justify-center p-12">
          <AnimatePresence mode="wait">
            {session?.assetsData?.logo ? (
              <motion.img
                key={session.assetsData.logo}
                initial={{ opacity: 0, scale: 0.8, filter: 'blur(20px)' }}
                animate={{ opacity: 1, scale: 1, filter: 'blur(0px)' }}
                exit={{ opacity: 0, scale: 0.8, filter: 'blur(20px)' }}
                transition={{ duration: 0.8 }}
                src={session.assetsData.logo}
                alt="Logo"
                className="max-w-[500px] w-full h-auto drop-shadow-[0_20px_50px_rgba(0,0,0,0.8)] pointer-events-none select-none brightness-110"
                draggable={false}
              />
            ) : (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 0.1 }}
                className="text-[12rem] font-black text-white select-none pointer-events-none tracking-tighter"
              >
                LAUNCHED
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <BottomBar
          onPlayClick={() => handlers.syncAndLoad()}
          onServerSelectClick={() => handlers.handleServerSelectToggle(true)}
          isSyncing={state.isSyncing}
        />
      </div>


      {/* Ambient noise/grain effect */}
      <div className="absolute inset-0 z-[5] pointer-events-none opacity-[0.03] bg-[url('https://grainy-gradients.vercel.app/noise.svg')] mix-blend-overlay"></div>
    </div>
  );
};

export default MainScreen;
