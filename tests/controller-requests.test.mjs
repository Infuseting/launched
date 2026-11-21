import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import ts from 'typescript';

const virtual = (source) =>
  `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`;
const deferred = () => {
  let resolve;
  const promise = new Promise((done) => {
    resolve = done;
  });
  return { promise, resolve };
};
const state = {
  discordUser: { discordId: 'test' },
  globalSessions: [],
  activeSessionIndex: 0,
  serverStatus: null,
};
let assetResponse;
let assetCalls = 0;
const statusResponses = new Map();
globalThis.__requestControllerTest = {
  state,
  fetchJson: async () => {
    assetCalls++;
    return assetResponse.promise;
  },
  fetchServerStatus: (hostname) => statusResponses.get(hostname).promise,
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
const mocks = {
  '@tauri-apps/api/event': 'export const listen = async () => () => {};',
  '@tauri-apps/plugin-shell': 'export const open = async () => {};',
  '../state': 'export const state = globalThis.__requestControllerTest.state;',
  '../services/auth': 'export const unused = true;',
  '../services/sessions':
    'export const fetchJson = globalThis.__requestControllerTest.fetchJson; export const setActiveSession = async () => {};',
  '../services/settings': 'export const unused = true;',
  '../services/status':
    'export const fetchServerStatus = globalThis.__requestControllerTest.fetchServerStatus;',
  '../services/updater': 'export const unused = true;',
};
for (const [specifier, source] of Object.entries(mocks))
  code = code.replaceAll(`from '${specifier}'`, `from '${virtual(source)}'`);
const { LauncherController } = await import(virtual(code));
const handlers = new LauncherController().getHandlers();

test('concurrent requests for session assets share a single in-flight fetch', async () => {
  state.globalSessions = [
    { name: 'First', syncUrl: '/first', assetsPath: '/first/assets.json' },
  ];
  assetResponse = deferred();
  const first = handlers.fetchAssetMetadata(0);
  const second = handlers.fetchAssetMetadata(0);
  assert.equal(assetCalls, 1);
  const metadata = { background: '/background.png', links: [] };
  assetResponse.resolve(metadata);
  await Promise.all([first, second]);
  assert.deepEqual(state.globalSessions[0].assetsData, metadata);
});

test('a slow previous server status cannot overwrite the newly selected session', async () => {
  state.globalSessions = [
    { name: 'First', syncUrl: '/first', hostname: 'first.test' },
    { name: 'Second', syncUrl: '/second', hostname: 'second.test' },
  ];
  const firstResponse = deferred();
  const secondResponse = deferred();
  statusResponses.set('first.test', firstResponse);
  statusResponses.set('second.test', secondResponse);
  const first = handlers.handleSessionSelect(0);
  await new Promise((resolve) => setImmediate(resolve));
  const second = handlers.handleSessionSelect(1);
  await new Promise((resolve) => setImmediate(resolve));
  secondResponse.resolve({ online: true, players: { online: 2, max: 20 } });
  await second;
  firstResponse.resolve({ online: true, players: { online: 99, max: 100 } });
  await first;
  assert.equal(state.serverStatus.players.online, 2);
  assert.equal(state.activeSessionIndex, 1);
});

test('invalid session indices leave the active session intact', async () => {
  await handlers.handleSessionSelect(-1);
  await handlers.handleSessionSelect(100);
  await handlers.handleSessionSelect(0.5);
  assert.equal(state.activeSessionIndex, 1);
});
