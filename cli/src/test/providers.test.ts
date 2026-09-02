import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import test from 'node:test';
import { CONFIG_TREE_LIMITS } from '../configTree';
import { PROVIDER_CATALOG, bundledLanguageIds } from '../providers/catalog';
import {
  compareVersions,
  findExecutable,
  isVersionSupported,
  parseVersion,
  probeVersion,
} from '../providers/discovery';
import {
  MANIFEST_LIMITS,
  assertPlainJsonObject,
  collectSensitiveStrings,
  mergeJsonObjects,
  resolveManifestObject,
  resolveManifestStrings,
  unreachableDottedKeys,
} from '../providers/manifest';
import { JsonObject, ManifestObject, ProviderPreset } from '../providers/preset';
import {
  PROJECT_PROVIDER_CONFIG_PATH,
  ProjectProviderChoice,
  readProjectProviderChoice,
} from '../providers/projectConfig';
import {
  ProviderResolutionOptions,
  languageId,
  resolveProvider,
  resolveSessionValues,
} from '../providers/resolve';
import { CliError } from '../types';

const NO_ENV: NodeJS.ProcessEnv = {};

function temporaryDirectory(t: { after(fn: () => void): void }, prefix: string): string {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  return directory;
}

/**
 * A stand-in for a language the shipped catalog does not serve.
 *
 * It is declared here and never in `providers/catalog.ts`: a `verified-external` entry in the real
 * catalog is a promise to users that a fixture passed against a pinned version, and M1 has verified
 * exactly one language. This fixture exists so the discovery, ambiguity and version paths are
 * exercised by real code rather than only by presets that cannot reach them.
 */
function fixturePythonPreset(overrides: Partial<ProviderPreset> = {}): ProviderPreset {
  return {
    id: 'fixture-python',
    displayName: 'Fixture Python Server',
    tier: 'verified-external',
    languageIds: ['python'],
    extensions: ['.py'],
    command: { candidates: ['impact-lens-fixture-server'], args: ['--stdio'], languageIdFrom: 'detected' },
    docs: { install: 'https://example.invalid/install-fixture-server' },
    lastVerified: { date: '2026-01-01', versions: ['1.0.0'] },
    ...overrides,
  };
}

function writeExecutable(directory: string, name: string, body: string): string {
  const file = path.join(directory, name);
  fs.writeFileSync(file, body);
  fs.chmodSync(file, 0o755);
  return file;
}

/**
 * A real, writable directory at a literal path containing no colon, for tests that force
 * `platform: 'linux'` (or `'darwin'`) lookup semantics regardless of the host OS actually running them.
 *
 * `temporaryDirectory()` builds its path from `os.tmpdir()`, which on a Windows host is
 * `C:\Users\...\AppData\Local\Temp\...`. `findExecutable()` under a forced non-`win32` platform splits
 * `PATH` on `:` - the very character a Windows drive letter embeds right after itself - so a test that
 * simulates POSIX lookup semantics with a real Windows-native path silently corrupts its own PATH value
 * (`"C:\Users\...".split(':')` becomes `["C", "\Users\..."]`, neither of which exists) no matter what
 * `platform` it claims to be testing. `platform: 'linux'` and a directory string with an embedded
 * drive-letter colon are mutually exclusive; a test gets one or the other, never both. A literal `/tmp/...`
 * path has no such colon on any host, which is what makes the simulation actually hold everywhere.
 */
function syntheticPosixDirectory(t: { after(fn: () => void): void }, prefix: string): string {
  const directory = `/tmp/impact-lens-test-${prefix}${process.pid}-${Math.random().toString(36).slice(2)}`;
  fs.mkdirSync(directory, { recursive: true });
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  return directory;
}

function keyedTree(prefix: string, keys: number): JsonObject {
  const tree: Record<string, number> = {};
  for (let index = 0; index < keys; index += 1) {
    tree[`${prefix}${index}`] = index;
  }
  return tree;
}

// ---------------------------------------------------------------------------
// Selection order
// ---------------------------------------------------------------------------

test('a raw custom command outranks every other tier', t => {
  const workspace = temporaryDirectory(t, 'impact-lens-select-custom-');
  fs.mkdirSync(path.join(workspace, '.impact-lens'));
  fs.writeFileSync(
    path.join(workspace, PROJECT_PROVIDER_CONFIG_PATH),
    JSON.stringify({ presetId: 'bundled-typescript' }),
  );
  const resolved = resolveProvider('src/a.ts', { command: '/custom/server', args: ['--stdio'] }, {
    workspace,
    providerPreset: 'bundled-typescript',
    env: NO_ENV,
  });
  assert.equal(resolved.selectedBy, 'custom');
  assert.equal(resolved.tier, 'custom');
  assert.equal(resolved.presetId, undefined);
  assert.equal(resolved.command.command, '/custom/server');
});

test('an explicit preset outranks the project choice', t => {
  const workspace = temporaryDirectory(t, 'impact-lens-select-preset-');
  fs.mkdirSync(path.join(workspace, '.impact-lens'));
  fs.writeFileSync(
    path.join(workspace, PROJECT_PROVIDER_CONFIG_PATH),
    JSON.stringify({ command: 'project-server' }),
  );
  const resolved = resolveProvider('src/a.ts', undefined, {
    workspace,
    providerPreset: 'bundled-typescript',
    env: NO_ENV,
  });
  assert.equal(resolved.selectedBy, 'preset');
  assert.equal(resolved.presetId, 'bundled-typescript');
  assert.equal(resolved.command.command, process.execPath);
});

test('the environment variable is an explicit preset, not a default', t => {
  const workspace = temporaryDirectory(t, 'impact-lens-select-env-');
  const viaEnv = resolveProvider('src/a.ts', undefined, {
    workspace,
    env: { IMPACT_LENS_PROVIDER_PRESET: 'bundled-typescript' },
  });
  assert.equal(viaEnv.selectedBy, 'preset');
  // Without it the same file goes through auto-discovery and reports the bundled tier instead.
  assert.equal(resolveProvider('src/a.ts', undefined, { workspace, env: NO_ENV }).selectedBy, 'bundled');
});

test('the project choice outranks auto-discovery and can name either a preset or a command', t => {
  const workspace = temporaryDirectory(t, 'impact-lens-select-project-');
  fs.mkdirSync(path.join(workspace, '.impact-lens'));
  const configFile = path.join(workspace, PROJECT_PROVIDER_CONFIG_PATH);

  fs.writeFileSync(configFile, JSON.stringify({ presetId: 'bundled-typescript' }));
  const byPreset = resolveProvider('src/a.ts', undefined, { workspace, env: NO_ENV });
  assert.equal(byPreset.selectedBy, 'project');
  assert.equal(byPreset.presetId, 'bundled-typescript');

  fs.writeFileSync(configFile, JSON.stringify({ command: 'project-server', args: ['--stdio'], languageId: 'typescript' }));
  const byCommand = resolveProvider('src/a.ts', undefined, { workspace, env: NO_ENV });
  assert.equal(byCommand.selectedBy, 'project');
  assert.equal(byCommand.command.command, 'project-server');
  assert.deepEqual(byCommand.command.args, ['--stdio']);
});

test('the project file is not consulted when no workspace is supplied', t => {
  const workspace = temporaryDirectory(t, 'impact-lens-select-noworkspace-');
  fs.mkdirSync(path.join(workspace, '.impact-lens'));
  fs.writeFileSync(path.join(workspace, PROJECT_PROVIDER_CONFIG_PATH), '{not json');
  // A cwd fallback would let an unrelated directory's file choose the provider for this analysis,
  // so the tier is simply inactive until a workspace is passed. The malformed file proves it is
  // never read here: reading it would throw.
  assert.equal(resolveProvider('src/a.ts', undefined, { env: NO_ENV }).selectedBy, 'bundled');
});

test('auto-discovery reports the bundled tier for the shipped TypeScript preset', () => {
  const resolved = resolveProvider('src/a.ts', undefined, { env: NO_ENV });
  assert.equal(resolved.selectedBy, 'bundled');
  assert.equal(resolved.tier, 'bundled');
  assert.equal(resolved.presetId, 'bundled-typescript');
  assert.equal(resolved.requestedLanguageId, 'typescript');
  assert.equal(resolved.languageMatch, true);
});

test('auto-discovery reports the auto tier for a discovered external preset', t => {
  const binaries = syntheticPosixDirectory(t, 'discovery-bin-');
  writeExecutable(binaries, 'impact-lens-fixture-server', '#!/bin/sh\nexit 0\n');
  const resolved = resolveProvider('src/a.py', undefined, {
    env: NO_ENV,
    catalog: [...PROVIDER_CATALOG, fixturePythonPreset()],
    lookup: { env: { PATH: binaries }, platform: 'linux' },
  });
  assert.equal(resolved.selectedBy, 'auto');
  assert.equal(resolved.tier, 'verified-external');
  assert.equal(resolved.command.command, path.join(binaries, 'impact-lens-fixture-server'));
  assert.deepEqual(resolved.command.args, ['--stdio']);
});

// ---------------------------------------------------------------------------
// The rule that must never break: no cross-language fallback
// ---------------------------------------------------------------------------

test('an unsupported language never falls back to another language provider', () => {
  assert.throws(
    () => resolveProvider('src/a.py', undefined, { env: NO_ENV }),
    (error: unknown) => error instanceof CliError
      && error.code === 'provider_required_for_language'
      && (error.details as { detectedLanguageId: string }).detectedLanguageId === 'python',
  );
});

test('an explicitly named preset is refused for a language it does not claim', () => {
  // Without this check the TypeScript preset would announce languageId python and start tsserver on
  // a Python file, and an empty Call Hierarchy reads exactly like "nothing calls this".
  assert.throws(
    () => resolveProvider('src/a.py', undefined, { providerPreset: 'bundled-typescript', env: NO_ENV }),
    (error: unknown) => error instanceof CliError
      && error.code === 'provider_language_mismatch'
      && (error.details as { presetId: string }).presetId === 'bundled-typescript',
  );
});

test('a matching preset with no installed executable is not replaced by another language', t => {
  const binaries = syntheticPosixDirectory(t, 'discovery-empty-');
  assert.throws(
    () => resolveProvider('src/a.py', undefined, {
      env: NO_ENV,
      catalog: [...PROVIDER_CATALOG, fixturePythonPreset()],
      lookup: { env: { PATH: binaries }, platform: 'linux' },
    }),
    (error: unknown) => {
      if (!(error instanceof CliError) || error.code !== 'provider_executable_not_found') {
        return false;
      }
      const details = error.details as { candidates: string[]; install: string[] };
      // The report says what to install and never where we looked.
      assert.deepEqual(details.candidates, ['impact-lens-fixture-server']);
      assert.deepEqual(details.install, ['https://example.invalid/install-fixture-server']);
      assert.doesNotMatch(JSON.stringify(error.details), new RegExp(binaries));
      return true;
    },
  );
});

test('two installed verified providers for one language are reported, not guessed between', t => {
  const binaries = syntheticPosixDirectory(t, 'discovery-ambiguous-');
  writeExecutable(binaries, 'impact-lens-fixture-server', '#!/bin/sh\nexit 0\n');
  writeExecutable(binaries, 'impact-lens-other-server', '#!/bin/sh\nexit 0\n');
  assert.throws(
    () => resolveProvider('src/a.py', undefined, {
      env: NO_ENV,
      catalog: [
        fixturePythonPreset(),
        fixturePythonPreset({
          id: 'fixture-python-other',
          command: { candidates: ['impact-lens-other-server'], args: [], languageIdFrom: 'detected' },
        }),
      ],
      lookup: { env: { PATH: binaries }, platform: 'linux' },
    }),
    (error: unknown) => error instanceof CliError
      && error.code === 'provider_selection_ambiguous'
      && (error.details as { candidatePresetIds: string[] }).candidatePresetIds.length === 2,
  );
});

test('a configured languageId that contradicts the file is still a mismatch', () => {
  assert.throws(
    () => resolveProvider('src/a.ts', { command: '/x', languageId: 'python' }, { env: NO_ENV }),
    (error: unknown) => error instanceof CliError && error.code === 'provider_language_mismatch',
  );
});

test('an unrecognised extension asserts nothing about the language', () => {
  const resolved = resolveProvider('notes.txt', { command: '/x', languageId: 'typescript' }, { env: NO_ENV });
  assert.equal(resolved.detectedLanguageId, 'plaintext');
  assert.equal(resolved.languageMatch, 'unknown');
});

// ---------------------------------------------------------------------------
// The bundled reference preset reproduces today's command
// ---------------------------------------------------------------------------

test('the TypeScript reference preset produces the command the bundled path produced before', () => {
  const resolved = resolveProvider('src/a.ts', undefined, { env: NO_ENV });
  assert.equal(resolved.command.command, process.execPath);
  const args = resolved.command.args ?? [];
  assert.equal(args.length, 2);
  // Not a literal 'lib/cli.mjs' suffix: the real path is built with path.join(), which uses '\' on
  // Windows, so a forward-slash literal never matches there.
  assert.ok((args[0] as string).endsWith(path.join('lib', 'cli.mjs')));
  assert.equal(args[1], '--stdio');
  assert.equal(resolved.command.languageId, 'typescript');
  // The opt-in log level is a conditional the manifest cannot express, so the resolver appends it.
  const debug = resolveProvider('src/a.ts', undefined, { env: { IMPACT_LENS_PROVIDER_LOG_LEVEL: '4' } });
  assert.deepEqual((debug.command.args ?? []).slice(1), ['--stdio', '--log-level', '4']);
});

test('the reference preset claims nothing it cannot prove', () => {
  const preset = PROVIDER_CATALOG.find(entry => entry.id === 'bundled-typescript');
  assert.ok(preset);
  assert.equal(preset.readiness, undefined, 'no readiness declaration means indexing stays unknown');
  assert.equal(preset.initializationOptions, undefined, 'an absent tree keeps the initialize frame empty');
  assert.equal(preset.settings, undefined);
  const resolved = resolveProvider('src/a.ts', undefined, { env: NO_ENV });
  assert.deepEqual(resolved.initializationOptions, {});
  assert.deepEqual(resolved.settings, {});
  assert.deepEqual(resolved.settingsDelivery, ['on-request']);
  assert.deepEqual(resolved.redactionValues, []);
});

test('the shipped catalog only claims languages that have been verified', () => {
  for (const preset of PROVIDER_CATALOG) {
    assert.ok(
      preset.tier !== 'verified-external' || preset.lastVerified !== undefined,
      `${preset.id} claims verified-external without evidence`,
    );
  }
  // 'gopls' entered here as a real deepEqual member, not a placeholder: M2 stage 1
  // (docs/work/task-m2-gopls-preset.md) ran Call Hierarchy against it on a pinned version range, which
  // is exactly the evidence the loop above requires of every verified-external preset.
  assert.deepEqual(PROVIDER_CATALOG.map(preset => preset.id), ['bundled-typescript', 'gopls']);
  assert.deepEqual(bundledLanguageIds(PROVIDER_CATALOG), [
    'typescript', 'typescriptreact', 'javascript', 'javascriptreact',
  ]);
});

test('an unknown preset name is a bad request, and an unknown one in a project file is a bad config', t => {
  assert.throws(
    () => resolveProvider('src/a.ts', undefined, { providerPreset: 'no-such-preset', env: NO_ENV }),
    (error: unknown) => error instanceof CliError && error.code === 'invalid_request' && error.exitCode === 2,
  );
  const workspace = temporaryDirectory(t, 'impact-lens-unknown-preset-');
  fs.mkdirSync(path.join(workspace, '.impact-lens'));
  fs.writeFileSync(path.join(workspace, PROJECT_PROVIDER_CONFIG_PATH), JSON.stringify({ presetId: 'no-such-preset' }));
  assert.throws(
    () => resolveProvider('src/a.ts', undefined, { workspace, env: NO_ENV }),
    (error: unknown) => error instanceof CliError && error.code === 'provider_config_invalid',
  );
});

// ---------------------------------------------------------------------------
// Discovery without a shell
// ---------------------------------------------------------------------------

test('PATH lookup treats shell metacharacters as ordinary filename characters', t => {
  const binaries = syntheticPosixDirectory(t, 'metachar-');
  const hostile = 'srv; touch pwned && echo $(whoami)';
  writeExecutable(binaries, hostile, '#!/bin/sh\nexit 0\n');
  const found = findExecutable(hostile, { env: { PATH: binaries }, platform: 'linux' });
  assert.equal(found, path.join(binaries, hostile));
  // If any shell had been involved, the semicolon would have split the name and this file would exist.
  assert.equal(fs.existsSync(path.join(process.cwd(), 'pwned')), false);
});

test('PATH lookup returns the first directory that has the file and undefined when none does', t => {
  const first = syntheticPosixDirectory(t, 'path-first-');
  const second = syntheticPosixDirectory(t, 'path-second-');
  writeExecutable(second, 'impact-lens-fixture-server', '#!/bin/sh\nexit 0\n');
  assert.equal(
    findExecutable('impact-lens-fixture-server', { env: { PATH: `${first}:${second}` }, platform: 'linux' }),
    path.join(second, 'impact-lens-fixture-server'),
  );
  assert.equal(
    findExecutable('impact-lens-absent-server', { env: { PATH: `${first}:${second}` }, platform: 'linux' }),
    undefined,
  );
});

test('a name containing a separator is verified as a path and never searched for', t => {
  const binaries = syntheticPosixDirectory(t, 'path-explicit-');
  const executable = writeExecutable(binaries, 'impact-lens-fixture-server', '#!/bin/sh\nexit 0\n');
  assert.equal(findExecutable(executable, { env: { PATH: '' }, platform: 'linux' }), executable);
  assert.equal(findExecutable('./impact-lens-fixture-server', { env: { PATH: binaries }, platform: 'linux' }), undefined);
});

test('a directory on PATH is not mistaken for an executable', t => {
  const binaries = syntheticPosixDirectory(t, 'path-directory-');
  fs.mkdirSync(path.join(binaries, 'impact-lens-fixture-server'));
  assert.equal(
    findExecutable('impact-lens-fixture-server', { env: { PATH: binaries }, platform: 'linux' }),
    undefined,
  );
});

test('Windows lookup uses PATHEXT because there is no execute bit there', t => {
  const binaries = temporaryDirectory(t, 'impact-lens-path-pathext-');
  fs.writeFileSync(path.join(binaries, 'impact-lens-fixture-server.CMD'), 'rem\n');
  assert.equal(
    findExecutable('impact-lens-fixture-server', {
      env: { PATH: binaries, PATHEXT: '.EXE;.CMD' },
      platform: 'win32',
    }),
    path.join(binaries, 'impact-lens-fixture-server.CMD'),
  );
});

// ---------------------------------------------------------------------------
// Version probe
// ---------------------------------------------------------------------------

const PROBE = { args: [] as string[], timeoutMs: 5000, maxOutputBytes: 4096, supported: { minimum: '1.0.0' } };

function versionScript(t: { after(fn: () => void): void }, body: string): string {
  const directory = temporaryDirectory(t, 'impact-lens-version-');
  const script = path.join(directory, 'version.js');
  fs.writeFileSync(script, body);
  return script;
}

test('version probe reads a version out of ordinary release prose', t => {
  const script = versionScript(t, "process.stdout.write('fixture language server 2.4.1 (linux)\\n');\n");
  const outcome = probeVersion(process.execPath, { ...PROBE, args: [script] });
  assert.equal(outcome.kind, 'found');
  assert.equal(outcome.kind === 'found' && outcome.version, '2.4.1');
});

test('version probe reads stderr too, because servers disagree about where a version belongs', t => {
  const script = versionScript(t, "process.stderr.write('v3.0\\n');\n");
  const outcome = probeVersion(process.execPath, { ...PROBE, args: [script] });
  assert.equal(outcome.kind === 'found' && outcome.version, '3.0');
});

test('version probe separates an unreadable version from a failed run', t => {
  const unreadable = versionScript(t, "process.stdout.write('no version here\\n');\n");
  assert.equal(probeVersion(process.execPath, { ...PROBE, args: [unreadable] }).kind, 'unreadable');

  const failing = versionScript(t, "process.stderr.write('boom\\n');\nprocess.exit(3);\n");
  const outcome = probeVersion(process.execPath, { ...PROBE, args: [failing] });
  assert.equal(outcome.kind, 'failed');
  assert.equal(outcome.kind === 'failed' && outcome.exitCode, 3);
});

test('version probe stops a hanging provider at its declared budget', t => {
  const script = versionScript(t, 'setTimeout(() => {}, 60000);\n');
  const outcome = probeVersion(process.execPath, { ...PROBE, args: [script], timeoutMs: 300 });
  assert.equal(outcome.kind, 'timeout');
});

test('version probe truncates output to the declared ceiling', t => {
  const script = versionScript(t, "process.stdout.write('1.2.3 ' + 'x'.repeat(50000));\n");
  const outcome = probeVersion(process.execPath, { ...PROBE, args: [script], maxOutputBytes: 64 });
  // maxBuffer already stops the child, and whatever arrives is cut to the ceiling before it is kept.
  assert.ok(outcome.kind === 'found' || outcome.kind === 'failed');
  if (outcome.kind === 'found') {
    assert.ok(outcome.output.length <= 64);
  }
});

test('version comparison pads shorter versions and honours both bounds', () => {
  assert.equal(compareVersions('1.2', '1.2.0'), 0);
  assert.equal(compareVersions('1.10.0', '1.9.9'), 1);
  assert.equal(compareVersions('2.0.0', '10.0.0'), -1);
  assert.equal(isVersionSupported('1.0.0', { minimum: '1.0.0' }), true);
  assert.equal(isVersionSupported('0.9.9', { minimum: '1.0.0' }), false);
  assert.equal(isVersionSupported('3.0.0', { minimum: '1.0.0', maximum: '2.9.9' }), false);
  assert.equal(parseVersion('nothing numeric'), undefined);
  // A dotted run beats a bare number so a product name cannot be mistaken for a release.
  assert.equal(parseVersion('fixture-server-v2 1.4.0'), '1.4.0');
});

// ---------------------------------------------------------------------------
// Manifest values
// ---------------------------------------------------------------------------

const REFS = {
  nodeExecutable: () => '/fixture/node',
  bundledModuleEntry: (module: string) => `/fixture/modules/${module}`,
};

function catalogOptions(origin = 'fixture') {
  return { origin, allowRefs: true, refs: REFS };
}

test('manifest references resolve to values, keeping their type and needing no escaping', () => {
  const tree: ManifestObject = {
    executable: { $ref: 'nodeExecutable' },
    // A string that merely looks like a template is data, because substitution only happens on a
    // tagged object. That is the property token interpolation could not have given us.
    literal: '${nodeExecutable} stays put',
    nested: { entry: { $ref: 'bundledModuleEntry', module: 'a/b.mjs' } },
  };
  assert.deepEqual(resolveManifestObject(tree, catalogOptions()), {
    executable: '/fixture/node',
    literal: '${nodeExecutable} stays put',
    nested: { entry: '/fixture/modules/a/b.mjs' },
  });
});

test('references are refused in user-supplied trees rather than silently dropped', () => {
  assert.throws(
    () => assertPlainJsonObject({ executable: { $ref: 'nodeExecutable' } }, 'override'),
    (error: unknown) => error instanceof CliError && error.code === 'provider_config_invalid',
  );
});

test('reference misuse is reported instead of guessed at', () => {
  const cases: readonly ManifestObject[] = [
    { a: { $ref: 'bundledModuleEntry' } },
    { a: { $ref: 'nodeExecutable', module: 'x' } },
    { a: { $ref: 'somethingElse' } as never },
  ];
  for (const tree of cases) {
    assert.throws(
      () => resolveManifestObject(tree, catalogOptions()),
      (error: unknown) => error instanceof CliError && error.code === 'provider_config_invalid',
      JSON.stringify(tree),
    );
  }
});

test('manifest limits reject prototype keys at every depth', () => {
  for (const key of ['__proto__', 'constructor', 'prototype']) {
    assert.throws(
      () => resolveManifestObject({ outer: { [key]: 'x' } } as ManifestObject, catalogOptions()),
      (error: unknown) => error instanceof CliError && error.code === 'provider_config_invalid',
      key,
    );
  }
});

test('manifest limits reject depth, key count, size and non-finite numbers', () => {
  let deep: ManifestObject = { leaf: 1 };
  for (let index = 0; index <= MANIFEST_LIMITS.maxDepth + 1; index += 1) {
    deep = { level: deep };
  }
  assert.throws(() => resolveManifestObject(deep, catalogOptions()), CliError);

  const wide: Record<string, number> = {};
  for (let index = 0; index <= MANIFEST_LIMITS.maxKeys; index += 1) {
    wide[`k${index}`] = index;
  }
  assert.throws(() => resolveManifestObject(wide as ManifestObject, catalogOptions()), CliError);

  assert.throws(
    () => resolveManifestObject({ big: 'x'.repeat(MANIFEST_LIMITS.maxSerializedBytes + 1) }, catalogOptions()),
    CliError,
  );
  assert.throws(
    () => resolveManifestObject({ bad: Number.POSITIVE_INFINITY } as ManifestObject, catalogOptions()),
    CliError,
  );
});

test('request and provider configuration enforce the same D8 budgets', () => {
  assert.deepEqual(MANIFEST_LIMITS, CONFIG_TREE_LIMITS);
});

test('command arguments must resolve to strings', () => {
  assert.deepEqual(
    resolveManifestStrings([{ $ref: 'nodeExecutable' }, '--stdio'], catalogOptions('args')),
    ['/fixture/node', '--stdio'],
  );
  assert.throws(() => resolveManifestStrings([42], catalogOptions('args')), CliError);
});

test('merging is deep for objects and wholesale for arrays', () => {
  const preset: JsonObject = { a: { keep: 1, replace: 'preset' }, list: [1, 2, 3] };
  const project: JsonObject = { a: { replace: 'project' }, list: [9] };
  const request: JsonObject = { a: { added: true } };
  assert.deepEqual(mergeJsonObjects(preset, project, request), {
    a: { keep: 1, replace: 'project', added: true },
    // Element-wise merging of an LSP settings array has no agreed meaning, so the later list wins.
    list: [9],
  });
});

test('the redaction table takes declared slots and the name heuristic, and skips short values', () => {
  const tree: JsonObject = {
    licenseServer: { credential: 'not-name-matched-secret' },
    auth: { token: 'name-matched-secret' },
    flag: 'ab',
    apiKey: 'xy',
  };
  const values = collectSensitiveStrings(tree, ['licenseServer.credential']);
  assert.ok(values.includes('not-name-matched-secret'), 'declared slot');
  assert.ok(values.includes('name-matched-secret'), 'heuristic backstop');
  assert.equal(values.includes('ab'), false, 'a two-character value would corrupt every log line');
  assert.equal(values.includes('xy'), false);
});

test('dotted settings keys are reported so doctor can warn about unreachable sections', () => {
  assert.deepEqual(
    unreachableDottedKeys({ 'typescript.preferences': { x: 1 }, files: { 'exclude.glob': true } }),
    ['typescript.preferences', 'files.exclude.glob'],
  );
});

// ---------------------------------------------------------------------------
// Project configuration file
// ---------------------------------------------------------------------------

test('a missing project file is not an error', t => {
  const workspace = temporaryDirectory(t, 'impact-lens-project-absent-');
  assert.equal(readProjectProviderChoice(workspace), undefined);
});

test('a malformed project file names the file rather than blaming the request', t => {
  const workspace = temporaryDirectory(t, 'impact-lens-project-broken-');
  fs.mkdirSync(path.join(workspace, '.impact-lens'));
  const file = path.join(workspace, PROJECT_PROVIDER_CONFIG_PATH);
  const cases: readonly [string, string][] = [
    ['{not json', 'syntax'],
    ['[]', 'not an object'],
    [JSON.stringify({ presetId: 'x', extra: 1 }), 'unknown field'],
    [JSON.stringify({ languageId: 'typescript' }), 'neither preset nor command'],
    [JSON.stringify({ command: '/absolute/server' }), 'absolute path'],
    [JSON.stringify({ command: 'srv', args: [1] }), 'args not strings'],
  ];
  for (const [content, label] of cases) {
    fs.writeFileSync(file, content);
    assert.throws(
      () => readProjectProviderChoice(workspace),
      (error: unknown) => error instanceof CliError
        && error.code === 'provider_config_invalid'
        && error.message.includes(PROJECT_PROVIDER_CONFIG_PATH),
      label,
    );
  }
});

test('project value overrides merge over the preset without changing the selection', t => {
  const workspace = temporaryDirectory(t, 'impact-lens-project-values-');
  fs.mkdirSync(path.join(workspace, '.impact-lens'));
  fs.writeFileSync(path.join(workspace, PROJECT_PROVIDER_CONFIG_PATH), JSON.stringify({
    presetId: 'bundled-typescript',
    initializationOptions: { preferences: { includeInlayHints: true } },
    settings: { typescript: { format: { semicolons: 'insert' } } },
  }));
  const options: ProviderResolutionOptions = {
    workspace,
    env: NO_ENV,
    override: { settings: { typescript: { format: { semicolons: 'remove' } } } },
  };
  const resolved = resolveProvider('src/a.ts', undefined, options);
  assert.deepEqual(resolved.initializationOptions, { preferences: { includeInlayHints: true } });
  // preset < project < request: the request wins the leaf, the project keeps the branch.
  assert.deepEqual(resolved.settings, { typescript: { format: { semicolons: 'remove' } } });
});

test('merged settings reject a combined key budget and report numeric source contributions only', () => {
  const preset = fixturePythonPreset({ settings: keyedTree('preset', 400) });
  const project: ProjectProviderChoice = {
    source: PROJECT_PROVIDER_CONFIG_PATH,
    presetId: preset.id,
    settings: keyedTree('project', 400),
  };
  const request = keyedTree('request', 400);
  assert.throws(
    () => resolveSessionValues(preset, project, { override: { settings: request } }),
    (error: unknown) => {
      assert.ok(error instanceof CliError);
      assert.equal(error.code, 'provider_config_invalid');
      const details = error.details as Record<string, unknown>;
      assert.equal(details.field, 'settings');
      assert.equal(details.rule, 'keys');
      assert.equal(details.limit, MANIFEST_LIMITS.maxKeys);
      assert.equal(details.observed, 1200);
      const contributions = details.sourceContributions as Record<string, { readonly keys: number }>;
      assert.equal(contributions.preset.keys, 400);
      assert.equal(contributions.project.keys, 400);
      assert.equal(contributions.request.keys, 400);
      return true;
    },
  );
});

test('merged initialization options reject a combined byte budget without exposing values', () => {
  const sentinel = 'IL-MERGED-BUDGET-SECRET-93d8';
  const value = (source: string, fill: string): JsonObject => ({
    [source]: `${sentinel}-${source}-${fill.repeat(24000)}`,
  });
  const preset = fixturePythonPreset({ initializationOptions: value('preset', 'p') });
  const project: ProjectProviderChoice = {
    source: PROJECT_PROVIDER_CONFIG_PATH,
    presetId: preset.id,
    initializationOptions: value('project', 'q'),
  };
  assert.throws(
    () => resolveSessionValues(preset, project, {
      override: { initializationOptions: value('request', 'r') },
    }),
    (error: unknown) => {
      assert.ok(error instanceof CliError);
      assert.equal(error.code, 'provider_config_invalid');
      assert.doesNotMatch(`${error.message}\n${JSON.stringify(error.details)}`, new RegExp(sentinel));
      const details = error.details as Record<string, unknown>;
      assert.equal(details.field, 'initializationOptions');
      assert.equal(details.rule, 'bytes');
      assert.equal(details.limit, MANIFEST_LIMITS.maxSerializedBytes);
      assert.ok((details.observed as number) > MANIFEST_LIMITS.maxSerializedBytes);
      const contributions = details.sourceContributions as Record<string, { readonly serializedBytes: number }>;
      assert.ok(contributions.preset.serializedBytes > 24000);
      assert.ok(contributions.project.serializedBytes > 24000);
      assert.ok(contributions.request.serializedBytes > 24000);
      return true;
    },
  );
});

// ---------------------------------------------------------------------------
// Language detection is unchanged
// ---------------------------------------------------------------------------

test('language detection still maps the extensions it mapped before', () => {
  assert.equal(languageId('a.ts'), 'typescript');
  assert.equal(languageId('a.MTS'), 'typescript');
  assert.equal(languageId('a.tsx'), 'typescriptreact');
  assert.equal(languageId('a.jsx'), 'javascriptreact');
  assert.equal(languageId('a.cjs'), 'javascript');
  assert.equal(languageId('a.py'), 'python');
  assert.equal(languageId('a.go'), 'go');
  assert.equal(languageId('a.kt'), 'kotlin');
  assert.equal(languageId('a.unknown'), 'plaintext');
});

// `catalog.ts`'s `extensions` field and `languageId()`'s switch above are two independent sources of
// truth for the same fact - declaring an extension on a preset does nothing to `languageId()` by
// itself. That gap shipped silently: the `gopls` preset declared `extensions: ['.go']` for a full
// milestone stage before `languageId()` gained a `.go` case, during which a real `.go` request detected
// as `plaintext` and never reached `gopls` at all (task-fix-go-language-detection.md). This closes the
// gap for every current and future preset, not just gopls.
test("every preset's declared extensions are actually reachable through languageId()", () => {
  for (const preset of PROVIDER_CATALOG) {
    for (const extension of preset.extensions) {
      const detected = languageId(`probe${extension}`);
      assert.ok(
        preset.languageIds.includes(detected),
        `${preset.id} declares extension ${extension}, but languageId() maps it to '${detected}', not ` +
        `one of ${JSON.stringify(preset.languageIds)} - a real request for a ${extension} file would ` +
        `never reach ${preset.id} through auto-discovery.`,
      );
    }
  }
});
