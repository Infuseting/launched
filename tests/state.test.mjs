import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import ts from 'typescript';

const virtual = (source) =>
  `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`;
const react = virtual(
  'export default { useSyncExternalStore: (_subscribe, getSnapshot) => getSnapshot(), useMemo: factory => factory() };',
);
const source = await readFile(
  new URL('../src/state.ts', import.meta.url),
  'utf8',
);
const code = ts
  .transpileModule(source, {
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.ESNext,
    },
  })
  .outputText.replace("from 'react'", `from '${react}'`);
const { state, useLauncherState } = await import(virtual(code));

test('nested session mutations publish immutable snapshots and retain untouched branches', () => {
  state.globalSessions = [
    { name: 'Session', assetsData: { background: '/before.png', links: [] } },
  ];
  const before = useLauncherState();
  state.globalSessions[0].assetsData.background = '/after.png';
  const after = useLauncherState();
  assert.equal(before.globalSessions[0].assetsData.background, '/before.png');
  assert.equal(after.globalSessions[0].assetsData.background, '/after.png');
  assert.notEqual(before.globalSessions, after.globalSessions);
  assert.equal(before.currentSettings, after.currentSettings);
  assert.equal(before.syncProgress, after.syncProgress);

  state.syncProgress.percentage = 50;
  assert.equal(after.globalSessions, useLauncherState().globalSessions);
});

test('deleting nested settings notifies readers without modifying their previous snapshot', () => {
  state.currentSettings.sessions.temporary = {
    ...state.currentSettings.defaultSettings,
  };
  const before = useLauncherState();
  delete state.currentSettings.sessions.temporary;
  assert.ok(before.currentSettings.sessions.temporary);
  assert.equal(
    useLauncherState().currentSettings.sessions.temporary,
    undefined,
  );
});

test('assigning an already reactive object does not nest proxies or publish no-op changes', () => {
  const before = useLauncherState();
  const settings = state.currentSettings;
  state.currentSettings = settings;
  assert.equal(useLauncherState(), before);
  state.globalSessions.push({ name: 'Another' });
  assert.equal(before.globalSessions.length, 1);
  assert.equal(useLauncherState().globalSessions.length, 2);
});
