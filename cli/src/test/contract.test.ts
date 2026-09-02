import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import test from 'node:test';
import { pathToFileURL } from 'node:url';

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
  assert.equal(error.runtime.cli.name, '@impact-lens/cli');
  assert.equal(error.runtime.runner.source, 'direct');
  assert.doesNotMatch(result.stderr, /\u001b\[/);
});

test('reports bundled TypeScript runtime preflight as compact JSON', () => {
  const executable = path.resolve(__dirname, '..', 'index.js');
  const result = spawnSync(process.execPath, [executable, 'doctor', 'bundled-typescript'], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stderr, '');
  const response = JSON.parse(result.stdout);
  assert.equal(response.operation, 'provider.doctor');
  assert.equal(response.runtime.cli.version, '0.7.0');
  assert.equal(response.data.status, 'ready');
  assert.equal(response.data.mode, 'preflight');
  assert.equal(response.data.checks[2].version, '6.0.0');
  assert.equal(response.data.checks[2].entry, 'lib/cli.mjs');
  assert.doesNotMatch(result.stdout, new RegExp(process.cwd()));
});

test('doctor smoke initializes the bundled TypeScript Call Hierarchy provider', { timeout: 30000 }, () => {
  const executable = path.resolve(__dirname, '..', 'index.js');
  const result = spawnSync(process.execPath, [executable, 'doctor', 'bundled-typescript', '--smoke'], {
    encoding: 'utf8',
    timeout: 25000,
  });
  assert.equal(result.status, 0, result.stderr);
  const response = JSON.parse(result.stdout);
  assert.equal(response.data.mode, 'smoke');
  assert.equal(response.data.checks.at(-1).id, 'initialize-capability-smoke');
  assert.equal(response.data.checks.at(-1).callHierarchy, true);
});

// task-m2-python-preset.md stage 4: `executableCheck`'s `tier === 'bundled'` branch used to call
// `inspectBundledTypeScriptArtifact()` unconditionally, which was only correct while `bundled-typescript`
// was the sole bundled preset. Once `bundled-pyright` shipped, that bug would have made this exact
// command report TypeScript's package/version/entry as a `pass` for a pyright check - a wrong answer
// reported as success, never a failure a user would notice. This is the regression guard: it fails if
// that bug ever comes back, for this preset or the next bundled one.
test('reports bundled pyright runtime preflight as compact JSON, not TypeScript\'s artifact', () => {
  const executable = path.resolve(__dirname, '..', 'index.js');
  const result = spawnSync(process.execPath, [executable, 'doctor', 'bundled-pyright'], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stderr, '');
  const response = JSON.parse(result.stdout);
  assert.equal(response.operation, 'provider.doctor');
  assert.equal(response.data.status, 'ready');
  assert.equal(response.data.mode, 'preflight');
  const artifact = response.data.checks[2];
  assert.equal(artifact.id, 'bundled-provider-artifact');
  assert.equal(artifact.package, 'pyright');
  assert.equal(artifact.version, '1.1.413');
  assert.equal(artifact.entry, 'langserver.index.js');
  assert.equal(artifact.typescriptVersion, undefined, 'pyright has no separate compiler package to report');
  assert.doesNotMatch(result.stdout, new RegExp(process.cwd()));
});

test('doctor smoke initializes the bundled pyright Call Hierarchy provider', { timeout: 30000 }, () => {
  const executable = path.resolve(__dirname, '..', 'index.js');
  const result = spawnSync(process.execPath, [executable, 'doctor', 'bundled-pyright', '--smoke'], {
    encoding: 'utf8',
    timeout: 25000,
  });
  assert.equal(result.status, 0, result.stderr);
  const response = JSON.parse(result.stdout);
  assert.equal(response.data.mode, 'smoke');
  assert.equal(response.data.checks.at(-1).id, 'initialize-capability-smoke');
  assert.equal(response.data.checks.at(-1).callHierarchy, true);
});

test('doctor fixture proves a real pyright Call Hierarchy round trip', { timeout: 30000 }, () => {
  const executable = path.resolve(__dirname, '..', 'index.js');
  const result = spawnSync(process.execPath, [executable, 'doctor', 'bundled-pyright', '--fixture'], {
    encoding: 'utf8',
    timeout: 25000,
  });
  assert.equal(result.status, 0, result.stderr);
  const response = JSON.parse(result.stdout);
  assert.equal(response.data.mode, 'fixture');
  const fixtureCheck = response.data.checks.at(-1);
  assert.equal(fixtureCheck.id, 'fixture-call-hierarchy');
  assert.equal(fixtureCheck.status, 'pass');
  assert.deepEqual(fixtureCheck.observedCallers, ['fixture_caller']);
});

// The guard `providers.test.ts:734`'s cross-check ("every preset's declared extensions are actually
// reachable through languageId()") cannot provide on its own: it proves `.py` -> `bundled-pyright` is
// declared consistently, not that the whole path actually produces a correct answer for a real file.
// task-m2-python-preset.md stage 4 requires this real end-to-end proof, mirroring the gopls lane's own
// "auto-discovery through no test-only override" requirement.
test('auto-discovery reaches bundled-pyright for a real .py file with no provider field at all', { timeout: 30000 }, t => {
  const workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'impact-lens-py-e2e-'));
  t.after(() => fs.rmSync(workspace, { recursive: true, force: true }));
  fs.writeFileSync(path.join(workspace, 'target.py'), 'def fixture_target(value: int) -> int:\n    return value + 1\n');
  fs.writeFileSync(
    path.join(workspace, 'caller.py'),
    'from target import fixture_target\n\n\ndef fixture_caller(value: int) -> int:\n    return fixture_target(value)\n',
  );
  const executable = path.resolve(__dirname, '..', 'index.js');
  const result = spawnSync(process.execPath, [executable, 'analyze', '--stdin'], {
    encoding: 'utf8',
    timeout: 25000,
    input: JSON.stringify({ workspace, file: 'target.py', line: 1, column: 5 }),
  });
  assert.equal(result.status, 0, result.stderr);
  const response = JSON.parse(result.stdout);
  assert.equal(response.ok, true);
  assert.equal(response.data.provider.selectedBy, 'bundled');
  assert.equal(response.data.provider.detectedLanguageId, 'python');
  assert.equal(response.data.completion.requestStatus, 'succeeded');
  const callerNames = (response.data.nodes as Array<{ name: string }>).map(node => node.name);
  assert.ok(callerNames.includes('fixture_caller'), JSON.stringify(callerNames));
});

test('doctor rejects a non-positive smoke timeout', () => {
  const executable = path.resolve(__dirname, '..', 'index.js');
  const result = spawnSync(process.execPath, [executable, 'doctor', 'bundled-typescript', '--timeout-ms', '0'], {
    encoding: 'utf8',
  });
  assert.equal(result.status, 2);
  assert.equal(JSON.parse(result.stderr).error.code, 'invalid_request');
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

// Python moved from "no bundled preset" to `bundled-pyright` in M2 (task-m2-python-preset.md), so this
// guard now needs a language the catalog genuinely does not cover. `.c` -> `c` is that language today
// (clangd is a future lane, not yet a preset) - the point being tested is unchanged: an unclaimed
// language must fail with `provider_required_for_language`, never silently fall back to bundled-typescript.
test('does not launch the bundled TypeScript provider for an unclaimed language', () => {
  const executable = path.resolve(__dirname, '..', 'index.js');
  const result = spawnSync(process.execPath, [executable, 'analyze', '--stdin'], {
    encoding: 'utf8',
    input: JSON.stringify({
      workspace: path.resolve(__dirname, '..', '..'),
      file: 'not-created.c',
      line: 1,
      column: 1,
    }),
  });
  assert.equal(result.status, 5);
  const error = JSON.parse(result.stderr).error;
  assert.equal(error.code, 'provider_required_for_language');
  assert.equal(error.retryable, false);
  assert.equal(error.details.stage, 'discovery');
  assert.equal(error.details.detectedLanguageId, 'c');
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

test('preserves lifecycle and runtime provenance when the provider exits silently', () => {
  const executable = path.resolve(__dirname, '..', 'index.js');
  const server = path.resolve(__dirname, 'fixtures', 'silentExitServer.js');
  const result = spawnSync(process.execPath, [executable, 'analyze', '--stdin'], {
    encoding: 'utf8',
    env: { ...process.env, IMPACT_LENS_RUNNER_SOURCE: 'release-fallback' },
    input: JSON.stringify({
      workspace: path.resolve(__dirname, '..', '..'),
      file: 'src/testFile.ts',
      line: 4,
      column: 17,
      provider: { command: process.execPath, args: [server], languageId: 'typescript' },
    }),
  });
  assert.equal(result.status, 5);
  const response = JSON.parse(result.stderr);
  assert.equal(response.error.code, 'provider_initialize_failed');
  assert.equal(response.error.details.stage, 'initialize');
  assert.equal(response.error.details.exitCode, 1);
  assert.equal(response.error.details.stderr, undefined);
  assert.equal(response.runtime.runner.source, 'release-fallback');
  assert.match(response.error.message, /during initialize \(exit code 1\)/);
  // A silent exit still has to say whether the server ever spoke the protocol and how long it lived.
  assert.equal(response.error.details.bytesFromServer, 0);
  assert.equal(response.error.details.requestsSent, 1);
  assert.equal(typeof response.error.details.msSinceSpawn, 'number');
});

test('does not hand the provider a parent processId to police', () => {
  const executable = path.resolve(__dirname, '..', 'index.js');
  const server = path.resolve(__dirname, 'fixtures', 'parentWatchdogServer.js');
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
  // The fixture exits 1 without stderr whenever it receives a numeric processId, which is exactly how
  // a sandboxed Language Server dies today. Reaching the missing-target error proves initialize and
  // the Call Hierarchy capability handshake completed instead.
  assert.equal(result.status, 3, result.stderr);
  assert.equal(JSON.parse(result.stderr).error.code, 'target_not_found');
});

test('keeps the provider log when a Language Server never writes to stderr', () => {
  const executable = path.resolve(__dirname, '..', 'index.js');
  const server = path.resolve(__dirname, 'fixtures', 'loggingExitServer.js');
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
  const details = JSON.parse(result.stderr).error.details;
  assert.equal(details.stage, 'initialize');
  assert.equal(details.stderr, undefined);
  assert.match(details.providerLog, /info: Using Typescript version/);
  assert.match(details.providerLog, /error: tsserver exited unexpectedly/);
  assert.match(details.providerLog, /token=\[REDACTED\]/);
  assert.doesNotMatch(details.providerLog, /super-secret/);
  assert.doesNotMatch(details.providerLog, new RegExp(process.env.HOME ?? '/definitely-not-home'));
  assert.ok(details.bytesFromServer > 0);
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

// M1 exit gate: "custom provider 요청과 기존 provider JSON은 하위 호환으로 동작한다"
// (docs/development-management/milestones/m1-provider-platform-ux.md). Every request above already
// proves the pre-M1 `provider: {command, args, languageId}` shape (no `providerPreset`, no
// `initializationOptions`, no `settings`) still reaches the CLI's real error paths unchanged. What none
// of them prove is that the same shape still reaches a *successful* analysis - a request this old could
// only ever fail here, which is not what "backward compatible" means for a working integration. This is
// that missing success case.
test('an old-style request with only provider command/args/languageId - no preset, no overrides - still completes a successful analysis', () => {
  const executable = path.resolve(__dirname, '..', 'index.js');
  const server = path.resolve(__dirname, 'fixtures', 'dynamicCallHierarchyServer.js');
  const targetUri = pathToFileURL(path.resolve(__dirname, '..', '..', 'src', 'testFile.ts')).toString();
  const result = spawnSync(process.execPath, [executable, 'analyze', '--stdin'], {
    encoding: 'utf8',
    env: { ...process.env, IMPACT_LENS_MOCK_TARGET_URI: targetUri },
    input: JSON.stringify({
      workspace: path.resolve(__dirname, '..', '..'),
      file: 'src/testFile.ts',
      line: 4,
      column: 17,
      // Deliberately the pre-M1 shape: no providerPreset, no initializationOptions, no settings.
      provider: { command: process.execPath, args: [server], languageId: 'typescript' },
    }),
  });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout.trimEnd().split('\n').length, 1);
  const response = JSON.parse(result.stdout);
  assert.equal(response.ok, true);
  assert.equal(response.data.provider.selectedBy, 'custom');
  assert.equal(response.data.provider.name, 'dynamic-call-hierarchy-server');
  assert.equal(response.data.provider.languageMatch, true);
  assert.ok(response.data.nodes.length >= 1);
});

// gopls's real `serverInfo.version` (a `-json`-flavoured self-description) measured 3,062 bytes and
// appeared twice in one response (data.provider.version and top-level capabilities.version, both
// projections of the same internal value) - 54.6% of an 11,219-byte response an agent pays tokens to
// read. This proves the bound at the one place that value is produced, not a server-specific patch.
test('an oversized serverInfo.version is bounded with a visible marker, in both response locations', () => {
  const executable = path.resolve(__dirname, '..', 'index.js');
  const server = path.resolve(__dirname, 'fixtures', 'hugeServerVersionServer.js');
  const targetUri = pathToFileURL(path.resolve(__dirname, '..', '..', 'src', 'testFile.ts')).toString();
  const result = spawnSync(process.execPath, [executable, 'analyze', '--stdin'], {
    encoding: 'utf8',
    env: { ...process.env, IMPACT_LENS_MOCK_TARGET_URI: targetUri },
    input: JSON.stringify({
      workspace: path.resolve(__dirname, '..', '..'),
      file: 'src/testFile.ts',
      line: 4,
      column: 17,
      provider: { command: process.execPath, args: [server], languageId: 'typescript' },
    }),
  });
  assert.equal(result.status, 0, result.stderr);
  const response = JSON.parse(result.stdout);
  assert.equal(response.ok, true);

  const providerVersion = response.data.provider.version as string;
  const capabilitiesVersion = response.capabilities.version as string;
  // Both response locations read the same bounded value - proves the fix lives at the one ingestion
  // point (lspProvider.ts) rather than needing a separate patch per projection.
  assert.equal(providerVersion, capabilitiesVersion);
  assert.ok(Buffer.byteLength(providerVersion, 'utf8') <= 256, `expected <=256 bytes, got ${Buffer.byteLength(providerVersion, 'utf8')}`);
  assert.ok(providerVersion.startsWith('v1.0.0-xxx'), 'expected the real prefix to survive truncation');
  assert.ok(providerVersion.endsWith('…[truncated]'), 'expected a visible marker, not a silently cut value');
});

// Same fixture, a multi-byte repeated character instead of ASCII - reproduces the byte-boundary-lands-
// mid-character case truncate()'s fix guards. Without that fix this could come out over the 256-byte
// schema maxLength once the truncation marker is appended (confirmed by reverting it locally: the naive
// cut alone overshot by 1-2 bytes at several boundaries, which was enough to push the total over 256).
test('an oversized non-ASCII serverInfo.version stays within the schema byte limit through the real CLI', () => {
  const executable = path.resolve(__dirname, '..', 'index.js');
  const server = path.resolve(__dirname, 'fixtures', 'hugeServerVersionServer.js');
  const targetUri = pathToFileURL(path.resolve(__dirname, '..', '..', 'src', 'testFile.ts')).toString();
  const result = spawnSync(process.execPath, [executable, 'analyze', '--stdin'], {
    encoding: 'utf8',
    env: { ...process.env, IMPACT_LENS_MOCK_TARGET_URI: targetUri, IMPACT_LENS_MOCK_HUGE_VERSION_CHAR: '가' },
    input: JSON.stringify({
      workspace: path.resolve(__dirname, '..', '..'),
      file: 'src/testFile.ts',
      line: 4,
      column: 17,
      provider: { command: process.execPath, args: [server], languageId: 'typescript' },
    }),
  });
  assert.equal(result.status, 0, result.stderr);
  const response = JSON.parse(result.stdout);
  assert.equal(response.ok, true);

  const providerVersion = response.data.provider.version as string;
  assert.equal(providerVersion, response.capabilities.version);
  assert.ok(
    Buffer.byteLength(providerVersion, 'utf8') <= 256,
    `expected <=256 bytes (the declared schema maxLength), got ${Buffer.byteLength(providerVersion, 'utf8')}: ${JSON.stringify(providerVersion)}`,
  );
  assert.ok(providerVersion.endsWith('…[truncated]'), 'expected a visible marker, not a silently cut value');
});

// docs/work/task-m2-python-preset.md stage 3: `lspProvider.ts`'s `incoming()` folds a raw JSON-RPC
// `null` into the same `[]` a real "zero callers" answer would return. This drives the actual `?? []`
// line through a real subprocess round trip, not a mock at the `CallHierarchyProvider` interface level
// that would bypass it - the risk this stage's own plan flagged as easiest to get a vacuous pass on.
test('a provider answering null (not []) for incoming calls gets an explicit, unpromoted limitation', () => {
  const executable = path.resolve(__dirname, '..', 'index.js');
  const server = path.resolve(__dirname, 'fixtures', 'nullIncomingCallsServer.js');
  const targetUri = pathToFileURL(path.resolve(__dirname, '..', '..', 'src', 'testFile.ts')).toString();
  const result = spawnSync(process.execPath, [executable, 'analyze', '--stdin'], {
    encoding: 'utf8',
    env: { ...process.env, IMPACT_LENS_MOCK_TARGET_URI: targetUri },
    input: JSON.stringify({
      workspace: path.resolve(__dirname, '..', '..'),
      file: 'src/testFile.ts',
      line: 4,
      column: 17,
      provider: { command: process.execPath, args: [server], languageId: 'typescript' },
    }),
  });
  assert.equal(result.status, 0, result.stderr);
  const response = JSON.parse(result.stdout);
  assert.equal(response.ok, true);
  assert.equal(response.data.nodes.length, 1, 'only the root - the null collapsed to no expanded callers');

  const codes = (response.data.limitationDetails as Array<{ code: string }>).map(detail => detail.code);
  assert.ok(codes.includes('provider_null_incoming_calls'), JSON.stringify(codes));
  // Withheld from the v1 array by design (docs/work/task-m1-completeness-emit.md decision D6's
  // mechanism, reused here) - an old consumer of `limitations`/`coverage.reasons` sees no new value.
  assert.ok(!(response.data.limitations as string[]).includes('provider_null_incoming_calls'));
  assert.ok(!(response.data.coverage.reasons as string[]).includes('provider_null_incoming_calls'));
});

// The negative control for the test above: `dynamicCallHierarchyServer.ts` is the same shape but answers
// an explicit `[]`. Without this, the previous test could pass vacuously for any 0-caller result.
test('a provider answering an explicit [] for incoming calls never gets the null-specific limitation', () => {
  const executable = path.resolve(__dirname, '..', 'index.js');
  const server = path.resolve(__dirname, 'fixtures', 'dynamicCallHierarchyServer.js');
  const targetUri = pathToFileURL(path.resolve(__dirname, '..', '..', 'src', 'testFile.ts')).toString();
  const result = spawnSync(process.execPath, [executable, 'analyze', '--stdin'], {
    encoding: 'utf8',
    env: { ...process.env, IMPACT_LENS_MOCK_TARGET_URI: targetUri },
    input: JSON.stringify({
      workspace: path.resolve(__dirname, '..', '..'),
      file: 'src/testFile.ts',
      line: 4,
      column: 17,
      provider: { command: process.execPath, args: [server], languageId: 'typescript' },
    }),
  });
  assert.equal(result.status, 0, result.stderr);
  const response = JSON.parse(result.stdout);
  assert.equal(response.ok, true);
  assert.equal(response.data.nodes.length, 1);

  const codes = (response.data.limitationDetails as Array<{ code: string }>).map(detail => detail.code);
  assert.ok(!codes.includes('provider_null_incoming_calls'), JSON.stringify(codes));
});
