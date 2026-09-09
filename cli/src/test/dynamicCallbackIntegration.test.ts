import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import * as path from 'node:path';
import test from 'node:test';

// IL-LIM-001 stage 3 (docs/work/task-il-lim-001-stage3-callback-adapter-design.md) - the second
// dynamic-dispatch adapter (`dynamic-callback-static-v1`), TypeScript/JavaScript's entry. Same harness
// shape as pythonFastapiIntegration.test.ts: the real CLI binary, spawned against a real fixture
// workspace, resolved through the shipped catalog's default (`bundled-typescript`) with no explicit
// provider configuration - a real user's zero-config default.
//
// ACCURACY CORPUS COUNTING RULE - CORRECTED (commander's finding, `[실행]` grep-confirmed: the rule
// this comment used to state - "every test asserting `augmentedEdges.length` as exactly 0 or 1" -
// matched ZERO actual assertions below, a comment claiming something the code never did, the exact
// failure shape this milestone has repeatedly caught elsewhere, this time in the rule written down
// specifically to prevent drift. The individual `find()`/`!includes()` assertions this file had were
// also weaker than the rule implied: a positive test's `find()` passes even if five unrelated false
// positives are also present, and a negative test's `!includes(name)` only checks ONE name, not that
// nothing else leaked in either. Neither shape can support a precision claim, which is the entire
// point of an accuracy corpus.
//
// Fixed rule: because every fixture lives in ONE shared workspace (a single `handler` query sees all
// of them at once - `pythonFastapiIntegration.test.ts`'s own multi-fixture tests share a call the same
// way), the corpus's actual backbone is the ONE test below that asserts the COMPLETE, sorted set of
// `augmentedEdges` source names with `assert.deepEqual` - stronger than any per-fixture `.length`
// assertion would have been, since it simultaneously proves every positive fixture DOES produce a
// candidate, every negative fixture does NOT, and nothing else (a cross-contaminating false positive
// from any fixture) is hiding in between. That one assertion covers all 11 fixtures at once. The
// per-scenario tests after it are not re-proving presence/absence (already closed by the set
// assertion) - they exist to pin per-candidate detail (`reasonCode`, `adapterId`) and to give a
// regression a specific, readable failure message instead of only a diff against the full set.
const EXPECTED_CANDIDATE_SOURCES = ['forEachCaller', 'listenerCaller', 'timeoutCaller'];

const executable = path.resolve(__dirname, '..', 'index.js');
const workspace = path.resolve(__dirname, '..', '..', 'src', 'test', 'fixtures', 'typescript-dynamic-callback');

interface AugmentedEdge {
  readonly source: { readonly kind: string; readonly name?: string };
  readonly target: { readonly kind: string; readonly id?: string };
  readonly adapterId: string;
  readonly evidenceSource: string;
  readonly resolution: string;
  readonly reasonCode: string;
}

interface AnalyzeResponse {
  readonly ok: boolean;
  readonly data: {
    readonly nodes: ReadonlyArray<{ readonly id: string; readonly name: string }>;
    readonly augmentedEdges: readonly AugmentedEdge[];
  };
}

function analyzeHandler(): AnalyzeResponse {
  const result = spawnSync(process.execPath, [executable, 'analyze', '--stdin'], {
    encoding: 'utf8',
    timeout: 25000,
    input: JSON.stringify({
      workspace, file: 'handler.ts', line: 1, column: 17, depth: 5, maxNodes: 50,
      augmentationEnabled: true,
    }),
  });
  assert.equal(result.status, 0, result.stderr);
  return JSON.parse(result.stdout);
}

// One shared call: every fixture file lives in the same workspace, so the adapter sees all of them on
// every query - this is the same "call once, exercise the whole corpus, assert per-scenario" shape
// pythonFastapiIntegration.test.ts's own multi-fixture tests use, not a repeated CLI invocation per
// scenario (each spawn is a full TypeScript language server startup).
const response = analyzeHandler();

test('the static graph still finds the direct caller unaugmented (baseline, not part of the accuracy corpus)', () => {
  assert.ok(response.data.nodes.some(node => node.name === 'directCaller'));
});

function sourceNames(): readonly string[] {
  return response.data.augmentedEdges.map(edge => edge.source.name ?? '');
}

function candidateFor(name: string): AugmentedEdge {
  const edge = response.data.augmentedEdges.find(candidate => candidate.source.name === name);
  assert.ok(edge, `expected ${name} among ${JSON.stringify(sourceNames())}`);
  return edge!;
}

// THE accuracy corpus test - see the file's own top comment for why this one assertion, not a
// per-fixture `.length` check, is what actually proves precision across all 11 fixtures at once: the
// 3 positives are present, the 8 negatives are absent, AND no twelfth, unexpected candidate (a
// cross-contaminating false positive from any fixture) is hiding in the set either - a `.find()`-based
// positive check or a single-name `!includes()` negative check could each pass even if that happened.
test('augmentedEdges contains exactly the 3 expected candidates and nothing else - the accuracy corpus in one assertion', () => {
  assert.deepEqual([...sourceNames()].sort(), [...EXPECTED_CANDIDATE_SOURCES].sort());
});

test('setTimeout(handler, 0): reasonCode callback-registration, adapterId dynamic-callback-static-v1, evidenceSource static-inference', () => {
  const edge = candidateFor('timeoutCaller');
  assert.equal(edge.reasonCode, 'callback-registration');
  assert.equal(edge.adapterId, 'dynamic-callback-static-v1');
  assert.equal(edge.evidenceSource, 'static-inference');
});

test('arr.forEach(handler): reasonCode callback-registration', () => {
  assert.equal(candidateFor('forEachCaller').reasonCode, 'callback-registration');
});

test("button.addEventListener('click', handler): reasonCode event-subscription", () => {
  assert.equal(candidateFor('listenerCaller').reasonCode, 'event-subscription');
});

// The 8 negative fixtures below are already proven absent by the set-equality test above - a
// `!sourceNames().includes(name)` assertion here is strictly implied by it, never able to catch
// anything that test would not. Kept as their own named tests anyway, each with its fixture file and
// its own reason in the title, purely so a regression on ONE specific scenario fails with a readable,
// specific message instead of only a diff against the full expected set.
test('register(handler) with a workspace-defined register, registerCallback.ts: not in the allowlist', () => {
  assert.ok(!sourceNames().includes('registerCaller'));
});

test('arr.push(handler), pushCallback.ts: push resolves to the same trusted lib.es5.d.ts as forEach, but its argument is data, not a callback slot - the allowlist, not callee resolution, excludes it', () => {
  assert.ok(!sourceNames().includes('pushCaller'));
});

test('setTimeout(handler, 0) with a LOCAL same-named handler, shadowedTimeoutCallback.ts: axis 2 (handler identity) rejects the shadow', () => {
  assert.ok(!sourceNames().includes('shadowedTimeoutCaller'));
});

test('setTimeout(handler, 0) with a workspace function shadowing the global name, fakeSetTimeoutCallback.ts: axis 1 (callee trust) rejects the shadow', () => {
  assert.ok(!sourceNames().includes('fakeTimeoutCaller'));
});

test('button.onclick = handler, onclickAssignment.ts: capability absence - property assignment targets are not prepareCallHierarchy-eligible at all', () => {
  assert.ok(!sourceNames().includes('assignOnclick'));
});

test("emitter.on('x', handler), subscribeToEmitter.ts: capability absence - EventEmitter.on does not resolve via prepare() the way addEventListener does (unexplored why, not needed for v1)", () => {
  assert.ok(!sourceNames().includes('subscribe'));
});

test("emitter.emit('x'), fireEmitter.ts: capability absence - the receiver is a variable, prepareCallHierarchy is callable-only", () => {
  assert.ok(!sourceNames().includes('fire'));
});

test('setTimeout(handler, 0) inside a function whose preceding sibling nested function contains a string with an unbalanced brace, ambiguousBraceInString.ts: reviewer-found false-attribution risk, now folded to no candidate rather than misattributed to the wrong (already-closed) enclosing function', () => {
  assert.ok(!sourceNames().includes('outerCaller'));
  // Also pin the specific wrong answer this used to produce, not just the right one's absence - a
  // regression that started misattributing to some OTHER name would still pass the line above.
  assert.ok(!sourceNames().includes('inner'));
});
