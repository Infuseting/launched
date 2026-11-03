import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';

const state = {
  discordUser: null, discordSkipped: false, discordChecking: false, discordBusy: false, discordError: null,
  globalSessions: [], activeSessionIndex: 0, sessionsLoading: false, sessionsError: null,
  isSyncing: false, isSettingsOpen: false, isServerSelectOpen: false,
  allAccounts: [{ uuid: 'minecraft', name: 'Player' }], authCache: { uuid: 'minecraft' },
  currentSettings: {},
};
const user = { discordId: '123456789012345678', username: 'test.user', avatar: null };
const rows = [{ name: 'Public', syncUrl: 'https://launcher.test/public' }, { name: 'Private', syncUrl: 'https://launcher.test/private' }];
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
globalThis.__discordControllerTest = {
  state,
  auth: {
    getDiscordAuth: async () => { restoreCalls++; if (pendingRestore) return pendingRestore; if (restoreError) throw restoreError; return guest ? null : storedUser; },
    loginDiscord: async () => { if (loginError) throw loginError; guest = false; return user; },
    logoutDiscord: async () => { if (logoutError) throw logoutError; revoked = true; guest = false; },
    continueWithoutDiscord: async () => { guest = true; },
  },
  sessions: {
    getSessions: async () => { sessionCalls++; if (pendingSessions) { const response = pendingSessions; pendingSessions = null; return response; } if (sessionError) throw sessionError; return guest ? rows.slice(0, 1) : rows; },
    getActiveSessionName: async () => 'Private',
  },
  settings: {
    saveSettingsInternal: async settings => { savedSettings = structuredClone(settings); },
  },
};
const virtual = source => `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`;
let code = ts.transpileModule(await readFile(new URL('../src/app/launcher-controller.ts', import.meta.url), 'utf8'), {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
}).outputText;
const mocks = {
  '@tauri-apps/api/event': 'export const listen=async()=>()=>{};',
  '@tauri-apps/plugin-shell': 'export const open=async()=>{};',
  '../state': 'export const state=globalThis.__discordControllerTest.state;',
  '../services/auth': 'export const { getDiscordAuth, loginDiscord, logoutDiscord, continueWithoutDiscord }=globalThis.__discordControllerTest.auth;',
  '../services/sessions': 'export const { getSessions, getActiveSessionName }=globalThis.__discordControllerTest.sessions;',
  '../services/settings': 'export const { saveSettingsInternal }=globalThis.__discordControllerTest.settings;',
  '../services/status': 'export const unused=true;',
  '../services/updater': 'export const unused=true;',
};
for (const [specifier, source] of Object.entries(mocks)) code = code.replaceAll(`from '${specifier}'`, `from '${virtual(source)}'`).replaceAll(`from "${specifier}"`, `from '${virtual(source)}'`);
const { LauncherController } = await import(virtual(code));
const handlers = new LauncherController().getHandlers();

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
  for (const message of ['Vous avez annulé l’autorisation Discord.', 'Le site n’a pas pu terminer la connexion. Réessayez dans un instant.']) {
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
  pendingRestore = new Promise(resolve => { finishRestore = resolve; });
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
  pendingSessions = new Promise(resolve => { finishSessions = resolve; });
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
