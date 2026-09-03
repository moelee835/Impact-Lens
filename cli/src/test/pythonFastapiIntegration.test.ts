import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import * as path from 'node:path';
import test from 'node:test';

// IL-LIM-006 (docs/work/task-m2-fastapi-e2e.md). Unconditional - no skip gate, no external dependency to
// install: `bundled-pyright` is a pinned CLI dependency (cli/package.json), and stage 1/1.5's measurement
// found that whether the real `fastapi` package is installed makes no difference to any of the three
// observations below - pyright's Call Hierarchy operates syntactically (finds call expressions), so an
// unresolved `fastapi` import does not change whether `Depends()`/route-decorated functions are found as
// "called". This was verified twice, not assumed: once with `settings.python.pythonPath` pointed at a
// Python confirmed fastapi-free (`ModuleNotFoundError` reproduced directly), and once with `settings`
// removed entirely (a real user's zero-config default, since `bundled-pyright` does not auto-detect a
// venv). CI therefore needs no Python venv, no pip install, and no `pythonPath` injection - which also
// means the Windows `Scripts\python.exe` vs. POSIX `bin/python` path-format split that tripped up
// clangd's CI never becomes a risk here. See the work document for the full measurement, including the
// diagnostics-timing check that ruled out a "the probe just didn't wait long enough" artifact before
// trusting this conclusion.
//
// The fixture is real FastAPI source (cli/src/test/fixtures/python-fastapi/app.py, pinned against real
// fastapi==0.128.8 during stage 1's measurement, never checked in), analyzed in place - no temp copy is
// needed because pyright never writes into the analyzed workspace. Observed locally (not asserted here,
// since CI timing could differ): even with no `fastapi` importable anywhere on this machine's default
// Python, the CLI's normal query latency never surfaces a `reportMissingImports` diagnostic on these
// three nodes - pyright's diagnostic publish arrives well after the query's own response. This test does
// not assert on `diagnostics` for that reason, so it will not break if a CI environment's timing differs
// and one does appear.

const executable = path.resolve(__dirname, '..', 'index.js');
// Not `path.resolve(__dirname, 'fixtures', ...)`: `app.py` is a real source file, not something `tsc`
// compiles or copies into `dist/`, so it only exists under `src/` - the same reason
// `buildInvocation.sources.test.ts` reaches back into `src` to scan real `.ts` sources instead of `dist`.
const workspace = path.resolve(__dirname, '..', '..', 'src', 'test', 'fixtures', 'python-fastapi');

interface AugmentedEndpoint {
  readonly kind: 'existing' | 'synthetic';
  readonly id?: string;
  readonly name?: string;
}

interface AugmentedEdge {
  readonly source: AugmentedEndpoint;
  readonly target: AugmentedEndpoint;
  readonly adapterId: string;
  readonly evidenceSource: string;
  readonly resolution: string;
  readonly reasonCode: string;
}

interface AnalyzeResponse {
  readonly ok: boolean;
  readonly data: {
    readonly provider: { readonly selectedBy: string };
    readonly nodes: ReadonlyArray<{ readonly id: string; readonly name: string }>;
    readonly edges: ReadonlyArray<unknown>;
    readonly augmentedEdges: readonly AugmentedEdge[];
    readonly limitationDetails: ReadonlyArray<{ readonly code: string }>;
    readonly coverage: { readonly semantic: { readonly status: string } };
    readonly completion: { readonly semanticScope: string };
  };
}

function analyze(line: number, column: number, augmentationEnabled = false): AnalyzeResponse {
  return analyzeFile('app.py', line, column, augmentationEnabled);
}

function analyzeFile(file: string, line: number, column: number, augmentationEnabled = false): AnalyzeResponse {
  const result = spawnSync(process.execPath, [executable, 'analyze', '--stdin'], {
    encoding: 'utf8',
    timeout: 25000,
    input: JSON.stringify({ workspace, file, line, column, depth: 5, maxNodes: 50, augmentationEnabled }),
  });
  assert.equal(result.status, 0, result.stderr);
  return JSON.parse(result.stdout);
}

function limitationCodes(response: AnalyzeResponse): readonly string[] {
  return response.data.limitationDetails.map(detail => detail.code);
}

// The positive control: proves the pipeline (auto-discovery -> real pyright -> Call Hierarchy) actually
// finds a real caller on THIS SAME fixture, in the same test run as the two "not found" cases below.
// Without it, an empty result from a totally broken pipeline could look identical to a correctly-reported
// framework-invisible call - the two "not found" assertions only mean something because this one proves
// the machinery works when a caller genuinely exists.
test('FastAPI fixture, ordinary call: normal_helper is found via regular_caller (control case)', { timeout: 25000 }, () => {
  const response = analyze(20, 5); // `def normal_helper` in app.py
  assert.equal(response.ok, true);
  assert.equal(response.data.provider.selectedBy, 'bundled');
  const callerNames = response.data.nodes.map(node => node.name);
  assert.ok(callerNames.includes('regular_caller'), `expected regular_caller among ${JSON.stringify(callerNames)}`);
  assert.equal(response.data.edges.length, 1, JSON.stringify(response.data.edges));
  assert.ok(
    !limitationCodes(response).includes('provider_null_incoming_calls'),
    'a genuinely-called function must not carry provider_null_incoming_calls',
  );
});

test(
  'FastAPI fixture, route handler: get_items has no incoming caller, and provider_null_incoming_calls says why',
  { timeout: 25000 },
  () => {
    const response = analyze(33, 5); // `def get_items` in app.py
    assert.equal(response.ok, true);
    assert.equal(response.data.edges.length, 0, JSON.stringify(response.data.edges));
    const codes = limitationCodes(response);
    assert.ok(
      codes.includes('provider_null_incoming_calls'),
      `an empty result alone does not prove FastAPI's router is invisible to this analysis - expected provider_null_incoming_calls, got ${JSON.stringify(codes)}`,
    );
  },
);

test(
  "FastAPI fixture, Depends() target: get_db has no incoming caller, and provider_null_incoming_calls says why",
  { timeout: 25000 },
  () => {
    const response = analyze(28, 5); // `def get_db` in app.py
    assert.equal(response.ok, true);
    assert.equal(response.data.edges.length, 0, JSON.stringify(response.data.edges));
    const codes = limitationCodes(response);
    assert.ok(
      codes.includes('provider_null_incoming_calls'),
      `an empty result alone does not prove Depends() references are invisible to this analysis - expected provider_null_incoming_calls, got ${JSON.stringify(codes)}`,
    );
  },
);

// ---------------------------------------------------------------------------
// M4 stage 2 (`fastapi-static-v1` adapter, docs/work/task-m4-stage2-fastapi-adapter.md). This is the
// contract's own proof, per commander's explicit instruction: every assertion above MUST stay exactly
// true with augmentation ON. If any of them broke, the M4 stage 1 contract (`edges`/`nodes`/
// `provider_null_incoming_calls` never change) would be wrong, not just the adapter.
// ---------------------------------------------------------------------------

test(
  'FastAPI fixture, augmentation ON, Depends() target: existing assertions unchanged, plus a candidate augmented edge',
  { timeout: 25000 },
  () => {
    const response = analyze(28, 5, true); // `def get_db` in app.py
    assert.equal(response.ok, true);
    // The M2 contract, verbatim: must not change because augmentation is on.
    assert.equal(response.data.edges.length, 0, JSON.stringify(response.data.edges));
    assert.ok(
      limitationCodes(response).includes('provider_null_incoming_calls'),
      'turning augmentation on must not remove provider_null_incoming_calls - the provider still did not confirm anything',
    );
    // The new signal: the adapter found get_items references get_db via Depends().
    assert.equal(response.data.augmentedEdges.length, 1, JSON.stringify(response.data.augmentedEdges));
    const [edge] = response.data.augmentedEdges;
    assert.equal(edge.adapterId, 'fastapi-static-v1');
    assert.equal(edge.reasonCode, 'fastapi-depends');
    assert.equal(edge.evidenceSource, 'static-inference');
    assert.equal(edge.resolution, 'single');
    assert.equal(edge.source.kind, 'synthetic', 'get_items was never independently visited by the static traversal here, so it must not claim an existing node id');
    assert.equal(edge.source.name, 'get_items');
    assert.equal(edge.target.kind, 'existing', 'get_db is the analysis root, always present in data.nodes');
    assert.equal(edge.target.id, response.data.nodes[0]!.id);
    // The M1 scaffolding this reuses, exercised for real for the first time here.
    assert.equal(response.data.coverage.semantic.status, 'augmented');
    assert.equal(response.data.completion.semanticScope, 'static-plus-inference');
  },
);

test(
  'FastAPI fixture, augmentation ON, route handler: existing assertions unchanged, plus a synthetic HTTP entrypoint edge',
  { timeout: 25000 },
  () => {
    const response = analyze(33, 5, true); // `def get_items` in app.py
    assert.equal(response.ok, true);
    assert.equal(response.data.edges.length, 0, JSON.stringify(response.data.edges));
    assert.ok(limitationCodes(response).includes('provider_null_incoming_calls'));
    assert.equal(response.data.augmentedEdges.length, 1, JSON.stringify(response.data.augmentedEdges));
    const [edge] = response.data.augmentedEdges;
    assert.equal(edge.reasonCode, 'fastapi-route-handler');
    assert.equal(edge.source.kind, 'synthetic');
    assert.equal(edge.source.name, 'HTTP GET /items');
    assert.equal(edge.target.kind, 'existing');
    assert.equal(edge.target.id, response.data.nodes[0]!.id);
  },
);

test(
  'FastAPI fixture, augmentation ON, ordinary call: augmentation finds nothing extra and does not fabricate an edge',
  { timeout: 25000 },
  () => {
    // Same query as the control test above, augmentation on. app.py imports fastapi (the adapter's
    // per-file gate passes), but normal_helper is neither a route handler nor a Depends() target -
    // proves the adapter does not fire just because the workspace happens to be FastAPI.
    const response = analyze(20, 5, true); // `def normal_helper` in app.py
    assert.equal(response.ok, true);
    assert.equal(response.data.edges.length, 1, JSON.stringify(response.data.edges));
    assert.equal(response.data.augmentedEdges.length, 0, JSON.stringify(response.data.augmentedEdges));
    assert.equal(response.data.coverage.semantic.status, 'static-only', 'no augmented edge means no semantic-scope signal either - the M1 scaffolding must not fire on nothing');
  },
);

// ---------------------------------------------------------------------------
// Corpus case 1 (same name, different symbol) - decoy_module.py/real_module.py/consumer.py. Both define
// `get_db`; only `real_module.get_db` is what consumer.py's `Depends(get_db)` actually binds to (a real
// Python import, not a naming coincidence the adapter is told about). Proves resolution happens through
// the real provider, not through name matching.
// ---------------------------------------------------------------------------

test(
  'corpus case 1, augmentation ON: the decoy get_db (never imported by consumer.py) gets zero augmented edges',
  { timeout: 25000 },
  () => {
    const response = analyzeFile('decoy_module.py', 8, 5, true); // `def get_db` in decoy_module.py
    assert.equal(response.ok, true);
    assert.equal(
      response.data.augmentedEdges.length,
      0,
      `name-matching alone would have wrongly attributed consumer.py's Depends(get_db) to this decoy: ${JSON.stringify(response.data.augmentedEdges)}`,
    );
  },
);

test(
  'corpus case 1, augmentation ON: the real get_db (imported by consumer.py) gets exactly one augmented edge',
  { timeout: 25000 },
  () => {
    const response = analyzeFile('real_module.py', 6, 5, true); // `def get_db` in real_module.py
    assert.equal(response.ok, true);
    assert.equal(response.data.augmentedEdges.length, 1, JSON.stringify(response.data.augmentedEdges));
    const [edge] = response.data.augmentedEdges;
    assert.equal(edge.reasonCode, 'fastapi-depends');
    assert.equal(edge.resolution, 'single');
    assert.equal(edge.source.kind, 'synthetic');
    assert.equal(edge.source.name, 'handler');
  },
);
