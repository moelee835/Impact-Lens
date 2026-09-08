import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import test from 'node:test';

// M4 gate 2 UI lane (docs/work/task-m4-gate2-shared-adapter.md). graphPanel.ts does `import * as vscode
// from 'vscode'` at its top - nothing in it, including toPayload()/getHtml(), can be required() from a
// plain `node --test` process, the same constraint adapterProviderShim.ts documents for itself. These
// checks read the SOURCE instead, matching graphPanel.test.ts's own established pattern (its own comment:
// "nothing in it can be imported and called from a plain node test").
//
// What this file does NOT prove (recorded, not silently skipped): that a real analysis with augmentation
// on actually renders identically to one with it off, byte-for-byte, in a live VS Code webview - that
// would need a real vscode-host harness this repository does not have, the same gap
// adapterItemConversion.test.ts's own equivalence test already names for a different function. The
// "off/on rollback" test below is a SOURCE-STRUCTURE check (toPayload()'s augmentedEdges/limitations
// fields are simple pass-throughs nothing else in the function reads), not an executed before/after
// comparison - the CLI's own rollback test (pythonFastapiIntegration.test.ts) could run both sides for
// real because it never needed vscode; this one cannot.
const source = fs.readFileSync(
  path.resolve(__dirname, '..', '..', 'src', 'graphPanel.ts'),
  'utf8',
);

test('toPayload() only ever assigns augmentedEdges/limitations as plain pass-throughs, nothing else in the function reads them', () => {
  const functionBody = extractFunctionBody(source, 'function toPayload');
  assert.match(functionBody, /augmentedEdges:\s*result\.augmentedEdges,/, 'expected a plain pass-through, not a computed/conditional value');
  assert.match(functionBody, /limitations:\s*result\.limitations,/, 'expected a plain pass-through, not a computed/conditional value');
  // Each pass-through line above legitimately contains the field name twice (the key and the
  // `result.<field>` read) - remove exactly those two lines, then the word must not appear anywhere else
  // in the function, which is the actual "nothing else reads or branches on it" property this test exists
  // to pin.
  const withoutPassThroughs = functionBody
    .replace(/augmentedEdges:\s*result\.augmentedEdges,/, '')
    .replace(/limitations:\s*result\.limitations,/, '');
  assert.doesNotMatch(
    withoutPassThroughs, /augmentedEdges/,
    'a second "augmentedEdges" reference exists in toPayload() beyond the pass-through assignment - ' +
    'something else in this function now reads or branches on it, which would make the "augmentation ' +
    `only adds these two fields, nothing else changes" claim untested: ${JSON.stringify(functionBody)}`,
  );
  assert.doesNotMatch(
    withoutPassThroughs, /limitations/,
    'a second "limitations" reference exists in toPayload() beyond the pass-through assignment - ' +
    'something else in this function now reads or branches on it',
  );
});

function extractFunctionBody(text: string, signature: string): string {
  const start = text.indexOf(signature);
  assert.ok(start >= 0, `expected to find "${signature}" in graphPanel.ts`);
  const braceStart = text.indexOf('{', start);
  let depth = 0;
  for (let index = braceStart; index < text.length; index += 1) {
    if (text[index] === '{') depth += 1;
    if (text[index] === '}') {
      depth -= 1;
      if (depth === 0) return text.slice(braceStart, index + 1);
    }
  }
  throw new Error(`unterminated function body for "${signature}"`);
}

// ---------------------------------------------------------------------------
// Word-literal drift guard (commander's finding). scripts/lib/response-policy-engine.mjs's own
// CANDIDATE_CALLER_PHRASE is exported specifically so response-policy-doc-invariants.mjs can import the
// exact same string instead of holding a separate literal - graphPanel.ts's client script cannot import
// it directly (a plain .mjs script, a different module system from this file's compiled CommonJS output),
// so this is graphPanel.test.ts's own established "read the other file as text" pattern applied to close
// what would otherwise be a third, comment-only-linked copy.
// ---------------------------------------------------------------------------

test('CANDIDATE_LABEL_TEXT matches the first word of response-policy-engine.mjs\'s own CANDIDATE_CALLER_PHRASE', () => {
  const engineSource = fs.readFileSync(
    path.resolve(__dirname, '..', '..', 'scripts', 'lib', 'response-policy-engine.mjs'),
    'utf8',
  );
  const match = /export const CANDIDATE_CALLER_PHRASE = '([^']+)';/.exec(engineSource);
  assert.ok(match, 'expected to find CANDIDATE_CALLER_PHRASE in response-policy-engine.mjs');
  const firstWord = match![1].split(' ')[0];
  const graphPanelMatch = /var CANDIDATE_LABEL_TEXT = '([^']+)';/.exec(source);
  assert.ok(graphPanelMatch, 'expected to find CANDIDATE_LABEL_TEXT in graphPanel.ts');
  assert.equal(
    graphPanelMatch![1],
    match![1],
    `graphPanel.ts's CANDIDATE_LABEL_TEXT ('${graphPanelMatch![1]}') must equal response-policy-engine.mjs's ` +
    `CANDIDATE_CALLER_PHRASE ('${match![1]}') - otherwise the CLI response, its own doc-invariant, and this ` +
    'UI would use three different words for the same concept with nothing to catch a future edit to only one of them',
  );
  assert.equal(firstWord, 'candidate', 'sanity check on the assumption this test is built on - if this ever fails, CANDIDATE_CALLER_PHRASE itself changed shape and the comparison above needs rethinking, not just re-pinning');
});

// ---------------------------------------------------------------------------
// Candidate styling dual-polarity (PR #82's own lesson, reused here per commander's request): an
// allow-list alone can be defeated by pointing every candidate rule at a DIFFERENT wrong value the
// allow-list never checks; a deny-list alone can be defeated by using a value the deny-list's pattern does
// not happen to match. Both together close what either alone leaves open - the exact reasoning
// graphPanel.test.ts's own gate-5 tests already document and this reuses verbatim, not a new invention.
// ---------------------------------------------------------------------------

test('candidate edge styling never claims a verdict color and never reuses stroke-dasharray', () => {
  const edgeCandidateRule = /\.edge\.edge-candidate\s*\{([^}]*)\}/.exec(source);
  assert.ok(edgeCandidateRule, 'expected an .edge.edge-candidate rule');
  assert.doesNotMatch(
    edgeCandidateRule![1],
    /stroke-dasharray/,
    '.edge.edge-candidate must not use stroke-dasharray - already three meanings in this file ' +
    '(.edge-test, .node.related, .state.partial); a fourth would make dashing ambiguous, not a candidate signal',
  );
  assert.doesNotMatch(
    edgeCandidateRule![1],
    /stroke:/,
    '.edge.edge-candidate must not override stroke (color) - a candidate relationship must read as a ' +
    'difference in evidence strength, never as a fourth colored relation kind alongside direct/transitive/test',
  );
});

test('never reintroduces the testing pass/fail palette on any of the new candidate rules', () => {
  const candidateSection = source.slice(
    source.indexOf('.edge.edge-candidate'),
    source.indexOf('</style>'),
  );
  assert.doesNotMatch(
    candidateSection,
    /vscode-testing-/,
    'a testing-palette token (pass/fail meaning) appeared somewhere between the first candidate rule and ' +
    'the end of the stylesheet - Impact Lens does not run tests, and a candidate caller is a static-analysis ' +
    'inference, not an executed result either',
  );
});
