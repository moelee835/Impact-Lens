import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import * as path from 'node:path';
import test from 'node:test';

test('writes one compact JSON error to stderr and keeps stdout empty', () => {
  const executable = path.resolve(__dirname, '..', 'index.js');
  const result = spawnSync(process.execPath, [executable], { encoding: 'utf8' });
  assert.equal(result.status, 2);
  assert.equal(result.stdout, '');
  assert.equal(result.stderr.trim().split('\n').length, 1);
  const error = JSON.parse(result.stderr);
  assert.equal(error.schemaVersion, 1);
  assert.equal(error.ok, false);
  assert.equal(error.error.code, 'invalid_command');
  assert.doesNotMatch(result.stderr, /\u001b\[/);
});

test('rejects invalid stdin as a stable validation error', () => {
  const executable = path.resolve(__dirname, '..', 'index.js');
  const result = spawnSync(process.execPath, [executable, 'analyze', '--stdin'], {
    encoding: 'utf8',
    input: '{invalid',
  });
  assert.equal(result.status, 2);
  assert.equal(result.stdout, '');
  assert.equal(JSON.parse(result.stderr).error.code, 'invalid_request');
});

test('rejects unknown options and stdin fields instead of ignoring agent typos', () => {
  const executable = path.resolve(__dirname, '..', 'index.js');
  const optionResult = spawnSync(process.execPath, [executable, 'analyze', '--widht', '10'], { encoding: 'utf8' });
  assert.equal(optionResult.status, 2);
  assert.match(JSON.parse(optionResult.stderr).error.message, /--widht/);

  const inputResult = spawnSync(process.execPath, [executable, 'analyze', '--stdin'], {
    encoding: 'utf8',
    input: JSON.stringify({ workspace: '/tmp', file: 'x.ts', line: 1, column: 1, widht: 10 }),
  });
  assert.equal(inputResult.status, 2);
  assert.match(JSON.parse(inputResult.stderr).error.message, /widht/);
});

test('reports a missing Language Server as provider unavailable', () => {
  const executable = path.resolve(__dirname, '..', 'index.js');
  const result = spawnSync(process.execPath, [executable, 'analyze', '--stdin'], {
    encoding: 'utf8',
    input: JSON.stringify({
      workspace: path.resolve(__dirname, '..', '..'),
      file: 'src/testFile.ts',
      line: 4,
      column: 17,
      provider: { command: '/definitely/missing/impact-lens-language-server', args: ['--stdio'] },
    }),
  });
  assert.equal(result.status, 5);
  assert.equal(JSON.parse(result.stderr).error.code, 'provider_unavailable');
});
