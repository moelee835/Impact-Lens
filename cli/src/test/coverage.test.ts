import assert from 'node:assert/strict';
import test from 'node:test';
import { coverageForTraversal } from '../coverage';

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
