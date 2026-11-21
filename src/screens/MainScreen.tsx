import React from 'react';
import { useSessions } from '../hooks/useSessions';
import { useSyncProgress } from '../hooks/useSyncProgress';
import type { AppHandlers } from '../types';
import TopBar from '../components/TopBar';
import BottomBar from '../components/BottomBar';
import SocialLinks from '../components/SocialLinks';
import { motion } from 'framer-motion';
import { LoaderCircle } from 'lucide-react';
import defaultBackground from '../assets/default-bg.jpg';

interface MainScreenProps {
  handlers: Pick<
    AppHandlers,
    | 'syncAndLoad'
    | 'handleSettingsToggle'
    | 'handleServerSelectToggle'
    | 'handleTabChange'
  >;
}

export const MainScreen: React.FC<MainScreenProps> = ({ handlers }) => {
  const { activeSession: session, sessionsLoading } = useSessions();
  const { isSyncing } = useSyncProgress();

  const backgroundSource = session?.assetsData?.background;
  const waitingForAssets =
    (!session && sessionsLoading) ||
    (!!session?.assetsPath && !session.assetsData && !session.assetsLoadFailed);

  const backgroundPool = React.useMemo(() => {
    let pool: string[] = [];
    if (Array.isArray(backgroundSource)) {
      pool = backgroundSource.filter(
        (url): url is string => typeof url === 'string' && url.length > 0,
      );
    } else if (
      typeof backgroundSource === 'string' &&
      backgroundSource.length > 0
    ) {
      pool = [backgroundSource];
    }

    if (pool.length === 0) {
      return waitingForAssets ? [] : [defaultBackground];
    }

    return pool;
  }, [backgroundSource, waitingForAssets]);

  const pickRandomBackground = React.useCallback(
    (exclude?: string) => {
      if (backgroundPool.length === 0) {
        return undefined;
      }

      if (backgroundPool.length === 1) {
        return backgroundPool[0];
      }

      const choices = exclude
        ? backgroundPool.filter((bg) => bg !== exclude)
        : backgroundPool;
      const pool = choices.length > 0 ? choices : backgroundPool;
      const index = Math.floor(Math.random() * pool.length);
      return pool[index];
    },
    [backgroundPool],
  );

  const [activeBackground, setActiveBackground] = React.useState<
    string | undefined
  >(undefined);
  const requestedBackground =
    activeBackground && backgroundPool.includes(activeBackground)
      ? activeBackground
      : backgroundPool[0];
  const backgroundImage = React.useRef<HTMLImageElement>(null);
  const [backgroundResult, setBackgroundResult] = React.useState<{
    source?: string;
    failed?: boolean;
  }>({});
  const imageReady = backgroundResult.source === requestedBackground;
  const backgroundLoading =
    waitingForAssets || (!!requestedBackground && !imageReady);

  React.useEffect(() => {
    setActiveBackground((previous) =>
      previous && backgroundPool.includes(previous)
        ? previous
        : backgroundPool[0],
    );
  }, [backgroundPool]);

  React.useEffect(() => {
    if (backgroundPool.length <= 1) {
      return;
    }

    const intervalId = setInterval(() => {
      setActiveBackground((previous) => pickRandomBackground(previous));
    }, 10_000);

    return () => clearInterval(intervalId);
  }, [backgroundPool.length, pickRandomBackground]);

  // Combine and deduplicate links from session and assetsData
  const links = React.useMemo(() => {
    const rawLinks = [
      ...(session?.assetsData?.links || []),
      ...(session?.links || []),
    ];
    const seen = new Set<string>();
    return rawLinks.filter((link) => {
      const normalized = link.url.trim().toLowerCase().replace(/\/+$/, '');
      if (seen.has(normalized)) {
        return false;
      }
      seen.add(normalized);
      return true;
    });
  }, [session?.links, session?.assetsData?.links]);

  return (
    <div className="relative w-full h-full overflow-hidden bg-neutral-950 font-sans antialiased select-none">
      {/* Immersive Dynamic Background */}
      <div className="absolute inset-0 z-0 pointer-events-none">
        {/* Multi-layered Vignette & Gradients for contrast */}
        <div className="absolute inset-0 bg-gradient-to-t from-neutral-950 via-neutral-950/40 to-neutral-950/80 z-[2]" />
        <div className="absolute inset-0 bg-radial-gradient from-transparent via-neutral-950/20 to-neutral-950/70 z-[2]" />

        {requestedBackground && (
          <motion.img
            key={requestedBackground}
            ref={backgroundImage}
            src={requestedBackground}
            alt=""
            initial={{ opacity: 0 }}
            animate={{
              opacity: imageReady && !backgroundResult.failed ? 1 : 0,
            }}
            transition={{ duration: 0.3, ease: 'easeOut' }}
            decoding="async"
            fetchPriority="high"
            className="w-full h-full object-cover select-none brightness-85"
            draggable={false}
            onLoad={(e) => {
              if (backgroundImage.current === e.currentTarget) {
                setBackgroundResult({ source: requestedBackground });
              }
            }}
            onError={(e) => {
              const image = e.currentTarget;
              if (backgroundImage.current !== image) return;
              if (
                requestedBackground !== defaultBackground &&
                image.dataset.fallback !== 'true'
              ) {
                image.dataset.fallback = 'true';
                image.src = defaultBackground;
              } else
                setBackgroundResult({
                  source: requestedBackground,
                  failed: true,
                });
            }}
          />
        )}
      </div>

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
          {backgroundLoading ? (
            <div
              role="status"
              className="flex flex-col items-center gap-3 text-white/60"
            >
              <LoaderCircle
                aria-hidden="true"
                className="size-7 motion-safe:animate-spin"
              />
              <span className="text-sm">Chargement du visuel…</span>
            </div>
          ) : (
            <motion.h1
              initial={{ opacity: 0, scale: 0.96 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.8, ease: 'easeOut' }}
              className="text-[14vw] font-black text-white/50 tracking-tighter leading-none select-none drop-shadow-[0_25px_60px_rgba(0,0,0,0.8)] text-center"
            >
              LAUNCHED
            </motion.h1>
          )}
        </div>

        <BottomBar
          onPlayClick={() => handlers.syncAndLoad()}
          onServerSelectClick={() => handlers.handleServerSelectToggle(true)}
          isSyncing={isSyncing}
        />
      </div>
    </div>
  );
};

export default MainScreen;
