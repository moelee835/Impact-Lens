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
    readonly limitationDetails: ReadonlyArray<{ readonly code: string; readonly message: string }>;
    readonly coverage: { readonly semantic: { readonly status: string } };
    readonly completion: { readonly semanticScope: string };
    readonly timings: { readonly totalMs: number };
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

/** Sends exactly the request object given, with no `augmentationEnabled` default injected - unlike
 * `analyzeFile()` above, this can omit the field entirely (what a pre-M4 client, which has never heard of
 * it, would send). Returns the raw parsed JSON envelope untyped, not `AnalyzeResponse` - the rollback
 * tests below compare the whole envelope against an explicit allow-list of fields expected to differ,
 * which needs every field the response carries, not just the subset `AnalyzeResponse` declares. */
function analyzeRaw(request: Record<string, unknown>): Record<string, unknown> {
  const result = spawnSync(process.execPath, [executable, 'analyze', '--stdin'], {
    encoding: 'utf8',
    timeout: 25000,
    input: JSON.stringify(request),
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

// ---------------------------------------------------------------------------
// Import-alias tracking (commander-found gap, docs/work/task-m4-stage2-fastapi-adapter.md): the M4
// exit gate names "FastAPI import alias" as a required coverage shape, but no fixture exercised
// localNamesFor() at all before this. It only detects an alias when the target name is the FIRST name
// immediately after `import` on one line - alias_caught_consumer.py exercises that (detected) and
// alias_uncaught_consumer.py exercises the target NOT being first in a comma-separated list (NOT
// detected, a documented limitation). Combined into one test: if either direction regressed, the edge
// count would be wrong in a way that shows exactly which one broke.
// ---------------------------------------------------------------------------

test(
  'import alias tracking, augmentation ON: a single-name import alias is found, a non-first name in a comma-separated import is not',
  { timeout: 25000 },
  () => {
    const response = analyzeFile('alias_target.py', 8, 5, true); // `def alias_target_fn` in alias_target.py
    assert.equal(response.ok, true);
    assert.equal(
      response.data.augmentedEdges.length,
      1,
      `expected exactly the caught alias (target_alias from alias_caught_consumer.py), not the uncaught one (target_alias2 from alias_uncaught_consumer.py): ${JSON.stringify(response.data.augmentedEdges)}`,
    );
    const [edge] = response.data.augmentedEdges;
    assert.equal(edge.reasonCode, 'fastapi-depends');
    assert.equal(edge.resolution, 'single');
    assert.equal(edge.source.kind, 'synthetic');
    assert.equal(edge.source.name, 'caught_handler');
  },
);

// ---------------------------------------------------------------------------
// Corpus case 3 (docs/work/task-m4-stage1-evidence-contract.md) - orphan_router.py/
// dynamic_mount_router.py. A route decorator alone must not become a confirmed route edge: a genuinely
// unmounted router and one mounted only through a form this scan cannot follow (dynamic registration)
// must produce the SAME result, including byte-identical limitation message text - this is the
// false-positive risk the corpus case exists to prevent (commander: "M4가 존재하는 이유가 추측을
// 확정처럼 보이지 않게 하는 것").
// ---------------------------------------------------------------------------

test(
  'corpus case 3(a), augmentation ON: a route decorator with no include_router() anywhere in the workspace produces no edge, only a limitation',
  { timeout: 25000 },
  () => {
    const response = analyzeFile('orphan_router.py', 13, 5, true); // `def orphan_handler` in orphan_router.py
    assert.equal(response.ok, true);
    assert.equal(
      response.data.augmentedEdges.length,
      0,
      `a route decorator alone must not become an edge without a confirmed mount: ${JSON.stringify(response.data.augmentedEdges)}`,
    );
    const detail = response.data.limitationDetails.find(entry => entry.code === 'framework_route_mount_unresolved');
    assert.ok(detail, `expected framework_route_mount_unresolved: ${JSON.stringify(response.data.limitationDetails)}`);
  },
);

test(
  'corpus case 3(b), augmentation ON: a route decorator mounted only via dynamic registration produces the same result as 3(a), byte-identical message',
  { timeout: 25000 },
  () => {
    const orphanResponse = analyzeFile('orphan_router.py', 13, 5, true);
    const dynamicResponse = analyzeFile('dynamic_mount_router.py', 16, 5, true); // `def dynamic_handler`
    assert.equal(dynamicResponse.ok, true);
    assert.equal(
      dynamicResponse.data.augmentedEdges.length,
      0,
      `dynamic include_router(get_dynamic_router()) is out of this scan's resolvable scope, same as an unmounted router: ${JSON.stringify(dynamicResponse.data.augmentedEdges)}`,
    );
    const orphanDetail = orphanResponse.data.limitationDetails.find(entry => entry.code === 'framework_route_mount_unresolved');
    const dynamicDetail = dynamicResponse.data.limitationDetails.find(entry => entry.code === 'framework_route_mount_unresolved');
    assert.ok(orphanDetail, `expected framework_route_mount_unresolved on 3(a): ${JSON.stringify(orphanResponse.data.limitationDetails)}`);
    assert.ok(dynamicDetail, `expected framework_route_mount_unresolved on 3(b): ${JSON.stringify(dynamicResponse.data.limitationDetails)}`);
    assert.equal(
      dynamicDetail!.message,
      orphanDetail!.message,
      'a genuinely-unmounted router and one mounted out of this scan\'s reach must be indistinguishable in the message text - a static scan cannot tell them apart',
    );
  },
);

test(
  'FastAPI fixture, augmentation ON, route handler on the app itself: no mount check applies, existing edge is unchanged',
  { timeout: 25000 },
  () => {
    // Regression guard for the mount check added for corpus case 3: `@app.get(...)` where `app = FastAPI()`
    // must NOT be treated as an unmounted router - this must still produce the same edge as before the
    // mount check existed, with no framework_route_mount_unresolved limitation.
    const response = analyze(33, 5, true); // `def get_items` in app.py
    assert.equal(response.ok, true);
    assert.equal(response.data.augmentedEdges.length, 1, JSON.stringify(response.data.augmentedEdges));
    assert.equal(response.data.augmentedEdges[0]!.reasonCode, 'fastapi-route-handler');
    assert.ok(
      !response.data.limitationDetails.some(entry => entry.code === 'framework_route_mount_unresolved'),
      `the app's own routes must never be flagged as mount-unresolved: ${JSON.stringify(response.data.limitationDetails)}`,
    );
  },
);

// ---------------------------------------------------------------------------
// Corpus case 3 false-positive guard (reviewer + commander finding, docs/work/task-m4-stage2-fastapi-
// adapter.md): the mount search is text-based, and a bare identifier match alone is not proof of a real
// mount. Four confounders were found empirically (a reviewer fixture, and a direct regex probe against
// representative Python shapes) - a commented-out call, a docstring mention, a string-literal mention, and
// a same-named router in an unrelated file. Each must produce the SAME result as a genuinely unmounted
// router: zero augmented edges, and a framework_route_mount_unresolved message byte-identical to the
// baseline (orphan_router.py) - proving these are treated as "cannot confirm", never as a softer or
// harder verdict than that.
// ---------------------------------------------------------------------------

const MOUNT_UNRESOLVED_GUARD_FIXTURES: ReadonlyArray<{ readonly file: string; readonly line: number; readonly label: string }> = [
  { file: 'commented_out_router.py', line: 12, label: 'a commented-out include_router(...) call' },
  { file: 'docstring_mention_router.py', line: 12, label: 'include_router(...) mentioned only in a docstring' },
  { file: 'string_literal_router.py', line: 11, label: 'include_router(...) mentioned only in a string literal' },
  { file: 'collision_router_unmounted.py', line: 15, label: 'name collision (bare form) - this router is genuinely unmounted' },
  { file: 'collision_router_mounted.py', line: 13, label: 'name collision (bare form) - this router IS mounted, but the name is ambiguous workspace-wide' },
  { file: 'collision_typed_unmounted.py', line: 15, label: 'name collision (type-annotated form on the OTHER file) - this router is genuinely unmounted' },
  { file: 'collision_typed_mounted.py', line: 14, label: 'name collision (type-annotated form on THIS file) - mounted, but ambiguous workspace-wide' },
  { file: 'collision_qualified_unmounted.py', line: 15, label: 'name collision (module-qualified form on the OTHER file) - this router is genuinely unmounted' },
  { file: 'collision_qualified_mounted.py', line: 15, label: 'name collision (module-qualified form on THIS file) - mounted, but ambiguous workspace-wide' },
];

for (const fixture of MOUNT_UNRESOLVED_GUARD_FIXTURES) {
  test(
    `corpus case 3 false-positive guard, augmentation ON: ${fixture.label} produces no edge and the same mount-unresolved message as the baseline`,
    { timeout: 25000 },
    () => {
      const baseline = analyzeFile('orphan_router.py', 13, 5, true);
      const response = analyzeFile(fixture.file, fixture.line, 5, true);
      assert.equal(response.ok, true);
      assert.equal(
        response.data.augmentedEdges.length,
        0,
        `${fixture.label} must not produce a mount edge: ${JSON.stringify(response.data.augmentedEdges)}`,
      );
      const baselineDetail = baseline.data.limitationDetails.find(entry => entry.code === 'framework_route_mount_unresolved');
      const detail = response.data.limitationDetails.find(entry => entry.code === 'framework_route_mount_unresolved');
      assert.ok(baselineDetail, 'baseline (orphan_router.py) must itself produce framework_route_mount_unresolved');
      assert.ok(detail, `expected framework_route_mount_unresolved for ${fixture.label}: ${JSON.stringify(response.data.limitationDetails)}`);
      assert.equal(
        detail!.message,
        baselineDetail!.message,
        `${fixture.label} must produce byte-identical message text to the baseline`,
      );
    },
  );
}

test(
  'corpus case 3 false-positive guard, augmentation ON: a genuinely single mounted router (no collision, no comment/string tricks) still produces a normal edge',
  { timeout: 25000 },
  () => {
    const response = analyzeFile('mounted_router.py', 13, 5, true); // `def mounted_handler` in mounted_router.py
    assert.equal(response.ok, true);
    assert.equal(response.data.augmentedEdges.length, 1, JSON.stringify(response.data.augmentedEdges));
    assert.equal(response.data.augmentedEdges[0]!.reasonCode, 'fastapi-route-handler');
    assert.ok(
      !response.data.limitationDetails.some(entry => entry.code === 'framework_route_mount_unresolved'),
      `a genuinely mounted, unambiguous router must not be flagged as mount-unresolved: ${JSON.stringify(response.data.limitationDetails)}`,
    );
  },
);

// ---------------------------------------------------------------------------
// M4 stage 3 accuracy corpus - known false negatives (docs/work/task-m4-stage3-accuracy-latency-gates.md).
// Each of these is a genuine caller/mount that this adapter does NOT detect, by construction - an accepted
// miss, not a bug: the adapter never claims reachability it cannot confirm, so the failure direction here
// is silence, not a fabricated edge. These are asserted here (not just described in the work document) so
// the accuracy-gate corpus counts are tied to executable fixtures, and so a future regex widening that
// starts catching one of these shapes is a visible, deliberate test change instead of a silent drift.
// ---------------------------------------------------------------------------

test(
  'accuracy corpus, known false negative: a router mounted only via a module-attribute reference (x.router) is not detected',
  { timeout: 25000 },
  () => {
    const response = analyzeFile('attr_mount_router.py', 15, 5, true); // `def attr_mount_handler`
    assert.equal(response.ok, true);
    assert.equal(response.data.augmentedEdges.length, 0, JSON.stringify(response.data.augmentedEdges));
    assert.ok(
      response.data.limitationDetails.some(entry => entry.code === 'framework_route_mount_unresolved'),
      'expected framework_route_mount_unresolved, not a fabricated edge, for a mount this scan cannot follow',
    );
  },
);

test(
  'accuracy corpus, known false negative: a router mounted only under a cross-file import alias is not detected',
  { timeout: 25000 },
  () => {
    const response = analyzeFile('alias_mount_router.py', 14, 5, true); // `def alias_mount_handler`
    assert.equal(response.ok, true);
    assert.equal(response.data.augmentedEdges.length, 0, JSON.stringify(response.data.augmentedEdges));
    assert.ok(
      response.data.limitationDetails.some(entry => entry.code === 'framework_route_mount_unresolved'),
      'expected framework_route_mount_unresolved, not a fabricated edge, for a mount this scan cannot follow',
    );
  },
);

test(
  'accuracy corpus, known false negative: a Depends() alias introduced by a parenthesized multi-line import is not detected',
  { timeout: 25000 },
  () => {
    const response = analyzeFile('parenthesized_import_target.py', 8, 5, true); // `def parenthesized_target_fn`
    assert.equal(response.ok, true);
    assert.equal(response.data.augmentedEdges.length, 0, JSON.stringify(response.data.augmentedEdges));
  },
);

// ---------------------------------------------------------------------------
// M4 stage 3 "단계 5" (docs/work/task-m4-stage3-accuracy-latency-gates.md). The corrected milestone gate
// (M4 stage 3 "단계 4") still requires a representative fixture reproducing a sub-dependency (nested
// dependency) - only the "multiple candidate" half of that gate sentence was corrected, not this half.
// stage 2 believed this already worked without new code (the same Depends() scan is per-file and
// recursive, and findEnclosingDef finds any enclosing def regardless of depth) but never verified it
// with a fixture. This does: querying the innermost dependency (`get_config`) must find the MIDDLE
// function (`get_db`, which has its own `Depends(get_config)`) as the candidate caller, not the outermost
// consumer (`handler`) - the direct reference at each level, not the whole transitive chain, matching
// this adapter's own doc comment.
// ---------------------------------------------------------------------------

test(
  'sub-dependency (nested dependency): querying the innermost Depends() target finds the middle function, not the outermost consumer',
  { timeout: 25000 },
  () => {
    const response = analyzeFile('nested_dependency_config.py', 11, 5, true); // `def get_config`
    assert.equal(response.ok, true);
    assert.equal(response.data.augmentedEdges.length, 1, JSON.stringify(response.data.augmentedEdges));
    const edge = response.data.augmentedEdges[0]!;
    assert.equal(edge.reasonCode, 'fastapi-depends');
    assert.equal(edge.resolution, 'single');
    assert.equal(
      edge.source.name,
      'get_db',
      `expected the middle function (get_db) as the candidate caller, not the outermost consumer: ${JSON.stringify(edge.source)}`,
    );
  },
);

// ---------------------------------------------------------------------------
// M4 stage 3 latency gate (docs/work/task-m4-stage3-accuracy-latency-gates.md, "단계 3"). Not a tight
// perf assertion - CI runners are noisy and this corpus is small (well under `maxFiles`), so exact
// millisecond numbers belong in the work document (measured locally, with its own environment stated),
// not in a threshold here. What this pins is the shape of a real regression: augmentation adding an
// unbounded or accidentally-quadratic cost (e.g. a `maxFiles` cap silently dropped, or a loop re-reading
// every file per match instead of once). `orphan_router.py` is used because it is the one query in this
// corpus that always pays the FULL `isRouterMounted` file walk - the mount is never found, so
// `nameAmbiguous` forces every file to be visited (see that function's own doc comment) - the same
// worst-case path the work document's latency table measured against `maxFiles`.
// ---------------------------------------------------------------------------

function minTotalMs(file: string, line: number, column: number, augmentationEnabled: boolean, repeats: number): number {
  const samples: number[] = [];
  for (let i = 0; i < repeats; i += 1) {
    samples.push(analyzeFile(file, line, column, augmentationEnabled).data.timings.totalMs);
  }
  // min, not mean/median: scheduling noise only ever ADDS time to a single run, never subtracts it, so
  // the minimum across repeats is the best available estimate of each side's true floor cost - and using
  // it for both sides keeps the subtraction below a fair comparison, not one cherry-picked to pass.
  return Math.min(...samples);
}

test(
  'latency gate: augmentation adds bounded cost on the worst-case query (route handler whose router is never mounted)',
  { timeout: 60000 },
  () => {
    const off = minTotalMs('orphan_router.py', 13, 5, false, 3);
    const on = minTotalMs('orphan_router.py', 13, 5, true, 3);
    const addedMs = on - off;
    assert.ok(
      addedMs < 5000,
      `augmentation added ${addedMs}ms (off=${off}ms, on=${on}ms) on the worst-case mount-walk query - ` +
        'expected well under 5000ms on this small fixture corpus (local M1 Pro measurement in the work ' +
        'document put this in the tens of ms; this threshold is deliberately loose to absorb CI noise ' +
        'and only catch an actual unbounded-cost regression, not normal variance).',
    );
  },
);

// ---------------------------------------------------------------------------
// M4 stage 3 "단계 6" - rollback (docs/work/task-m4-stage3-accuracy-latency-gates.md). M4 stage 1's own
// evidence contract (docs/work/task-m4-stage1-evidence-contract.md, "Q5 - kill switch") specifies two
// SEPARATE invariants, not one - a reviewer finding that blocked stage 1 until both were written down:
//
// 1. OFF state must be untouched even for a client that has never heard of `augmentationEnabled` (a
//    pre-M4 consumer) - not just one that explicitly sends `false`.
// 2. ON state, when augmentation genuinely finds something, must still leave a specific field set
//    (`nodes`, `edges`, `completion`'s non-semantic fields, `complete`, `truncated`, `traversalLimits`,
//    `coverage.traversal`, `coverage.indexing`, `provider`) byte-for-byte identical to the OFF response -
//    "turn it off and you get the old graph back" says nothing about whether the OLD graph is left alone
//    while augmentation is ON, which is where users actually spend their time.
//
// Until now neither was pinned by a test - both were structural guarantees only (the kill switch's early
// return in `runAugmentation()`, and augmentedEdges being a wholly separate array `impact.ts` never reads
// back into `nodes`/`edges`). This closes that gap with an actual regression test for each.
// ---------------------------------------------------------------------------

/** Fields legitimately expected to change when augmentation runs and finds something - everything else in
 * the envelope must stay identical to the OFF response. Kept as an explicit allow-list (delete-then-
 * compare-the-rest), not a hand-picked list of fields to assert equal, so any OTHER field drifting would
 * fail this test even if nobody remembered to name it here. */
const AUGMENTATION_LIMITATION_CODES = new Set([
  'inferred_edges_included', 'observed_edges_included', 'augmentation_budget_exceeded', 'framework_route_mount_unresolved',
]);

function stripAugmentationVariableFields(response: Record<string, unknown>): Record<string, unknown> {
  const clone = JSON.parse(JSON.stringify(response));
  // The envelope carries `limitations`/`timings` at BOTH the root (a summary) and again nested under
  // `data` (the full record) - found by running this test before writing this function and reading what
  // it actually failed on, not assumed from `impact.ts`'s return shape alone. Both copies need the same
  // treatment, or this helper silently only checks half of what the response contains. `capabilities` is
  // NOT one of these - the root's `capabilities` mirrors `data.provider` (a different name, not a second
  // copy under the same key), and `data.provider` is never stripped below because it never differs
  // between on/off in the first place (index.ts copies `data.provider` verbatim to the root regardless of
  // augmentation), so `deepEqual` passing on it is a real fact about the response, not a gap in this
  // helper's coverage.
  delete clone.timings;
  if (Array.isArray(clone.limitations)) clone.limitations = clone.limitations.filter((code: string) => !AUGMENTATION_LIMITATION_CODES.has(code));

  const data = clone.data as Record<string, unknown>;
  delete data.augmentedEdges;
  // Always volatile, unrelated to augmentation - excluded from both sides for the same reason M4 stage 1
  // excluded them from the kill-switch definition (never decisive, never worth comparing).
  delete data.analyzedAt;
  delete data.timings;
  // Expected to change: the M1-designed signal for exactly this ("static-only"/"provider-static" vs.
  // "augmented"/"static-plus-inference").
  const completion = data.completion as Record<string, unknown> | undefined;
  if (completion) delete completion.semanticScope;
  const coverage = data.coverage as Record<string, unknown> | undefined;
  if (coverage) delete coverage.semantic;
  // `data.limitations` and `coverage.reasons` are the same array (coverage.ts's own invariant) -
  // augmentation may add these four codes and no others; strip them from both sides rather than asserting
  // exact membership, since this test's job is the OTHER fields, not re-proving the accuracy-corpus
  // fixtures.
  const stripCodes = (codes: unknown): unknown =>
    Array.isArray(codes) ? codes.filter(code => !AUGMENTATION_LIMITATION_CODES.has(code)) : codes;
  if (Array.isArray(data.limitations)) data.limitations = stripCodes(data.limitations);
  if (Array.isArray(data.limitationDetails)) {
    data.limitationDetails = (data.limitationDetails as Array<{ code: string }>).filter(d => !AUGMENTATION_LIMITATION_CODES.has(d.code));
  }
  if (coverage && Array.isArray(coverage.reasons)) coverage.reasons = stripCodes(coverage.reasons);
  return clone;
}

test(
  'rollback, OFF state: a request that omits augmentationEnabled entirely (a pre-M4 client) matches one that sends it explicitly false, byte-for-byte',
  { timeout: 25000 },
  () => {
    const omitted = analyzeRaw({ workspace, file: 'app.py', line: 28, column: 5, depth: 5, maxNodes: 50 }); // `def get_db`
    const explicitFalse = analyzeRaw({ workspace, file: 'app.py', line: 28, column: 5, depth: 5, maxNodes: 50, augmentationEnabled: false });
    assert.equal(omitted.ok, true);
    assert.equal(explicitFalse.ok, true);
    // Both are OFF, so nothing legitimately differs at all - not even the augmentation-only allow-list the
    // ON-state test below needs - once the universally-volatile fields (root and nested `timings`,
    // `data.analyzedAt`) are stripped.
    assert.deepEqual(stripAugmentationVariableFields(omitted), stripAugmentationVariableFields(explicitFalse));
    assert.deepEqual((omitted.data as { augmentedEdges: unknown[] }).augmentedEdges, [], 'OFF state must never populate augmentedEdges, with or without the field present in the request');
  },
);

test(
  'rollback, ON state: augmentation finding a real candidate edge leaves nodes/edges/completeness untouched',
  { timeout: 25000 },
  () => {
    const off = analyzeRaw({ workspace, file: 'app.py', line: 28, column: 5, depth: 5, maxNodes: 50, augmentationEnabled: false }); // `def get_db`
    const on = analyzeRaw({ workspace, file: 'app.py', line: 28, column: 5, depth: 5, maxNodes: 50, augmentationEnabled: true });
    assert.equal(off.ok, true);
    assert.equal(on.ok, true);
    // Non-vacuity for this test itself: if ON found nothing here, the comparison below would trivially
    // pass regardless of whether the protected fields are actually guarded.
    const onData = on.data as { augmentedEdges: readonly unknown[] };
    assert.ok(onData.augmentedEdges.length > 0, 'this fixture must produce a real augmented edge, or this test proves nothing');
    assert.deepEqual(stripAugmentationVariableFields(off), stripAugmentationVariableFields(on));
  },
);
