import assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import test from 'node:test';
import { pathToFileURL } from 'node:url';
import { analyzeImpact } from '../impact';
import {
  CallHierarchyItem,
  CallHierarchyProvider,
  IncomingCall,
  ProviderCapabilities,
  ProviderDiagnostic,
} from '../types';

const range = (line: number) => ({
  start: { line, character: 0 },
  end: { line, character: 10 },
});

function item(workspace: string, file: string, name: string, line: number): CallHierarchyItem {
  return {
    name,
    kind: 12,
    uri: pathToFileURL(`${workspace}/${file}`).toString(),
    range: range(line),
    selectionRange: range(line),
  };
}

class FakeProvider implements CallHierarchyProvider {
  readonly capabilities: ProviderCapabilities = {
    host: 'lsp',
    name: 'fake-provider',
    version: '1.0.0',
    requestedLanguageId: 'typescript',
    detectedLanguageId: 'typescript',
    selectedBy: 'custom',
    languageMatch: true,
    callHierarchy: true,
    diagnostics: true,
    advertised: { callHierarchy: true, diagnostics: true },
    observed: { prepareCallHierarchy: true, incomingCalls: true, diagnostics: true },
    lifecycle: { stage: 'query', status: 'ready' },
  };

  /** How many times `incoming()` was actually called - the invariant guard test's only interest. */
  incomingCallCount = 0;

  constructor(
    private readonly root: CallHierarchyItem,
    private readonly calls: ReadonlyMap<string, readonly IncomingCall[]>,
    private readonly diagnostics: readonly ProviderDiagnostic[] = [],
  ) {}

  async prepare(): Promise<readonly CallHierarchyItem[]> {
    return [this.root];
  }

  async incoming(value: CallHierarchyItem): Promise<readonly IncomingCall[]> {
    this.incomingCallCount += 1;
    return this.calls.get(value.name) ?? [];
  }

  async collectDiagnostics(): Promise<readonly ProviderDiagnostic[]> {
    return this.diagnostics;
  }

  async dispose(): Promise<void> {}
}

async function workspaceFixture(t: { after(callback: () => Promise<void>): void }, rootFile: string): Promise<string> {
  const raw = await fs.mkdtemp(path.join(os.tmpdir(), 'impact-lens-impact-'));
  t.after(() => fs.rm(raw, { recursive: true, force: true }));
  // `analyzeImpact()` runs every path through `canonicalWorkspace()` (`fs.realpath`) before comparing
  // anything against it - on macOS, `os.tmpdir()` returns a `/var/folders/...` path whose realpath is
  // `/private/var/folders/...`, a different string. Returning the RAW path here would make every
  // `item()` URI (built from this same raw string) resolve to a file `analyzeImpact()`'s internal
  // `relativeFile()`/`isOutside()` sees as OUTSIDE the (realpath'd) workspace, silently falling back to
  // the absolute path as `relation`'s classifier input - IL-LIM-010 stage 1 completion's new pattern
  // tests (docs/work/task-m4-il-lim-010-stage1-completion.md) surfaced this because an anchored
  // `contracts/**/*.contract.ts`-style pattern, unlike `test-directory`, does not coincidentally still
  // match somewhere inside a long absolute path (see `testFileClassifier.ts`'s own comment on that
  // coincidence). Same fix, same reason, as `cli/src/test/stateReachability.integration.test.ts`'s
  // `realGoplsWorkspace()` (lines ~468-479) already established for its own scratch workspace: a raw
  // `os.tmpdir()` path there caused a real gopls session to silently drop a cross-file symbol from the
  // call hierarchy while still reporting `ready` - "not a gopls or readiness-signal defect - a test
  // bug", per that function's own comment. This repository's actual entry points never exhibit this
  // mismatch (commander verified `cli/src/index.ts:51-53` directly: production always canonicalizes
  // the workspace ONCE and hands that same canonical value to both the provider and `analyzeImpact` -
  // there is no code path where a provider or `analyzeImpact` sees two different aliases of the same
  // directory). Only a test harness that builds `CallHierarchyItem` URIs from a pre-canonicalization
  // path string, as this file's `item()` helper does, can produce the mismatch - which is exactly why
  // fixing it here, in the shared fixture helper, is the correct and sufficient fix.
  const workspace = await fs.realpath(raw);
  await fs.mkdir(path.dirname(path.join(workspace, rootFile)), { recursive: true });
  await fs.writeFile(path.join(workspace, rootFile), 'export function root(): void {}\n');
  return workspace;
}

test('returns deterministic direct, transitive, and test relationships', async t => {
  const workspace = await workspaceFixture(t, 'src/root.ts');
  const root = item(workspace, 'src/root.ts', 'root', 0);
  const direct = item(workspace, 'src/direct.ts', 'direct', 2);
  const transitive = item(workspace, 'src/transitive.ts', 'transitive', 4);
  const testCaller = item(workspace, 'tests/root.test.ts', 'root test', 6);
  const provider = new FakeProvider(root, new Map([
    ['root', [
      { from: direct, fromRanges: [range(3)] },
      { from: testCaller, fromRanges: [range(7)] },
    ]],
    ['direct', [{ from: transitive, fromRanges: [range(5)] }]],
  ]));
  const result = await analyzeImpact({
    workspace,
    file: 'src/root.ts',
    line: 1,
    column: 1,
    depth: 2,
    maxNodes: 10,
  }, provider);
  const nodes = result.nodes as Array<{
    name: string;
    relation: string;
    depth: number;
    testDistance: number | null;
    testRule: { id: string; source: string } | null;
    testRuleSuppressed: unknown;
  }>;
  assert.deepEqual(nodes.map(node => [node.name, node.relation, node.depth, node.testDistance]), [
    ['root', 'root', 0, null],
    ['direct', 'direct', 1, null],
    ['root test', 'test', 1, 1],
    ['transitive', 'transitive', 2, null],
  ]);
  // IL-LIM-010 stage 1 completion (docs/work/task-m4-il-lim-010-stage1-completion.md): every node
  // carries the classification evidence now, end to end through the real analyzeImpact() response -
  // not just at the shared classifier's own unit-test level.
  assert.deepEqual(nodes.map(node => [node.name, node.testRule, node.testRuleSuppressed]), [
    ['root', null, null],
    ['direct', null, null],
    ['root test', { id: 'test-directory', source: 'default-convention' }, null],
    ['transitive', null, null],
  ]);
  assert.equal((result.edges as unknown[]).length, 3);
  assert.equal(result.truncated, false);
  assert.deepEqual(result.limitations, ['dynamic_calls_not_inferred', 'unsaved_buffers_unavailable']);
  assert.deepEqual(result.coverage, {
    traversal: { status: 'complete', requestedDepth: 2, reachedDepth: 2, maxNodes: 10 },
    semantic: { status: 'static-only', evidenceSources: ['lsp-call-hierarchy'] },
    indexing: { status: 'unknown' },
    reasons: ['dynamic_calls_not_inferred', 'unsaved_buffers_unavailable'],
  });
});

test('a real .impact-lens/test-patterns.json drives a real analyzeImpact() call end to end: rescues one caller, suppresses another', async t => {
  // IL-LIM-010 stage 1 completion (docs/work/task-m4-il-lim-010-stage1-completion.md). Exercises the
  // REAL file (`readProjectTestPatterns()`, not a stubbed CompiledTestPatterns) through the REAL
  // `analyzeImpact()` entry point, the same end-to-end discipline the gate 7 budget-exceeded test uses
  // (`augmentationBudgetExceededEndToEnd.test.ts`) - a unit test on the classifier alone would not catch
  // a wiring mistake in `cli/src/impact.ts` itself (wrong workspace passed, patterns read but not
  // forwarded, etc).
  const workspace = await workspaceFixture(t, 'src/root.ts');
  await fs.mkdir(path.join(workspace, '.impact-lens'), { recursive: true });
  await fs.writeFile(
    path.join(workspace, '.impact-lens/test-patterns.json'),
    JSON.stringify({ include: ['contracts/**/*.contract.ts'], exclude: ['tests/legacy/**'] }),
  );

  const root = item(workspace, 'src/root.ts', 'root', 0);
  // Would NOT match any of the five default rules on its own - only the include pattern rescues it.
  const rescued = item(workspace, 'contracts/order.contract.ts', 'rescued', 2);
  // Matches the default test-directory rule, but the exclude pattern suppresses it.
  const suppressed = item(workspace, 'tests/legacy/order_test.py', 'suppressed', 4);
  const provider = new FakeProvider(root, new Map([
    ['root', [
      { from: rescued, fromRanges: [range(3)] },
      { from: suppressed, fromRanges: [range(5)] },
    ]],
  ]));
  const result = await analyzeImpact({
    workspace,
    file: 'src/root.ts',
    line: 1,
    column: 1,
    depth: 2,
    maxNodes: 10,
  }, provider);

  const nodes = result.nodes as Array<{
    name: string;
    relation: string;
    testRule: { id: string; source: string } | null;
    testRuleSuppressed: { ruleId: string | null; excludePattern: string } | null;
  }>;
  const byName = new Map(nodes.map(node => [node.name, node]));

  assert.equal(byName.get('rescued')?.relation, 'test');
  assert.deepEqual(byName.get('rescued')?.testRule, { id: 'contracts/**/*.contract.ts', source: 'user-include' });
  assert.equal(byName.get('rescued')?.testRuleSuppressed, null);

  assert.notEqual(byName.get('suppressed')?.relation, 'test');
  assert.equal(byName.get('suppressed')?.testRule, null);
  assert.deepEqual(byName.get('suppressed')?.testRuleSuppressed, {
    ruleId: 'test-directory',
    excludePattern: 'tests/legacy/**',
  });
});

test('an invalid .impact-lens/test-patterns.json fails the whole request loudly, not silently with fewer patterns', async t => {
  const workspace = await workspaceFixture(t, 'src/root.ts');
  await fs.mkdir(path.join(workspace, '.impact-lens'), { recursive: true });
  await fs.writeFile(
    path.join(workspace, '.impact-lens/test-patterns.json'),
    JSON.stringify({ include: ['a?.ts'] }),
  );
  const root = item(workspace, 'src/root.ts', 'root', 0);
  const provider = new FakeProvider(root, new Map());
  await assert.rejects(
    () => analyzeImpact({ workspace, file: 'src/root.ts', line: 1, column: 1, depth: 2, maxNodes: 10 }, provider),
    (error: unknown) => {
      assert.ok(error instanceof Error);
      assert.equal((error as { code?: string }).code, 'test_pattern_config_invalid');
      return true;
    },
  );
});

test('reports depth truncation and retains cycle edges', async t => {
  const workspace = await workspaceFixture(t, 'root.ts');
  const root = item(workspace, 'root.ts', 'root', 0);
  const direct = item(workspace, 'direct.ts', 'direct', 0);
  const hidden = item(workspace, 'hidden.ts', 'hidden', 0);
  const provider = new FakeProvider(root, new Map([
    ['root', [{ from: direct, fromRanges: [range(1)] }]],
    ['direct', [
      { from: root, fromRanges: [range(1)] },
      { from: hidden, fromRanges: [range(1)] },
    ]],
  ]));
  const result = await analyzeImpact({
    workspace,
    file: 'root.ts',
    line: 1,
    column: 1,
    depth: 1,
    maxNodes: 10,
  }, provider);
  assert.equal(result.truncated, true);
  assert.deepEqual(result.traversalLimits, ['depth']);
  assert.equal((result.edges as unknown[]).length, 1);
});

test('does not return dangling edges when the node limit is reached', async t => {
  const workspace = await workspaceFixture(t, 'root.ts');
  const root = item(workspace, 'root.ts', 'root', 0);
  const omitted = item(workspace, 'omitted.ts', 'omitted', 0);
  const provider = new FakeProvider(root, new Map([
    ['root', [{ from: omitted, fromRanges: [range(1)] }]],
  ]));
  const result = await analyzeImpact({
    workspace,
    file: 'root.ts',
    line: 1,
    column: 1,
    depth: 1,
    maxNodes: 1,
  }, provider);
  assert.equal((result.nodes as unknown[]).length, 1);
  assert.equal((result.edges as unknown[]).length, 0);
  assert.deepEqual(result.traversalLimits, ['nodes']);
});

test('rejects ambiguous provider roots instead of selecting one', async t => {
  const workspace = await workspaceFixture(t, 'root.ts');
  const root = item(workspace, 'root.ts', 'root', 0);
  const provider = new FakeProvider(root, new Map());
  provider.prepare = async () => [root, { ...root, name: 'other' }];
  await assert.rejects(
    analyzeImpact({ workspace, file: 'root.ts', line: 1, column: 1 }, provider),
    (error: unknown) => Boolean(error && typeof error === 'object' && 'code' in error && error.code === 'target_ambiguous'),
  );
});

test('returns a successful complete graph when the root has no callers', async t => {
  const workspace = await workspaceFixture(t, 'root.ts');
  const root = item(workspace, 'root.ts', 'root', 0);
  const provider = new FakeProvider(root, new Map());
  const result = await analyzeImpact({
    workspace,
    file: 'root.ts',
    line: 1,
    column: 1,
  }, provider);

  assert.equal((result.nodes as unknown[]).length, 1);
  assert.equal((result.edges as unknown[]).length, 0);
  assert.equal(result.complete, true);
  assert.equal((result.coverage as { traversal: { status: string } }).traversal.status, 'complete');
  // The invariant coverage.ts's `nullIncomingCallsObserved` handling depends on (see the comment at
  // TraversalFacts.incomingCallerCount): incomingCallerCount === 0 only happens when incoming() was
  // called exactly once this session (for the root). If a future change queried incoming() more than
  // once before deciding there are no callers, a null observed on a *different* query would wrongly
  // attach to this proven-empty result.
  assert.equal(provider.incomingCallCount, 1);
});

// The other way incomingCallerCount can land on 0 despite a real answer coming back: a symbol that calls
// itself. `seen` already contains the root, so the self-reference becomes an edge, not a new queued
// entry - `entries.length` (and so incomingCallerCount) stays at the root-only value, but exactly one
// incoming() call still produced that edge. Same invariant, different shape of "no expansion happened".
test('a self-recursive root still queries incoming() exactly once', async t => {
  const workspace = await workspaceFixture(t, 'root.ts');
  const root = item(workspace, 'root.ts', 'root', 0);
  const provider = new FakeProvider(root, new Map([
    ['root', [{ from: root, fromRanges: [range(0)] }]],
  ]));
  const result = await analyzeImpact({
    workspace,
    file: 'root.ts',
    line: 1,
    column: 1,
  }, provider);

  assert.equal((result.nodes as unknown[]).length, 1, 'no new entry - the self-reference is an edge only');
  assert.equal((result.edges as unknown[]).length, 1, 'the self-edge is still recorded');
  assert.equal(provider.incomingCallCount, 1);
});
