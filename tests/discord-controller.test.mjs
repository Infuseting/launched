import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';

const state = {
  discordUser: null, discordChecking: false, discordBusy: false, discordError: null,
  globalSessions: [], activeSessionIndex: 0, sessionsLoading: false, sessionsError: null,
  isSyncing: false, isSettingsOpen: false, isServerSelectOpen: false,
  allAccounts: [{ uuid: 'minecraft', name: 'Player' }], authCache: { uuid: 'minecraft' },
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
globalThis.__discordControllerTest = {
  state,
  auth: {
    getDiscordAuth: async () => { if (restoreError) throw restoreError; return storedUser; },
    loginDiscord: async () => { if (loginError) throw loginError; return user; },
    logoutDiscord: async () => { if (logoutError) throw logoutError; revoked = true; },
  },
  sessions: {
    getSessions: async () => { sessionCalls++; if (sessionError) throw sessionError; return rows; },
    getActiveSessionName: async () => 'Private',
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
  '../services/auth': 'export const { getDiscordAuth, loginDiscord, logoutDiscord }=globalThis.__discordControllerTest.auth;',
  '../services/sessions': 'export const { getSessions, getActiveSessionName }=globalThis.__discordControllerTest.sessions;',
  '../services/settings': 'export const unused=true;',
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

test('logout revokes first, clears all Discord/session UI, and preserves Minecraft accounts', async () => {
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
  assert.deepEqual(state.globalSessions, []);
  assert.equal(state.isSettingsOpen, false);
  assert.equal(state.isServerSelectOpen, false);
  assert.equal(state.allAccounts[0].uuid, 'minecraft');
  assert.equal(state.authCache.uuid, 'minecraft');
});

test('failed restoration and session requests remain retryable without exposing cached sessions', async () => {
  restoreError = 'Réseau indisponible';
  await handlers.handleDiscordRestore();
  assert.equal(state.discordUser, null);
  assert.equal(state.discordChecking, false);
  assert.equal(state.discordError, restoreError);
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
