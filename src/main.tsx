import './assets/tailwind.css';
import './assets/style.css';
import React from 'react';
import ReactDOM from 'react-dom/client';
import { MotionConfig } from 'framer-motion';
import App from './App';
import { ErrorBoundary } from './components/ErrorBoundary';
import { LauncherController } from './app/launcher-controller';
import { createLogger, installGlobalLogBridge } from './services/logger';
import { state } from './state';

installGlobalLogBridge();
const log = createLogger('main');

window.addEventListener('error', (event) => {
  log.error(
    `Uncaught window error at ${event.filename || 'unknown'}:${event.lineno}:${event.colno}: ${event.message}`,
    event.error,
  );
});

window.addEventListener('unhandledrejection', (event) => {
  log.error('Unhandled promise rejection', event.reason);
});

log.info('Frontend bootstrap starting');

function renderFatalError(root: ReactDOM.Root, error: unknown): void {
  const message = error instanceof Error ? error.message : String(error);

  root.render(
    <div
      style={{
        minHeight: '100vh',
        background: '#111',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '2rem',
        color: 'white',
        fontFamily: 'Inter, sans-serif',
      }}
    >
      <div
        style={{
          textAlign: 'center',
          color: '#ff4444',
          border: '1px solid rgba(255,0,0,0.3)',
          padding: '2rem',
          borderRadius: '12px',
          background: 'rgba(255,0,0,0.05)',
          maxWidth: '400px',
        }}
      >
        <h2 style={{ fontSize: '1.5rem', marginBottom: '0.5rem' }}>
          Error Loading Sessions
        </h2>
        <p style={{ opacity: 0.8, fontSize: '0.875rem' }}>{message}</p>
      </div>
    </div>,
  );
}

const appElement = document.getElementById('app');
if (!appElement) {
  throw new Error('Root element #app not found');
}

const controller = new LauncherController();
const root = ReactDOM.createRoot(appElement);

root.render(
  <React.StrictMode>
    <ErrorBoundary>
      <MotionConfig reducedMotion="user">
        <App handlers={controller.getHandlers()} />
      </MotionConfig>
    </ErrorBoundary>
  </React.StrictMode>,
);

if (import.meta.env.DEV) {
  (
    window as unknown as {
      testUpdateModal: (isInstalling?: boolean) => void;
      launcherState: typeof state;
    }
  ).launcherState = state;

  const triggerTestUpdate = (isInstalling = false) => {
    state.updateManifest = {
      version: '1.5.0',
      body: '## Nouveautés\n- Refonte complète du design de la mise à jour\n- Nouvelle jauge de progression technique\n- Amélioration de la fluidité et des animations\n\n## Correctifs\n- Correction des styles résiduels\n- Optimisation du chargement des sessions',
    };
    state.dismissedUpdateVersion = null;
    state.isInstallingUpdate = isInstalling;
    state.updateInstallProgress = isInstalling ? 45 : 0;
  };

  const win = window as unknown as Record<string, unknown>;
  win.testUpdateModal = triggerTestUpdate;
  win.testUpdateAllow = triggerTestUpdate;

  win.testCrackModal = () => {
    state.crackModalOpen = true;
    state.crackModalDefaultPseudo = 'Steve';
  };

  win.testDeviceCodeModal = () => {
    state.deviceCodeModalOpen = true;
    state.deviceCodePayload = {
      user_code: 'WD7K-9P2M',
      verification_uri: 'https://microsoft.com/link',
    };
    state.deviceCodeError = null;
  };
}

controller
  .initialize()
  .then(() => {
    log.info('Frontend controller initialization completed');
  })
  .catch((error) => {
    log.error('Failed to initialize launcher', error);
    renderFatalError(root, error);
  });
