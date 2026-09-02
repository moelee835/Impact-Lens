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
  const workspace = await fs.mkdtemp(path.join(os.tmpdir(), 'impact-lens-impact-'));
  t.after(() => fs.rm(workspace, { recursive: true, force: true }));
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
  const nodes = result.nodes as Array<{ name: string; relation: string; depth: number; testDistance: number | null }>;
  assert.deepEqual(nodes.map(node => [node.name, node.relation, node.depth, node.testDistance]), [
    ['root', 'root', 0, null],
    ['direct', 'direct', 1, null],
    ['root test', 'test', 1, 1],
    ['transitive', 'transitive', 2, null],
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
