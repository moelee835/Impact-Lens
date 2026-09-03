import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import test from 'node:test';
import { DoctorCheck } from '../doctor/checks';
import { runDoctor } from '../doctor/index';
import { PROVIDER_CATALOG } from '../providers/catalog';
import { ProviderPreset } from '../providers/preset';
import { PROJECT_PROVIDER_CONFIG_PATH } from '../providers/projectConfig';
import { CliError } from '../types';
import { syntheticPosixDirectory } from './testFsHelpers';

const EXECUTABLE = path.resolve(__dirname, '..', 'index.js');

function fixtureServer(name: string): string {
  return path.join(__dirname, 'fixtures', `${name}.js`);
}

function temporaryDirectory(t: { after(fn: () => void): void }, prefix: string): string {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  return directory;
}

function check(checks: readonly DoctorCheck[], id: string): DoctorCheck {
  const found = checks.find(entry => entry.id === id);
  assert.ok(found, `expected a ${id} check in ${checks.map(entry => entry.id).join(', ')}`);
  return found;
}

/**
 * A preset for a language the shipped catalog does not serve, used to reach the failure paths.
 *
 * It never enters `providers/catalog.ts`. A `verified-external` entry there is a promise that a real
 * fixture passed against a pinned version range, and M1 has verified exactly one language.
 */
function externalPreset(overrides: Partial<ProviderPreset> = {}): ProviderPreset {
  return {
    id: 'fixture-external',
    displayName: 'Fixture External Server',
    tier: 'verified-external',
    languageIds: ['typescript'],
    extensions: ['.ts'],
    command: { candidates: ['impact-lens-absent-server'], args: [], languageIdFrom: 'detected' },
    docs: { install: 'https://example.invalid/install-fixture-server' },
    lastVerified: { date: '2026-01-01', versions: ['1.0.0'] },
    ...overrides,
  };
}

function mockServerPreset(fixture: string, overrides: Partial<ProviderPreset> = {}): ProviderPreset {
  return externalPreset({
    command: {
      candidates: [process.execPath],
      args: [fixtureServer(fixture)],
      languageIdFrom: 'detected',
    },
    ...overrides,
  });
}

function versionScript(t: { after(fn: () => void): void }, body: string): string {
  const directory = temporaryDirectory(t, 'impact-lens-doctor-version-');
  const script = path.join(directory, 'version.js');
  fs.writeFileSync(script, body);
  return script;
}

// ---------------------------------------------------------------------------
// The healthy path still looks the way callers expect
// ---------------------------------------------------------------------------

test('preflight on the bundled preset reports ready without starting a process', async t => {
  const workspace = temporaryDirectory(t, 'impact-lens-doctor-ready-');
  const data = await runDoctor('bundled-typescript', { workspace, env: {} });
  assert.equal(data.status, 'ready');
  assert.equal(data.mode, 'preflight');
  const checks = data.checks as readonly DoctorCheck[];
  assert.deepEqual(checks.map(entry => entry.id), [
    'node-engine',
    'cli-package',
    'bundled-provider-artifact',
    'language-support',
    'settings-keys',
    'project-config',
  ]);
  assert.ok(checks.every(entry => entry.status === 'pass'));
  assert.deepEqual((data.preset as { id: string; tier: string }).tier, 'bundled');
});

test('an unknown preset is refused with the list of presets that do exist', async () => {
  await assert.rejects(
    () => runDoctor('no-such-preset'),
    (error: unknown) => error instanceof CliError
      && error.code === 'invalid_command'
      && error.exitCode === 2
      && (error.details as { knownPresetIds: string[] }).knownPresetIds.includes('bundled-typescript'),
  );
});

// ---------------------------------------------------------------------------
// The five failure kinds the Wave 1 gate asks doctor to keep apart
// ---------------------------------------------------------------------------

test('a missing executable is reported as its own failure with what to install', async t => {
  const binaries = syntheticPosixDirectory(t, 'doctor-nobin-');
  const data = await runDoctor('fixture-external', {
    workspace: temporaryDirectory(t, 'impact-lens-doctor-nobin-ws-'),
    catalog: [externalPreset()],
    lookup: { env: { PATH: binaries }, platform: 'linux' },
    env: {},
  });
  const executable = check(data.checks as DoctorCheck[], 'provider-executable');
  assert.equal(executable.status, 'fail');
  assert.equal(executable.code, 'provider_executable_not_found');
  assert.equal(executable.install, 'https://example.invalid/install-fixture-server');
  assert.equal(executable.recovery, 'install_the_language_server_manually');
  assert.equal(data.status, 'blocked');
});

test('an unsupported version is reported separately from an unreadable one', async t => {
  const supported = { minimum: '1.0.0' };
  const probe = { timeoutMs: 5000, maxOutputBytes: 4096, supported };

  const tooOld = await runDoctor('fixture-external', {
    workspace: temporaryDirectory(t, 'impact-lens-doctor-oldver-'),
    catalog: [externalPreset({
      command: { candidates: [process.execPath], args: [], languageIdFrom: 'detected' },
      version: { ...probe, args: [versionScript(t, "process.stdout.write('fixture 0.4.2\\n');\n")] },
    })],
    env: {},
  });
  const outOfRange = check(tooOld.checks as DoctorCheck[], 'provider-version');
  assert.equal(outOfRange.status, 'fail');
  assert.equal(outOfRange.code, 'provider_version_unsupported');
  assert.equal(outOfRange.detected, '0.4.2');
  assert.equal(outOfRange.supported, '>=1.0.0');

  const silent = await runDoctor('fixture-external', {
    workspace: temporaryDirectory(t, 'impact-lens-doctor-noverr-'),
    catalog: [externalPreset({
      command: { candidates: [process.execPath], args: [], languageIdFrom: 'detected' },
      version: { ...probe, args: [versionScript(t, "process.stdout.write('a language server\\n');\n")] },
    })],
    env: {},
  });
  const unreadable = check(silent.checks as DoctorCheck[], 'provider-version');
  // Failing to read a version says as much about our parser as about the server, so it warns rather
  // than blocking. The code is what tells the two apart.
  assert.equal(unreadable.status, 'warn');
  assert.equal(unreadable.code, 'provider_version_unreadable');
  assert.equal(unreadable.reason, 'no-version-in-output');
  assert.equal(silent.status, 'degraded');
});

test('a language the preset does not serve is reported as a mismatch, not as an empty result', async t => {
  const data = await runDoctor('bundled-typescript', {
    workspace: temporaryDirectory(t, 'impact-lens-doctor-lang-'),
    file: 'service.py',
    env: {},
  });
  const language = check(data.checks as DoctorCheck[], 'language-support');
  assert.equal(language.status, 'fail');
  assert.equal(language.code, 'provider_language_mismatch');
  assert.equal(language.detectedLanguageId, 'python');
  assert.deepEqual(language.languageIds, [
    'typescript', 'typescriptreact', 'javascript', 'javascriptreact',
  ]);
});

test('an unrecognised extension warns instead of claiming a mismatch', async t => {
  const data = await runDoctor('bundled-typescript', {
    workspace: temporaryDirectory(t, 'impact-lens-doctor-langunknown-'),
    file: 'notes.txt',
    env: {},
  });
  const language = check(data.checks as DoctorCheck[], 'language-support');
  assert.equal(language.status, 'warn');
  assert.equal(language.reason, 'unrecognised-extension');
  assert.equal(language.code, undefined);
});

test('a server without Call Hierarchy is reported as a missing capability', { timeout: 30000 }, async t => {
  const data = await runDoctor('fixture-external', {
    mode: 'smoke',
    workspace: temporaryDirectory(t, 'impact-lens-doctor-nocap-'),
    catalog: [mockServerPreset('noCapabilityServer')],
    timeoutMs: 8000,
    env: {},
    log: () => {},
  });
  const smoke = check(data.checks as DoctorCheck[], 'initialize-capability-smoke');
  assert.equal(smoke.status, 'fail');
  assert.equal(smoke.code, 'provider_capability_missing');
  assert.equal(smoke.callHierarchy, false);
  assert.equal(data.status, 'blocked');
});

test('a server that advertises Call Hierarchy but answers nothing fails the fixture', { timeout: 30000 }, async t => {
  const data = await runDoctor('fixture-external', {
    mode: 'fixture',
    workspace: temporaryDirectory(t, 'impact-lens-doctor-fixture-'),
    catalog: [mockServerPreset('parentWatchdogServer', {
      fixture: {
        files: [{ path: 'src/target.ts', content: 'export function fixtureTarget(): void {}\n' }],
        target: { file: 'src/target.ts', line: 1, column: 17 },
        expectedCaller: 'fixtureCaller',
      },
    })],
    timeoutMs: 8000,
    env: {},
    log: () => {},
  });
  const checks = data.checks as DoctorCheck[];
  // The capability probe passed and the fixture did not. That separation is the whole point: a server
  // advertising Call Hierarchy is not the same as a server answering one.
  assert.equal(check(checks, 'initialize-capability-smoke').status, 'pass');
  const fixture = check(checks, 'fixture-call-hierarchy');
  assert.equal(fixture.status, 'fail');
  assert.equal(fixture.code, 'provider_fixture_failed');
  assert.equal(fixture.reason, 'no-symbol-at-fixture-target');
});

test('the real bundled server passes its fixture and fails a wrong expectation', { timeout: 60000 }, async t => {
  const preset = PROVIDER_CATALOG.find(entry => entry.id === 'bundled-typescript');
  assert.ok(preset?.fixture);

  const passing = await runDoctor('bundled-typescript', {
    mode: 'fixture',
    workspace: temporaryDirectory(t, 'impact-lens-doctor-realfixture-'),
    timeoutMs: 30000,
    env: {},
    log: () => {},
  });
  const passed = check(passing.checks as DoctorCheck[], 'fixture-call-hierarchy');
  assert.equal(passed.status, 'pass', JSON.stringify(passed));
  assert.deepEqual(passed.observedCallers, ['fixtureCaller']);

  const failing = await runDoctor('bundled-typescript', {
    mode: 'fixture',
    workspace: temporaryDirectory(t, 'impact-lens-doctor-realfixture-bad-'),
    catalog: [{ ...preset, fixture: { ...preset.fixture, expectedCaller: 'notTheCaller' } }],
    timeoutMs: 30000,
    env: {},
    log: () => {},
  });
  const failed = check(failing.checks as DoctorCheck[], 'fixture-call-hierarchy');
  assert.equal(failed.status, 'fail');
  assert.equal(failed.code, 'provider_fixture_failed');
  assert.equal(failed.reason, 'expected-caller-missing');
  assert.deepEqual(failed.observedCallers, ['fixtureCaller']);
});

// ---------------------------------------------------------------------------
// The first failure does not end the run
// ---------------------------------------------------------------------------

test('every check runs even when earlier ones fail', async t => {
  const workspace = temporaryDirectory(t, 'impact-lens-doctor-multi-');
  fs.mkdirSync(path.join(workspace, '.impact-lens'));
  fs.writeFileSync(path.join(workspace, PROJECT_PROVIDER_CONFIG_PATH), '{ not json');
  const binaries = syntheticPosixDirectory(t, 'doctor-multi-bin-');

  const data = await runDoctor('fixture-external', {
    workspace,
    file: 'service.py',
    catalog: [externalPreset({ settings: { 'typescript.format': { semicolons: 'insert' } } })],
    lookup: { env: { PATH: binaries }, platform: 'linux' },
    env: {},
  });

  const checks = data.checks as DoctorCheck[];
  // Three independent problems, all present in one answer. The previous doctor threw on the first of
  // them and hard-coded `status: 'pass'` on everything else, so it could report none of this.
  assert.equal(check(checks, 'provider-executable').status, 'fail');
  assert.equal(check(checks, 'language-support').status, 'fail');
  assert.equal(check(checks, 'project-config').status, 'fail');
  assert.equal(check(checks, 'project-config').code, 'provider_config_invalid');
  assert.equal(check(checks, 'settings-keys').status, 'warn');
  assert.deepEqual(check(checks, 'settings-keys').unreachableSections, ['typescript.format']);
  assert.equal(check(checks, 'node-engine').status, 'pass');
  assert.equal(data.status, 'blocked');
});

test('doctor status summarises the worst check without hiding the others', async t => {
  const workspace = temporaryDirectory(t, 'impact-lens-doctor-status-');
  const degraded = await runDoctor('fixture-external', {
    workspace,
    catalog: [externalPreset({
      command: { candidates: [process.execPath], args: [], languageIdFrom: 'detected' },
      settings: { 'a.b': 1 },
    })],
    env: {},
  });
  assert.equal(degraded.status, 'degraded');
  assert.ok((degraded.checks as DoctorCheck[]).some(entry => entry.status === 'pass'));
});

// ---------------------------------------------------------------------------
// The stdout contract
// ---------------------------------------------------------------------------

test('doctor writes exactly one JSON line to stdout and its progress to stderr', () => {
  const result = spawnSync(process.execPath, [EXECUTABLE, 'doctor', 'bundled-typescript', '--smoke'], {
    encoding: 'utf8',
    timeout: 30000,
  });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout.trimEnd().split('\n').length, 1);
  const response = JSON.parse(result.stdout) as { ok: boolean; data: { mode: string; checks: DoctorCheck[] } };
  assert.equal(response.ok, true);
  assert.equal(response.data.mode, 'smoke');
  // Progress exists, is on stderr, and is not JSON: nothing here can be mistaken for the envelope.
  assert.match(result.stderr, /impact-lens doctor: initializing bundled-typescript/);
  for (const line of result.stderr.trimEnd().split('\n')) {
    assert.doesNotMatch(line, /^\{/, 'stderr progress must never look like an envelope');
  }
});

test('preflight stays silent on stderr and leaks no absolute path to stdout', () => {
  const result = spawnSync(process.execPath, [EXECUTABLE, 'doctor', 'bundled-typescript'], {
    encoding: 'utf8',
  });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stderr, '');
  assert.doesNotMatch(result.stdout, new RegExp(process.cwd()));
});

test('the doctor subcommand accepts any preset name and rejects a missing one', () => {
  // 'gopls' used to be this test's stand-in for a preset name absent from the catalog; M2 stage 2 made
  // it a real shipped preset, so the unknown-preset path now needs a name that still isn't real.
  const unknown = spawnSync(process.execPath, [EXECUTABLE, 'doctor', 'no-such-preset'], { encoding: 'utf8' });
  assert.equal(unknown.status, 2);
  assert.equal(unknown.stdout, '');
  assert.equal(JSON.parse(unknown.stderr).error.code, 'invalid_command');

  const missing = spawnSync(process.execPath, [EXECUTABLE, 'doctor'], { encoding: 'utf8' });
  assert.equal(missing.status, 2);
  assert.equal(JSON.parse(missing.stderr).error.code, 'invalid_command');
});

test('the file option reaches the language check through the CLI surface', () => {
  const result = spawnSync(
    process.execPath,
    [EXECUTABLE, 'doctor', 'bundled-typescript', '--file', 'service.py'],
    { encoding: 'utf8' },
  );
  assert.equal(result.status, 0, result.stderr);
  const data = JSON.parse(result.stdout).data as { status: string; checks: DoctorCheck[] };
  assert.equal(data.status, 'blocked');
  assert.equal(check(data.checks, 'language-support').code, 'provider_language_mismatch');
});

// ---------------------------------------------------------------------------
// compile-database check (M2 clangd lane stage 3, docs/work/task-m2-clangd-preset.md) - surfaces
// compile_commands.json state, never gates. `fixture-external` overridden to a C-family languageIds so
// the check activates without needing the real clangd preset (stage 4).
// ---------------------------------------------------------------------------

function cFamilyPreset(overrides: Partial<ProviderPreset> = {}): ProviderPreset {
  return externalPreset({ languageIds: ['c', 'cpp'], extensions: ['.c', '.cpp'], ...overrides });
}

test('a non-C-family preset never carries a compile-database check at all', async t => {
  const data = await runDoctor('fixture-external', {
    workspace: temporaryDirectory(t, 'impact-lens-doctor-nocdb-ts-'),
    env: {},
    catalog: [...PROVIDER_CATALOG, externalPreset()],
  });
  const checks = data.checks as readonly DoctorCheck[];
  assert.ok(!checks.some(entry => entry.id === 'compile-database'), JSON.stringify(checks.map(c => c.id)));
});

test('a C-family preset with no compile_commands.json anywhere reports missing, as a warning not a failure', async t => {
  const data = await runDoctor('fixture-external', {
    workspace: temporaryDirectory(t, 'impact-lens-doctor-cdb-missing-'),
    env: {},
    catalog: [...PROVIDER_CATALOG, cFamilyPreset()],
  });
  const result = check(data.checks as readonly DoctorCheck[], 'compile-database');
  // Surfaces, never gates: this check's own status is `warn`, never `fail` - the same way
  // `settingsKeysCheck`/`projectConfigCheck`'s state-only findings never escalate to `fail` on their
  // own. (The overall run's aggregate status here is `blocked` for an unrelated reason - the fixture
  // preset's executable does not exist - so it is not asserted on in this test.)
  assert.equal(result.status, 'warn');
  assert.equal(result.state, 'missing');
});

test('a fresh compile_commands.json at the workspace root reports present/pass', async t => {
  const workspace = temporaryDirectory(t, 'impact-lens-doctor-cdb-present-');
  fs.writeFileSync(
    path.join(workspace, 'compile_commands.json'),
    JSON.stringify([{ directory: workspace, arguments: ['/usr/bin/clang', '-c', 'main.c'], file: path.join(workspace, 'main.c') }]),
  );
  const data = await runDoctor('fixture-external', { workspace, env: {}, catalog: [...PROVIDER_CATALOG, cFamilyPreset()] });
  const result = check(data.checks as readonly DoctorCheck[], 'compile-database');
  assert.equal(result.status, 'pass');
  assert.equal(result.state, 'present');
  assert.equal(result.path, 'compile_commands.json');
});

test('a compile_commands.json older than CMakeLists.txt reports stale/warn, not pass', async t => {
  const workspace = temporaryDirectory(t, 'impact-lens-doctor-cdb-stale-');
  fs.writeFileSync(
    path.join(workspace, 'compile_commands.json'),
    JSON.stringify([{ directory: workspace, arguments: ['/usr/bin/clang', '-c', 'main.c'], file: path.join(workspace, 'main.c') }]),
  );
  fs.utimesSync(path.join(workspace, 'compile_commands.json'), new Date('2026-01-01'), new Date('2026-01-01'));
  fs.writeFileSync(path.join(workspace, 'CMakeLists.txt'), 'cmake_minimum_required(VERSION 3.20)\n');
  fs.utimesSync(path.join(workspace, 'CMakeLists.txt'), new Date('2026-06-01'), new Date('2026-06-01'));
  const data = await runDoctor('fixture-external', { workspace, env: {}, catalog: [...PROVIDER_CATALOG, cFamilyPreset()] });
  const result = check(data.checks as readonly DoctorCheck[], 'compile-database');
  assert.equal(result.status, 'warn');
  assert.equal(result.state, 'stale');
});

test('two candidate compile_commands.json files report ambiguous/warn with both relative paths', async t => {
  const workspace = temporaryDirectory(t, 'impact-lens-doctor-cdb-ambiguous-');
  fs.writeFileSync(path.join(workspace, 'compile_commands.json'), '[]');
  fs.mkdirSync(path.join(workspace, 'build'));
  fs.writeFileSync(path.join(workspace, 'build', 'compile_commands.json'), '[]');
  const data = await runDoctor('fixture-external', { workspace, env: {}, catalog: [...PROVIDER_CATALOG, cFamilyPreset()] });
  const result = check(data.checks as readonly DoctorCheck[], 'compile-database');
  assert.equal(result.status, 'warn');
  assert.equal(result.state, 'ambiguous');
  assert.deepEqual(result.candidatePaths, ['build/compile_commands.json', 'compile_commands.json']);
});

// A commander review found the first redaction attempt (redact matched flag patterns) had a
// reachable, real leak: it caught concatenated `-DNAME=value` but missed a space-separated `-D
// NAME=value` (reachable through this exact code path, since a JSON Compilation Database's
// `arguments` array commonly splits `-D` from its value, and the array gets joined back into one
// string), a quoted value whose closing quote falls past the flag's own token boundary, and MSVC's
// `/D` spelling (relevant because CI runs windows-latest). The fix is not a wider pattern - the same
// chase already burned five rounds in this session's response-policy-engine lane for the same
// underlying reason (a lexical match over free-form text has no boundary) - it is to never read a
// flag's name or value into the response at all. `sample` reports only compiler basename, a
// workspace-relative file path, and an argument count: three fields with no room for a flag's content
// to hide in, so there is nothing left to redact.
test('a present compile database\'s sample carries only compiler/file/argumentCount, never a flag', async t => {
  const workspace = temporaryDirectory(t, 'impact-lens-doctor-cdb-sample-shape-');
  fs.writeFileSync(
    path.join(workspace, 'compile_commands.json'),
    JSON.stringify([{
      directory: workspace,
      arguments: ['/usr/bin/clang', '-Wall', '-Wextra', '-c', 'main.c', '-o', 'main.o'],
      file: path.join(workspace, 'src', 'main.c'),
    }]),
  );
  const data = await runDoctor('fixture-external', { workspace, env: {}, catalog: [...PROVIDER_CATALOG, cFamilyPreset()] });
  const result = check(data.checks as readonly DoctorCheck[], 'compile-database');
  assert.deepEqual(result.sample, { compiler: 'clang', file: 'src/main.c', argumentCount: 6 });
});

// The four leak shapes commander measured against the retracted `redactPreprocessorDefines()` design,
// each checked in BOTH directions: the check's actual JSON output (the whole object, not just one
// field, in case a leak landed somewhere other than `sample`) never contains the secret, and the exact
// raw content the fixture wrote DOES contain it - proving each secret was real and present, not an
// assertion that would have passed regardless of what the check did.
const LEAK_SHAPES: ReadonlyArray<{ readonly name: string; readonly arguments: readonly string[] }> = [
  { name: 'concatenated -D (the one form the retracted regex did catch)', arguments: ['clang', '-DAPI_TOKEN=abc123secret', '-c', 'main.c'] },
  { name: 'space-separated -D (reachable via arguments.join)', arguments: ['clang', '-D', 'API_TOKEN=abc123secret', '-c', 'main.c'] },
  { name: 'quoted value with an embedded space', arguments: ['clang', '-DGREETING=tok abc123secret', '-c', 'main.c'] },
  { name: 'MSVC /D spelling', arguments: ['clang-cl', '/DAPI_TOKEN=abc123secret', '-c', 'main.c'] },
  // A commander review found this fifth shape after the other four were already fixed: a malformed
  // entry whose arguments[0] IS a flag rather than a compiler executable. path.basename() passes a
  // flag-shaped string through unchanged (no '/' to strip), so this token would otherwise leak
  // straight into the `compiler` field - the one field this check still reads a real token into.
  { name: "arguments[0] is itself a -D define (malformed database, compiler slot)", arguments: ['-DAPI_TOKEN=abc123secret', '-c', 'main.c'] },
  // A second commander review found path.basename() is platform-bound: on POSIX (this suite's
  // platform) it does not treat '\' as a separator, so a Windows-generated compile_commands.json
  // (arguments[0] = an absolute path with a username in it) read on macOS/Linux passed the whole
  // string through unchanged as "compiler" - a real cross-platform scenario, not hypothetical (a
  // database committed to a repo and opened on a different OS than it was generated on).
  { name: 'a Windows-style absolute compiler path read on a non-Windows platform', arguments: ['C:\\Users\\abc123secret\\LLVM\\bin\\clang.exe', '-c', 'main.c'] },
];

for (const shape of LEAK_SHAPES) {
  test(`compile-database sample never leaks a secret via: ${shape.name}`, async t => {
    const workspace = temporaryDirectory(t, 'impact-lens-doctor-cdb-leak-');
    const rawContent = JSON.stringify([{ directory: workspace, arguments: shape.arguments, file: path.join(workspace, 'main.c') }]);
    fs.writeFileSync(path.join(workspace, 'compile_commands.json'), rawContent);
    const data = await runDoctor('fixture-external', { workspace, env: {}, catalog: [...PROVIDER_CATALOG, cFamilyPreset()] });
    const result = check(data.checks as readonly DoctorCheck[], 'compile-database');

    // Positive direction: the secret does not survive anywhere in the check's own output.
    assert.doesNotMatch(JSON.stringify(result), /abc123secret/);

    // Negative direction (the vacuous-pass guard): the raw fixture content this test actually wrote
    // really does contain the secret, so the assertion above is not vacuous.
    assert.match(rawContent, /abc123secret/);
  });
}

// The same cross-platform leak, in the `file` field instead of `compiler`: a Windows-style absolute
// path in a compile database entry's `file` property, read on a non-Windows platform, is invisible to
// the native (POSIX-bound) `path.isAbsolute()` and would otherwise be treated as an odd relative
// filename and passed through whole by `workspaceRelativeOrUndefined()`.
test('compile-database sample never leaks a secret via: a Windows-style absolute file path read on a non-Windows platform', async t => {
  const workspace = temporaryDirectory(t, 'impact-lens-doctor-cdb-leak-file-');
  const rawContent = JSON.stringify([{
    directory: workspace,
    arguments: ['clang', '-c', 'main.c'],
    file: 'C:\\Users\\abc123secret\\project\\main.c',
  }]);
  fs.writeFileSync(path.join(workspace, 'compile_commands.json'), rawContent);
  const data = await runDoctor('fixture-external', { workspace, env: {}, catalog: [...PROVIDER_CATALOG, cFamilyPreset()] });
  const result = check(data.checks as readonly DoctorCheck[], 'compile-database');

  assert.doesNotMatch(JSON.stringify(result), /abc123secret/);
  assert.match(rawContent, /abc123secret/);
});
