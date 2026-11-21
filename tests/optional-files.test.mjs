import assert from 'node:assert/strict';
import { test, beforeEach } from 'node:test';
import { readFile } from 'node:fs/promises';
import { setImmediate } from 'node:timers/promises';
import ts from 'typescript';

// Exercise the production controller with isolated Tauri/service adapters.
const fixture = {
  state: {},
  calls: [],
  files: [],
  loadError: null,
  saveError: null,
  pendingSave: null,
  pendingLoad: null,
};
const session = {
  name: 'Test',
  syncUrl: 'https://launcher.test/sync',
  crack: false,
};
const optional = {
  destPath: 'mods/iris.jar',
  name: 'iris.jar',
  folder: 'mods',
  isEnabled: true,
  hasUpdate: false,
};
globalThis.__optionalControllerTest = fixture;
globalThis.alert = (message) => fixture.calls.push(['alert', message]);
fixture.sessions = {
  getSessionOptionalFiles: async (value) => {
    fixture.calls.push(['inspect', value]);
    if (fixture.pendingLoad) await fixture.pendingLoad;
    if (fixture.loadError) throw fixture.loadError;
    return fixture.files;
  },
  setSessionOptionalFiles: async (...args) => {
    fixture.calls.push(['save', ...args]);
    if (fixture.pendingSave) await fixture.pendingSave;
    if (fixture.saveError) throw fixture.saveError;
  },
  syncSession: async (value) => fixture.calls.push(['sync', value]),
  launchGame: async (...args) => fixture.calls.push(['launch', ...args]),
};
fixture.settings = {
  saveSettingsInternal: async (value) =>
    fixture.calls.push(['settings', structuredClone(value)]),
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
  '@tauri-apps/api/event': 'export const listen=async()=>()=>{};',
  '@tauri-apps/plugin-shell': 'export const open=async()=>{};',
  '../state': 'export const state=globalThis.__optionalControllerTest.state;',
  '../services/auth': 'export const unused=true;',
  '../services/sessions':
    'export const { getSessionOptionalFiles,setSessionOptionalFiles,syncSession,launchGame }=globalThis.__optionalControllerTest.sessions;',
  '../services/settings':
    'export const { saveSettingsInternal }=globalThis.__optionalControllerTest.settings;',
  '../services/status': 'export const unused=true;',
  '../services/updater': 'export const unused=true;',
};
for (const [specifier, source] of Object.entries(mocks))
  code = code.replaceAll(`from '${specifier}'`, `from '${virtual(source)}'`);
// Only the post-launch UI cooldown is used by these workflows.
const { LauncherController } = await import(
  virtual(`const setTimeout=fn=>fn();\n${code}`)
);
let controller;
let handlers;
beforeEach(() => {
  Object.assign(fixture.state, {
    discordUser: { id: 'user' },
    discordSkipped: false,
    isSyncing: false,
    isPreparingLaunch: false,
    globalSessions: [session],
    activeSessionIndex: 0,
    authCache: { name: 'Player' },
    currentSettings: { sessions: {}, defaultSettings: { showLogs: false } },
    optionalModsModalOpen: false,
    optionalModsModalSession: null,
    optionalModsHasUpdates: false,
  });
  fixture.calls = [];
  fixture.files = [{ ...optional }];
  fixture.loadError =
    fixture.saveError =
    fixture.pendingSave =
    fixture.pendingLoad =
      null;
  controller = new LauncherController();
  handlers = controller.getHandlers();
});
const calls = (name) => fixture.calls.filter((call) => call[0] === name);
const configured = () => {
  fixture.state.currentSettings.sessions.Test = {
    optionalFilesConfigured: true,
    showLogs: true,
  };
};

test('first sync waits for selection, saves once, then synchronizes and launches', async () => {
  const launching = handlers.syncAndLoad();
  await setImmediate();
  assert.equal(fixture.state.optionalModsModalOpen, true);
  assert.equal(fixture.state.optionalModsIsFirstSync, true);
  assert.equal(calls('sync').length, 0);
  await handlers.handleSaveOptionalMods(
    'Test',
    ['mods/iris.jar'],
    ['mods/iris.jar'],
  );
  await launching;
  assert.deepEqual(calls('save')[0], [
    'save',
    session,
    ['mods/iris.jar'],
    ['mods/iris.jar'],
  ]);
  assert.equal(
    calls('settings').length,
    0,
    'backend selection must not be overwritten by stale frontend settings',
  );
  assert.deepEqual(
    fixture.calls.map((call) => call[0]),
    ['inspect', 'save', 'sync', 'launch'],
  );
  assert.equal(fixture.state.optionalModsModalOpen, false);
});

test('canceling first selection prevents synchronization and permits another attempt', async () => {
  const launching = handlers.syncAndLoad();
  await setImmediate();
  handlers.handleCloseOptionalMods();
  await launching;
  assert.equal(calls('sync').length, 0);
  configured();
  await handlers.syncAndLoad();
  assert.equal(calls('sync').length, 1);
});

test('enabled updates prompt again and explicit deselection is persisted', async () => {
  configured();
  fixture.files[0].hasUpdate = true;
  const launching = handlers.syncAndLoad();
  await setImmediate();
  assert.equal(fixture.state.optionalModsHasUpdates, true);
  assert.equal(fixture.state.optionalModsIsFirstSync, false);
  await handlers.handleSaveOptionalMods('Test', [], ['mods/iris.jar']);
  await launching;
  assert.deepEqual(
    fixture.state.currentSettings.sessions.Test.enabledOptionalFiles,
    [],
  );
  assert.equal(calls('launch').length, 1);
});

test('updates to disabled files do not interrupt launch', async () => {
  configured();
  fixture.files[0] = { ...optional, isEnabled: false, hasUpdate: true };
  await handlers.syncAndLoad();
  assert.equal(fixture.state.optionalModsModalOpen, false);
  assert.equal(calls('save').length, 0);
  assert.equal(calls('sync').length, 1);
});

test('a session with no optional files records an explicit empty selection', async () => {
  fixture.files = [];
  await handlers.syncAndLoad();
  const saved = calls('settings')[0][1].sessions.Test;
  assert.equal(saved.optionalFilesConfigured, true);
  assert.deepEqual(saved.enabledOptionalFiles, []);
  assert.equal(calls('launch').length, 1);
});

test('manifest lookup errors abort launch and report the actual error', async () => {
  fixture.loadError = 'Manifeste indisponible';
  await handlers.syncAndLoad();
  assert.equal(calls('sync').length, 0);
  assert.equal(calls('launch').length, 0);
  assert.equal(fixture.state.isPreparingLaunch, false);
  assert.match(calls('alert')[0][1], /Manifeste indisponible/);
  fixture.loadError = null;
  configured();
  await handlers.syncAndLoad();
  assert.equal(calls('sync').length, 1);
});

test('repeated launch clicks during preflight issue a single manifest request', async () => {
  configured();
  let release;
  fixture.pendingLoad = new Promise((resolve) => {
    release = resolve;
  });
  const first = handlers.syncAndLoad();
  await setImmediate();
  assert.equal(fixture.state.isPreparingLaunch, true);
  assert.match(fixture.state.syncProgress.current_file, /Vérification/);
  await handlers.syncAndLoad();
  assert.equal(calls('inspect').length, 1);
  release();
  await first;
  assert.equal(calls('launch').length, 1);
  assert.equal(fixture.state.isPreparingLaunch, false);
});

test('failed save keeps the modal open, preserves settings, and can be canceled', async () => {
  const launching = handlers.syncAndLoad();
  await setImmediate();
  fixture.saveError = 'Disque inaccessible';
  await assert.rejects(
    handlers.handleSaveOptionalMods('Test', [], ['mods/iris.jar']),
    (error) => error === fixture.saveError,
  );
  assert.equal(fixture.state.optionalModsModalOpen, true);
  assert.equal(fixture.state.currentSettings.sessions.Test, undefined);
  handlers.handleCloseOptionalMods();
  await launching;
  assert.equal(calls('sync').length, 0);
});

test('Escape and duplicate saves cannot close a selection while persistence is pending', async () => {
  const launching = handlers.syncAndLoad();
  await setImmediate();
  let release;
  fixture.pendingSave = new Promise((resolve) => {
    release = resolve;
  });
  const saving = handlers.handleSaveOptionalMods('Test', [], ['mods/iris.jar']);
  handlers.handleCloseOptionalMods();
  await handlers.handleSaveOptionalMods('Test', [], ['mods/iris.jar']);
  assert.equal(fixture.state.optionalModsModalOpen, true);
  assert.equal(calls('save').length, 1);
  release();
  await saving;
  await launching;
  assert.equal(calls('sync').length, 1);
});

test('manual configuration resets update state and does not launch a game', async () => {
  fixture.state.optionalModsHasUpdates = true;
  handlers.handleOpenOptionalMods(session);
  assert.equal(fixture.state.optionalModsHasUpdates, false);
  await handlers.handleSaveOptionalMods('Test', [], ['mods/iris.jar']);
  assert.equal(calls('save').length, 1);
  assert.equal(calls('sync').length, 0);
  assert.equal(calls('launch').length, 0);
});

test('selection cannot be saved under a different session name', async () => {
  handlers.handleOpenOptionalMods(session);
  await assert.rejects(
    handlers.handleSaveOptionalMods('Other', [], []),
    /Session optionnelle invalide/,
  );
  assert.equal(calls('save').length, 0);
});

test('revoking access resolves a pending selection without starting synchronization', async () => {
  const launching = handlers.syncAndLoad();
  await setImmediate();
  controller.clearDiscordState();
  await launching;
  assert.equal(fixture.state.optionalModsModalOpen, false);
  assert.equal(calls('sync').length, 0);
});

test('revoking access during preflight discards a late optional-files response', async () => {
  for (const files of [[{ ...optional }], []]) {
    fixture.files = files;
    fixture.state.discordUser = { id: 'user' };
    fixture.state.globalSessions = [session];
    let release;
    fixture.pendingLoad = new Promise((resolve) => {
      release = resolve;
    });
    const launching = handlers.syncAndLoad();
    await setImmediate();
    controller.clearDiscordState();
    release();
    await launching;
    assert.equal(fixture.state.optionalModsModalOpen, false);
    assert.equal(calls('sync').length, 0);
    assert.equal(calls('launch').length, 0);
    assert.equal(calls('settings').length, 0);
    assert.equal(controller.launchPending, false);
  }
});
