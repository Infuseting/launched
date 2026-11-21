import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import ts from 'typescript';

const virtual = (source) =>
  `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`;
const source = await readFile(
  new URL('../src/services/sessions.ts', import.meta.url),
  'utf8',
);
const code = ts
  .transpileModule(source, {
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.ESNext,
    },
  })
  .outputText.replace(
    /from ['"]@tauri-apps\/api\/core['"]/,
    `from '${virtual('export const invoke = () => {};')}'`,
  );
const { extractSessionSlugFromDeepLink } = await import(virtual(code));

test('session links decode names and ignore trailing slashes, query strings and fragments', () => {
  assert.equal(
    extractSessionSlugFromDeepLink(
      'launched://session/Mon%20Serveur/?source=site#play',
    ),
    'Mon Serveur',
  );
  assert.equal(extractSessionSlugFromDeepLink('launched://public'), 'public');
});

test('malformed external links cannot prevent sessions from loading', () => {
  for (const link of [
    'launched://session/%E0%A4%A',
    'launched://session/%',
    'https://launcher.test/session/public',
    'launched://session/',
    '',
  ]) {
    assert.equal(extractSessionSlugFromDeepLink(link), null);
  }
});
