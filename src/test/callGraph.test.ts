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
});
