import assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import test, { type TestContext } from 'node:test';
import { pathToFileURL } from 'node:url';
import { analyzeImpact } from '../impact';
import { LspCallHierarchyProvider } from '../lspProvider';
import { ProviderPreset, ProviderReadinessProfile } from '../providers/preset';
import { fieldsClassified } from './stateReachabilityClassification';

// Answers a question `completion.test.ts` and `coverage.test.ts` cannot: not "does the projection report the
// right thing for an observation", but "can the product ever produce that observation in the first place".
// Those files hand `AnalysisObservations` straight into `analyzeImpact`/`projectCompletion`; this file never
// does. Every row below comes from calling `analyzeImpact(request, provider)` with NO observations argument,
// against a real `LspCallHierarchyProvider` (bundled TypeScript, or a mock Language Server reached through an
// injected catalog preset exactly like readiness.integration.test.ts). Whatever
// `provider.analysisObservations?.()` reports on its own is what a real run reports; nothing here constructs
// or imports the values that go into it.

// ---------------------------------------------------------------------------
// Row identity (design decision, recorded per the work document's R2)
//
// A row is the completion 4-tuple (requestStatus, traversalStatus, semanticScope, indexingStatus) and
// NOTHING else — not limitationDetails codes, not caller count. `cli/src/types.ts` documents `completion`
// as "the single source of result state"; limitationDetails/reasons are derived annotations
// `limitationDetailsFor` computes FROM a completion plus incidental traversal facts, not a second axis of
// state. None of the schema's own state-shape rules (X1, X5, X6, X8, X9) are expressed in terms of which
// limitation codes are present.
//
// This collapses more of the S1-S13 truth table than the work document's own S7/S8 example suggested:
//   - S1 (callers found) and S3 (no callers, index unknown) share (succeeded, exhausted, provider-static,
//     unknown) - they differ only by whether `no_incoming_callers`/`index_state_unknown` fire, which is
//     driven by caller count, not by completion state.
//   - S5 (node limit) and S6 (both limits) share (partial, node-limited, provider-static, unknown) - they
//     differ only in whether `depth_limit_reached` also appears in limitationDetails.
//   - S7 (working, callers found so far) and S8 (working, no callers) share (partial, unknown,
//     provider-static, working), exactly as the work document flagged.
// All three collapses were confirmed against docs/work/task-m1-state-truth-table.md's own S1-S13 table
// before writing the declared lists below - the tuple columns for each pair are byte-identical there too.
// ---------------------------------------------------------------------------

interface CompletionTuple {
  readonly requestStatus: string;
  readonly traversalStatus: string;
  readonly semanticScope: string;
  readonly indexingStatus: string;
}

function tupleKey(tuple: CompletionTuple): string {
  return `${tuple.requestStatus}/${tuple.traversalStatus}/${tuple.semanticScope}/${tuple.indexingStatus}`;
}

function tupleOf(data: Record<string, unknown>): CompletionTuple {
  return data.completion as unknown as CompletionTuple;
}

/**
 * What a request to the shipped catalog alone can produce today: `indexingStatus` is always `unknown`,
 * because no preset in the shipped catalog declares a `readiness` profile (confirmed against
 * `cli/src/providers/catalog.ts`, and re-checked by stateReachability.sources.test.ts's field-producer
 * check). This is the direct answer to "what do I see today, with no provider configuration of my own".
 */
const SHIPPED_CATALOG_REACHABLE: readonly CompletionTuple[] = [
  { requestStatus: 'succeeded', traversalStatus: 'exhausted', semanticScope: 'provider-static', indexingStatus: 'unknown' },
  { requestStatus: 'partial', traversalStatus: 'depth-limited', semanticScope: 'provider-static', indexingStatus: 'unknown' },
  { requestStatus: 'partial', traversalStatus: 'node-limited', semanticScope: 'provider-static', indexingStatus: 'unknown' },
];

/**
 * The additional states reachable when a catalog preset declares a `readiness` profile, ON TOP OF
 * everything in `SHIPPED_CATALOG_REACHABLE` (a depth/node limit is provider-agnostic traversal behavior,
 * already proven reachable above; it does not need re-deriving against a readiness-declaring preset).
 *
 * Naming this after "user configuration" would overstate what is actually reachable, which is exactly the
 * mistake an earlier version of this file made (W3-A, PR #49) and the work document now records as
 * corrected. `readiness` is a field on `ProviderPreset` alone (`cli/src/providers/preset.ts:105-110`), and
 * nothing outside this test file can attach one to a request:
 *   - the request schema carries no `readiness` field (`cli/schemas/request.schema.json` has no match for
 *     the word at all);
 *   - `.impact-lens/provider.json`'s `ALLOWED_FIELDS` does not include it
 *     (`cli/src/providers/projectConfig.ts:17`);
 *   - the real CLI entry point never passes a custom `resolution.catalog` when it constructs a provider
 *     (`cli/src/index.ts:53-67` passes only `providerPreset` and initialization/settings overrides), so
 *     `PROVIDER_CATALOG` - the shipped one, with no readiness-declaring entry - is the only catalog a real
 *     invocation ever resolves against.
 * The two rows below are reachable ONLY through the `resolution.catalog` constructor option used a few
 * lines down in this file and in `readiness.integration.test.ts` - a test-only TypeScript API with no
 * counterpart in the CLI's stdin JSON, CLI arguments, or project config surface. No real user, however
 * they configure their provider, can reach either row today.
 */
const CATALOG_DECLARED_READINESS_REACHABLE: readonly CompletionTuple[] = [
  { requestStatus: 'succeeded', traversalStatus: 'exhausted', semanticScope: 'provider-static', indexingStatus: 'ready' },
  { requestStatus: 'partial', traversalStatus: 'unknown', semanticScope: 'provider-static', indexingStatus: 'working' },
];

// ---------------------------------------------------------------------------
// Bundled TypeScript: one real typescript-language-server session, five real analyses against it.
//
// One shared workspace and one shared provider session produce all five shipped-catalog scenarios, so this
// file spawns the real Language Server exactly once for all of them (`open()` in lspProvider.ts is
// idempotent per uri, so repeated `prepare()` calls against the same session are safe). The call graph is
// shaped so each scenario's outcome is deterministic regardless of the order the server returns incoming
// calls in:
//   - `root` has exactly two direct callers (`a`, `b`), so a maxNodes budget of 2 always admits exactly one
//     of them, whichever the server names first.
//   - both `a` and `b` have their own single caller (`a2`, `b2`), so whichever of {a, b} wins the node
//     budget still has an unexplored caller of its own beyond a depth-1 limit.
// That is what makes the depth-limit, node-limit and both-limits scenarios below reachable without pinning
// the server's traversal order.
// ---------------------------------------------------------------------------

async function bundledTypeScriptWorkspace(t: TestContext): Promise<string> {
  const workspace = await fs.mkdtemp(path.join(os.tmpdir(), 'impact-lens-reachability-'));
  t.after(() => fs.rm(workspace, { recursive: true, force: true }));
  await fs.writeFile(path.join(workspace, 'tsconfig.json'), JSON.stringify({
    compilerOptions: { target: 'ES2022', module: 'commonjs', strict: true },
    include: ['*.ts'],
  }));
  await fs.writeFile(path.join(workspace, 'root.ts'), 'export function root(): void {}\nexport function lonely(): void {}\n');
  await fs.writeFile(path.join(workspace, 'a.ts'), "import { root } from './root';\nexport function a(): void { root(); }\n");
  await fs.writeFile(path.join(workspace, 'b.ts'), "import { root } from './root';\nexport function b(): void { root(); }\n");
  await fs.writeFile(path.join(workspace, 'a2.ts'), "import { a } from './a';\nexport function a2(): void { a(); }\n");
  await fs.writeFile(path.join(workspace, 'b2.ts'), "import { b } from './b';\nexport function b2(): void { b(); }\n");
  return workspace;
}

interface ObservedRow {
  readonly scenario: string;
  readonly tuple: CompletionTuple;
}

interface BundledTypeScriptResult {
  readonly rows: readonly ObservedRow[];
  readonly provider: LspCallHierarchyProvider;
}

async function bundledTypeScriptRows(t: TestContext): Promise<BundledTypeScriptResult> {
  const workspace = await bundledTypeScriptWorkspace(t);
  // No provider command: this is the same "resolve the shipped catalog default" path a real request with
  // no `provider`/`providerPreset` takes, which is what makes this the bundled-TypeScript scenario rather
  // than a mock one.
  const provider = new LspCallHierarchyProvider(workspace, 'root.ts', undefined, 20000);
  t.after(() => provider.dispose());

  const root = { line: 1, column: 17 }; // "export function " is 16 chars; column 17 is where `root` starts.
  const lonely = { line: 2, column: 17 };

  const callersFound = await analyzeImpact({ workspace, file: 'root.ts', line: root.line, column: root.column, depth: 5, maxNodes: 50 }, provider);
  assert.equal((callersFound.completion as CompletionTuple).requestStatus, 'succeeded', 'callers-found scenario must reach the natural end, not a limit');
  assert.ok((callersFound.nodes as unknown[]).length > 1, 'callers-found scenario must actually find callers');

  const noCallers = await analyzeImpact({ workspace, file: 'root.ts', line: lonely.line, column: lonely.column, depth: 5, maxNodes: 50 }, provider);
  assert.equal((noCallers.nodes as unknown[]).length, 1, 'no-callers scenario must find only the root');

  const depthLimit = await analyzeImpact({ workspace, file: 'root.ts', line: root.line, column: root.column, depth: 1, maxNodes: 50 }, provider);
  assert.deepEqual(depthLimit.traversalLimits, ['depth'], 'depth-limit scenario must hit only the depth limit');

  const nodeLimit = await analyzeImpact({ workspace, file: 'root.ts', line: root.line, column: root.column, depth: 5, maxNodes: 2 }, provider);
  assert.deepEqual(nodeLimit.traversalLimits, ['nodes'], 'node-limit scenario must hit only the node limit');

  const bothLimits = await analyzeImpact({ workspace, file: 'root.ts', line: root.line, column: root.column, depth: 1, maxNodes: 2 }, provider);
  assert.deepEqual(bothLimits.traversalLimits, ['depth', 'nodes'], 'both-limits scenario must hit both limits');

  return {
    rows: [
      { scenario: 'bundled-typescript: callers found', tuple: tupleOf(callersFound) },
      { scenario: 'bundled-typescript: no callers', tuple: tupleOf(noCallers) },
      { scenario: 'bundled-typescript: depth limit', tuple: tupleOf(depthLimit) },
      { scenario: 'bundled-typescript: node limit', tuple: tupleOf(nodeLimit) },
      { scenario: 'bundled-typescript: both limits', tuple: tupleOf(bothLimits) },
    ],
    provider,
  };
}

// ---------------------------------------------------------------------------
// Mock servers with a declared readiness profile, reached through the test-only `resolution.catalog`
// constructor option - not a path a real user can reach (see the comment on
// CATALOG_DECLARED_READINESS_REACHABLE above).
//
// Reuses the exact `mockPreset`/`resolution: { catalog: [...] }` pattern and the `readinessServer.ts`
// fixture from readiness.integration.test.ts - both already produce `ready` and `working` deterministically,
// so no new fixture is needed here.
// ---------------------------------------------------------------------------

function fixtureServer(name: string): string {
  return path.resolve(__dirname, 'fixtures', `${name}.js`);
}

function mockPreset(fixture: string, readiness: ProviderReadinessProfile): ProviderPreset {
  return {
    id: 'fixture-reachability',
    displayName: 'Fixture Reachability Server',
    tier: 'verified-external',
    languageIds: ['typescript'],
    extensions: ['.ts'],
    command: { candidates: [process.execPath], args: [fixtureServer(fixture)], languageIdFrom: 'detected' },
    docs: { install: 'https://example.invalid/install-fixture-server' },
    lastVerified: { date: '2026-01-01', versions: ['1.0.0'] },
    readiness,
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

async function mockScratch(t: TestContext, prefix: string): Promise<string> {
  const workspace = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), prefix)));
  t.after(() => fs.rm(workspace, { recursive: true, force: true }));
  await fs.writeFile(path.join(workspace, 'target.ts'), 'export function target(): void {}\n');
  return workspace;
}

async function catalogDeclaredReadinessRows(t: TestContext): Promise<readonly ObservedRow[]> {
  const readyWorkspace = await mockScratch(t, 'impact-lens-reachability-ready-');
  withEnv(t, {
    IMPACT_LENS_MOCK_TARGET_URI: pathToFileURL(path.join(readyWorkspace, 'target.ts')).toString(),
    IMPACT_LENS_MOCK_READY_MODE: 'progress',
    IMPACT_LENS_MOCK_READY_DELAY_MS: '30',
  });
  const readyProvider = new LspCallHierarchyProvider(readyWorkspace, 'target.ts', undefined, 8000, {
    resolution: { catalog: [mockPreset('readinessServer', {
      signals: [{ kind: 'work-done-progress', means: 'ready', titlePattern: 'Indexing' }],
      budgetMs: 6000,
      onBudgetExceeded: 'fail',
    })] },
  });
  t.after(() => readyProvider.dispose());
  const ready = await analyzeImpact({ workspace: readyWorkspace, file: 'target.ts', line: 1, column: 17 }, readyProvider);
  assert.equal((ready.completion as CompletionTuple).indexingStatus, 'ready');

  const workingWorkspace = await mockScratch(t, 'impact-lens-reachability-working-');
  withEnv(t, {
    IMPACT_LENS_MOCK_TARGET_URI: pathToFileURL(path.join(workingWorkspace, 'target.ts')).toString(),
    IMPACT_LENS_MOCK_READY_MODE: 'working',
  });
  const workingProvider = new LspCallHierarchyProvider(workingWorkspace, 'target.ts', undefined, 8000, {
    resolution: { catalog: [mockPreset('readinessServer', {
      signals: [{ kind: 'work-done-progress', means: 'ready', titlePattern: 'Indexing' }],
      budgetMs: 60,
      onBudgetExceeded: 'proceed-partial',
    })] },
  });
  t.after(() => workingProvider.dispose());
  const working = await analyzeImpact({ workspace: workingWorkspace, file: 'target.ts', line: 1, column: 17 }, workingProvider);
  assert.equal((working.completion as CompletionTuple).indexingStatus, 'working');

  return [
    { scenario: 'catalog-declared-readiness (test-only): ready', tuple: tupleOf(ready) },
    { scenario: 'catalog-declared-readiness (test-only): working (proceed-partial)', tuple: tupleOf(working) },
  ];
}

// ---------------------------------------------------------------------------
// The two-way assertions. Each direction is a separate assert so a failure names which direction broke:
// a tuple that occurred but was not declared (the declared list is stale and under-counts reality), or a
// tuple that was declared but never occurred (the declared list over-claims what the product can do).
// ---------------------------------------------------------------------------

function assertReachableSetMatches(label: string, observed: readonly ObservedRow[], declared: readonly CompletionTuple[]): void {
  const observedKeys = new Set(observed.map(row => tupleKey(row.tuple)));
  const declaredKeys = new Set(declared.map(tupleKey));

  const undeclared = [...observedKeys].filter(key => !declaredKeys.has(key));
  assert.deepEqual(undeclared, [], `${label}: these tuples occurred but are not in the declared reachable list: ${undeclared.join(', ')}`);

  const unobserved = [...declaredKeys].filter(key => !observedKeys.has(key));
  assert.deepEqual(unobserved, [], `${label}: these tuples are declared reachable but no scenario produced them: ${unobserved.join(', ')}`);
}

test('the shipped catalog produces exactly its declared reachable completion states', { timeout: 60000 }, async t => {
  const { rows, provider } = await bundledTypeScriptRows(t);
  assertReachableSetMatches('shipped catalog', rows, SHIPPED_CATALOG_REACHABLE);

  // Runtime closure of the text scan's blind spot in stateReachability.sources.test.ts: that scan looks
  // for a colon-key producer (`interruption: ...`) and cannot see a shorthand one
  // (`return { indexing, interruption };`). This checks the actual return value of the real method instead
  // of its source text, so the producer's syntax does not matter. Reuses the session already spun up above
  // rather than starting a second Language Server just for this assertion.
  assert.equal(typeof provider.analysisObservations, 'function', 'expected analysisObservations() to exist on the provider (not renamed or removed)');
  const observations = provider.analysisObservations!();
  assert.equal(typeof observations, 'object', 'expected analysisObservations() to return an object');
  assert.ok(observations !== null, 'expected analysisObservations() to return a non-null object');
  const actualKeys = Object.keys(observations).sort();
  const expectedKeys = fieldsClassified('has-producer');
  assert.deepEqual(
    actualKeys,
    expectedKeys,
    `provider.analysisObservations() returned ${JSON.stringify(actualKeys)}, but ` +
    `stateReachabilityClassification.ts classifies only ${JSON.stringify(expectedKeys)} as has-producer. ` +
    'If a field was legitimately added here, update CLASSIFIED_OBSERVATION_FIELDS and, if it unlocks a ' +
    'new completion state, add that state to the reachable lists above.',
  );
});

test('a catalog preset that declares readiness produces exactly its declared additional states (test-only path, not reachable by a real user)', { timeout: 30000 }, async t => {
  const rows = await catalogDeclaredReadinessRows(t);
  assertReachableSetMatches('catalog-declared-readiness (additional)', rows, CATALOG_DECLARED_READINESS_REACHABLE);
});

// A cross-check that the two declared sets do not overlap - if they did, "additional" would not mean
// additional, and R3's separation would stop answering "what do I see today" cleanly.
test('the shipped and catalog-declared-readiness-additional reachable sets do not overlap', () => {
  const shippedKeys = new Set(SHIPPED_CATALOG_REACHABLE.map(tupleKey));
  const overlap = CATALOG_DECLARED_READINESS_REACHABLE.map(tupleKey).filter(key => shippedKeys.has(key));
  assert.deepEqual(overlap, []);
});
