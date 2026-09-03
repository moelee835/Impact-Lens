import assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import test, { type TestContext } from 'node:test';
import { analyzeImpact } from '../impact';
import { LspCallHierarchyProvider } from '../lspProvider';
import { CLANGD_PRESET_ID, findPreset, PROVIDER_CATALOG } from '../providers/catalog';
import { findExecutable } from '../providers/discovery';
import { ProviderPreset } from '../providers/preset';
import { LimitationDetail } from '../types';

// M2 clangd lane stage 5 (docs/work/task-m2-clangd-preset.md) - a commander review found the shipped
// preset's own `fixture` (doctor/checks.ts's `--fixture` mode) structurally cannot cover the feature
// this preset actually sells: `ProviderFixtureFile.content` is a static string, and `fixtureCheck()`
// (doctor/index.ts) only creates the fixture's real, absolute temp-directory path via `fs.mkdtempSync()`
// AFTER that static content is already defined - there is no template-injection hook to put that path
// into a `compile_commands.json`'s `directory` field. So the shipped fixture (stage 4) can only ever
// prove the DEGRADED path: no compile database, single file. It says nothing about the path this preset
// exists for - a real compile database, cross-file caller discovery. This file is where that path gets
// proven, because a TEST (unlike a static preset definition) runs at a point where the real temp
// directory path already exists and can be written into a real compile_commands.json.
//
// Two scenarios, deliberately paired as a positive/negative control on the same file layout: the ONLY
// difference between them is whether compile_commands.json exists. That is what makes each one prove
// something about compile-database presence specifically, not about the fixture shape in general.

const CLANGD_ON_PATH = findExecutable('clangd') !== undefined;
const REQUIRE_CLANGD = process.env.IMPACT_LENS_REQUIRE_CLANGD === '1';

/**
 * Runs `fn` normally when clangd is on PATH; skips it (a real, visible skip, not a silent one) when
 * clangd is absent and nothing required it; fails it loudly when clangd is absent but
 * `IMPACT_LENS_REQUIRE_CLANGD=1` said it must be present - the `clangd-provider` CI job sets exactly
 * that. Same shape as `stateReachability.integration.test.ts`'s `goplsGatedTest`, for the same reason:
 * a contributor's machine without clangd installed must not fail `npm run cli:test`, but a CI job that
 * exists specifically to prove this preset works must not silently skip it either.
 */
function clangdGatedTest(
  name: string,
  options: { readonly timeout: number },
  fn: (t: TestContext) => Promise<void>,
): void {
  if (CLANGD_ON_PATH) {
    test(name, options, fn);
    return;
  }
  if (REQUIRE_CLANGD) {
    test(name, () => {
      assert.fail(
        'IMPACT_LENS_REQUIRE_CLANGD=1 but no clangd executable was found on PATH. This job exists ' +
        'specifically to prove the shipped clangd preset resolves a real cross-file caller through a ' +
        'real compile database - skipping instead of failing here would make the job green without ' +
        'having proven anything.',
      );
    });
    return;
  }
  test.skip(name, fn);
}

function shippedClangdPreset(): ProviderPreset {
  const preset = findPreset(PROVIDER_CATALOG, CLANGD_PRESET_ID);
  assert.ok(preset, 'expected the shipped catalog to declare a clangd preset');
  return preset!;
}

const TARGET_H = ['#ifndef TARGET_H', '#define TARGET_H', 'void fixture_target(void);', '#endif', ''].join('\n');
const TARGET_C = ['#include "target.h"', '', 'void fixture_target(void) {', '}', ''].join('\n');
const CALLER_C = ['#include "target.h"', '', 'void fixture_caller(void) {', '    fixture_target();', '}', ''].join('\n');

/**
 * Two real files (target.c defines fixture_target via target.h, caller.c calls it), written to a real
 * temp directory. `withCompileDatabase` controls the one variable this pair of tests exists to isolate:
 * whether a real `compile_commands.json` - with this workspace's own real absolute path in `directory`,
 * something no static preset fixture can ever contain - is present.
 */
async function realClangdWorkspace(t: TestContext, withCompileDatabase: boolean): Promise<string> {
  const workspace = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'impact-lens-clangd-ci-')));
  t.after(() => fs.rm(workspace, { recursive: true, force: true }));
  await fs.writeFile(path.join(workspace, 'target.h'), TARGET_H);
  await fs.writeFile(path.join(workspace, 'target.c'), TARGET_C);
  await fs.writeFile(path.join(workspace, 'caller.c'), CALLER_C);
  if (withCompileDatabase) {
    const entries = [
      { directory: workspace, arguments: ['clang', '-c', 'target.c', '-o', 'target.o'], file: path.join(workspace, 'target.c') },
      { directory: workspace, arguments: ['clang', '-c', 'caller.c', '-o', 'caller.o'], file: path.join(workspace, 'caller.c') },
    ];
    await fs.writeFile(path.join(workspace, 'compile_commands.json'), JSON.stringify(entries));
  }
  return workspace;
}

/** Queries fixture_target's incoming calls from ITS OWN file - the direction stage 4's fixture bug found unreachable without a compile database, and the direction this preset's real feature (cross-file discovery) has to prove. */
async function queryFixtureTargetOnce(workspace: string, provider: LspCallHierarchyProvider): Promise<Record<string, unknown>> {
  const result = await analyzeImpact(
    { workspace, file: 'target.c', line: 3, column: 6, depth: 5, maxNodes: 50 },
    provider,
  );
  assert.equal(provider.capabilities.selectedBy, 'auto', 'expected auto-discovery, not a test override, to have selected clangd');
  return result;
}

/**
 * Retries the same query on the SAME already-open provider session until `expectedCaller` appears or
 * `budgetMs` runs out - not a fresh clangd process per attempt, which would just restart the same race.
 *
 * clangd's background indexing after a compile-database-backed `didOpen` is asynchronous, and this
 * preset declares no `readiness` (stage 1's gate finding: the signal is `didOpen`-triggered, structurally
 * unreachable at the point `awaitReadiness()` runs - see the preset's own comment in catalog.ts), so a
 * query issued immediately after the provider initializes can race ahead of indexing completion. Found
 * directly, not assumed: this exact positive-control test passed in isolation every time (~60ms
 * end-to-end) but failed intermittently once folded into the full suite under real system load, with
 * `fixture_caller` simply absent from an otherwise-correct, ok:true response - not an error, an early
 * answer. Retrying matches how a real user would actually recover from this: running the same query
 * again a moment later. A production query has no such retry today (no readiness means no automatic
 * wait); this is left as-is for stage 5 rather than turned into a new product feature un-requested by
 * any stage's decision record.
 */
async function queryUntilCallerFound(
  workspace: string,
  provider: LspCallHierarchyProvider,
  expectedCaller: string,
  budgetMs: number,
): Promise<Record<string, unknown>> {
  const deadline = Date.now() + budgetMs;
  for (;;) {
    const result = await queryFixtureTargetOnce(workspace, provider);
    const names = (result.nodes as ReadonlyArray<{ readonly name?: string }>).map(node => node.name);
    if (names.includes(expectedCaller) || Date.now() >= deadline) {
      return result;
    }
    await new Promise(resolve => setTimeout(resolve, 250));
  }
}

clangdGatedTest(
  'with a real compile database: the real shipped clangd preset finds the cross-file caller, and reports no compile_database_missing',
  { timeout: 30000 },
  async t => {
    const preset = shippedClangdPreset();
    const workspace = await realClangdWorkspace(t, true);
    const provider = new LspCallHierarchyProvider(workspace, 'target.c', undefined, 20000);
    t.after(() => provider.dispose());
    const result = await queryUntilCallerFound(workspace, provider, 'fixture_caller', 15000);
    const callerNames = (result.nodes as ReadonlyArray<{ readonly name?: string }>)
      .map(node => node.name)
      .filter((name): name is string => name !== undefined);
    assert.ok(
      callerNames.includes('fixture_caller'),
      `expected fixture_caller (defined in a different file, connected only through compile_commands.json) among ${JSON.stringify(callerNames)}`,
    );
    const codes = (result.limitationDetails as readonly LimitationDetail[]).map(detail => detail.code);
    assert.ok(!codes.includes('compile_database_missing'), `expected no compile_database_missing, got ${JSON.stringify(codes)}`);
    assert.equal(preset.tier, 'verified-external');
  },
);

clangdGatedTest(
  'negative control - same two files, no compile database: the cross-file caller is NOT found, and compile_database_missing IS reported',
  { timeout: 30000 },
  async t => {
    const workspace = await realClangdWorkspace(t, false);
    // No retry here on purpose: with no compile database there is no background index to eventually
    // catch up - fixture_caller is not a matter of timing, it is genuinely unreachable (stage 4's own
    // finding), so a single query is the right shape for a negative control, not a shorter version of
    // the positive test's retry loop.
    const provider = new LspCallHierarchyProvider(workspace, 'target.c', undefined, 20000);
    t.after(() => provider.dispose());
    const result = await queryFixtureTargetOnce(workspace, provider);
    const callerNames = (result.nodes as ReadonlyArray<{ readonly name?: string }>)
      .map(node => node.name)
      .filter((name): name is string => name !== undefined);
    // This is the exact failure stage 4's own `doctor clangd --fixture` caught: clangd's fallback
    // command (no compile database) has no index to discover an unopened file's calls with, so
    // fixture_caller - real, present in caller.c, but never opened by this query - does not appear.
    assert.ok(
      !callerNames.includes('fixture_caller'),
      'expected fixture_caller to be invisible without a compile database (same root cause stage 4 found via doctor --fixture) - if this now finds it, clangd behavior or this CLI\'s traversal changed and the positive-control test above needs re-examination for whether it still proves what it claims to',
    );
    const codes = (result.limitationDetails as readonly LimitationDetail[]).map(detail => detail.code);
    assert.ok(codes.includes('compile_database_missing'), `expected compile_database_missing, got ${JSON.stringify(codes)}`);
  },
);

// M2 gate-gaps lane (docs/work/task-m2-gate-gaps.md), closing IL-LIM-014 #3: the shipped preset's
// `docs.limitations` claims a specific C++ static-analysis shape (a virtual method reached only through
// a base-class pointer is invisible under the derived override's own Call Hierarchy result) on the
// strength of exactly one manual probe from stage 4 - never a repeating fixture. If clangd's behavior
// ever changes (or that probe was simply wrong), nothing today would notice. This fixture closes that gap
// for method/overload/virtual-dispatch specifically - function pointer and conditional-compilation
// limitations are out of this lane's scope (already fixture-backed differently, see the story doc).
//
// Real compile database, real clang++, one shared file layout, one shared provider session for all five
// queries below - that is what makes "same execution" literal, not just "same CI job": the positive
// assertions (method call found, int overload found, base-pointer virtual call found) share a session
// with the negative ones (double overload NOT found, derived override NOT found) they exist to give
// meaning to. A query landing between two files still ambiguous mid-index would fail the earlier positive
// assertions first, so a negative assertion is only ever checked once indexing has already been proven
// complete by an adjacent positive one in the same run.

const CPP_HEADER = [
  '#ifndef SHAPES_H',
  '#define SHAPES_H',
  '',
  'class Base {',
  'public:',
  '    virtual void target();',
  '    void helper();',
  '};',
  '',
  'class Derived : public Base {',
  'public:',
  '    void target() override;',
  '};',
  '',
  'void overloaded(int value);',
  'void overloaded(double value);',
  '',
  '#endif',
  '',
].join('\n');

// Definitions only, deliberately in one file: every symbol this test queries lives here, so all five
// queries below can share one `LspCallHierarchyProvider` session rooted at this file.
const CPP_DEFINITIONS = [
  '#include "shapes.h"',
  '',
  'void Base::target() {',
  '}',
  '',
  'void Base::helper() {',
  '}',
  '',
  'void Derived::target() {',
  '}',
  '',
  'void overloaded(int value) {',
  '}',
  '',
  'void overloaded(double value) {',
  '}',
  '',
].join('\n');

const CPP_CALLER = [
  '#include "shapes.h"',
  '',
  'void call_method(Base& obj) {',
  '    obj.helper();',
  '}',
  '',
  'void call_overloaded_int() {',
  '    overloaded(42);',
  '}',
  '',
  'void call_via_base_pointer(Base* ptr) {',
  '    ptr->target();',
  '}',
  '',
].join('\n');

async function realCppWorkspace(t: TestContext): Promise<string> {
  const workspace = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'impact-lens-clangd-cpp-')));
  t.after(() => fs.rm(workspace, { recursive: true, force: true }));
  await fs.writeFile(path.join(workspace, 'shapes.h'), CPP_HEADER);
  await fs.writeFile(path.join(workspace, 'shapes.cpp'), CPP_DEFINITIONS);
  await fs.writeFile(path.join(workspace, 'caller.cpp'), CPP_CALLER);
  const entries = [
    { directory: workspace, arguments: ['clang++', '-std=c++17', '-c', 'shapes.cpp', '-o', 'shapes.o'], file: path.join(workspace, 'shapes.cpp') },
    { directory: workspace, arguments: ['clang++', '-std=c++17', '-c', 'caller.cpp', '-o', 'caller.o'], file: path.join(workspace, 'caller.cpp') },
  ];
  await fs.writeFile(path.join(workspace, 'compile_commands.json'), JSON.stringify(entries));
  return workspace;
}

async function queryCppSymbolOnce(
  workspace: string,
  provider: LspCallHierarchyProvider,
  line: number,
  column: number,
): Promise<readonly string[]> {
  const result = await analyzeImpact(
    { workspace, file: 'shapes.cpp', line, column, depth: 5, maxNodes: 50 },
    provider,
  );
  assert.equal(provider.capabilities.selectedBy, 'auto', 'expected auto-discovery, not a test override, to have selected clangd');
  return (result.nodes as ReadonlyArray<{ readonly name?: string }>)
    .map(node => node.name)
    .filter((name): name is string => name !== undefined);
}

/** Same retry shape as `queryUntilCallerFound` above (background indexing after a compile-database
 * `didOpen` is async), generalized to any line/column in `shapes.cpp` rather than one hardcoded target. */
async function queryCppSymbolUntilFound(
  workspace: string,
  provider: LspCallHierarchyProvider,
  line: number,
  column: number,
  expectedCaller: string,
  budgetMs: number,
): Promise<readonly string[]> {
  const deadline = Date.now() + budgetMs;
  for (;;) {
    const names = await queryCppSymbolOnce(workspace, provider, line, column);
    if (names.includes(expectedCaller) || Date.now() >= deadline) {
      return names;
    }
    await new Promise(resolve => setTimeout(resolve, 250));
  }
}

clangdGatedTest(
  'C++ with a real compile database: method calls, overload resolution and virtual-dispatch invisibility are all correct',
  { timeout: 45000 },
  async t => {
    const workspace = await realCppWorkspace(t);
    const provider = new LspCallHierarchyProvider(workspace, 'shapes.cpp', undefined, 20000);
    t.after(() => provider.dispose());

    // 1. Method call - the feature proof AND the control for assertion 3 below: if the whole pipeline
    // were broken (wrong compile flags, provider crash, traversal regression), this would already fail,
    // which is what makes the negative assertions further down meaningful rather than vacuous.
    const helperCallers = await queryCppSymbolUntilFound(workspace, provider, 6, 12, 'call_method', 15000);
    assert.ok(helperCallers.includes('call_method'), `expected call_method among ${JSON.stringify(helperCallers)}`);

    // 2. Overload resolution - only `overloaded(42)` (the int overload) is ever called. If clangd (or
    // this CLI's normalization) conflated the two overloads, the caller would wrongly appear on the
    // double overload too, or the int overload would wrongly appear empty - either is a silently wrong
    // result, which is exactly what naming `overload` separately in the acceptance criterion guards
    // against.
    const intOverloadCallers = await queryCppSymbolUntilFound(workspace, provider, 12, 6, 'call_overloaded_int', 15000);
    assert.ok(intOverloadCallers.includes('call_overloaded_int'), `expected call_overloaded_int among ${JSON.stringify(intOverloadCallers)}`);
    const doubleOverloadCallers = await queryCppSymbolOnce(workspace, provider, 15, 6);
    assert.ok(
      !doubleOverloadCallers.includes('call_overloaded_int'),
      `expected the double overload to have no callers (only the int overload is ever invoked), got ${JSON.stringify(doubleOverloadCallers)}`,
    );

    // 3. Virtual dispatch limitation - `ptr->target()` through a `Base*` is attributed to Base::target's
    // Call Hierarchy result (the statically-typed call site), never to Derived::target's - the exact
    // shape catalog.ts's docs.limitations claims. This asserts the LIMITATION, not a feature: if clangd
    // later becomes able to resolve the derived override too, this assertion starts failing, which is
    // the point - it forces docs.limitations to be re-examined instead of quietly going stale.
    const baseTargetCallers = await queryCppSymbolUntilFound(workspace, provider, 3, 12, 'call_via_base_pointer', 15000);
    assert.ok(baseTargetCallers.includes('call_via_base_pointer'), `expected call_via_base_pointer among ${JSON.stringify(baseTargetCallers)}`);
    const derivedTargetCallers = await queryCppSymbolOnce(workspace, provider, 9, 15);
    assert.ok(
      !derivedTargetCallers.includes('call_via_base_pointer'),
      `expected Derived::target to show no callers (the call site is statically attributed to Base::target instead) - if this now finds it, clangd's virtual-dispatch resolution changed and catalog.ts's docs.limitations needs re-examination, got ${JSON.stringify(derivedTargetCallers)}`,
    );
  },
);
