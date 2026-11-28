import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { beforeEach, test } from 'node:test';
import ts from 'typescript';

const virtual = (source) =>
  `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`;
const deferred = () => {
  let resolve;
  let reject;
  const promise = new Promise((done, fail) => {
    resolve = done;
    reject = fail;
  });
  return { promise, resolve, reject };
};
const turn = () => new Promise((resolve) => setImmediate(resolve));
const user = { discordId: 'verified', username: 'Player', avatar: null };
const rows = ['Other', 'Saved', 'Linked'].map((name) => ({
  name,
  slug: name.toLowerCase(),
  syncUrl: `https://launcher.test/${name}`,
  assetsPath: `https://launcher.test/${name}/assets.json`,
  hostname: `${name}.test`,
}));
const assets = { background: 'data:image/png;base64,preview', links: [] };
const fixture = {
  state: {},
  pendingAssets: new Map(),
  previews: new Map(),
  calls: [],
  deepLink: null,
  pendingSessions: null,
  pendingAccounts: null,
  pendingRam: null,
  pendingUpdate: null,
  pendingStatus: null,
  pendingPreference: null,
};
globalThis.__startupControllerTest = fixture;
globalThis.document = { addEventListener: () => {} };
const modules = {
  '@tauri-apps/api/event': 'export const listen = async () => () => {};',
  '../state':
    'export const state = globalThis.__startupControllerTest.state; export const unwrapState = (v) => structuredClone(v);',
  '../services/logger':
    'export const formatError = (e) => (e instanceof Error ? e.message : String(e)); export const createLogger = () => ({ debug: () => {}, info: () => {}, warn: () => {}, error: () => {} });',
  '../services/auth': `
    const f = globalThis.__startupControllerTest;
    export const getDiscordAuth = async () => ({discordId:'verified', username:'Player', avatar:null});
    export const getAllAccounts = async () => f.pendingAccounts?.promise ?? [];
    export const getAuth = async () => null;
    export const refreshActiveToken = async () => ({uuid:'minecraft',name:'Player'});
    export const continueWithoutDiscord = async () => {};
  `,
  '../services/settings': `
    const f = globalThis.__startupControllerTest;
    export const getSettings = async () => ({discordLoginSkipped:false});
    export const getSystemRam = async () => f.pendingRam?.promise ?? 8192;
    export const saveSettingsInternal = async () => {};
  `,
  '../services/updater': `
    const f = globalThis.__startupControllerTest;
    export const appVersion = async () => '1.0.0';
    export const checkForAppUpdates = async () => f.pendingUpdate?.promise ?? null;
  `,
  '../services/status': `
    const f = globalThis.__startupControllerTest;
    export const pingService = async () => f.pendingStatus?.promise ?? true;
    export const fetchServerStatus = async () => ({online:true});
  `,
  '../services/sessions': `
    const f = globalThis.__startupControllerTest;
    export const getSessions = async () => f.pendingSessions?.promise ?? structuredClone(f.rows);
    export const getActiveSessionName = async () => 'Saved';
    export const getDeepLinkUrl = async () => { const link = f.deepLink; f.deepLink = null; return link; };
    export const extractSessionSlugFromDeepLink = (url) => url.split('/').pop();
    export const setActiveSession = async () => f.pendingPreference?.promise;
    export const fetchJson = async (url, onPreview) => {
      f.calls.push(url); f.previews.set(url, onPreview);
      return f.pendingAssets.get(url)?.promise ?? {background:'ready',links:[]};
    };
  `,
};
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
for (const [specifier, source] of Object.entries(modules)) {
  code = code.replaceAll(`from '${specifier}'`, `from '${virtual(source)}'`);
}
const { LauncherController } = await import(
  virtual(`${code}\n//# sourceURL=startup-controller-under-test.js`)
);

beforeEach((t) => {
  t.mock.timers.enable({ apis: ['setTimeout', 'setInterval'] });
  Object.assign(fixture.state, {
    discordUser: user,
    discordSkipped: false,
    discordChecking: false,
    discordBusy: false,
    discordError: null,
    sessionsLoading: false,
    sessionsError: null,
    globalSessions: [],
    activeSessionIndex: 0,
    currentSettings: { discordLoginSkipped: false },
    serverStatusInterval: null,
    isSyncing: false,
    deletingSessionName: null,
  });
  fixture.rows = rows;
  fixture.pendingAssets.clear();
  fixture.previews.clear();
  fixture.calls = [];
  for (const key of [
    'deepLink',
    'pendingSessions',
    'pendingAccounts',
    'pendingRam',
    'pendingUpdate',
    'pendingStatus',
    'pendingPreference',
  ])
    fixture[key] = null;
});

test('startup shows the saved session while all session visuals are still pending', async () => {
  const controller = new LauncherController();
  for (const row of rows) fixture.pendingAssets.set(row.assetsPath, deferred());
  let restored = false;
  const restoration = controller
    .getHandlers()
    .handleDiscordRestore()
    .then(() => {
      restored = true;
    });
  await turn();
  assert.equal(restored, true);
  assert.equal(fixture.state.discordChecking, false);
  assert.equal(fixture.state.sessionsLoading, false);
  assert.equal(fixture.state.activeSessionIndex, 1);
  assert.deepEqual(fixture.calls, [rows[1].assetsPath]);
  fixture.previews.get(rows[1].assetsPath)(assets);
  assert.deepEqual(fixture.state.globalSessions[1].assetsData, assets);
  fixture.pendingAssets.get(rows[1].assetsPath).resolve(assets);
  await turn();
  assert.deepEqual(fixture.calls, [rows[1].assetsPath, rows[0].assetsPath]);
  fixture.pendingAssets.get(rows[0].assetsPath).resolve(assets);
  await turn();
  assert.equal(fixture.calls[2], rows[2].assetsPath);
  fixture.pendingAssets.get(rows[2].assetsPath).resolve(assets);
  await restoration;
  await turn();
});

test('a protocol link gives its session priority over the saved preference', async () => {
  fixture.deepLink = 'launched://session/linked';
  for (const row of rows) fixture.pendingAssets.set(row.assetsPath, deferred());
  await new LauncherController().getHandlers().handleRefreshSessions();
  assert.equal(fixture.state.activeSessionIndex, 2);
  assert.deepEqual(fixture.calls, [rows[2].assetsPath]);
  for (const pending of fixture.pendingAssets.values()) pending.resolve(assets);
  await turn();
});

test('a newly selected session starts immediately despite another download and a slow preference write', async () => {
  const handlers = new LauncherController().getHandlers();
  for (const row of rows) fixture.pendingAssets.set(row.assetsPath, deferred());
  await handlers.handleRefreshSessions();
  fixture.pendingAssets.get(rows[1].assetsPath).resolve(assets);
  await turn();
  assert.equal(fixture.calls[1], rows[0].assetsPath);
  fixture.pendingPreference = deferred();
  const selecting = handlers.handleSessionSelect(2);
  assert.equal(fixture.state.activeSessionIndex, 2);
  assert.equal(fixture.calls[2], rows[2].assetsPath);
  fixture.pendingPreference.resolve();
  for (const pending of fixture.pendingAssets.values()) pending.resolve(assets);
  await selecting;
  await turn();
});

test('Discord verification releases the loading screen before a slow session-list response', async () => {
  fixture.pendingSessions = deferred();
  const restoring = new LauncherController()
    .getHandlers()
    .handleDiscordRestore();
  await turn();
  assert.deepEqual(fixture.state.discordUser, user);
  assert.equal(fixture.state.discordChecking, false);
  assert.equal(fixture.state.sessionsLoading, true);
  fixture.pendingSessions.resolve(structuredClone(rows));
  await restoring;
  await turn();
});

test('local account and RAM reads do not hold up the selected session, nor do update and status requests', async () => {
  const controller = new LauncherController();
  fixture.pendingAccounts = deferred();
  fixture.pendingRam = deferred();
  fixture.pendingUpdate = deferred();
  fixture.pendingStatus = deferred();
  let initialized = false;
  const startup = controller.initialize().then(() => {
    initialized = true;
  });
  await turn();
  assert.equal(fixture.state.activeSessionIndex, 1);
  assert.equal(fixture.state.discordChecking, false);
  assert.equal(initialized, false);
  fixture.pendingAccounts.resolve([]);
  fixture.pendingRam.resolve(8192);
  await turn();
  assert.equal(initialized, true);
  fixture.pendingUpdate.resolve(null);
  fixture.pendingStatus.resolve(true);
  await startup;
  await turn();
});

test('late progressive assets cannot reappear after the user switches to public access', async () => {
  const handlers = new LauncherController().getHandlers();
  const pending = deferred();
  fixture.pendingAssets.set(rows[1].assetsPath, pending);
  await handlers.handleRefreshSessions();
  const publishOldPreview = fixture.previews.get(rows[1].assetsPath);
  fixture.rows = [];
  await handlers.handleContinueWithoutDiscord();
  publishOldPreview(assets);
  pending.resolve(assets);
  await turn();
  assert.equal(fixture.state.discordSkipped, true);
  assert.deepEqual(fixture.state.globalSessions, []);
});

test('failed session visuals leave loading and can be retried', async (t) => {
  t.mock.method(console, 'error', () => {});
  const handlers = new LauncherController().getHandlers();
  const pending = deferred();
  fixture.pendingAssets.set(rows[1].assetsPath, pending);
  await handlers.handleRefreshSessions();
  pending.reject(new Error('Image unavailable'));
  await turn();
  assert.equal(fixture.state.sessionsLoading, false);
  assert.equal(fixture.state.globalSessions[1].assetsLoadFailed, true);
  fixture.pendingAssets.delete(rows[1].assetsPath);
  await handlers.fetchAssetMetadata(1);
  assert.equal(fixture.state.globalSessions[1].assetsLoadFailed, false);
  assert.ok(fixture.state.globalSessions[1].assetsData);
});
