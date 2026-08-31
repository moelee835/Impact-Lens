import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import test from 'node:test';
import { pathToFileURL } from 'node:url';

// IL-LIM-005 stage 3 ("자동 호환성 검증"): bundled/custom/mock provider의 capability, timeout, indexing
// unknown, partial 결과 matrix, exercised through the real `analyze --stdin` entry point - the process
// boundary every other axis-level test in this directory stays one layer below (see the comments this
// file cites). This file only adds what that boundary is missing; everything already proven at the entry
// point is cited, not re-tested, per the coverage audit in docs/work/task-m1-compatibility-matrix.md.
//
// Matrix as audited (see the work document for the full table and the direct test-name evidence):
//
//   axis               | bundled (real tsserver)         | custom (raw command)             | status
//   -------------------|----------------------------------|-----------------------------------|-----------
//   missing capability | N/A - the shipped preset is       | contract.test.ts "reports         | covered,
//                       | catalog-verified to have it       | missing Call Hierarchy            | no new test
//                       | (providers.test.ts "the shipped   | capability instead of an          |
//                       | catalog only claims languages     | empty graph"                      |
//                       | that have been verified")         |                                    |
//   timeout / budget   | not reachable at this boundary:   | not reachable at this boundary:   | documented
//                       | a readiness `budgetMs` only        | same - `resolution.catalog` is    | limitation,
//                       | exists on a `ProviderPreset`      | the only way to attach a          | no new test
//                       | (`providers/preset.ts`), and the  | readiness profile at all, and     | (see below)
//                       | real CLI entry point never        | index.ts never constructs one     |
//                       | passes one (index.ts constructs   | from request JSON                 |
//                       | providers only from               |                                    |
//                       | `providerPreset`/overrides)        |                                    |
//   indexing unknown   | THIS FILE                          | THIS FILE                         | new
//   partial (limited)  | THIS FILE (depth-limited)          | not added - see the comment on    | new
//                       |                                    | the depth-limit test below        | (bundled)
//
// The timeout/budget row is the same conclusion `stateReachability.integration.test.ts` already recorded
// for `CATALOG_DECLARED_READINESS_REACHABLE`: reaching a declared readiness profile requires the
// `resolution.catalog` constructor option, which is a test-only TypeScript API with no counterpart in the
// CLI's stdin JSON, CLI arguments, or `.impact-lens/provider.json`. `readiness.integration.test.ts`
// already proves the budget-overrun behavior itself (in-process, one layer below this file); there is no
// additional entry-point wiring to prove until a request-facing readiness surface exists.

const EXECUTABLE = path.resolve(__dirname, '..', 'index.js');

function runCli(body: unknown, env: NodeJS.ProcessEnv = {}): { status: number | null; stdout: string; stderr: string } {
  const result = spawnSync(process.execPath, [EXECUTABLE, 'analyze', '--stdin'], {
    encoding: 'utf8',
    input: JSON.stringify(body),
    timeout: 40000,
    env: { ...process.env, ...env },
  });
  return { status: result.status, stdout: result.stdout, stderr: result.stderr };
}

function envelope(result: { readonly status: number | null; readonly stdout: string; readonly stderr: string }): Record<string, unknown> {
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout.trimEnd().split('\n').length, 1);
  return JSON.parse(result.stdout) as Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// indexing unknown, bundled and custom
// ---------------------------------------------------------------------------

test('indexing status is unknown at the real CLI entry point for the bundled provider (shipped catalog declares no readiness profile)', () => {
  const workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'impact-lens-matrix-bundled-'));
  try {
    fs.writeFileSync(path.join(workspace, 'tsconfig.json'), JSON.stringify({
      compilerOptions: { target: 'ES2022', module: 'commonjs', strict: true },
      include: ['*.ts'],
    }));
    fs.writeFileSync(path.join(workspace, 'target.ts'), 'export function target(value: number): number { return value + 1; }\n');
    fs.writeFileSync(path.join(workspace, 'caller.ts'), "import { target } from './target';\nexport function caller(): number { return target(1); }\n");
    // No `provider`/`providerPreset` at all: auto-discovery resolves the shipped bundled-typescript preset.
    const response = envelope(runCli({ workspace, file: 'target.ts', line: 1, column: 17 }));
    const data = response.data as Record<string, unknown>;
    const completion = data.completion as Record<string, unknown>;
    const coverage = data.coverage as Record<string, unknown>;
    assert.equal((data.provider as Record<string, unknown>).selectedBy, 'bundled');
    assert.equal(completion.indexingStatus, 'unknown');
    assert.equal((coverage.indexing as Record<string, unknown>).status, 'unknown');
  } finally {
    fs.rmSync(workspace, { recursive: true, force: true });
  }
});

test('indexing status is unknown at the real CLI entry point for a raw custom command provider', () => {
  const workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'impact-lens-matrix-custom-'));
  try {
    const target = path.join(workspace, 'target.ts');
    fs.writeFileSync(target, 'export function target(): void {}\n');
    const server = path.resolve(__dirname, 'fixtures', 'dynamicCallHierarchyServer.js');
    const response = envelope(runCli({
      workspace,
      file: 'target.ts',
      line: 1,
      column: 17,
      provider: { command: process.execPath, args: [server], languageId: 'typescript' },
    }, {
      IMPACT_LENS_MOCK_TARGET_URI: pathToFileURL(target).toString(),
    }));
    const data = response.data as Record<string, unknown>;
    const completion = data.completion as Record<string, unknown>;
    const coverage = data.coverage as Record<string, unknown>;
    assert.equal((data.provider as Record<string, unknown>).selectedBy, 'custom');
    assert.equal(completion.indexingStatus, 'unknown');
    assert.equal((coverage.indexing as Record<string, unknown>).status, 'unknown');
  } finally {
    fs.rmSync(workspace, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// partial / depth-limited, bundled
//
// `stateReachability.integration.test.ts` already proves this state is reachable, but only in-process
// (`analyzeImpact(request, provider)` called directly - see its own header comment). This proves the same
// state survives the CLI subprocess boundary: argv parsing, stdin JSON, and the response envelope this
// file's other tests also check.
//
// Not duplicated for a custom (raw command) provider: no shipped fixture answers `incomingCalls` with more
// than an empty array (`dynamicCallHierarchyServer.ts`, `readinessServer.ts` and
// `settingsRequiredServer.ts` all `respond(message.id, [])`), so a depth/node-limit case for a custom
// provider would need a new fixture built just for this. The traversal loop that applies `depth`/
// `maxNodes` and marks a result `depth-limited`/`node-limited` (`impact.ts`) runs identically regardless
// of `provider.selectedBy` - it consumes `CallHierarchyProvider.incomingCalls()` results the same way for
// every provider kind - so the bundled proof below already exercises the one code path a custom-provider
// fixture would exercise a second time.
// ---------------------------------------------------------------------------

test('a depth limit reached through the real CLI entry point reports partial/depth-limited for the bundled provider', () => {
  const workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'impact-lens-matrix-depth-'));
  try {
    fs.writeFileSync(path.join(workspace, 'tsconfig.json'), JSON.stringify({
      compilerOptions: { target: 'ES2022', module: 'commonjs', strict: true },
      include: ['*.ts'],
    }));
    fs.writeFileSync(path.join(workspace, 'root.ts'), 'export function root(): void {}\n');
    fs.writeFileSync(path.join(workspace, 'a.ts'), "import { root } from './root';\nexport function a(): void { root(); }\n");
    fs.writeFileSync(path.join(workspace, 'a2.ts'), "import { a } from './a';\nexport function a2(): void { a(); }\n");
    // "export function " is 16 characters; column 17 is where `root` starts.
    const response = envelope(runCli({ workspace, file: 'root.ts', line: 1, column: 17, depth: 1, maxNodes: 50 }));
    const data = response.data as Record<string, unknown>;
    const completion = data.completion as Record<string, unknown>;
    assert.deepEqual(data.traversalLimits, ['depth']);
    assert.equal(completion.traversalStatus, 'depth-limited');
    assert.equal(completion.requestStatus, 'partial');
    assert.equal(data.complete, false);
    assert.equal(data.truncated, true);
  } finally {
    fs.rmSync(workspace, { recursive: true, force: true });
  }
});
