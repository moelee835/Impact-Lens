import assert from 'node:assert/strict';
import test from 'node:test';
import { traverseIncoming } from '../callGraph';

test('traverses callers breadth-first and records caller-to-callee edges', async () => {
  const graph: Record<string, string[]> = {
    target: ['directA', 'directB'],
    directA: ['entry'],
    directB: ['entry'],
    entry: [],
  };

  const result = await traverseIncoming(
    'target',
    {
      key: value => value,
      incoming: async value => graph[value] ?? [],
    },
    2,
    20,
  );

  assert.deepEqual(
    result.entries.map(entry => [entry.value, entry.depth]),
    [
      ['target', 0],
      ['directA', 1],
      ['directB', 1],
      ['entry', 2],
    ],
  );
  assert.ok(result.edges.some(edge => edge.source === 'entry' && edge.target === 'directA'));
  assert.ok(result.edges.some(edge => edge.source === 'entry' && edge.target === 'directB'));
});

test('honors node limits without looping through cycles', async () => {
  const graph: Record<string, string[]> = { a: ['b'], b: ['a', 'c'], c: [] };
  const result = await traverseIncoming(
    'a',
    { key: value => value, incoming: async value => graph[value] ?? [] },
    5,
    2,
  );

  assert.equal(result.entries.length, 2);
  assert.equal(result.truncated, true);
  assert.deepEqual(result.limits, ['nodes']);
  const nodeIds = new Set(result.entries.map(entry => entry.value));
  assert.equal(result.edges.every(edge => nodeIds.has(edge.source) && nodeIds.has(edge.target)), true);
});

test('distinguishes a depth limit from a naturally completed traversal', async () => {
  const graph: Record<string, string[]> = { root: ['one'], one: ['two'], two: [] };
  const limited = await traverseIncoming(
    'root',
    { key: value => value, incoming: async value => graph[value] ?? [] },
    1,
    20,
  );
  const complete = await traverseIncoming(
    'root',
    { key: value => value, incoming: async value => graph[value] ?? [] },
    5,
    20,
  );

  assert.equal(limited.reachedDepth, 1);
  assert.deepEqual(limited.limits, ['depth']);
  assert.equal(complete.reachedDepth, 2);
  assert.deepEqual(complete.limits, []);
});

test('keeps cross-file nodes with the same display name distinct', async () => {
  interface Node { readonly path: string; readonly name: string }
  const root: Node = { path: 'service.py', name: 'target' };
  const first: Node = { path: 'routes/a.py', name: 'handler' };
  const second: Node = { path: 'routes/b.py', name: 'handler' };
  const result = await traverseIncoming(
    root,
    {
      key: value => `${value.path}#${value.name}`,
      incoming: async value => value === root ? [first, second] : [],
    },
    5,
    20,
  );

  assert.equal(result.entries.length, 3);
  assert.deepEqual(result.entries.map(entry => entry.value.path), [
    'service.py',
    'routes/a.py',
    'routes/b.py',
  ]);
});

test('supports analysis depths greater than five', async () => {
  const graph: Record<string, string[]> = {};
  for (let depth = 0; depth < 8; depth += 1) {
    graph[String(depth)] = [String(depth + 1)];
  }
  graph['8'] = [];

  const result = await traverseIncoming(
    '0',
    { key: value => value, incoming: async value => graph[value] ?? [] },
    10,
    20,
  );

  assert.equal(result.reachedDepth, 8);
  assert.equal(result.entries.length, 9);
  assert.deepEqual(result.limits, []);
});
