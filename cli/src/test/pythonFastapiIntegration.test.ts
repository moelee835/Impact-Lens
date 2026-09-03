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

interface AnalyzeResponse {
  readonly ok: boolean;
  readonly data: {
    readonly provider: { readonly selectedBy: string };
    readonly nodes: ReadonlyArray<{ readonly name: string }>;
    readonly edges: ReadonlyArray<unknown>;
    readonly limitationDetails: ReadonlyArray<{ readonly code: string }>;
  };
}

function analyze(line: number, column: number): AnalyzeResponse {
  const result = spawnSync(process.execPath, [executable, 'analyze', '--stdin'], {
    encoding: 'utf8',
    timeout: 25000,
    input: JSON.stringify({ workspace, file: 'app.py', line, column, depth: 5, maxNodes: 50 }),
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
