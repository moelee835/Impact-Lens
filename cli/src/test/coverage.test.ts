import assert from 'node:assert/strict';
import test from 'node:test';
import {
  CompletionProjection,
  STATIC_ONLY_SEMANTIC_COVERAGE,
  TraversalFacts,
  UNKNOWN_INDEXING_COVERAGE,
  V1_WITHHELD_REASON_CODES,
  graphCompletion,
  projectCompletion,
} from '../coverage';
import { AnalysisObservations, TraversalLimit } from '../types';

function facts(overrides: Partial<TraversalFacts> = {}): TraversalFacts {
  return {
    limits: new Set<TraversalLimit>(),
    requestedDepth: 5,
    reachedDepth: 2,
    maxNodes: 120,
    incomingCallerCount: 3,
    diagnosticsSupported: true,
    ...overrides,
  };
}

function project(
  overrides: Partial<TraversalFacts> = {},
  observations: AnalysisObservations = {},
): CompletionProjection {
  return projectCompletion(facts(overrides), observations);
}

function codes(projection: CompletionProjection): readonly string[] {
  return projection.limitationDetails.map(detail => detail.code);
}

// ---------------------------------------------------------------------------
// The v1 fields must not move. Everything below this block is new surface; everything in it is the
// contract the plugin, the e2e assert and every stored response already depend on.
// ---------------------------------------------------------------------------

test('a finished traversal projects to exactly the v1 values it produced before', () => {
  const projection = project();

  assert.equal(projection.complete, true);
  assert.equal(projection.truncated, false);
  assert.deepEqual(projection.traversalLimits, []);
  assert.equal(
    JSON.stringify(projection.coverage),
    JSON.stringify({
      traversal: { status: 'complete', requestedDepth: 5, reachedDepth: 2, maxNodes: 120 },
      semantic: { status: 'static-only', evidenceSources: ['lsp-call-hierarchy'] },
      indexing: { status: 'unknown' },
      reasons: ['dynamic_calls_not_inferred', 'unsaved_buffers_unavailable'],
    }),
  );
  assert.deepEqual(projection.coverage.semantic, STATIC_ONLY_SEMANTIC_COVERAGE);
  assert.deepEqual(projection.coverage.indexing, UNKNOWN_INDEXING_COVERAGE);
});

test('limitations and coverage.reasons stay the same array, not two arrays that agree', () => {
  const projection = project();
  assert.equal(projection.limitations, projection.coverage.reasons);
});

test('the v1 reason order survives every conditional code', () => {
  const projection = project({
    limits: new Set<TraversalLimit>(['depth', 'nodes']),
    diagnosticsSupported: false,
  });

  assert.deepEqual(projection.limitations, [
    'dynamic_calls_not_inferred',
    'unsaved_buffers_unavailable',
    'provider_diagnostics_unsupported',
    'depth_limit_reached',
    'node_limit_reached',
  ]);
});

test('a node limit still outranks a depth limit in the v1 traversal status', () => {
  const projection = project({ limits: new Set<TraversalLimit>(['depth', 'nodes']) });
  assert.equal(projection.coverage.traversal.status, 'node-limited');
  assert.equal(projection.completion.traversalStatus, 'node-limited');
});

test('an empty observations object is the same as passing nothing', () => {
  assert.equal(
    JSON.stringify(projectCompletion(facts(), {})),
    JSON.stringify(projectCompletion(facts())),
  );
});

// ---------------------------------------------------------------------------
// Truth table rows S1..S13 (docs/work/task-m1-state-truth-table.md section 2.1).
//
// Each row asserts the three axes, the four v1 projections and the reason codes the table calls mandatory.
// A row that cannot be produced here is a row the table got wrong.
// ---------------------------------------------------------------------------

const READY = { status: 'ready', evidence: { signal: 'test-fixture' } } as const;

test('S1 - natural end with callers', () => {
  const projection = project();
  assert.deepEqual(projection.completion, {
    requestStatus: 'succeeded',
    traversalStatus: 'exhausted',
    semanticScope: 'provider-static',
    indexingStatus: 'unknown',
  });
  assert.equal(projection.complete, true);
  assert.equal(projection.truncated, false);
  assert.equal(projection.coverage.traversal.status, 'complete');
  assert.deepEqual(codes(projection), ['dynamic_calls_not_inferred', 'unsaved_buffers_unavailable']);
});

test('S2 - natural end, no callers, index state proven', () => {
  const projection = project({ incomingCallerCount: 0 }, { indexing: READY });
  assert.equal(projection.completion.requestStatus, 'succeeded');
  assert.equal(projection.completion.indexingStatus, 'ready');
  assert.equal(projection.complete, true);
  assert.deepEqual(projection.coverage.indexing, READY);
  assert.ok(codes(projection).includes('no_incoming_callers'));
  assert.ok(!codes(projection).includes('index_state_unknown'));
});

test('S3 - natural end, no callers, index state unknown', () => {
  const projection = project({ incomingCallerCount: 0 });
  assert.equal(projection.completion.requestStatus, 'succeeded');
  assert.equal(projection.complete, true);
  assert.deepEqual(codes(projection).slice(2), ['no_incoming_callers', 'index_state_unknown']);
});

test('S4 - depth limit', () => {
  const projection = project({ limits: new Set<TraversalLimit>(['depth']) });
  assert.deepEqual(projection.completion, {
    requestStatus: 'partial',
    traversalStatus: 'depth-limited',
    semanticScope: 'provider-static',
    indexingStatus: 'unknown',
  });
  assert.equal(projection.complete, false);
  assert.equal(projection.truncated, true);
  assert.deepEqual(projection.traversalLimits, ['depth']);
  assert.equal(projection.coverage.traversal.status, 'depth-limited');
  assert.ok(codes(projection).includes('depth_limit_reached'));
});

test('S5 - node limit', () => {
  const projection = project({ limits: new Set<TraversalLimit>(['nodes']) });
  assert.equal(projection.completion.traversalStatus, 'node-limited');
  assert.equal(projection.coverage.traversal.status, 'node-limited');
  assert.deepEqual(projection.traversalLimits, ['nodes']);
  assert.ok(codes(projection).includes('node_limit_reached'));
});

test('S6 - depth and node limits together', () => {
  const projection = project({ limits: new Set<TraversalLimit>(['depth', 'nodes']) });
  assert.equal(projection.completion.traversalStatus, 'node-limited');
  assert.deepEqual(projection.traversalLimits, ['depth', 'nodes']);
  const reasons = codes(projection);
  assert.ok(reasons.includes('depth_limit_reached') && reasons.includes('node_limit_reached'));
});

test('S7 - provider still indexing, partial result', () => {
  const projection = project({}, { indexing: { status: 'working' } });
  assert.deepEqual(projection.completion, {
    requestStatus: 'partial',
    traversalStatus: 'unknown',
    semanticScope: 'provider-static',
    indexingStatus: 'working',
  });
  assert.equal(projection.complete, false);
  assert.equal(projection.coverage.traversal.status, 'failed');
  assert.ok(codes(projection).includes('provider_not_ready'));
});

test('S8 - provider still indexing, no callers, and the empty result is not promoted', () => {
  const projection = project({ incomingCallerCount: 0 }, { indexing: { status: 'working' } });
  assert.equal(projection.completion.requestStatus, 'partial');
  assert.ok(codes(projection).includes('provider_not_ready'));
  // X11: the two codes describe incompatible claims and may never appear together.
  assert.ok(!codes(projection).includes('no_incoming_callers'));
});

test('S9 - timeout with a partial result', () => {
  const projection = project({}, { interruption: 'timeout' });
  assert.equal(projection.completion.traversalStatus, 'timeout');
  assert.equal(projection.coverage.traversal.status, 'timeout');
  assert.equal(projection.complete, false);
  assert.ok(codes(projection).includes('traversal_timeout'));
});

test('S10 - cancelled with a partial result', () => {
  const projection = project({}, { interruption: 'cancelled' });
  assert.equal(projection.completion.traversalStatus, 'cancelled');
  // `cancelled` has no v1 spelling and is written as `failed` on purpose.
  assert.equal(projection.coverage.traversal.status, 'failed');
  assert.ok(codes(projection).includes('traversal_cancelled'));
});

test('S11 - provider failed mid traversal with a partial result', () => {
  const projection = project({}, { interruption: 'provider-failed' });
  assert.equal(projection.completion.traversalStatus, 'failed');
  assert.equal(projection.coverage.traversal.status, 'failed');
  assert.ok(codes(projection).includes('provider_query_failed'));
});

test('S12 - natural end including inferred edges', () => {
  const projection = project({}, {
    semantic: { scope: 'static-plus-inference', evidenceSources: ['lsp-call-hierarchy', 'inferred-di'] },
  });
  assert.equal(projection.completion.semanticScope, 'static-plus-inference');
  assert.equal(projection.completion.requestStatus, 'succeeded');
  assert.equal(projection.coverage.semantic.status, 'augmented');
  assert.ok(codes(projection).includes('inferred_edges_included'));
});

test('S13 - natural end including observed edges', () => {
  const projection = project({}, {
    semantic: { scope: 'static-plus-observation', evidenceSources: ['lsp-call-hierarchy', 'observed-trace'] },
  });
  assert.equal(projection.completion.semanticScope, 'static-plus-observation');
  assert.equal(projection.coverage.semantic.status, 'augmented');
  assert.ok(codes(projection).includes('observed_edges_included'));
});

// ---------------------------------------------------------------------------
// Rules the projection has to keep no matter which row produced the value.
// ---------------------------------------------------------------------------

test('an interruption outranks a limit but does not hide it', () => {
  const projection = project({ limits: new Set<TraversalLimit>(['nodes']) }, { interruption: 'timeout' });
  assert.equal(projection.completion.traversalStatus, 'timeout');
  assert.deepEqual(projection.traversalLimits, ['nodes']);
  const reasons = codes(projection);
  assert.ok(reasons.includes('node_limit_reached') && reasons.includes('traversal_timeout'));
});

test('an augmented scope has to name the evidence that augmented it', () => {
  assert.throws(
    () => project({}, {
      semantic: { scope: 'static-plus-inference', evidenceSources: ['lsp-call-hierarchy'] },
    }),
    /requires an evidence source starting with "inferred-"/,
  );
  assert.throws(
    () => project({}, {
      semantic: { scope: 'static-plus-observation', evidenceSources: ['lsp-call-hierarchy'] },
    }),
    /requires an evidence source starting with "observed-"/,
  );
});

test('graphCompletion never returns a failed request status', () => {
  const inputs: readonly AnalysisObservations[] = [
    {},
    { interruption: 'timeout' },
    { interruption: 'cancelled' },
    { interruption: 'provider-failed' },
    { indexing: { status: 'working' } },
    { indexing: READY },
  ];
  for (const observations of inputs) {
    const completion = graphCompletion(new Set<TraversalLimit>(['depth']), observations);
    assert.notEqual(completion.requestStatus, 'failed');
    assert.notEqual(completion.semanticScope, 'none');
  }
});

// The two withheld codes are the only difference between the structured list and the v1 array. Keeping the
// difference to one constant is what makes promoting them a one-line change once the release that updates
// the plugin contract lands. See docs/work/task-m1-completeness-emit.md decision D6.
test('the structured list and the v1 array differ only by the withheld codes', () => {
  const projection = project({ incomingCallerCount: 0 });
  assert.deepEqual(
    codes(projection).filter(code => !V1_WITHHELD_REASON_CODES.has(code)),
    [...projection.limitations],
  );
  assert.deepEqual([...V1_WITHHELD_REASON_CODES], ['no_incoming_callers', 'index_state_unknown']);
});

test('every structured detail carries a severity, a scope and a message', () => {
  const projection = project({
    limits: new Set<TraversalLimit>(['depth', 'nodes']),
    incomingCallerCount: 0,
    diagnosticsSupported: false,
  });
  for (const detail of projection.limitationDetails) {
    assert.ok(['info', 'warning', 'error'].includes(detail.severity), detail.code);
    assert.ok(['traversal', 'semantic', 'indexing', 'provider', 'request'].includes(detail.scope), detail.code);
    assert.ok(detail.message.length > 0, detail.code);
    // Contract rule: an entry a user has to act on says what to do.
    if (detail.severity !== 'info') {
      assert.ok(detail.action && detail.action.length > 0, detail.code);
    }
  }
});
