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
// Two checks below, each closing a hole the other leaves open - deny-list alone and allow-list alone were
// both tried and each was defeated:
//
// - The allow-list (this test) pins the five known test-classification rules to the exact approved token.
//   An earlier version of this test was a bare `doesNotMatch(source, /vscode-testing-/)` (deny-list only),
//   which a reviewer defeated by pointing all five rules at `--vscode-charts-green` (or a raw `#73c991`
//   hex) instead - still a "passed"-looking green, still wrong, and the deny-list regex never noticed
//   because that string never appears. Pinning each rule's value closes that hole.
// - But the allow-list only inspects five known selectors. It says nothing about a SIXTH rule someone adds
//   later - e.g. `.node.test .node-name { fill: var(--vscode-testing-iconPassed); }` - reintroducing the
//   banned token under a selector this list doesn't know about. The allow-list would stay green. That is
//   what the deny-list test below still catches, so both stay - one pins known values, the other guards
//   against the token coming back anywhere else in the file.
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

test('never reintroduces the testing pass/fail palette anywhere in the file', () => {
  assert.doesNotMatch(
    source,
    /vscode-testing-/,
    'a testing-palette token (especially one with pass/fail meaning, like testing.iconPassed) reappeared ' +
      'somewhere in graphPanel.ts - the allow-list test above only checks the five selectors it already ' +
      'knows about, so a NEW rule pointing at this token (e.g. on a selector not in that list) would pass ' +
      'that test while still claiming a result Impact Lens never executed.',
  );
});
