import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';

const state = {
  discordUser: null,
  discordSkipped: false,
  discordChecking: false,
  discordBusy: false,
  discordError: null,
  globalSessions: [],
  activeSessionIndex: 0,
  sessionsLoading: false,
  sessionsError: null,
  sessionLinkError: null,
  isSyncing: false,
  isSettingsOpen: false,
  isServerSelectOpen: false,
  allAccounts: [{ uuid: 'minecraft', name: 'Player' }],
  authCache: { uuid: 'minecraft' },
  currentSettings: {},
};
const user = {
  discordId: '123456789012345678',
  username: 'test.user',
  avatar: null,
};
const rows = [
  { name: 'Public', syncUrl: 'https://launcher.test/public' },
  { name: 'Private', syncUrl: 'https://launcher.test/private' },
];
let storedUser = null;
let restoreError = null;
let loginError = null;
let logoutError = null;
let sessionError = null;
let sessionCalls = 0;
let revoked = false;
let guest = false;
let pendingRestore = null;
let pendingSessions = null;
let savedSettings = {};
let restoreCalls = 0;
let fetchedAssetsUrls = [];
let mockDeepLink = null;
let activeSessionSaved = null;
const eventListeners = new Map();
globalThis.__discordControllerTest = {
  eventListeners,
  state,
  auth: {
    getDiscordAuth: async () => {
      restoreCalls++;
      if (pendingRestore) return pendingRestore;
      if (restoreError) throw restoreError;
      return guest ? null : storedUser;
    },
    loginDiscord: async () => {
      if (loginError) throw loginError;
      guest = false;
      return user;
    },
    logoutDiscord: async () => {
      if (logoutError) throw logoutError;
      revoked = true;
      guest = false;
    },
    continueWithoutDiscord: async () => {
      guest = true;
    },
  },
  sessions: {
    getSessions: async () => {
      sessionCalls++;
      if (pendingSessions) {
        const response = pendingSessions;
        pendingSessions = null;
        return response;
      }
      if (sessionError) throw sessionError;
      return guest ? rows.slice(0, 1) : rows;
    },
    getActiveSessionName: async () => 'Private',
    fetchJson: async (url) => {
      fetchedAssetsUrls.push(url);
      return {
        background: '/bg.png',
        icon: '/icon.png',
        logo: '/logo.png',
        links: [],
      };
    },
    getDeepLinkUrl: async () => {
      const url = mockDeepLink;
      mockDeepLink = null;
      return url;
    },
    setActiveSession: async (name) => {
      activeSessionSaved = name;
    },
    extractSessionSlugFromDeepLink: (url) => {
      if (!url || !url.startsWith('launched://')) return null;
      let path = url.slice('launched://'.length);
      path = path.split('?')[0].split('#')[0].replace(/\/+$/, '');
      if (path.startsWith('session/')) path = path.slice('session/'.length);
      path = decodeURIComponent(path).trim();
      return path || null;
    },
  },
  settings: {
    saveSettingsInternal: async (settings) => {
      savedSettings = structuredClone(settings);
    },
  },
};
const virtual = (source) =>
  `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`;
let code = ts.transpileModule(
  await readFile(
    new URL('../src/app/launcher-controller.ts', import.meta.url),
    'utf8',
  ),
  {
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.ESNext,
    },
  },
).outputText;
const mocks = {
  '@tauri-apps/api/event':
    'export const listen=async(name, callback)=>{globalThis.__discordControllerTest.eventListeners.set(name, callback);return ()=>{};};',
  '@tauri-apps/plugin-shell': 'export const open=async()=>{};',
  '../state': 'export const state=globalThis.__discordControllerTest.state;',
  '../services/auth':
    'export const { getDiscordAuth, loginDiscord, logoutDiscord, continueWithoutDiscord }=globalThis.__discordControllerTest.auth;',
  '../services/sessions':
    'export const { getSessions, getActiveSessionName, fetchJson, getDeepLinkUrl, extractSessionSlugFromDeepLink, setActiveSession }=globalThis.__discordControllerTest.sessions;',
  '../services/settings':
    'export const { saveSettingsInternal }=globalThis.__discordControllerTest.settings;',
  '../services/status': 'export const unused=true;',
  '../services/updater': 'export const unused=true;',
};
for (const [specifier, source] of Object.entries(mocks))
  code = code
    .replaceAll(`from '${specifier}'`, `from '${virtual(source)}'`)
    .replaceAll(`from "${specifier}"`, `from '${virtual(source)}'`);
const { LauncherController } = await import(virtual(code));
const controller = new LauncherController();
const handlers = controller.getHandlers();

test('startup restores a verified Discord identity before fetching any sessions', async () => {
  await handlers.handleDiscordRestore();
  assert.equal(state.discordUser, null);
  assert.equal(sessionCalls, 0);
  storedUser = user;
  await handlers.handleDiscordRestore();
  assert.deepEqual(state.discordUser, user);
  assert.deepEqual(state.globalSessions, rows);
  assert.equal(state.activeSessionIndex, 1);
  assert.equal(state.discordChecking, false);
  // Refresh preserves the currently selected session instead of reverting to saved preferences.
  state.activeSessionIndex = 0;
  await handlers.handleRefreshSessions();
  assert.equal(state.activeSessionIndex, 0);
});

test('logout revokes first, returns to public sessions, and preserves Minecraft accounts', async () => {
  state.isSettingsOpen = true;
  state.isServerSelectOpen = true;
  logoutError = 'Site inaccessible';
  await handlers.handleDiscordLogout();
  assert.equal(revoked, false);
  assert.deepEqual(state.discordUser, user);
  assert.equal(state.discordError, logoutError);
  logoutError = null;
  await handlers.handleDiscordLogout();
  assert.equal(revoked, true);
  assert.equal(state.discordUser, null);
  assert.deepEqual(state.globalSessions, rows.slice(0, 1));
  assert.equal(state.discordSkipped, true);
  assert.equal(state.isSettingsOpen, false);
  assert.equal(state.isServerSelectOpen, false);
  assert.equal(state.allAccounts[0].uuid, 'minecraft');
  assert.equal(state.authCache.uuid, 'minecraft');
});

test('failed restoration and session requests remain retryable without exposing cached sessions', async () => {
  state.discordSkipped = false;
  guest = false;
  state.currentSettings.discordLoginSkipped = false;
  restoreError = 'Réseau indisponible';
  await handlers.handleDiscordRestore();
  assert.equal(state.discordUser, null);
  assert.equal(state.discordChecking, false);
  assert.equal(state.discordError, restoreError);
  assert.equal(state.discordSkipped, true);
  assert.deepEqual(state.globalSessions, rows.slice(0, 1));
  assert.equal(state.currentSettings.discordLoginSkipped, false);
  restoreError = null;
  sessionError = 'Accès refusé';
  await handlers.handleDiscordLogin();
  assert.deepEqual(state.discordUser, user);
  assert.deepEqual(state.globalSessions, []);
  assert.equal(state.sessionsError, sessionError);
  assert.equal(state.discordBusy, false);
  sessionError = null;
  await handlers.handleRefreshSessions();
  assert.deepEqual(state.globalSessions, rows);
  assert.equal(state.sessionsError, null);
});

test('native OAuth failures are shown in the launcher and allow another login attempt', async () => {
  state.discordUser = null;
  state.globalSessions = [];
  for (const message of [
    'Vous avez annulé l’autorisation Discord.',
    'Le site n’a pas pu terminer la connexion. Réessayez dans un instant.',
  ]) {
    loginError = message;
    await handlers.handleDiscordLogin();
    assert.equal(state.discordError, message);
    assert.equal(state.discordBusy, false);
    assert.equal(state.discordUser, null);
  }
  loginError = null;
  await handlers.handleDiscordLogin();
  assert.equal(state.discordError, null);
  assert.deepEqual(state.discordUser, user);
});

test('continuing without Discord loads public sessions and permits a later sign-in', async () => {
  await handlers.handleDiscordLogout();
  await handlers.handleContinueWithoutDiscord();
  assert.equal(state.discordSkipped, true);
  assert.equal(state.discordUser, null);
  assert.deepEqual(state.globalSessions, rows.slice(0, 1));
  assert.equal(state.allAccounts[0].uuid, 'minecraft');
  await handlers.handleDiscordRestore();
  assert.equal(state.discordSkipped, true);
  assert.deepEqual(state.globalSessions, rows.slice(0, 1));
  loginError = 'Connexion annulée.';
  await handlers.handleDiscordLogin();
  assert.equal(state.discordSkipped, true);
  assert.deepEqual(state.globalSessions, rows.slice(0, 1));
  loginError = null;
  await handlers.handleDiscordLogin();
  assert.equal(state.discordSkipped, false);
  assert.deepEqual(state.discordUser, user);
  assert.deepEqual(state.globalSessions, rows);
});

test('a late saved-account restoration cannot replace the explicit public-only choice', async () => {
  let finishRestore;
  pendingRestore = new Promise((resolve) => {
    finishRestore = resolve;
  });
  const restoration = handlers.handleDiscordRestore();
  assert.equal(state.discordChecking, true);
  await handlers.handleContinueWithoutDiscord();
  finishRestore(user);
  await restoration;
  pendingRestore = null;
  assert.equal(state.discordChecking, false);
  assert.equal(state.discordUser, null);
  assert.equal(state.discordSkipped, true);
  assert.deepEqual(state.globalSessions, rows.slice(0, 1));
});

test('late authenticated session requests cannot restore private sessions after continuing without Discord', async () => {
  await handlers.handleDiscordLogin();
  let finishSessions;
  pendingSessions = new Promise((resolve) => {
    finishSessions = resolve;
  });
  const oldRequest = handlers.handleRefreshSessions();
  assert.equal(state.sessionsLoading, true);
  await handlers.handleContinueWithoutDiscord();
  finishSessions(rows);
  await oldRequest;
  assert.equal(state.discordUser, null);
  assert.equal(state.discordSkipped, true);
  assert.equal(state.sessionsLoading, false);
  assert.deepEqual(state.globalSessions, rows.slice(0, 1));
});

function simulateRestart() {
  state.discordUser = null;
  state.discordSkipped = false;
  state.discordChecking = true;
  state.discordError = null;
  state.globalSessions = [];
  state.currentSettings = structuredClone(savedSettings);
  guest = false;
  return new LauncherController().getHandlers();
}

test('a saved public-only choice survives a restart even when credentials still exist', async () => {
  assert.equal(savedSettings.discordLoginSkipped, true);
  storedUser = user;
  const callsBeforeRestart = restoreCalls;
  await simulateRestart().handleDiscordRestore();
  assert.equal(restoreCalls, callsBeforeRestart);
  assert.equal(guest, true);
  assert.equal(state.discordChecking, false);
  assert.equal(state.discordSkipped, true);
  assert.equal(state.discordUser, null);
  assert.deepEqual(state.globalSessions, rows.slice(0, 1));
});

test('signing in after a saved skip restores the chosen account on the next start', async () => {
  await handlers.handleDiscordLogin();
  assert.equal(savedSettings.discordLoginSkipped, false);
  await simulateRestart().handleDiscordRestore();
  assert.equal(state.discordSkipped, false);
  assert.deepEqual(state.discordUser, user);
  assert.deepEqual(state.globalSessions, rows);
});

test('expired credentials on a returning installation use public sessions without another prompt', async () => {
  storedUser = null;
  await simulateRestart().handleDiscordRestore();
  assert.equal(state.discordSkipped, true);
  assert.equal(state.discordUser, null);
  assert.deepEqual(state.globalSessions, rows.slice(0, 1));
  assert.equal(savedSettings.discordLoginSkipped, true);
});

test('a restart after logout stays public and never requests a saved identity', async () => {
  await handlers.handleDiscordLogin();
  await handlers.handleDiscordLogout();
  storedUser = null;
  const callsBeforeRestart = restoreCalls;
  await simulateRestart().handleDiscordRestore();
  assert.equal(restoreCalls, callsBeforeRestart);
  assert.equal(state.discordSkipped, true);
  assert.deepEqual(state.globalSessions, rows.slice(0, 1));
});

test('other sessions eventually preload their visuals without clicking', async () => {
  fetchedAssetsUrls = [];
  const testSessions = [
    {
      name: 'Server 1',
      syncUrl: 'https://launcher.test/s1',
      assetsPath: 'https://launcher.test/s1/assets.json',
    },
    {
      name: 'Server 2',
      syncUrl: 'https://launcher.test/s2',
      assetsPath: 'https://launcher.test/s2/assets.json',
    },
    {
      name: 'Server 3',
      syncUrl: 'https://launcher.test/s3',
      assetsPath: 'https://launcher.test/s3/assets.json',
    },
  ];
  pendingSessions = testSessions;
  await handlers.handleRefreshSessions();
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(state.globalSessions.length, 3);
  assert.equal(fetchedAssetsUrls.length, 3);
  assert.ok(state.globalSessions[0].assetsData);
  assert.ok(state.globalSessions[1].assetsData);
  assert.ok(state.globalSessions[2].assetsData);
  assert.equal(state.globalSessions[1].assetsData.icon, '/icon.png');
});

test('extractSessionSlugFromDeepLink parses various deep link URL formats', () => {
  const { extractSessionSlugFromDeepLink } =
    globalThis.__discordControllerTest.sessions;
  assert.equal(
    extractSessionSlugFromDeepLink('launched://session/survie-rp'),
    'survie-rp',
  );
  assert.equal(
    extractSessionSlugFromDeepLink('launched://session/survie-rp/'),
    'survie-rp',
  );
  assert.equal(
    extractSessionSlugFromDeepLink('launched://survie-rp'),
    'survie-rp',
  );
  assert.equal(
    extractSessionSlugFromDeepLink('launched://session/mon%20serveur?ref=web'),
    'mon serveur',
  );
  assert.equal(extractSessionSlugFromDeepLink('https://example.com'), null);
  assert.equal(extractSessionSlugFromDeepLink(''), null);
});

test('deep link URL on startup automatically selects matching session and closes select modal', async () => {
  mockDeepLink = 'launched://session/pvp-faction';
  const testSessions = [
    {
      name: 'Survie RP',
      slug: 'survie-rp',
      syncUrl: 'https://launcher.test/api/sessions/survie-rp/sync',
    },
    {
      name: 'PvP Faction',
      slug: 'pvp-faction',
      syncUrl: 'https://launcher.test/api/sessions/pvp-faction/sync',
    },
  ];
  pendingSessions = testSessions;
  state.isServerSelectOpen = true;
  await handlers.handleRefreshSessions();
  assert.equal(state.activeSessionIndex, 1);
  assert.equal(state.isServerSelectOpen, false);
  assert.equal(activeSessionSaved, 'PvP Faction');
  mockDeepLink = null;
});

test('a protocol activation selects a session in an already running launcher', async () => {
  await controller.registerDeepLinkHandler();
  guest = false;
  state.discordUser = user;
  state.globalSessions = structuredClone(rows);
  state.activeSessionIndex = 0;
  mockDeepLink = 'launched://session/private';
  await eventListeners.get('deep-link-received')();
  assert.equal(state.activeSessionIndex, 1);
  assert.equal(activeSessionSaved, 'Private');
});

test('a private deep link survives public-only loading until Discord sign-in', async () => {
  await handlers.handleContinueWithoutDiscord();
  mockDeepLink = 'launched://session/private';
  await eventListeners.get('deep-link-received')();
  assert.deepEqual(state.globalSessions, rows.slice(0, 1));
  assert.equal(state.activeSessionIndex, 0);
  assert.match(state.sessionLinkError, /compte Discord autorisé/);
  assert.equal(state.sessionsError, null);
  await handlers.handleDiscordLogin();
  assert.equal(state.activeSessionIndex, 1);
  assert.equal(activeSessionSaved, 'Private');
  assert.equal(state.sessionLinkError, null);
});

test('a protocol activation waits until an in-flight session request finishes', async () => {
  let releaseSessions;
  pendingSessions = new Promise((resolve) => {
    releaseSessions = resolve;
  });
  const loading = handlers.handleRefreshSessions();
  mockDeepLink = 'launched://session/public';
  await eventListeners.get('deep-link-received')();
  releaseSessions(rows);
  await loading;
  assert.equal(state.activeSessionIndex, 0);
  assert.equal(activeSessionSaved, 'Public');
});

test('a link arriving during metadata loading is consumed by the next refresh', async () => {
  const sessionRows = rows.map((row) => ({
    ...row,
    assetsPath: `${row.syncUrl}/assets.json`,
  }));
  const originalFetchMetadata = controller.fetchAssetMetadata;
  let received = false;
  let applied;
  const selected = new Promise((resolve) => {
    applied = resolve;
  });
  controller.fetchAssetMetadata = async () => {
    if (!received) {
      received = true;
      mockDeepLink = 'launched://session/private';
      await eventListeners.get('deep-link-received')();
    }
    if (state.activeSessionIndex === 1) applied();
  };
  try {
    state.activeSessionIndex = 0;
    pendingSessions = sessionRows;
    await handlers.handleRefreshSessions();
    await selected;
    assert.equal(state.activeSessionIndex, 1);
    assert.equal(activeSessionSaved, 'Private');
  } finally {
    controller.fetchAssetMetadata = originalFetchMetadata;
  }
});

test('an inaccessible session link stays pending and never launches another accessible session', async () => {
  pendingSessions = null;
  sessionError = null;
  guest = false;
  state.discordUser = user;
  state.discordSkipped = false;
  state.isSyncing = false;
  state.sessionsLoading = false;
  state.optionalModsModalOpen = false;
  state.deletingSessionName = null;
  state.globalSessions = [rows[0]];
  state.activeSessionIndex = 0;
  mockDeepLink = 'launched://session/private';
  pendingSessions = [rows[0]];
  await eventListeners.get('deep-link-received')();
  assert.match(state.sessionLinkError, /accès refusé pour ce compte Discord/);
  assert.deepEqual(state.globalSessions, [rows[0]]);
  let preflightCalls = 0;
  const ensureAuthenticated = controller.ensureAuthenticated;
  controller.ensureAuthenticated = async () => {
    preflightCalls++;
  };
  try {
    await handlers.syncAndLoad();
    assert.equal(preflightCalls, 0);
  } finally {
    controller.ensureAuthenticated = ensureAuthenticated;
  }

  // Grant access and refresh: the original link is retried without another click.
  await handlers.handleRefreshSessions();
  assert.equal(state.sessionLinkError, null);
  assert.equal(state.activeSessionIndex, 1);
  assert.equal(activeSessionSaved, 'Private');
});

test('a missing canonical slug never falls back to another session with the same display name', async () => {
  mockDeepLink = 'launched://session/private';
  const other = { ...rows[0], name: 'Private', slug: 'different-session' };
  pendingSessions = [other];
  activeSessionSaved = null;
  await eventListeners.get('deep-link-received')();
  assert.match(state.sessionLinkError, /introuvable ou accès refusé/);
  assert.equal(activeSessionSaved, null);
  handlers.handleDismissSessionLink();
  assert.equal(state.sessionLinkError, null);
  await handlers.handleRefreshSessions();
  assert.equal(state.sessionLinkError, null);
});

test('choosing an accessible session explicitly dismisses an unavailable link', async () => {
  mockDeepLink = 'launched://session/missing';
  await eventListeners.get('deep-link-received')();
  assert.match(state.sessionLinkError, /introuvable ou accès refusé/);
  await handlers.handleSessionSelect(0);
  assert.equal(state.sessionLinkError, null);
  assert.equal(activeSessionSaved, 'Public');
  await handlers.handleRefreshSessions();
  assert.equal(state.sessionLinkError, null);
});
