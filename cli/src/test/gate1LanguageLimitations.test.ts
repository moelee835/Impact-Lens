import assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import test, { type TestContext } from 'node:test';
import { analyzeImpact } from '../impact';
import { LspCallHierarchyProvider } from '../lspProvider';
import { findExecutable } from '../providers/discovery';

// M4 gate 1 lane D (docs/work/task-m4-gate1-lane-d-language-limitations.md): every preset's
// `docs.limitations` names a representative gap, but before this file only C++'s virtual-dispatch claim
// (clangdIntegration.test.ts) was backed by a repeating fixture against a real server - the other four
// rested on a one-time probe (Go, C) or no cited evidence at all (Python, TS/JS). Per this lane's own
// rule, every fixture below was measured against a real, installed provider BEFORE being written here,
// never designed to confirm what the doc already claimed - see the work document for the full
// measurement, including the two cases (Go, C) where measuring first found the existing doc claim was an
// overclaim, not merely under-cited.

function names(result: Record<string, unknown>): readonly string[] {
  return (result.nodes as ReadonlyArray<{ readonly name?: string }>)
    .map(node => node.name)
    .filter((name): name is string => name !== undefined);
}

// ---------------------------------------------------------------------------
// TS/JS - bundled-typescript, unconditional (no external install, same as every other bundled-provider
// test in this suite).
// ---------------------------------------------------------------------------

const TS_TARGET = ['export function fixtureTarget(): number {', '  return 1;', '}', ''].join('\n');

async function tsWorkspace(t: TestContext, callerBody: string): Promise<string> {
  const workspace = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'impact-lens-gate1-ts-')));
  t.after(() => fs.rm(workspace, { recursive: true, force: true }));
  await fs.writeFile(path.join(workspace, 'tsconfig.json'), JSON.stringify({ compilerOptions: { target: 'ES2020', module: 'commonjs' } }));
  await fs.writeFile(path.join(workspace, 'target.ts'), TS_TARGET);
  await fs.writeFile(path.join(workspace, 'caller.ts'), callerBody);
  return workspace;
}

test(
  'TS/JS (bundled-typescript): dynamic dispatch through a computed property, and Reflect.apply, are not part of the Call Hierarchy result',
  { timeout: 20000 },
  async t => {
    const workspace = await tsWorkspace(
      t,
      [
        "import { fixtureTarget } from './target';",
        '',
        'const methods: Record<string, () => number> = { run: fixtureTarget };',
        '',
        'export function fixtureCallerComputed(): number {',
        "  return methods['run']();",
        '}',
        '',
        'export function fixtureCallerReflect(): number {',
        '  return Reflect.apply(fixtureTarget, undefined, []);',
        '}',
        '',
      ].join('\n'),
    );
    const provider = new LspCallHierarchyProvider(workspace, 'target.ts', undefined, 20000);
    t.after(() => provider.dispose());
    const result = await analyzeImpact({ workspace, file: 'target.ts', line: 1, column: 17, depth: 5, maxNodes: 50 }, provider);
    assert.equal(provider.capabilities.selectedBy, 'bundled', 'expected auto-discovery to select the bundled-typescript preset');
    assert.deepEqual(
      result.edges,
      [],
      `expected no callers for either the computed-property call or Reflect.apply - if this now finds one, bundled-typescript's dynamic-dispatch behavior changed and catalog.ts's docs.limitations claim for TS/JS needs re-examination, got ${JSON.stringify(result.edges)}`,
    );
  },
);

test(
  'TS/JS (bundled-typescript): a function referenced but never called is not reported as a caller (matches the doc, unlike gopls/clangd)',
  { timeout: 20000 },
  async t => {
    const workspace = await tsWorkspace(
      t,
      [
        "import { fixtureTarget } from './target';",
        '',
        'export const storedRef = fixtureTarget;',
        '',
        'export function fixtureCaller(): number {',
        '  const f: () => number = fixtureTarget;',
        '  void f;',
        '  return 0;',
        '}',
        '',
      ].join('\n'),
    );
    const provider = new LspCallHierarchyProvider(workspace, 'target.ts', undefined, 20000);
    t.after(() => provider.dispose());
    const result = await analyzeImpact({ workspace, file: 'target.ts', line: 1, column: 17, depth: 5, maxNodes: 50 }, provider);
    assert.deepEqual(result.edges, [], `expected a value-only reference to produce no caller, got ${JSON.stringify(result.edges)}`);
  },
);

// ---------------------------------------------------------------------------
// Python - bundled-pyright, unconditional.
// ---------------------------------------------------------------------------

const PY_TARGET = ['def fixture_target():', '    return 1', ''].join('\n');

async function pyWorkspace(t: TestContext, callerBody: string): Promise<string> {
  const workspace = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'impact-lens-gate1-py-')));
  t.after(() => fs.rm(workspace, { recursive: true, force: true }));
  await fs.writeFile(path.join(workspace, 'target.py'), PY_TARGET);
  await fs.writeFile(path.join(workspace, 'caller.py'), callerBody);
  return workspace;
}

test(
  'Python (bundled-pyright): reflection via getattr(module, name_string) is not part of the Call Hierarchy result',
  { timeout: 20000 },
  async t => {
    const workspace = await pyWorkspace(
      t,
      ['import target', '', '', 'def fixture_caller():', "    return getattr(target, 'fixture_target')()", ''].join('\n'),
    );
    const provider = new LspCallHierarchyProvider(workspace, 'target.py', undefined, 20000);
    t.after(() => provider.dispose());
    const result = await analyzeImpact({ workspace, file: 'target.py', line: 1, column: 5, depth: 5, maxNodes: 50 }, provider);
    assert.equal(provider.capabilities.selectedBy, 'bundled', 'expected auto-discovery to select the bundled-pyright preset');
    assert.deepEqual(
      result.edges,
      [],
      `expected no caller for a getattr-by-name-string call - if this now finds one, bundled-pyright's behavior changed and catalog.ts's docs.limitations claim for Python needs re-examination, got ${JSON.stringify(result.edges)}`,
    );
  },
);

test(
  'Python (bundled-pyright): a function referenced but never called is not reported as a caller (matches the doc, unlike gopls/clangd)',
  { timeout: 20000 },
  async t => {
    const workspace = await pyWorkspace(
      t,
      ['import target', '', 'stored_ref = target.fixture_target', '', '', 'def fixture_caller():', '    f = target.fixture_target', '    return f', ''].join('\n'),
    );
    const provider = new LspCallHierarchyProvider(workspace, 'target.py', undefined, 20000);
    t.after(() => provider.dispose());
    const result = await analyzeImpact({ workspace, file: 'target.py', line: 1, column: 5, depth: 5, maxNodes: 50 }, provider);
    assert.deepEqual(result.edges, [], `expected a value-only reference to produce no caller, got ${JSON.stringify(result.edges)}`);
  },
);

// ---------------------------------------------------------------------------
// Go - gopls, gated the same way stateReachability.integration.test.ts's goplsGatedTest is (a
// contributor's machine without Go installed must not fail `npm run cli:test`; the `go-provider` CI job,
// which sets IMPACT_LENS_REQUIRE_GOPLS=1, must not silently skip and go green without having proven
// anything).
// ---------------------------------------------------------------------------

const GOPLS_ON_PATH = findExecutable('gopls') !== undefined;
const REQUIRE_GOPLS = process.env.IMPACT_LENS_REQUIRE_GOPLS === '1';

function goplsGatedTest(name: string, options: { readonly timeout: number }, fn: (t: TestContext) => Promise<void>): void {
  if (GOPLS_ON_PATH) {
    test(name, options, fn);
    return;
  }
  if (REQUIRE_GOPLS) {
    test(name, () => {
      assert.fail(
        'IMPACT_LENS_REQUIRE_GOPLS=1 but no gopls executable was found on PATH. The go-provider CI job ' +
        'exists specifically to prove this preset\'s documented reflection gap and its reference-as-caller ' +
        'over-report both still hold on the version it installs - skipping instead of failing here would ' +
        'make the job green without having proven anything.',
      );
    });
    return;
  }
  test.skip(name, fn);
}

const GOPLS_GOMOD = 'module fixture\n\ngo 1.21\n';

async function goWorkspace(t: TestContext, targetBody: string, callerBody: string): Promise<string> {
  const workspace = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'impact-lens-gate1-go-')));
  t.after(() => fs.rm(workspace, { recursive: true, force: true }));
  await fs.writeFile(path.join(workspace, 'go.mod'), GOPLS_GOMOD);
  await fs.writeFile(path.join(workspace, 'target.go'), targetBody);
  await fs.writeFile(path.join(workspace, 'caller.go'), callerBody);
  return workspace;
}

goplsGatedTest(
  'Go (gopls): genuine name-string reflection (MethodByName, no static identifier reference in source) is not part of the Call Hierarchy result',
  { timeout: 30000 },
  async t => {
    const workspace = await goWorkspace(
      t,
      ['package fixture', '', 'type Fixture struct{}', '', 'func (Fixture) FixtureTarget() int {', '\treturn 1', '}', ''].join('\n'),
      [
        'package fixture',
        '',
        'import "reflect"',
        '',
        'func FixtureCaller() int {',
        '\tv := reflect.ValueOf(Fixture{})',
        '\tm := v.MethodByName("FixtureTarget")',
        '\tresult := m.Call(nil)',
        '\treturn int(result[0].Int())',
        '}',
        '',
      ].join('\n'),
    );
    const provider = new LspCallHierarchyProvider(workspace, 'target.go', undefined, 20000);
    t.after(() => provider.dispose());
    // "func (Fixture) FixtureTarget() int {" - "func (Fixture) " is 15 characters, so column 16 (1-indexed)
    // is the first character of the method name.
    const result = await analyzeImpact({ workspace, file: 'target.go', line: 5, column: 16, depth: 5, maxNodes: 50 }, provider);
    assert.equal(provider.capabilities.selectedBy, 'auto', 'expected auto-discovery to select gopls');
    assert.deepEqual(
      result.edges,
      [],
      `expected no caller for a MethodByName-by-string-literal call, since the target name never appears as a static identifier reference anywhere in source - if this now finds one, gopls's behavior changed and catalog.ts's docs.limitations claim for Go needs re-examination, got ${JSON.stringify(result.edges)}`,
    );
  },
);

goplsGatedTest(
  'Go (gopls): capturing a function by identifier and invoking it reflectively DOES appear as a caller - but only because gopls reports the reference, not because it resolves the reflective call (proven by an identical, call-free control)',
  { timeout: 30000 },
  async t => {
    const reflectiveCallWorkspace = await goWorkspace(
      t,
      ['package fixture', '', 'func FixtureTarget() int {', '\treturn 1', '}', ''].join('\n'),
      [
        'package fixture',
        '',
        'import "reflect"',
        '',
        'func FixtureCaller() int {',
        '\tv := reflect.ValueOf(FixtureTarget)',
        '\tresult := v.Call(nil)',
        '\treturn int(result[0].Int())',
        '}',
        '',
      ].join('\n'),
    );
    const reflectiveProvider = new LspCallHierarchyProvider(reflectiveCallWorkspace, 'target.go', undefined, 20000);
    t.after(() => reflectiveProvider.dispose());
    const reflectiveResult = await analyzeImpact(
      { workspace: reflectiveCallWorkspace, file: 'target.go', line: 3, column: 6, depth: 5, maxNodes: 50 },
      reflectiveProvider,
    );
    assert.ok(
      names(reflectiveResult).includes('FixtureCaller'),
      `expected reflect.ValueOf(FixtureTarget).Call(...) to be reported as a caller (the finding this test locks in) - if this no longer finds it, catalog.ts's Go docs.limitations wording needs re-examination in the other direction, got ${JSON.stringify(names(reflectiveResult))}`,
    );

    // The control: an identical identifier reference (variable capture), with NO call anywhere - not even
    // through reflect.Value.Call. If gopls were genuinely resolving the reflective call above, this
    // call-free version would report no caller. It does not - proving the row above is a reference report,
    // not a resolved call.
    const referenceOnlyWorkspace = await goWorkspace(
      t,
      ['package fixture', '', 'func FixtureTarget() int {', '\treturn 1', '}', ''].join('\n'),
      [
        'package fixture',
        '',
        'func FixtureCaller() int {',
        '\tvar f func() int = FixtureTarget',
        '\t_ = f',
        '\treturn 0',
        '}',
        '',
      ].join('\n'),
    );
    const referenceOnlyProvider = new LspCallHierarchyProvider(referenceOnlyWorkspace, 'target.go', undefined, 20000);
    t.after(() => referenceOnlyProvider.dispose());
    const referenceOnlyResult = await analyzeImpact(
      { workspace: referenceOnlyWorkspace, file: 'target.go', line: 3, column: 6, depth: 5, maxNodes: 50 },
      referenceOnlyProvider,
    );
    assert.ok(
      names(referenceOnlyResult).includes('FixtureCaller'),
      `expected a call-free identifier reference to ALSO be reported as a caller, proving the reflective-call row above is reference-reporting, not call resolution - if this no longer reproduces, gopls's incomingCalls behavior changed and this test's own premise needs re-examination, got ${JSON.stringify(names(referenceOnlyResult))}`,
    );
  },
);

// ---------------------------------------------------------------------------
// C - clangd, gated the same way clangdIntegration.test.ts's clangdGatedTest is.
// ---------------------------------------------------------------------------

const CLANGD_ON_PATH = findExecutable('clangd') !== undefined;
const REQUIRE_CLANGD = process.env.IMPACT_LENS_REQUIRE_CLANGD === '1';
const IS_CI = Boolean(process.env.CI);

function clangdGatedTest(name: string, options: { readonly timeout: number }, fn: (t: TestContext) => Promise<void>): void {
  if (REQUIRE_CLANGD) {
    if (CLANGD_ON_PATH) {
      test(name, options, fn);
      return;
    }
    test(name, () => {
      assert.fail(
        'IMPACT_LENS_REQUIRE_CLANGD=1 but no clangd executable was found on PATH - this job exists ' +
        'specifically to prove the shipped preset\'s function-pointer gap and reference-as-caller ' +
        'over-report both still hold, skipping instead of failing would make the job green without having ' +
        'proven anything.',
      );
    });
    return;
  }
  if (IS_CI) {
    // Same reasoning as clangdIntegration.test.ts's clangdGatedTest: a CI job that never opted into
    // verifying the clangd preset must not silently exercise an unpinned, unmeasured version anyway.
    test(name, { skip: 'CI job did not set IMPACT_LENS_REQUIRE_CLANGD, so it never opted into verifying the clangd preset.' }, fn);
    return;
  }
  if (CLANGD_ON_PATH) {
    test(name, options, fn);
    return;
  }
  test.skip(name, fn);
}

async function cWorkspace(t: TestContext, fileBody: string): Promise<string> {
  const workspace = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'impact-lens-gate1-c-')));
  t.after(() => fs.rm(workspace, { recursive: true, force: true }));
  await fs.writeFile(path.join(workspace, 'fixture.c'), fileBody);
  return workspace;
}

clangdGatedTest(
  'C (clangd): a function pointer invocation is not part of the Call Hierarchy result - the pointer\'s own assignment site appears as the "caller" instead',
  { timeout: 20000 },
  async t => {
    const workspace = await cWorkspace(
      t,
      ['void fixture_target(void) {', '}', '', 'void fixture_caller(void) {', '    void (*fp)(void) = fixture_target;', '    fp();', '}', ''].join('\n'),
    );
    const provider = new LspCallHierarchyProvider(workspace, 'fixture.c', undefined, 20000);
    t.after(() => provider.dispose());
    const result = await analyzeImpact({ workspace, file: 'fixture.c', line: 1, column: 6, depth: 5, maxNodes: 50 }, provider);
    assert.equal(provider.capabilities.selectedBy, 'auto', 'expected auto-discovery to select clangd');
    const edges = result.edges as ReadonlyArray<{ readonly callSites: ReadonlyArray<{ readonly range: { readonly start: { readonly line: number } } }> }>;
    assert.equal(edges.length, 1, `expected exactly one caller entry (the assignment site), got ${JSON.stringify(edges)}`);
    assert.equal(
      edges[0]!.callSites[0]!.range.start.line,
      5,
      'expected the reported call site to be the pointer ASSIGNMENT line (line 5), not the indirect-call line (line 6) - if this now points at the call line, clangd started resolving the indirect call itself and catalog.ts\'s docs.limitations claim needs re-examination',
    );
  },
);

clangdGatedTest(
  'C (clangd): the same reference-as-caller appears even when the pointer is never called through at all',
  { timeout: 20000 },
  async t => {
    const workspace = await cWorkspace(
      t,
      ['void fixture_target(void) {', '}', '', 'void fixture_caller(void) {', '    void (*fp)(void) = fixture_target;', '    (void)fp;', '}', ''].join('\n'),
    );
    const provider = new LspCallHierarchyProvider(workspace, 'fixture.c', undefined, 20000);
    t.after(() => provider.dispose());
    const result = await analyzeImpact({ workspace, file: 'fixture.c', line: 1, column: 6, depth: 5, maxNodes: 50 }, provider);
    assert.ok(
      names(result).includes('fixture_caller'),
      `expected a call-free pointer assignment to STILL be reported as a caller, proving this is reference-reporting rather than resolving the indirect call above - if this no longer reproduces, clangd's behavior changed and this test's own premise needs re-examination, got ${JSON.stringify(names(result))}`,
    );
  },
);
