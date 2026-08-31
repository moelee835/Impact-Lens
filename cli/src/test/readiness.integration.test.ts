import assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import * as fsSync from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import test, { type TestContext } from 'node:test';
import { pathToFileURL } from 'node:url';
import { analyzeImpact } from '../impact';
import { LspCallHierarchyProvider } from '../lspProvider';
import { ProviderPreset, ProviderReadinessProfile } from '../providers/preset';
import { CliError } from '../types';
import { JsonSchema, validate } from './jsonSchema';

const SCHEMA_PATH = path.resolve(__dirname, '..', '..', 'schemas', 'response.schema.json');

/**
 * Checks a produced `coverage` against the published schema, not against a copy of it.
 *
 * The subtree rather than the envelope, because these sessions run in-process and never build one. It
 * is the subtree the readiness work actually changes, and it carries the rule that matters here: X3
 * makes `status: ready` invalid without `evidence`, so a readiness claim with nothing behind it fails
 * the contract rather than reaching a caller.
 */
function assertCoverageMatchesSchema(value: unknown): void {
  const root = JSON.parse(fsSync.readFileSync(SCHEMA_PATH, 'utf8')) as JsonSchema;
  const coverageSchema = (root as unknown as { $defs: Record<string, JsonSchema> }).$defs.coverage;
  assert.deepEqual(validate(coverageSchema, value, root), []);
}

function fixtureServer(name: string): string {
  return path.resolve(__dirname, 'fixtures', `${name}.js`);
}

/**
 * A catalog entry for a mock server. It never enters `providers/catalog.ts`: an entry there is a claim
 * that a real server was verified against a pinned version, and readiness measurement verifies none.
 */
function mockPreset(fixture: string, readiness?: ProviderReadinessProfile): ProviderPreset {
  return {
    id: 'fixture-readiness',
    displayName: 'Fixture Readiness Server',
    tier: 'verified-external',
    languageIds: ['typescript'],
    extensions: ['.ts'],
    command: { candidates: [process.execPath], args: [fixtureServer(fixture)], languageIdFrom: 'detected' },
    docs: { install: 'https://example.invalid/install-fixture-server' },
    lastVerified: { date: '2026-01-01', versions: ['1.0.0'] },
    ...(readiness === undefined ? {} : { readiness }),
  };
}

function withEnv(t: TestContext, values: Record<string, string>): void {
  for (const [key, value] of Object.entries(values)) {
    const previous = process.env[key];
    process.env[key] = value;
    t.after(() => {
      if (previous === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = previous;
      }
    });
  }
}

async function scratch(t: TestContext, prefix: string): Promise<string> {
  const workspace = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), prefix)));
  t.after(() => fs.rm(workspace, { recursive: true, force: true }));
  await fs.writeFile(path.join(workspace, 'target.ts'), 'export function target(): void {}\n');
  return workspace;
}

interface Session {
  readonly workspace: string;
  readonly provider: LspCallHierarchyProvider;
}

async function session(
  t: TestContext,
  prefix: string,
  fixture: string,
  readiness: ProviderReadinessProfile | undefined,
  env: Record<string, string> = {},
): Promise<Session> {
  const workspace = await scratch(t, prefix);
  withEnv(t, { IMPACT_LENS_MOCK_TARGET_URI: pathToFileURL(path.join(workspace, 'target.ts')).toString(), ...env });
  const provider = new LspCallHierarchyProvider(workspace, 'target.ts', undefined, 8000, {
    resolution: { catalog: [mockPreset(fixture, readiness)] },
  });
  t.after(() => provider.dispose());
  return { workspace, provider };
}

function analyze(workspace: string, provider: LspCallHierarchyProvider): Promise<Record<string, unknown>> {
  return analyzeImpact({ workspace, file: 'target.ts', line: 1, column: 17 }, provider);
}

function coverage(data: Record<string, unknown>): Record<string, unknown> {
  return data.coverage as Record<string, unknown>;
}

async function rejection(run: () => Promise<unknown>): Promise<CliError> {
  try {
    await run();
  } catch (error) {
    assert.ok(error instanceof CliError, `expected a CliError, got ${String(error)}`);
    return error;
  }
  throw new assert.AssertionError({ message: 'expected the analysis to fail' });
}

// ---------------------------------------------------------------------------
// A provider that declares nothing keeps the answer it had
// ---------------------------------------------------------------------------

test('a preset without a readiness profile still reports the index state as unknown', { timeout: 30000 }, async t => {
  const { workspace, provider } = await session(t, 'impact-lens-readiness-silent-', 'readinessServer', undefined, {
    // The server runs a full progress cycle anyway. Undeclared, it must change nothing.
    IMPACT_LENS_MOCK_READY_MODE: 'progress',
  });
  const data = await analyze(workspace, provider);

  assertCoverageMatchesSchema(coverage(data));
  assert.deepEqual(coverage(data).indexing, { status: 'unknown' });
  assert.equal(data.complete, true);
  assert.deepEqual(data.completion, {
    requestStatus: 'succeeded',
    traversalStatus: 'exhausted',
    semanticScope: 'provider-static',
    indexingStatus: 'unknown',
  });
  // The pair a silent provider has always produced for an empty result, and the reason an agent cannot
  // read this response as proof that nothing calls the symbol.
  const codes = (data.limitationDetails as Array<{ code: string }>).map(entry => entry.code);
  assert.ok(codes.includes('no_incoming_callers'), codes.join(', '));
  assert.ok(codes.includes('index_state_unknown'), codes.join(', '));
});

// ---------------------------------------------------------------------------
// A declared signal, and only a declared signal, reports ready
// ---------------------------------------------------------------------------

test('a declared progress end reports ready with evidence and completes the traversal', { timeout: 30000 }, async t => {
  const { workspace, provider } = await session(t, 'impact-lens-readiness-progress-', 'readinessServer', {
    signals: [{ kind: 'work-done-progress', means: 'ready', titlePattern: 'Indexing' }],
    budgetMs: 6000,
    onBudgetExceeded: 'fail',
  }, { IMPACT_LENS_MOCK_READY_MODE: 'progress', IMPACT_LENS_MOCK_READY_DELAY_MS: '30' });
  const data = await analyze(workspace, provider);

  assertCoverageMatchesSchema(coverage(data));
  assert.deepEqual(coverage(data).indexing, {
    status: 'ready',
    evidence: { signal: 'work-done-progress', detail: 'Indexing' },
  });
  assert.equal((data.completion as { indexingStatus: string }).indexingStatus, 'ready');
  assert.equal(data.complete, true);
  // Now that the index is known to be built, an empty result is a real answer, so the caveat that says
  // "an empty result is not evidence" is correctly absent.
  const codes = (data.limitationDetails as Array<{ code: string }>).map(entry => entry.code);
  assert.ok(codes.includes('no_incoming_callers'), codes.join(', '));
  assert.ok(!codes.includes('index_state_unknown'), codes.join(', '));
  assert.ok(!codes.includes('provider_not_ready'), codes.join(', '));
});

test('a declared notification reports ready with evidence naming the method', { timeout: 30000 }, async t => {
  const { workspace, provider } = await session(t, 'impact-lens-readiness-notify-', 'readinessServer', {
    signals: [{
      kind: 'notification',
      means: 'ready',
      method: 'custom/indexStatus',
      match: { path: ['index', 'state'], equals: 'ready' },
    }],
    budgetMs: 6000,
    onBudgetExceeded: 'fail',
  }, { IMPACT_LENS_MOCK_READY_MODE: 'notification', IMPACT_LENS_MOCK_READY_DELAY_MS: '30' });
  const data = await analyze(workspace, provider);

  assert.deepEqual(coverage(data).indexing, {
    status: 'ready',
    evidence: { signal: 'notification', detail: 'custom/indexStatus' },
  });
});

test('the reported evidence is byte-identical across two runs of the same server', { timeout: 30000 }, async t => {
  const readiness: ProviderReadinessProfile = {
    signals: [{ kind: 'work-done-progress', means: 'ready', titlePattern: 'Indexing' }],
    budgetMs: 6000,
    onBudgetExceeded: 'fail',
  };
  const env = {
    IMPACT_LENS_MOCK_READY_MODE: 'progress',
    // A title carrying a clock reading and a path. Neither may reach the response.
    IMPACT_LENS_MOCK_PROGRESS_TITLE: `Indexing ${os.tmpdir()} at ${new Date().toISOString()}`,
  };
  const first = await session(t, 'impact-lens-readiness-stable-a-', 'readinessServer', readiness, env);
  const a = JSON.stringify(coverage(await analyze(first.workspace, first.provider)).indexing);
  const second = await session(t, 'impact-lens-readiness-stable-b-', 'readinessServer', readiness, env);
  const b = JSON.stringify(coverage(await analyze(second.workspace, second.provider)).indexing);

  assert.equal(a, b);
  assert.equal(a, '{"status":"ready","evidence":{"signal":"work-done-progress","detail":"Indexing"}}');
});

// ---------------------------------------------------------------------------
// A budget that runs out is reported, never rounded up to ready
// ---------------------------------------------------------------------------

test('a proceed-partial budget overrun returns a partial result that names the index', { timeout: 30000 }, async t => {
  const { workspace, provider } = await session(t, 'impact-lens-readiness-partial-', 'readinessServer', {
    signals: [{ kind: 'work-done-progress', means: 'ready', titlePattern: 'Indexing' }],
    budgetMs: 60,
    onBudgetExceeded: 'proceed-partial',
  }, { IMPACT_LENS_MOCK_READY_MODE: 'working' });
  const data = await analyze(workspace, provider);

  assertCoverageMatchesSchema(coverage(data));
  assert.deepEqual(coverage(data).indexing, { status: 'working' });
  assert.equal(data.complete, false);
  assert.deepEqual(data.completion, {
    requestStatus: 'partial',
    traversalStatus: 'unknown',
    semanticScope: 'provider-static',
    indexingStatus: 'working',
  });
  const codes = (data.limitationDetails as Array<{ code: string }>).map(entry => entry.code);
  assert.ok(codes.includes('provider_not_ready'), codes.join(', '));
  // X11 in the contract: an incomplete traversal may not also claim there is nothing to find. Without
  // this the same empty answer would carry both "still indexing" and "no caller exists".
  assert.ok(!codes.includes('no_incoming_callers'), codes.join(', '));
  assert.ok(!codes.includes('index_state_unknown'), codes.join(', '));
  assert.ok((data.limitations as string[]).includes('provider_not_ready'));
});

test('a fail budget overrun fails at the indexing stage before any query is sent', { timeout: 30000 }, async t => {
  const { workspace, provider } = await session(t, 'impact-lens-readiness-fail-', 'readinessServer', {
    signals: [{ kind: 'work-done-progress', means: 'ready', titlePattern: 'Indexing' }],
    budgetMs: 60,
    onBudgetExceeded: 'fail',
  }, { IMPACT_LENS_MOCK_READY_MODE: 'never' });

  const error = await rejection(() => analyze(workspace, provider));
  assert.equal(error.code, 'provider_not_ready');
  assert.equal(error.exitCode, 5);
  assert.equal(error.retryable, true);
  assert.deepEqual(error.details, { stage: 'indexing', budgetMs: 60, observedWorking: false });
  // The failure is the point: an empty graph was never produced, so nothing can be mistaken for one.
  assert.equal(provider.capabilities.observed.prepareCallHierarchy, false);
});

// ---------------------------------------------------------------------------
// Project metadata is checked before the wait, and never created
// ---------------------------------------------------------------------------

test('a missing required project file fails without waiting out the budget', { timeout: 30000 }, async t => {
  const { workspace, provider } = await session(t, 'impact-lens-readiness-metadata-', 'readinessServer', {
    requiredProjectFiles: ['tsconfig.json'],
    signals: [{ kind: 'work-done-progress', means: 'ready', titlePattern: 'Indexing' }],
    // Long enough that a check running after the wait would blow this test's timeout.
    budgetMs: 60000,
    onBudgetExceeded: 'proceed-partial',
  }, { IMPACT_LENS_MOCK_READY_MODE: 'never' });

  const error = await rejection(() => analyze(workspace, provider));
  assert.equal(error.code, 'provider_project_metadata_missing');
  assert.deepEqual(error.details, { stage: 'indexing', missing: ['tsconfig.json'] });
  assert.deepEqual((await fs.readdir(workspace)).sort(), ['target.ts']);
});

test('a present required project file lets readiness proceed', { timeout: 30000 }, async t => {
  const { workspace, provider } = await session(t, 'impact-lens-readiness-metadata-ok-', 'readinessServer', {
    requiredProjectFiles: ['tsconfig.json'],
    signals: [{ kind: 'work-done-progress', means: 'ready', titlePattern: 'Indexing' }],
    budgetMs: 6000,
    onBudgetExceeded: 'fail',
  }, { IMPACT_LENS_MOCK_READY_MODE: 'progress' });
  await fs.writeFile(path.join(workspace, 'tsconfig.json'), '{}\n');

  const data = await analyze(workspace, provider);
  assert.equal((coverage(data).indexing as { status: string }).status, 'ready');
});

// ---------------------------------------------------------------------------
// Static and dynamic Call Hierarchy are one state
// ---------------------------------------------------------------------------

test('a server that registers Call Hierarchy dynamically is accepted', { timeout: 30000 }, async t => {
  const { workspace, provider } = await session(
    t,
    'impact-lens-dynamic-capability-',
    'dynamicCallHierarchyServer',
    undefined,
  );
  const data = await analyze(workspace, provider);

  assert.equal(provider.capabilities.callHierarchy, true);
  assert.equal(provider.capabilities.advertised.callHierarchy, true);
  assert.equal(provider.capabilities.observed.prepareCallHierarchy, true);
  assert.equal(data.complete, true);
});

test('a dynamic registration that arrives late still counts', { timeout: 30000 }, async t => {
  const { workspace, provider } = await session(
    t,
    'impact-lens-dynamic-late-',
    'dynamicCallHierarchyServer',
    undefined,
    { IMPACT_LENS_MOCK_REGISTER_DELAY_MS: '40' },
  );
  await analyze(workspace, provider);
  assert.equal(provider.capabilities.callHierarchy, true);
});

test('withdrawing the only registration takes the capability back down', { timeout: 30000 }, async t => {
  const { workspace, provider } = await session(
    t,
    'impact-lens-dynamic-unregister-',
    'dynamicCallHierarchyServer',
    undefined,
    { IMPACT_LENS_MOCK_UNREGISTER: '1' },
  );
  await analyze(workspace, provider);
  // No static capability stood behind the registration, so its withdrawal leaves nothing. Reporting
  // support the server has taken back would be a claim about a server that is no longer making it.
  assert.equal(provider.capabilities.callHierarchy, false);
  assert.equal(provider.capabilities.advertised.callHierarchy, false);
});

test('a server that advertises Call Hierarchy nowhere is still rejected', { timeout: 30000 }, async t => {
  const workspace = await scratch(t, 'impact-lens-dynamic-absent-');
  const provider = new LspCallHierarchyProvider(workspace, 'target.ts', undefined, 8000, {
    resolution: { catalog: [mockPreset('noCapabilityServer')] },
  });
  t.after(() => provider.dispose());

  const error = await rejection(() => analyze(workspace, provider));
  assert.equal(error.code, 'provider_capability_missing');
  assert.deepEqual(
    (error.details as { advertised: unknown }).advertised,
    { callHierarchy: false, diagnostics: 'unknown' },
  );
});
