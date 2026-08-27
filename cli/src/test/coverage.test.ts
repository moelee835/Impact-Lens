import assert from 'node:assert/strict';
import test from 'node:test';
import { STATIC_ONLY_SEMANTIC_COVERAGE, UNKNOWN_INDEXING_COVERAGE, coverageForTraversal } from '../coverage';

test('reports a completed static traversal without claiming indexing readiness', () => {
  const coverage = coverageForTraversal(new Set(), 5, 2, 120, [
    'dynamic_calls_not_inferred',
  ]);

  assert.deepEqual(coverage, {
    traversal: { status: 'complete', requestedDepth: 5, reachedDepth: 2, maxNodes: 120 },
    semantic: { status: 'static-only', evidenceSources: ['lsp-call-hierarchy'] },
    indexing: { status: 'unknown' },
    reasons: ['dynamic_calls_not_inferred'],
  });
});

test('gives a node limit precedence when multiple traversal limits are present', () => {
  const coverage = coverageForTraversal(new Set(['depth', 'nodes']), 2, 2, 10, [
    'depth_limit_reached',
    'node_limit_reached',
  ]);

  assert.equal(coverage.traversal.status, 'node-limited');
});

// The semantic and indexing values became arguments so that a later lane can report measured
// readiness. Until something measures it, an omitted argument has to serialize exactly as the
// hard-coded constant did, key order included, or every stored response changes shape.
test('omitting observations serializes exactly as the previous hard-coded coverage', () => {
  const coverage = coverageForTraversal(new Set(['depth']), 3, 3, 40, ['depth_limit_reached']);

  assert.equal(
    JSON.stringify(coverage),
    JSON.stringify({
      traversal: { status: 'depth-limited', requestedDepth: 3, reachedDepth: 3, maxNodes: 40 },
      semantic: { status: 'static-only', evidenceSources: ['lsp-call-hierarchy'] },
      indexing: { status: 'unknown' },
      reasons: ['depth_limit_reached'],
    }),
  );
  assert.deepEqual(coverage.semantic, STATIC_ONLY_SEMANTIC_COVERAGE);
  assert.deepEqual(coverage.indexing, UNKNOWN_INDEXING_COVERAGE);
});

test('an empty observations object is the same as passing nothing', () => {
  assert.equal(
    JSON.stringify(coverageForTraversal(new Set(), 5, 1, 120, [], {})),
    JSON.stringify(coverageForTraversal(new Set(), 5, 1, 120, [])),
  );
});

test('measured semantic and indexing coverage replace the defaults independently', () => {
  const semanticOnly = coverageForTraversal(new Set(), 5, 1, 120, [], {
    semantic: { status: 'augmented', evidenceSources: ['lsp-call-hierarchy', 'runtime-trace'] },
  });
  assert.equal(semanticOnly.semantic.status, 'augmented');
  assert.deepEqual(semanticOnly.semantic.evidenceSources, ['lsp-call-hierarchy', 'runtime-trace']);
  assert.equal(semanticOnly.indexing.status, 'unknown');

  const indexingOnly = coverageForTraversal(new Set(), 5, 1, 120, [], {
    indexing: { status: 'ready' },
  });
  assert.equal(indexingOnly.indexing.status, 'ready');
  assert.deepEqual(indexingOnly.semantic, STATIC_ONLY_SEMANTIC_COVERAGE);
});
