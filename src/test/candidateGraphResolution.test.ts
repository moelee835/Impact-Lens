import assert from 'node:assert/strict';
import test from 'node:test';
import {
  CandidateAnchorNode,
  resolveCandidateEdgeEndpoints,
  resolveSyntheticNode,
  SyntheticNode,
} from '../candidateGraphResolution';

// M4 gate 2 UI lane left this logic reachable only as literal text inside graphPanel.ts's getHtml()
// template - untestable without `eval`ing a text slice tied to that literal's exact formatting. Moving
// it into this real module (docs/work/task-refactor-graphpanel-candidate-logic-extraction.md) is what
// makes these tests possible at all, including the target-synthetic branch below, which no adapter this
// repository ships reaches today but which the type signature allows.

function anchorMap(entries: ReadonlyArray<[string, CandidateAnchorNode]>): Map<string, CandidateAnchorNode> {
  return new Map(entries);
}

test('existing source, existing target: passes both ids through unchanged when both are in scope', () => {
  const nodeById = anchorMap([['caller', { depth: 1 }], ['root', { depth: 0 }]]);
  const syntheticNodesById = new Map<string, SyntheticNode>();
  const resolved = resolveCandidateEdgeEndpoints(
    {
      source: { kind: 'existing', id: 'caller' },
      target: { kind: 'existing', id: 'root' },
    } as never,
    nodeById,
    syntheticNodesById,
  );
  assert.deepEqual(resolved, { source: 'caller', target: 'root' });
  assert.equal(syntheticNodesById.size, 0, 'no synthetic node should be created when both endpoints are existing');
});

test('existing source not in the depth-filtered node set: the whole edge is skipped', () => {
  const nodeById = anchorMap([['root', { depth: 0 }]]);
  const resolved = resolveCandidateEdgeEndpoints(
    {
      source: { kind: 'existing', id: 'not-visible' },
      target: { kind: 'existing', id: 'root' },
    } as never,
    nodeById,
    new Map(),
  );
  assert.equal(resolved, undefined);
});

test('existing target not in the depth-filtered node set: the whole edge is skipped', () => {
  const nodeById = anchorMap([['caller', { depth: 1 }]]);
  const resolved = resolveCandidateEdgeEndpoints(
    {
      source: { kind: 'existing', id: 'caller' },
      target: { kind: 'existing', id: 'not-visible' },
    } as never,
    nodeById,
    new Map(),
  );
  assert.equal(resolved, undefined);
});

test('synthetic source, existing target: creates a pseudo-node anchored on the target at depth + 1 (the shape the current adapter actually produces)', () => {
  const nodeById = anchorMap([['root', { depth: 0 }]]);
  const syntheticNodesById = new Map<string, SyntheticNode>();
  const resolved = resolveCandidateEdgeEndpoints(
    {
      source: {
        kind: 'synthetic',
        name: 'get_db',
        kindLabel: 'function',
        file: 'app/db.py',
        range: { start: { line: 10, column: 0 }, end: { line: 10, column: 5 } },
      },
      target: { kind: 'existing', id: 'root' },
    } as never,
    nodeById,
    syntheticNodesById,
  );
  assert.ok(resolved);
  assert.equal(resolved!.target, 'root');
  assert.equal(syntheticNodesById.size, 1);
  const synthetic = [...syntheticNodesById.values()][0];
  assert.equal(resolved!.source, synthetic.id);
  assert.equal(synthetic.depth, 1, 'anchor (root) depth 0 + 1');
  assert.equal(synthetic.name, 'get_db');
  assert.equal(synthetic.path, 'app/db.py');
  assert.equal(synthetic.line, 10);
});

test('existing source, synthetic target: the target-synthetic branch - unreached by any shipped adapter today, but the type allows it and this pins it directly', () => {
  const nodeById = anchorMap([['caller', { depth: 2 }]]);
  const syntheticNodesById = new Map<string, SyntheticNode>();
  const resolved = resolveCandidateEdgeEndpoints(
    {
      source: { kind: 'existing', id: 'caller' },
      target: {
        kind: 'synthetic',
        name: 'on_shutdown',
        kindLabel: 'function',
        file: 'app/lifecycle.py',
        range: { start: { line: 3, column: 0 }, end: { line: 3, column: 5 } },
      },
    } as never,
    nodeById,
    syntheticNodesById,
  );
  assert.ok(resolved);
  assert.equal(resolved!.source, 'caller');
  const synthetic = [...syntheticNodesById.values()][0];
  assert.equal(resolved!.target, synthetic.id);
  assert.equal(synthetic.depth, 3, 'anchor (caller) depth 2 + 1');
});

test('both endpoints synthetic: no anchor exists, resolveSyntheticNode returns undefined, the whole edge is skipped', () => {
  const syntheticEndpoint = {
    kind: 'synthetic' as const,
    name: 'x',
    kindLabel: 'function',
    file: 'a.py',
    range: { start: { line: 0, column: 0 }, end: { line: 0, column: 1 } },
  };
  const resolved = resolveCandidateEdgeEndpoints(
    { source: syntheticEndpoint, target: syntheticEndpoint } as never,
    new Map(),
    new Map(),
  );
  assert.equal(resolved, undefined);
});

test('resolveSyntheticNode returns undefined outright when there is no anchor', () => {
  const endpoint = {
    kind: 'synthetic' as const,
    name: 'x',
    kindLabel: 'function',
    file: 'a.py',
    range: { start: { line: 0, column: 0 }, end: { line: 0, column: 1 } },
  };
  assert.equal(resolveSyntheticNode(endpoint, undefined, new Map()), undefined);
});

test('the same synthetic endpoint (file + line + column + name) reuses the same pseudo-node across two edges', () => {
  const endpoint = {
    kind: 'synthetic' as const,
    name: 'get_db',
    kindLabel: 'function',
    file: 'app/db.py',
    range: { start: { line: 10, column: 0 }, end: { line: 10, column: 5 } },
  };
  const syntheticNodesById = new Map<string, SyntheticNode>();
  const firstId = resolveSyntheticNode(endpoint, { depth: 0 }, syntheticNodesById);
  const secondId = resolveSyntheticNode(endpoint, { depth: 0 }, syntheticNodesById);
  assert.equal(firstId, secondId);
  assert.equal(syntheticNodesById.size, 1, 'a second call with the same key must not create a second pseudo-node');
});

test('two different synthetic endpoints at the same file/line but different columns are kept distinct', () => {
  const base = {
    kind: 'synthetic' as const,
    name: 'x',
    kindLabel: 'function',
    file: 'a.py',
    range: { start: { line: 0, column: 0 }, end: { line: 0, column: 1 } },
  };
  const other = { ...base, range: { ...base.range, start: { line: 0, column: 4 } } };
  const syntheticNodesById = new Map<string, SyntheticNode>();
  const firstId = resolveSyntheticNode(base, { depth: 0 }, syntheticNodesById);
  const secondId = resolveSyntheticNode(other, { depth: 0 }, syntheticNodesById);
  assert.notEqual(firstId, secondId);
  assert.equal(syntheticNodesById.size, 2);
});
