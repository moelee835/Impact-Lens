import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import test from 'node:test';
import {
  LOCAL_TEST_PATTERNS_PATH,
  readProjectTestPatterns,
  SHARED_TEST_PATTERNS_PATH,
} from '../testPatternsConfig';
import { CliError } from '../types';

// IL-LIM-010 stage 1 completion (docs/work/task-m4-il-lim-010-stage1-completion.md). Mirrors
// `cli/src/providers/projectConfig.ts`'s own test style (see `cli/src/test/providers.test.ts`).

function temporaryWorkspace(t: { after(fn: () => void): void }): string {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'impact-lens-test-patterns-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  fs.mkdirSync(path.join(directory, '.impact-lens'));
  return directory;
}

function writeShared(workspace: string, body: unknown): void {
  fs.writeFileSync(path.join(workspace, SHARED_TEST_PATTERNS_PATH), typeof body === 'string' ? body : JSON.stringify(body));
}

function writeLocal(workspace: string, body: unknown): void {
  fs.writeFileSync(path.join(workspace, LOCAL_TEST_PATTERNS_PATH), typeof body === 'string' ? body : JSON.stringify(body));
}

function assertConfigInvalid(fn: () => unknown, originSubstring: string): void {
  assert.throws(fn, (error: unknown) => {
    assert.ok(error instanceof CliError);
    assert.equal(error.code, 'test_pattern_config_invalid');
    assert.equal(error.exitCode, 8);
    assert.ok(String((error.details as { origin?: string } | undefined)?.origin).includes(originSubstring));
    return true;
  });
}

test('neither file existing returns empty compiled patterns - not an error', t => {
  const workspace = temporaryWorkspace(t);
  const patterns = readProjectTestPatterns(workspace);
  assert.deepEqual(patterns.include, []);
  assert.deepEqual(patterns.exclude, []);
});

test('a missing "include"/"exclude" field defaults to empty, not an error', t => {
  const workspace = temporaryWorkspace(t);
  writeShared(workspace, {});
  const patterns = readProjectTestPatterns(workspace);
  assert.deepEqual(patterns.include, []);
  assert.deepEqual(patterns.exclude, []);
});

test('shared and local files are read and their include/exclude lists are UNIONED, neither overriding the other', t => {
  const workspace = temporaryWorkspace(t);
  writeShared(workspace, { include: ['e2e/**/*.contract.ts'], exclude: ['integration/**'] });
  writeLocal(workspace, { include: ['tools/**/*.check.ts'], exclude: ['vendor/**'] });
  const patterns = readProjectTestPatterns(workspace);
  assert.deepEqual(patterns.include.map(p => p.source).sort(), ['e2e/**/*.contract.ts', 'tools/**/*.check.ts'].sort());
  assert.deepEqual(patterns.exclude.map(p => p.source).sort(), ['integration/**', 'vendor/**'].sort());
});

test('malformed JSON throws test_pattern_config_invalid naming the specific file', t => {
  const workspace = temporaryWorkspace(t);
  writeShared(workspace, '{not json');
  assertConfigInvalid(() => readProjectTestPatterns(workspace), SHARED_TEST_PATTERNS_PATH);
});

test('an unknown field is rejected rather than silently ignored', t => {
  const workspace = temporaryWorkspace(t);
  writeShared(workspace, { include: [], typo: ['x'] });
  assertConfigInvalid(() => readProjectTestPatterns(workspace), SHARED_TEST_PATTERNS_PATH);
});

test('a non-array "include"/"exclude" is rejected', t => {
  const workspace = temporaryWorkspace(t);
  writeShared(workspace, { include: 'not-an-array' });
  assertConfigInvalid(() => readProjectTestPatterns(workspace), SHARED_TEST_PATTERNS_PATH);
});

test('an unsupported glob pattern is rejected, naming the file that contains it - the local file, even when the shared file is fine', t => {
  const workspace = temporaryWorkspace(t);
  writeShared(workspace, { include: ['e2e/**/*.ts'] });
  writeLocal(workspace, { include: ['a?.ts'] });
  assertConfigInvalid(() => readProjectTestPatterns(workspace), LOCAL_TEST_PATTERNS_PATH);
});

test('the error message says what IS supported, matching the classifier module\'s own wording', t => {
  const workspace = temporaryWorkspace(t);
  writeShared(workspace, { include: ['a[b].ts'] });
  assert.throws(() => readProjectTestPatterns(workspace), (error: unknown) => {
    assert.ok(error instanceof CliError);
    assert.match(error.message, /is not supported/);
    return true;
  });
});

test('a leading "/" through the full CLI pipeline is rejected with a suggested fix, not silently accepted as a dead pattern (reviewer\'s finding)', t => {
  const workspace = temporaryWorkspace(t);
  writeShared(workspace, { include: ['/test/*.ts'] });
  assert.throws(() => readProjectTestPatterns(workspace), (error: unknown) => {
    assert.ok(error instanceof CliError);
    assert.equal(error.code, 'test_pattern_config_invalid');
    assert.match(error.message, /leading "\//);
    return true;
  });
});

test('a trailing "/" through the full CLI pipeline is rejected with a suggested fix, not silently accepted as a dead pattern (reviewer\'s finding)', t => {
  const workspace = temporaryWorkspace(t);
  writeShared(workspace, { exclude: ['tests/'] });
  assert.throws(() => readProjectTestPatterns(workspace), (error: unknown) => {
    assert.ok(error instanceof CliError);
    assert.equal(error.code, 'test_pattern_config_invalid');
    assert.match(error.message, /trailing "\//);
    return true;
  });
});
