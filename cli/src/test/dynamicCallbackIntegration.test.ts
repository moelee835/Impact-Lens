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
// ACCURACY CORPUS COUNTING RULE (declared in the design doc BEFORE any fixture existed, applied
// mechanically here - the same discipline pythonFastapiIntegration.test.ts's denominator needed only
// after drifting five times): every test below asserting `augmentedEdges.length` as exactly 0 or 1 as
// its PRIMARY check counts toward the corpus. None here are budget/latency-focused or named with
// "known false negative"/"accepted residual", so all of them count. Positive: 3 (timeout, forEach,
// addEventListener). Negative: 7 (register - not in allowlist; push - not in allowlist, same trust
// tier as forEach; shadowed handler; shadowed callee; onclick property assignment - capability
// absence; EventEmitter subscribe - capability absence; EventEmitter emit - capability absence).

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

test('setTimeout(handler, 0): candidate edge with reasonCode callback-registration', () => {
  const edge = response.data.augmentedEdges.find(candidate => candidate.source.name === 'timeoutCaller');
  assert.ok(edge, `expected timeoutCaller among ${JSON.stringify(sourceNames())}`);
  assert.equal(edge!.reasonCode, 'callback-registration');
  assert.equal(edge!.adapterId, 'dynamic-callback-static-v1');
  assert.equal(edge!.evidenceSource, 'static-inference');
});

test('arr.forEach(handler): candidate edge with reasonCode callback-registration', () => {
  const edge = response.data.augmentedEdges.find(candidate => candidate.source.name === 'forEachCaller');
  assert.ok(edge, `expected forEachCaller among ${JSON.stringify(sourceNames())}`);
  assert.equal(edge!.reasonCode, 'callback-registration');
});

test("button.addEventListener('click', handler): candidate edge with reasonCode event-subscription", () => {
  const edge = response.data.augmentedEdges.find(candidate => candidate.source.name === 'listenerCaller');
  assert.ok(edge, `expected listenerCaller among ${JSON.stringify(sourceNames())}`);
  assert.equal(edge!.reasonCode, 'event-subscription');
});

test('register(handler) with a workspace-defined register: no candidate edge (not in the allowlist)', () => {
  assert.ok(!sourceNames().includes('registerCaller'));
});

test('arr.push(handler): no candidate edge (push resolves to the same trusted lib.es5.d.ts as forEach, but its argument is data, not a callback slot, and the allowlist - not callee resolution - is what excludes it)', () => {
  assert.ok(!sourceNames().includes('pushCaller'));
});

test('setTimeout(handler, 0) where handler is a same-named LOCAL function, not the target: no candidate edge (axis 2, handler identity, rejects the shadow)', () => {
  assert.ok(!sourceNames().includes('shadowedTimeoutCaller'));
});

test('setTimeout(handler, 0) where setTimeout is a workspace function shadowing the global name: no candidate edge (axis 1, callee trust, rejects the shadow)', () => {
  assert.ok(!sourceNames().includes('fakeTimeoutCaller'));
});

test('button.onclick = handler: no candidate edge (capability absence - property assignment targets are not prepareCallHierarchy-eligible at all)', () => {
  assert.ok(!sourceNames().includes('assignOnclick'));
});

test("emitter.on('x', handler): no candidate edge (capability absence - EventEmitter.on does not resolve via prepare() the way addEventListener does, unexplored, not needed for v1)", () => {
  assert.ok(!sourceNames().includes('subscribe'));
});

test("emitter.emit('x') calling back to the handler registered via .on(): no candidate edge (capability absence - the receiver is a variable, prepareCallHierarchy is callable-only)", () => {
  assert.ok(!sourceNames().includes('fire'));
});
