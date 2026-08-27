import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import test from 'node:test';

// The graph panel builds its HTML as a template string, so nothing in it can be imported and called from a
// plain node test. These checks read the source instead. They exist because both defects they guard
// against were invisible: a state class with no stylesheet rule renders in the default colour and looks
// settled, and a second copy of a label function is only noticed when the two copies disagree.
const source = fs.readFileSync(
  path.resolve(__dirname, '..', '..', 'src', 'graphPanel.ts'),
  'utf8',
);

test('styles every analysis state the pill can carry', () => {
  // `current` is intentionally absent: it is the default appearance. The other four have to be visibly
  // different from it, and `partial` is the one that was missing.
  for (const state of ['stale', 'analyzing', 'partial', 'failed']) {
    assert.ok(
      new RegExp(`\\.state\\.${state}\\b`).test(source),
      `the stylesheet needs a .state.${state} rule`,
    );
  }
});

test('leaves the state label to the Extension', () => {
  assert.doesNotMatch(source, /function stateLabel\s*\(/);
  assert.match(source, /state\.textContent = graph\.state\.label/);
});

test('sends the whole coverage record to the webview', () => {
  // The flattened `coverage: { traversal: string, semantic: string, indexing: string }` payload dropped
  // advertised, observed, lifecycle and the reason codes before they reached the panel.
  assert.match(source, /coverage: result\.coverage,/);
  for (const field of ['advertised', 'observed', 'lifecycle', 'reasons']) {
    assert.ok(source.includes(field), `the payload should carry ${field}`);
  }
});
