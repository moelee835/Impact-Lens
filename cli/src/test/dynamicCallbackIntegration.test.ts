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
// from any fixture) is hiding in between. That one assertion covers all 14 fixtures at once. The
// per-scenario tests after it are not re-proving presence/absence (already closed by the set
// assertion) - they exist to pin per-candidate detail (`reasonCode`, `adapterId`) and to give a
// regression a specific, readable failure message instead of only a diff against the full set.
const EXPECTED_CANDIDATE_SOURCES = ['forEachCaller', 'listenerCaller', 'outerCaller', 'timeoutCaller'];

// M4 gate 7 real-code measurement (docs/work/task-m4-gate7-budget-and-real-code-measurement.md, "the
// arrow channel" - commander's finding after PR #99's method-opener fix): an inline arrow argument
// (`(x) => { ... }`) is caught by neither `ENCLOSING_FUNCTION_PATTERNS` nor the new
// `UNRECOGNIZED_FUNCTION_LIKE_LINE_OPENER` fold (it has no leading identifier the way a named
// method does), so the scan walks through it and attributes to the outer named function - correctly
// for a synchronous higher-order traversal (`syncTraversalArrowWrapping.ts`'s `syncOuterCaller`, since
// `forEach`'s callback runs during the outer call's own execution), wrongly for a deferred registration
// (`deferredArrowWrapping.ts`'s `deferredOuterCaller`, the same wrong-answer shape PR #99 fixed for
// `createAdapterProvider`). NEITHER is in `EXPECTED_CANDIDATE_SOURCES` above (per commander: not part
// of the precision corpus, the same reason gate 4 kept its own accepted residual out of that
// milestone's corpus) - both are pinned separately below as CURRENT behavior, not endorsed-correct
// behavior, so a future change to this channel is caught either way it goes.
const KNOWN_ACCEPTED_RESIDUAL_SOURCES = ['syncOuterCaller', 'deferredOuterCaller'];

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
// per-fixture `.length` check, is what actually proves precision across all 16 fixtures at once: the
// 4 positives are present, the 10 negatives are absent, AND no fifteenth, unexpected candidate (a
// cross-contaminating false positive from any fixture) is hiding in the set either - a `.find()`-based
// positive check or a single-name `!includes()` negative check could each pass even if that happened.
// `KNOWN_ACCEPTED_RESIDUAL_SOURCES` is filtered out here on purpose (see its own comment) - it is real,
// current, non-empty adapter output, but deliberately not asserted as correct by this corpus; the
// dedicated tests just below pin its presence separately so a change to it is still caught.
test('augmentedEdges contains exactly the 4 expected candidates and nothing else - the accuracy corpus in one assertion', () => {
  const withoutKnownResidual = sourceNames().filter(name => !KNOWN_ACCEPTED_RESIDUAL_SOURCES.includes(name));
  assert.deepEqual([...withoutKnownResidual].sort(), [...EXPECTED_CANDIDATE_SOURCES].sort());
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

// The 10 negative fixtures below are already proven absent by the set-equality test above - a
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

// ambiguousBraceInString.ts: reviewer originally reproduced this as a false-attribution risk against
// the first (all-or-nothing abort) guard - `outerCaller` (the true enclosing function) was
// mis-attributed to `inner` (an already-closed nested function containing a string with an unbalanced
// brace). commander then measured that abort guard's real recall cost across this repo's own two
// source trees (roughly half of otherwise-resolvable call sites lost) and it was replaced with
// `stripSameLineCommentsAndStrings()`, which handles this exact shape correctly instead of aborting -
// the brace inside the string is blanked out before counting, so the depth count never gets thrown off
// in the first place. This fixture now pins the CORRECT resolution, not an abort: `outerCaller` is a
// real positive, `inner` must never appear (a regression back to the old mis-attribution, or a new one
// pointing somewhere else, both fail this).
test('setTimeout(handler, 0) inside a function whose preceding sibling nested function contains a string with an unbalanced brace, ambiguousBraceInString.ts: correctly attributed to the true enclosing function', () => {
  assert.equal(candidateFor('outerCaller').reasonCode, 'callback-registration');
  assert.ok(!sourceNames().includes('inner'));
});

// regexBraceTrap.ts: commander found the same false-attribution shape reviewer found for strings, on a
// THIRD channel - a regex literal (`/\{/`, `/[{]/`). stripSameLineCommentsAndStrings() strips
// `//`/`/* */`/quotes/simple backticks but never recognized `/.../ ` as a regex literal at all, so a
// brace inside one was still counted as real structure - mis-attributing to `regexInner` (an
// already-closed nested function) instead of the true enclosing `regexOuterCaller`, reproduced directly
// before the fix. Distinguishing a real regex literal from a division expression needs surrounding
// expression context this single-line scanner does not have, so the fix does not try: any `/`
// surviving after comment/string stripping, on a line that also has a brace, makes the line unsafe -
// this fixture folds to NO candidate (a missed positive, not a wrong one), unlike
// ambiguousBraceInString.ts which the string-stripping fix resolves correctly. Both `regexOuterCaller`
// and `regexInner` must be absent - checking only one would miss a regression that recovers the right
// answer for the wrong reason, or a new one that mis-attributes elsewhere.
test('setTimeout(handler, 0) inside a function whose preceding sibling nested function contains a regex literal with an unbalanced brace, regexBraceTrap.ts: folds to no candidate rather than misattributing to the wrong (already-closed) enclosing function', () => {
  assert.ok(!sourceNames().includes('regexOuterCaller'));
  assert.ok(!sourceNames().includes('regexInner'));
});

// objectLiteralMethodCallback.ts / classMethodCallback.ts: M4 gate 7 real-code measurement
// (docs/work/task-m4-gate7-budget-and-real-code-measurement.md) - reproduces a real mis-attribution
// found in this repo's own adapterProviderShim.ts, not a synthetic case. An object-literal method
// shorthand (`run(): void { ... }`) and a class method are neither one of `ENCLOSING_FUNCTION_PATTERNS`;
// before the fix, the backward scan for the object-literal case skipped straight past the unrecognized
// `run` method and landed on the outer FACTORY function `outerFactoryNeverCallsHandlerDirectly`, which
// never itself calls `handler` - a confidently wrong candidate, reproduced directly before this fixture
// existed. The class-method case was already a false negative (the outer name doesn't even match a
// pattern), but pinning it here guards against a future change accidentally turning it into the same
// kind of mis-attribution. Both wrong outer names, and the never-matched method names themselves, must
// be absent - checking only one leaves the other regression undetected.
test('setTimeout(handler, 0) inside an object-literal method shorthand returned by a factory function, objectLiteralMethodCallback.ts: folds to no candidate rather than misattributing to the outer factory that never itself calls handler', () => {
  assert.ok(!sourceNames().includes('outerFactoryNeverCallsHandlerDirectly'));
  assert.ok(!sourceNames().includes('run'));
});

test('setTimeout(handler, 0) inside a class method, classMethodCallback.ts: folds to no candidate rather than misattributing to any outer scope', () => {
  assert.ok(!sourceNames().includes('NeverCallsHandlerDirectly'));
  assert.ok(!sourceNames().includes('run'));
});

// KNOWN, ACCEPTED RESIDUAL - the "arrow channel" (see KNOWN_ACCEPTED_RESIDUAL_SOURCES's own comment).
// Measured against this repo's own real code (commander, script-based count replicating
// findCallSitesInLine's bare-identifier-argument requirement exactly): of 31 real allowlist call sites
// in src/ and cli/src/, 3 currently cross an unrecognized inline-arrow scope (all three
// `setTimeout(finish, budgetMs)` inside a `new Promise(resolve => { ... })` executor) - none of the
// three actually mis-attribute today, because the class method further out is ALSO unrecognized and
// PR #99's fold catches it first. These two fixtures exist to pin the channel's behavior in the shapes
// that DO reach an outer name, not because this repo's own code currently exercises them.
test('setTimeout(handler, 0) inside an inline arrow passed to a synchronous higher-order call, syncTraversalArrowWrapping.ts: currently attributes to the outer function - defensible, since the arrow runs during the outer call\'s own synchronous execution', () => {
  assert.equal(candidateFor('syncOuterCaller').reasonCode, 'callback-registration');
});

test('setTimeout(handler, 0) inside an inline arrow passed to a deferred registration (.then()), deferredArrowWrapping.ts: currently attributes to the outer function - NOT defensible, the same wrong-answer shape PR #99 fixed for createAdapterProvider, left open (unmeasured recall cost to close via the same fold this PR uses)', () => {
  assert.equal(candidateFor('deferredOuterCaller').reasonCode, 'callback-registration');
});
