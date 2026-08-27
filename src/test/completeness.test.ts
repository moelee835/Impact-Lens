import assert from 'node:assert/strict';
import test from 'node:test';
import {
  analysisStateLabel,
  CompletenessInput,
  completenessInput,
  headerSegments,
  indexingLabel,
  noProviderSummary,
  resultCountLabel,
  semanticScopeLabel,
  stateBadge,
  summarizeCompleteness,
} from '../completeness';

function input(overrides: Partial<CompletenessInput> = {}): CompletenessInput {
  return {
    callerCount: 3,
    truncated: false,
    traversalLimits: [],
    requestedDepth: 5,
    reachedDepth: 2,
    maxNodes: 120,
    analysisState: 'current',
    traversalStatus: 'complete',
    semanticStatus: 'static-only',
    indexingStatus: 'unknown',
    reasons: ['identity_unavailable_through_vscode_api', 'dynamic_calls_not_inferred'],
    ...overrides,
  };
}

// The Wave 2 exit gate asks for one thing in particular: in the Extension, empty and incomplete must be
// distinguishable from the wording alone. These three are the states that used to collapse into "the tree
// shows a root and nothing else".
test('tells the three empty states apart by wording alone', () => {
  const noProvider = noProviderSummary('typescript');
  const noCallers = summarizeCompleteness(input({ callerCount: 0 }));
  const partial = summarizeCompleteness(input({
    callerCount: 0,
    truncated: true,
    traversalLimits: ['nodes'],
  }));

  assert.equal(noProvider.outcome, 'no-provider');
  assert.equal(noCallers.outcome, 'no-callers-index-unknown');
  assert.equal(partial.outcome, 'node-limited');

  const headlines = [noProvider.headline, noCallers.headline, partial.headline];
  assert.equal(new Set(headlines).size, 3, 'each empty state needs its own sentence');

  // Each sentence has to carry the distinction on its own, without an icon or a colour.
  assert.match(noProvider.headline, /No Call Hierarchy provider answered/);
  assert.match(noCallers.headline, /No incoming callers were returned/);
  assert.match(noCallers.headline, /not proof that none exist/);
  assert.match(partial.headline, /^Partial result: /);

  // A bounded traversal that returned nothing must never be described as "no callers found": the boundary
  // is the reason there is nothing, and the reader has to see that first.
  assert.doesNotMatch(partial.headline, /No incoming callers/i);
  assert.equal(partial.bounded, true);
  assert.equal(noCallers.bounded, false);
});

test('every state that stops the reader from concluding carries an action', () => {
  const summaries = [
    noProviderSummary(),
    summarizeCompleteness(input({ callerCount: 0 })),
    summarizeCompleteness(input({ traversalLimits: ['depth'], truncated: true })),
    summarizeCompleteness(input({ traversalLimits: ['nodes'], truncated: true })),
    summarizeCompleteness(input({ traversalLimits: ['depth', 'nodes'], truncated: true })),
    summarizeCompleteness(input({ traversalStatus: 'timeout' })),
    summarizeCompleteness(input({ traversalStatus: 'failed' })),
    summarizeCompleteness(input({ indexingStatus: 'working' })),
    summarizeCompleteness(input({ indexingStatus: 'working', callerCount: 0 })),
    summarizeCompleteness(input({ analysisState: 'failed' })),
    summarizeCompleteness(input({ analysisState: 'stale' })),
  ];
  for (const summary of summaries) {
    assert.notEqual(summary.severity, 'info', `${summary.outcome} should not be info`);
    assert.ok(summary.action, `${summary.outcome} needs an action`);
  }
});

test('maps the truth table rows the VS Code broker can produce', () => {
  // S1
  assert.match(summarizeCompleteness(input({ callerCount: 4 })).headline, /^4 incoming callers found\./);
  assert.equal(summarizeCompleteness(input({ callerCount: 4 })).severity, 'info');
  assert.match(summarizeCompleteness(input({ callerCount: 1 })).headline, /^1 incoming caller found\./);

  // S2 becomes reachable the moment a provider reports a ready index. It is the only row allowed to scope
  // the claim to an indexed workspace.
  const indexed = summarizeCompleteness(input({ callerCount: 0, indexingStatus: 'ready' }));
  assert.equal(indexed.outcome, 'no-callers-indexed');
  assert.match(indexed.headline, /within the indexed workspace/);

  // S4
  const depth = summarizeCompleteness(input({ traversalLimits: ['depth'], truncated: true }));
  assert.match(depth.headline, /depth limit 5 reached/);

  // S5
  const nodes = summarizeCompleteness(input({ traversalLimits: ['nodes'], truncated: true }));
  assert.match(nodes.headline, /node budget 120 exhausted\. Some callers were not expanded\./);

  // S6 names the node budget first because that is what stopped the expansion.
  const both = summarizeCompleteness(input({ traversalLimits: ['depth', 'nodes'], truncated: true }));
  assert.match(both.headline, /node budget 120 exhausted before the depth limit 5 was cleared\./);

  // S7 and S8 are the same cause with different evidence, and only S8 must refuse the empty conclusion.
  const indexingPartial = summarizeCompleteness(input({ indexingStatus: 'working' }));
  const indexingEmpty = summarizeCompleteness(input({ indexingStatus: 'working', callerCount: 0 }));
  assert.equal(indexingPartial.outcome, 'indexing-partial');
  assert.equal(indexingEmpty.outcome, 'indexing-empty');
  assert.match(indexingEmpty.headline, /not evidence that the symbol has no callers/);
  assert.equal(indexingPartial.severity, 'error');
  assert.equal(indexingEmpty.severity, 'error');
});

test('reconciles the analysis state with the coverage it came from', () => {
  // `src/impactAnalyzer.ts:analyzeItem` writes 'current' even for a truncated traversal, so a surface that
  // trusts the field alone renders a bounded result as settled.
  const bounded = stateBadge(input({ analysisState: 'current', truncated: true, traversalLimits: ['depth'] }));
  assert.deepEqual(bounded, { label: 'Partial result', className: 'partial' });

  assert.deepEqual(
    stateBadge(input({ analysisState: 'current' })),
    { label: 'Current', className: 'current' },
  );
  assert.deepEqual(
    stateBadge(input({ analysisState: 'current', indexingStatus: 'working' })),
    { label: 'Partial result', className: 'partial' },
  );
  assert.deepEqual(
    stateBadge(input({ analysisState: 'failed' })),
    { label: 'Analysis failed', className: 'failed' },
  );
});

test('keeps one spelling of every analysis state', () => {
  assert.equal(analysisStateLabel('current'), 'Current');
  assert.equal(analysisStateLabel('stale'), 'Editing · stale');
  assert.equal(analysisStateLabel('analyzing'), 'Analyzing…');
  assert.equal(analysisStateLabel('partial'), 'Partial result');
  assert.equal(analysisStateLabel('failed'), 'Analysis failed');
  assert.equal(analysisStateLabel(undefined), '');
});

test('orders header segments as count, traversal, semantic scope, action', () => {
  // `src/coverage.ts:vscodeCoverage` derives the status and the limit list from the same traversal, so a
  // fixture that disagrees with itself would be testing a state the producer cannot emit.
  const bounded = input({
    callerCount: 7,
    traversalLimits: ['depth'],
    traversalStatus: 'depth-limited',
    truncated: true,
    reachedDepth: 5,
  });
  const segments = headerSegments(bounded, summarizeCompleteness(bounded));
  assert.deepEqual(segments, [
    '7 callers',
    'traversal depth-limited · depth 5/5 · node budget 120',
    'semantic scope: static call hierarchy only',
    'Re-run with a higher depth.',
  ]);

  // Without an action the order is unchanged and the segment is simply absent.
  const settled = input({ callerCount: 2 });
  assert.deepEqual(headerSegments(settled, summarizeCompleteness(settled)), [
    '2 callers',
    'traversal complete · depth 2/5 · node budget 120',
    'semantic scope: static call hierarchy only',
  ]);
});

test('states the result count without implying a verdict', () => {
  assert.equal(resultCountLabel(0), 'no callers returned');
  assert.equal(resultCountLabel(1), '1 caller');
  assert.equal(resultCountLabel(9), '9 callers');
});

test('reads an absent index signal as a missing report', () => {
  assert.equal(indexingLabel('unknown'), 'index state: not reported');
  assert.equal(indexingLabel('working'), 'index state: still indexing');
  assert.equal(indexingLabel('ready'), 'index state: ready');
  assert.equal(semanticScopeLabel('static-only'), 'static call hierarchy only');
  assert.equal(semanticScopeLabel('augmented'), 'static call hierarchy plus augmented edges');
});

test('derives the caller count from the root-seeded node list', () => {
  const derived = completenessInput({
    nodeCount: 1,
    truncated: false,
    traversalLimits: [],
    requestedDepth: 5,
    reachedDepth: 0,
    maxNodes: 120,
    analysisState: 'current',
    coverage: {
      traversal: { status: 'complete', requestedDepth: 5, reachedDepth: 0, maxNodes: 120 },
      semantic: { status: 'static-only', evidenceSources: ['vscode-call-hierarchy'] },
      indexing: { status: 'unknown' },
      reasons: [],
    },
  });
  assert.equal(derived.callerCount, 0);
  assert.equal(summarizeCompleteness(derived).outcome, 'no-callers-index-unknown');
});
