import assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import test from 'node:test';
import { pathToFileURL } from 'node:url';
import { analyzeImpact } from '../impact';
import {
  AnalysisObservations,
  CallHierarchyItem,
  CallHierarchyProvider,
  Completion,
  IncomingCall,
  LimitationDetail,
  ProviderCapabilities,
  ProviderDiagnostic,
} from '../types';

// The projection is unit-tested in coverage.test.ts. This file answers a different question: can each row of
// the truth table actually come out of `analyzeImpact`, the function the CLI calls? A row that only the
// projection can produce is a row the product cannot reach.

const range = (line: number) => ({ start: { line, character: 0 }, end: { line, character: 10 } });

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

  constructor(
    private readonly root: CallHierarchyItem,
    private readonly calls: ReadonlyMap<string, readonly IncomingCall[]> = new Map(),
  ) {}

  async prepare(): Promise<readonly CallHierarchyItem[]> {
    return [this.root];
  }

  async incoming(value: CallHierarchyItem): Promise<readonly IncomingCall[]> {
    return this.calls.get(value.name) ?? [];
  }

  async collectDiagnostics(): Promise<readonly ProviderDiagnostic[]> {
    return [];
  }

  async dispose(): Promise<void> {}
}

async function workspaceFixture(t: { after(callback: () => Promise<void>): void }): Promise<string> {
  const workspace = await fs.mkdtemp(path.join(os.tmpdir(), 'impact-lens-completion-'));
  t.after(() => fs.rm(workspace, { recursive: true, force: true }));
  await fs.mkdir(path.join(workspace, 'src'), { recursive: true });
  await fs.writeFile(path.join(workspace, 'src', 'root.ts'), 'export function root(): void {}\n');
  return workspace;
}

interface Analysis {
  readonly completion: Completion;
  readonly complete: boolean;
  readonly truncated: boolean;
  readonly traversalLimits: readonly string[];
  readonly coverage: {
    traversal: { status: string };
    semantic: { status: string };
    indexing: { status: string };
    reasons: readonly string[];
  };
  readonly limitations: readonly string[];
  readonly limitationDetails: readonly LimitationDetail[];
}

/** Builds a caller chain of the requested length above the root and analyzes it. */
async function analyze(
  t: { after(callback: () => Promise<void>): void },
  options: {
    callers?: number;
    chain?: number;
    depth?: number;
    maxNodes?: number;
    observations?: AnalysisObservations;
  } = {},
): Promise<Analysis> {
  const workspace = await workspaceFixture(t);
  const root = item(workspace, 'src/root.ts', 'root', 0);
  const calls = new Map<string, IncomingCall[]>();
  const direct: IncomingCall[] = [];
  for (let index = 0; index < (options.callers ?? 1); index += 1) {
    direct.push({ from: item(workspace, `src/caller${index}.ts`, `caller${index}`, index + 1), fromRanges: [range(index + 1)] });
  }
  if (direct.length > 0) {
    calls.set('root', direct);
  }
  for (let level = 1; level < (options.chain ?? 1); level += 1) {
    calls.set(`caller${level - 1}`, [{
      from: item(workspace, `src/caller${level}.ts`, `caller${level}`, level + 10),
      fromRanges: [range(level + 10)],
    }]);
  }
  const result = await analyzeImpact(
    {
      workspace,
      file: 'src/root.ts',
      line: 1,
      column: 1,
      depth: options.depth ?? 5,
      maxNodes: options.maxNodes ?? 50,
    },
    new FakeProvider(root, calls),
    undefined,
    options.observations,
  );
  return result as unknown as Analysis;
}

const codes = (analysis: Analysis): readonly string[] => analysis.limitationDetails.map(detail => detail.code);
const READY = { status: 'ready', evidence: { signal: 'test-fixture' } } as const;

test('S1 - a natural end with callers reaches succeeded/exhausted', async t => {
  const analysis = await analyze(t, { callers: 2 });
  assert.deepEqual(analysis.completion, {
    requestStatus: 'succeeded',
    traversalStatus: 'exhausted',
    semanticScope: 'provider-static',
    indexingStatus: 'unknown',
  });
  assert.equal(analysis.complete, true);
  assert.equal(analysis.truncated, false);
  assert.equal(analysis.coverage.traversal.status, 'complete');
  assert.deepEqual(analysis.limitations, ['dynamic_calls_not_inferred', 'unsaved_buffers_unavailable']);
});

test('S2 - no callers with a proven index reaches ready without index_state_unknown', async t => {
  const analysis = await analyze(t, { callers: 0, observations: { indexing: READY } });
  assert.equal(analysis.completion.requestStatus, 'succeeded');
  assert.equal(analysis.completion.indexingStatus, 'ready');
  assert.deepEqual(analysis.coverage.indexing, READY);
  assert.ok(codes(analysis).includes('no_incoming_callers'));
  assert.ok(!codes(analysis).includes('index_state_unknown'));
});

test('S3 - no callers with an unproven index reaches both empty-result codes', async t => {
  const analysis = await analyze(t, { callers: 0 });
  assert.equal(analysis.completion.requestStatus, 'succeeded');
  assert.equal(analysis.completion.indexingStatus, 'unknown');
  assert.ok(codes(analysis).includes('no_incoming_callers'));
  assert.ok(codes(analysis).includes('index_state_unknown'));
  // The v1 array deliberately still holds neither. See coverage.ts V1_WITHHELD_REASON_CODES.
  assert.deepEqual(analysis.limitations, ['dynamic_calls_not_inferred', 'unsaved_buffers_unavailable']);
});

test('S4 - a depth limit reaches partial/depth-limited', async t => {
  const analysis = await analyze(t, { callers: 1, chain: 3, depth: 1 });
  assert.equal(analysis.completion.requestStatus, 'partial');
  assert.equal(analysis.completion.traversalStatus, 'depth-limited');
  assert.equal(analysis.complete, false);
  assert.equal(analysis.coverage.traversal.status, 'depth-limited');
  assert.deepEqual(analysis.traversalLimits, ['depth']);
  assert.ok(analysis.limitations.includes('depth_limit_reached'));
});

test('S5 - a node limit reaches partial/node-limited', async t => {
  const analysis = await analyze(t, { callers: 4, maxNodes: 2 });
  assert.equal(analysis.completion.traversalStatus, 'node-limited');
  assert.equal(analysis.coverage.traversal.status, 'node-limited');
  assert.deepEqual(analysis.traversalLimits, ['nodes']);
  assert.ok(analysis.limitations.includes('node_limit_reached'));
});

test('S6 - both limits reach node-limited and keep both reasons', async t => {
  const analysis = await analyze(t, { callers: 3, chain: 3, depth: 1, maxNodes: 3 });
  assert.equal(analysis.completion.traversalStatus, 'node-limited');
  assert.deepEqual(analysis.traversalLimits, ['depth', 'nodes']);
  assert.ok(analysis.limitations.includes('depth_limit_reached'));
  assert.ok(analysis.limitations.includes('node_limit_reached'));
});

test('S7 - an index that is still working reaches partial/unknown', async t => {
  const analysis = await analyze(t, { callers: 2, observations: { indexing: { status: 'working' } } });
  assert.deepEqual(analysis.completion, {
    requestStatus: 'partial',
    traversalStatus: 'unknown',
    semanticScope: 'provider-static',
    indexingStatus: 'working',
  });
  assert.equal(analysis.complete, false);
  assert.equal(analysis.coverage.traversal.status, 'failed');
  assert.ok(codes(analysis).includes('provider_not_ready'));
});

test('S8 - an empty result while indexing is never reported as no callers', async t => {
  const analysis = await analyze(t, { callers: 0, observations: { indexing: { status: 'working' } } });
  assert.equal(analysis.completion.requestStatus, 'partial');
  assert.equal(analysis.complete, false);
  assert.ok(codes(analysis).includes('provider_not_ready'));
  assert.ok(!codes(analysis).includes('no_incoming_callers'));
});

test('S9 - a timeout with a partial graph reaches partial/timeout', async t => {
  const analysis = await analyze(t, { callers: 2, observations: { interruption: 'timeout' } });
  assert.equal(analysis.completion.traversalStatus, 'timeout');
  assert.equal(analysis.coverage.traversal.status, 'timeout');
  assert.ok(codes(analysis).includes('traversal_timeout'));
});

test('S10 - a cancellation with a partial graph reaches partial/cancelled', async t => {
  const analysis = await analyze(t, { callers: 2, observations: { interruption: 'cancelled' } });
  assert.equal(analysis.completion.traversalStatus, 'cancelled');
  assert.equal(analysis.coverage.traversal.status, 'failed');
  assert.ok(codes(analysis).includes('traversal_cancelled'));
});

test('S11 - a provider failure with a partial graph reaches partial/failed', async t => {
  const analysis = await analyze(t, { callers: 2, observations: { interruption: 'provider-failed' } });
  assert.equal(analysis.completion.traversalStatus, 'failed');
  assert.equal(analysis.coverage.traversal.status, 'failed');
  assert.ok(codes(analysis).includes('provider_query_failed'));
});

test('S12 - inferred edges reach static-plus-inference and project to augmented', async t => {
  const analysis = await analyze(t, {
    callers: 2,
    observations: {
      semantic: { scope: 'static-plus-inference', evidenceSources: ['lsp-call-hierarchy', 'inferred-di'] },
    },
  });
  assert.equal(analysis.completion.semanticScope, 'static-plus-inference');
  assert.equal(analysis.coverage.semantic.status, 'augmented');
  assert.ok(codes(analysis).includes('inferred_edges_included'));
});

test('S13 - observed edges reach static-plus-observation and project to augmented', async t => {
  const analysis = await analyze(t, {
    callers: 2,
    observations: {
      semantic: { scope: 'static-plus-observation', evidenceSources: ['lsp-call-hierarchy', 'observed-trace'] },
    },
  });
  assert.equal(analysis.completion.semanticScope, 'static-plus-observation');
  assert.equal(analysis.coverage.semantic.status, 'augmented');
  assert.ok(codes(analysis).includes('observed_edges_included'));
});

// X1 and X10 restated against the real response: the v1 fields cannot disagree with the completion because
// there is no code path that writes them separately.
test('the v1 fields agree with the completion in every reachable row', async t => {
  const rows: ReadonlyArray<Parameters<typeof analyze>[1]> = [
    { callers: 2 },
    { callers: 0 },
    { callers: 1, chain: 3, depth: 1 },
    { callers: 4, maxNodes: 2 },
    { callers: 2, observations: { indexing: { status: 'working' } } },
    { callers: 2, observations: { interruption: 'timeout' } },
    { callers: 2, observations: { interruption: 'cancelled' } },
    { callers: 2, observations: { interruption: 'provider-failed' } },
  ];
  for (const row of rows) {
    const analysis = await analyze(t, row);
    const exhausted = analysis.completion.traversalStatus === 'exhausted';
    assert.equal(analysis.complete, exhausted);
    assert.equal(analysis.truncated, !exhausted);
    assert.equal(analysis.complete, analysis.coverage.traversal.status === 'complete');
    if (!analysis.truncated) {
      assert.deepEqual(analysis.traversalLimits, []);
    }
    assert.equal(analysis.limitations, analysis.coverage.reasons);
  }
});

// The root is always seeded into the traversal, so a successful analysis can never carry an empty graph.
// That invariant is what lets the schema forbid "provider failure reported as an empty success" (X2).
test('a successful analysis always carries at least the root node', async t => {
  const analysis = await analyze(t, { callers: 0 }) as unknown as { nodes: unknown[] };
  assert.equal(analysis.nodes.length, 1);
});
