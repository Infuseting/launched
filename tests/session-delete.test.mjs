import assert from 'node:assert/strict';
import { beforeEach, test } from 'node:test';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';

const session = { name: 'Selected', syncUrl: 'https://example.test/sync' };
const fixture = { state: {}, calls: [], error: null, pending: null };
globalThis.__sessionDeleteTest = fixture;
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
for (const specifier of [
  '@tauri-apps/api/event',
  '@tauri-apps/plugin-shell',
  '../state',
  '../services/auth',
  '../services/sessions',
  '../services/settings',
  '../services/status',
  '../services/updater',
]) {
  const source =
    specifier === '../state'
      ? 'export const state=globalThis.__sessionDeleteTest.state;'
      : specifier === '../services/sessions'
        ? `export async function deleteSession(session) {
            const fixture=globalThis.__sessionDeleteTest;
            fixture.calls.push(session);
            if (fixture.pending) await fixture.pending;
            if (fixture.error) throw fixture.error;
          }`
        : 'export const unused=true; export const listen=async()=>()=>{}; export const open=async()=>{};';
  code = code.replaceAll(`from '${specifier}'`, `from '${virtual(source)}'`);
}
const { LauncherController } = await import(virtual(code));
let handlers;
beforeEach(() => {
  Object.assign(fixture.state, {
    discordUser: { id: 'user' },
    isSyncing: false,
    isPreparingLaunch: false,
    deletingSessionName: null,
    optionalModsModalOpen: false,
    isServerSelectOpen: true,
    globalSessions: [session],
    activeSessionIndex: 0,
    currentSettings: {
      sessions: {
        Selected: { optionalFilesConfigured: true },
        Other: { maxRam: 4096 },
      },
    },
  });
  fixture.calls = [];
  fixture.error = fixture.pending = null;
  handlers = new LauncherController().getHandlers();
});

test('local deletion resets only the selected settings and keeps sessions available', async () => {
  await handlers.handleDeleteSession(session);
  assert.deepEqual(fixture.calls, [session]);
  assert.equal(fixture.state.currentSettings.sessions.Selected, undefined);
  assert.deepEqual(fixture.state.currentSettings.sessions.Other, {
    maxRam: 4096,
  });
  assert.deepEqual(fixture.state.globalSessions, [session]);
  assert.equal(fixture.state.activeSessionIndex, 0);
  assert.equal(fixture.state.deletingSessionName, null);
});

test('failed deletion preserves settings and permits retry', async () => {
  fixture.error = new Error('Fermez Minecraft');
  await assert.rejects(
    handlers.handleDeleteSession(session),
    /Fermez Minecraft/,
  );
  assert.equal(fixture.state.deletingSessionName, null);
  assert.equal(
    fixture.state.currentSettings.sessions.Selected.optionalFilesConfigured,
    true,
  );
  fixture.error = null;
  await handlers.handleDeleteSession(session);
  assert.equal(fixture.calls.length, 2);
});

test('deletion cannot overlap synchronization, preflight, or optional-file selection', async () => {
  for (const field of ['isSyncing', 'optionalModsModalOpen']) {
    fixture.state[field] = true;
    await assert.rejects(handlers.handleDeleteSession(session), /opération/);
    fixture.state[field] = false;
  }
  // Preflight owns the launch guard before synchronization starts.
  const controller = new LauncherController();
  controller.launchPending = true;
  await assert.rejects(
    controller.getHandlers().handleDeleteSession(session),
    /opération/,
  );
  assert.equal(fixture.calls.length, 0);
});

test('pending deletion blocks duplicate deletion, launching, and closing the hub', async () => {
  let release;
  fixture.pending = new Promise((resolve) => {
    release = resolve;
  });
  const deleting = handlers.handleDeleteSession(session);
  assert.equal(fixture.state.deletingSessionName, 'Selected');
  await assert.rejects(handlers.handleDeleteSession(session), /opération/);
  await handlers.syncAndLoad();
  handlers.handleServerSelectToggle(false);
  assert.equal(fixture.state.isServerSelectOpen, true);
  assert.equal(fixture.calls.length, 1);
  release();
  await deleting;
  assert.equal(fixture.state.deletingSessionName, null);
});

test('a stale card cannot delete a session that is no longer available', async () => {
  fixture.state.globalSessions = [];
  await assert.rejects(
    handlers.handleDeleteSession(session),
    /plus disponible/,
  );
  assert.equal(fixture.calls.length, 0);
});
