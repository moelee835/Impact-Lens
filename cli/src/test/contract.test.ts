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

test('reports a missing Language Server as a launch failure', () => {
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
  const error = JSON.parse(result.stderr).error;
  assert.equal(error.code, 'provider_launch_failed');
  assert.equal(error.details.stage, 'launch');
  assert.equal(error.details.executable, 'impact-lens-language-server');
});

test('does not launch the bundled TypeScript provider for Python', () => {
  const executable = path.resolve(__dirname, '..', 'index.js');
  const result = spawnSync(process.execPath, [executable, 'analyze', '--stdin'], {
    encoding: 'utf8',
    input: JSON.stringify({
      workspace: path.resolve(__dirname, '..', '..'),
      file: 'not-created.py',
      line: 1,
      column: 1,
    }),
  });
  assert.equal(result.status, 5);
  const error = JSON.parse(result.stderr).error;
  assert.equal(error.code, 'provider_required_for_language');
  assert.equal(error.retryable, false);
  assert.equal(error.details.stage, 'discovery');
  assert.equal(error.details.detectedLanguageId, 'python');
});

test('rejects an explicit languageId mismatch before launching the provider', () => {
  const executable = path.resolve(__dirname, '..', 'index.js');
  const result = spawnSync(process.execPath, [executable, 'analyze', '--stdin'], {
    encoding: 'utf8',
    input: JSON.stringify({
      workspace: path.resolve(__dirname, '..', '..'),
      file: 'src/testFile.ts',
      line: 1,
      column: 1,
      provider: { command: process.execPath, languageId: 'python' },
    }),
  });
  assert.equal(result.status, 5);
  assert.equal(JSON.parse(result.stderr).error.code, 'provider_language_mismatch');
});

test('preserves initialize exit diagnostics after stderr closes and redacts secrets', () => {
  const executable = path.resolve(__dirname, '..', 'index.js');
  const server = path.resolve(__dirname, 'fixtures', 'exitingServer.js');
  const result = spawnSync(process.execPath, [executable, 'analyze', '--stdin'], {
    encoding: 'utf8',
    input: JSON.stringify({
      workspace: path.resolve(__dirname, '..', '..'),
      file: 'src/testFile.ts',
      line: 4,
      column: 17,
      provider: { command: process.execPath, args: [server], languageId: 'typescript' },
    }),
  });
  assert.equal(result.status, 5);
  const error = JSON.parse(result.stderr).error;
  assert.equal(error.code, 'provider_initialize_failed');
  assert.equal(error.details.stage, 'initialize');
  assert.equal(error.details.exitCode, 1);
  assert.match(error.details.stderr, /token=\[REDACTED\]/);
  assert.match(error.details.stderr, /final-stderr-line/);
  assert.doesNotMatch(error.details.stderr, /top-secret/);
  assert.doesNotMatch(error.details.stderr, new RegExp(process.env.HOME ?? '/definitely-not-home'));
});

test('reports missing Call Hierarchy capability instead of an empty graph', () => {
  const executable = path.resolve(__dirname, '..', 'index.js');
  const server = path.resolve(__dirname, 'fixtures', 'noCapabilityServer.js');
  const result = spawnSync(process.execPath, [executable, 'analyze', '--stdin'], {
    encoding: 'utf8',
    input: JSON.stringify({
      workspace: path.resolve(__dirname, '..', '..'),
      file: 'src/testFile.ts',
      line: 4,
      column: 17,
      provider: { command: process.execPath, args: [server], languageId: 'typescript' },
    }),
  });
  assert.equal(result.status, 5);
  const error = JSON.parse(result.stderr).error;
  assert.equal(error.code, 'provider_capability_missing');
  assert.equal(error.details.stage, 'capability');
  assert.equal(error.details.provider, 'no-call-hierarchy');
});

test('separates a query-stage provider exit from initialization failure', () => {
  const executable = path.resolve(__dirname, '..', 'index.js');
  const server = path.resolve(__dirname, 'fixtures', 'queryExitServer.js');
  const result = spawnSync(process.execPath, [executable, 'analyze', '--stdin'], {
    encoding: 'utf8',
    input: JSON.stringify({
      workspace: path.resolve(__dirname, '..', '..'),
      file: 'src/testFile.ts',
      line: 4,
      column: 17,
      provider: { command: process.execPath, args: [server], languageId: 'typescript' },
    }),
  });
  assert.equal(result.status, 5);
  const error = JSON.parse(result.stderr).error;
  assert.equal(error.code, 'provider_query_failed');
  assert.equal(error.details.stage, 'query');
  assert.equal(error.details.exitCode, 1);
  assert.match(error.details.stderr, /query failed after didOpen/);
});
