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

// M4 milestone closure audit gate 5 (docs/work/task-m4-milestone-closure-audit.md,
// docs/work/task-m4-gate5-test-color.md). Impact Lens does not run tests, and classification is a
// filename-only heuristic (`cli/src/testFile.ts`'s `isTestFilePath()`) - so borrowing the `testing`
// palette's pass/fail-meaning tokens (especially `testing.iconPassed`) for a node whose only evidence is
// its file path asserts a result that was never executed. `direct`/`transitive` already use the neutral
// `charts` palette, not `testing`, for exactly this reason.
//
// This is an allow-list, not a deny-list, on purpose: an earlier version of this test only asserted
// `doesNotMatch(source, /vscode-testing-/)`, which a reviewer defeated by pointing all five rules at
// `--vscode-charts-green` (or a raw `#73c991` hex) instead - still a "passed"-looking green, still wrong,
// and the deny-list regex never noticed because that string never appears. Pinning each rule to the exact
// approved token means ANY substitute - a different color token, a raw hex, a new indirection - fails this
// test and forces whoever changes it to touch the assertion too, the same anti-drift polarity as the
// rollback field-stripping test in pythonFastapiIntegration.test.ts.
test('pins the five test-classification style rules to the approved neutral token', () => {
  const approved = 'var(--vscode-charts-orange, #ea5c00)';
  const rules = [
    { name: '.edge-test (stroke)', pattern: /\.edge-test\s*\{\s*stroke:\s*([^;]+);/ },
    { name: '.node.test rect (stroke)', pattern: /\.node\.test rect\s*\{\s*stroke:\s*([^;]+);\s*\}/ },
    {
      name: '.node.test .relation-marker (fill)',
      pattern: /\.node\.test \.relation-marker\s*\{\s*fill:\s*([^;]+);\s*\}/,
    },
    {
      name: '.node.test .node-relation (fill)',
      pattern: /\.node\.test \.node-relation\s*\{\s*fill:\s*([^;]+);\s*\}/,
    },
    { name: '.legend .test::before (background)', pattern: /\.legend \.test::before\s*\{\s*background:\s*([^;]+);\s*\}/ },
  ];
  for (const { name, pattern } of rules) {
    const match = pattern.exec(source);
    assert.ok(match, `expected to find a ${name} rule in graphPanel.ts`);
    assert.equal(
      match[1].trim(),
      approved,
      `${name} must use the approved neutral token ${approved} - Impact Lens does not run tests and ` +
        'classifies "test" purely by file name (isTestFilePath()), so ANY color that reads as a pass/fail ' +
        'signal (the old testing.iconPassed green, or a substitute green like charts-green or #73c991) ' +
        'would claim a result that was never executed.',
    );
  }
});
