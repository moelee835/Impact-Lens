import assert from 'node:assert/strict';
import test from 'node:test';
import {
  calculateFitZoom,
  calculateGraphLayout,
  calculateViewportSurface,
  DEFAULT_GRAPH_LAYOUT,
  shouldRestoreViewport,
} from '../graphLayout';

test('uses the deepest actual node instead of an unused requested depth', () => {
  const layout = calculateGraphLayout([
    { id: 'root', depth: 0 },
    { id: 'caller', depth: 1 },
  ], DEFAULT_GRAPH_LAYOUT);

  assert.equal(layout.maximumDepth, 1);
  assert.equal(
    layout.width,
    (DEFAULT_GRAPH_LAYOUT.paddingX * 2)
      + DEFAULT_GRAPH_LAYOUT.nodeWidth
      + DEFAULT_GRAPH_LAYOUT.columnWidth,
  );
  assert.ok(layout.positions.caller.x < layout.positions.root.x);
});

test('centers shorter columns and includes every card in the layout bounds', () => {
  const layout = calculateGraphLayout([
    { id: 'root', depth: 0 },
    { id: 'first', depth: 1 },
    { id: 'second', depth: 1 },
    { id: 'entry', depth: 2 },
  ], DEFAULT_GRAPH_LAYOUT);
  const halfWidth = DEFAULT_GRAPH_LAYOUT.nodeWidth / 2;
  const halfHeight = DEFAULT_GRAPH_LAYOUT.nodeHeight / 2;

  for (const position of Object.values(layout.positions)) {
    assert.ok(position.x - halfWidth >= 0);
    assert.ok(position.x + halfWidth <= layout.width);
    assert.ok(position.y - halfHeight >= 0);
    assert.ok(position.y + halfHeight <= layout.height);
  }
  assert.equal(layout.positions.root.y, layout.positions.entry.y);
});

test('fits actual graph bounds within zoom limits', () => {
  assert.equal(calculateFitZoom(500, 250, 1000, 600, 24, 0.5, 2.5), (1000 - 48) / 500);
  assert.equal(calculateFitZoom(4000, 2000, 800, 600, 24, 0.5, 2.5), 0.5);
  assert.equal(calculateFitZoom(100, 100, 1200, 800, 24, 0.5, 2.5), 2.5);
});

test('centers a graph surface only on axes smaller than the viewport', () => {
  assert.deepEqual(calculateViewportSurface(400, 200, 1, 1000, 600), {
    width: 1000,
    height: 600,
    offsetX: 300,
    offsetY: 200,
  });
  assert.deepEqual(calculateViewportSurface(1200, 200, 1, 1000, 600), {
    width: 1200,
    height: 600,
    offsetX: 0,
    offsetY: 200,
  });
});

test('restores viewport only for a persisted view of the same root', () => {
  assert.equal(shouldRestoreViewport('root', 'root', 1.2), true);
  assert.equal(shouldRestoreViewport('previous', 'root', 1.2), false);
  assert.equal(shouldRestoreViewport('root', 'root', undefined), false);
});
