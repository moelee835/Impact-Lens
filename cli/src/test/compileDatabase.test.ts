import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import test from 'node:test';
import { inspectCompileDatabase } from '../providers/compileDatabase';

function temporaryDirectory(t: { after(fn: () => void): void }, prefix: string): string {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  return directory;
}

function writeFile(directory: string, relativePath: string, content: string): void {
  const target = path.join(directory, ...relativePath.split('/'));
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, content);
}

/** Sets an explicit mtime, since two files written back to back can land in the same filesystem tick. */
function setMtime(directory: string, relativePath: string, when: Date): void {
  const target = path.join(directory, ...relativePath.split('/'));
  fs.utimesSync(target, when, when);
}

test('an empty workspace reports missing', async t => {
  const workspace = temporaryDirectory(t, 'compiledb-missing-');
  const observation = await inspectCompileDatabase(workspace);
  assert.deepEqual(observation, { status: 'missing' });
});

test('a compile_commands.json at the workspace root reports present, not stale, when there is no CMakeLists.txt to compare against', async t => {
  const workspace = temporaryDirectory(t, 'compiledb-present-root-');
  writeFile(workspace, 'compile_commands.json', '[]');
  const observation = await inspectCompileDatabase(workspace);
  assert.deepEqual(observation, { status: 'present', relativePath: 'compile_commands.json', stale: false });
});

test('a compile_commands.json in a common build directory (build/) is found the same way as the root', async t => {
  const workspace = temporaryDirectory(t, 'compiledb-present-build-');
  writeFile(workspace, 'build/compile_commands.json', '[]');
  const observation = await inspectCompileDatabase(workspace);
  assert.deepEqual(observation, { status: 'present', relativePath: 'build/compile_commands.json', stale: false });
});

test('a compile_commands.json older than CMakeLists.txt is reported stale', async t => {
  const workspace = temporaryDirectory(t, 'compiledb-stale-');
  writeFile(workspace, 'compile_commands.json', '[]');
  setMtime(workspace, 'compile_commands.json', new Date('2026-01-01T00:00:00Z'));
  writeFile(workspace, 'CMakeLists.txt', 'cmake_minimum_required(VERSION 3.20)\n');
  setMtime(workspace, 'CMakeLists.txt', new Date('2026-06-01T00:00:00Z'));
  const observation = await inspectCompileDatabase(workspace);
  assert.deepEqual(observation, { status: 'present', relativePath: 'compile_commands.json', stale: true });
});

test('a compile_commands.json newer than CMakeLists.txt is reported fresh, not stale', async t => {
  const workspace = temporaryDirectory(t, 'compiledb-fresh-');
  writeFile(workspace, 'CMakeLists.txt', 'cmake_minimum_required(VERSION 3.20)\n');
  setMtime(workspace, 'CMakeLists.txt', new Date('2026-01-01T00:00:00Z'));
  writeFile(workspace, 'compile_commands.json', '[]');
  setMtime(workspace, 'compile_commands.json', new Date('2026-06-01T00:00:00Z'));
  const observation = await inspectCompileDatabase(workspace);
  assert.deepEqual(observation, { status: 'present', relativePath: 'compile_commands.json', stale: false });
});

test('two candidate compile_commands.json files report ambiguous with both relative paths, sorted', async t => {
  const workspace = temporaryDirectory(t, 'compiledb-ambiguous-');
  writeFile(workspace, 'compile_commands.json', '[]');
  writeFile(workspace, 'build/compile_commands.json', '[]');
  const observation = await inspectCompileDatabase(workspace);
  assert.deepEqual(observation, {
    status: 'ambiguous',
    relativePaths: ['build/compile_commands.json', 'compile_commands.json'],
  });
});

test('relative paths use forward slashes, matching this contract\'s convention elsewhere', async t => {
  const workspace = temporaryDirectory(t, 'compiledb-slashes-');
  writeFile(workspace, 'cmake-build-debug/compile_commands.json', '[]');
  const observation = await inspectCompileDatabase(workspace);
  assert.deepEqual(observation, {
    status: 'present',
    relativePath: 'cmake-build-debug/compile_commands.json',
    stale: false,
  });
});

test('never generates, configures or builds anything - a read-only scan does not create compile_commands.json', async t => {
  const workspace = temporaryDirectory(t, 'compiledb-readonly-');
  await inspectCompileDatabase(workspace);
  assert.deepEqual(fs.readdirSync(workspace), []);
});
