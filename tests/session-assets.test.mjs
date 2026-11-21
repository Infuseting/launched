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
const fixture = { invoke: null };
globalThis.__sessionAssetsTest = fixture;
const code = ts
  .transpileModule(
    await readFile(
      new URL('../src/services/sessions.ts', import.meta.url),
      'utf8',
    ),
    {
      compilerOptions: {
        target: ts.ScriptTarget.ES2022,
        module: ts.ModuleKind.ESNext,
      },
    },
  )
  .outputText.replace(
    "from '@tauri-apps/api/core'",
    `from '${virtual('export const invoke = (...args) => globalThis.__sessionAssetsTest.invoke(...args);')}'`,
  );
const { fetchJson } = await import(virtual(code));

test('the first protected background is published before alternate images or icons finish', async () => {
  const first = deferred();
  const remaining = deferred();
  const requests = [];
  const previews = [];
  const background =
    'https://launcher.test/api/sessions/selected/assets/first.png';
  const second =
    'https://launcher.test/api/sessions/selected/assets/second.png';
  const logo = 'https://launcher.test/api/sessions/selected/assets/logo.png';
  fixture.invoke = async (command, args) => {
    if (command === 'fetch_json')
      return {
        background: [background, second],
        logo,
        links: [],
      };
    requests.push(args.url);
    return args.url === background ? first.promise : remaining.promise;
  };
  let complete = false;
  const loading = fetchJson(
    'https://launcher.test/api/sessions/selected/assets.json',
    (preview) => previews.push(preview),
  ).then((result) => {
    complete = true;
    return result;
  });
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(requests, [background]);
  first.resolve('data:image/png;base64,first');
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(complete, false);
  assert.equal(previews.length, 1);
  assert.equal(previews[0].background, 'data:image/png;base64,first');
  assert.deepEqual(requests, [background, second, logo]);
  remaining.resolve('data:image/png;base64,other');
  const result = await loading;
  assert.deepEqual(result.background, [
    'data:image/png;base64,first',
    'data:image/png;base64,other',
  ]);
  assert.equal(result.logo, 'data:image/png;base64,other');
});

test('external backgrounds remain browser URLs and an empty pool stays empty', async () => {
  for (const source of ['https://cdn.test/background.png', []]) {
    fixture.invoke = async (command) => {
      assert.equal(command, 'fetch_json');
      return { background: source, links: [] };
    };
    const result = await fetchJson('https://launcher.test/assets.json');
    assert.deepEqual(result.background, source);
  }
});
