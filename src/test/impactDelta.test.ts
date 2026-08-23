import assert from 'node:assert/strict';
import test from 'node:test';
import { computeImpactDelta } from '../impactDelta';

function node(id: string, diagnostics: Array<{ severity: 'error'; message: string; line: number }> = []) {
  return { id, diagnostics } as never;
}

function edge(source: string, target: string) {
  return { source, target } as never;
}

test('compares added and removed impact nodes and edges', () => {
  const delta = computeImpactDelta(
    { nodes: [node('root'), node('old')], edges: [edge('old', 'root')] },
    { nodes: [node('root'), node('new')], edges: [edge('new', 'root')] },
  );

  assert.deepEqual(delta.addedNodeIds, ['new']);
  assert.deepEqual(delta.removedNodeIds, ['old']);
  assert.equal(delta.addedEdgeCount, 1);
  assert.equal(delta.removedEdgeCount, 1);
});

test('counts only newly introduced diagnostics', () => {
  const existing = { severity: 'error' as const, message: 'Existing', line: 4 };
  const introduced = { severity: 'error' as const, message: 'New', line: 8 };
  const delta = computeImpactDelta(
    { nodes: [node('root', [existing])], edges: [] },
    { nodes: [node('root', [existing, introduced])], edges: [] },
  );

  assert.equal(delta.addedDiagnosticCount, 1);
});
