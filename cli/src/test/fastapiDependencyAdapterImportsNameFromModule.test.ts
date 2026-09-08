import assert from 'node:assert/strict';
import test from 'node:test';
import { importsNameFromModule } from '../adapters/fastapiDependencyAdapter';

// M4 gate 4 module-resolution follow-up (docs/work/task-m4-gate4-module-resolution.md).
// `importsNameFromModule()` went through two designs after the original stem-only comparison (M4 gate 4
// reopening, docs/work/task-m4-gate4-mount-false-positive.md):
//   1. Compare only the module path's last dotted segment - could not tell `pkg_a/users.py` apart from an
//      unrelated `pkg_b/users.py` (masked, not fixed, by isRouterMounted()'s old nameAmbiguous check).
//   2. Resolve relative imports exactly (importing file's own location) and absolute imports against the
//      workspace root as an assumed package root - exact for relative imports, but broke a `src/` layout
//      project's absolute imports, which design 1's cruder comparison had actually gotten right by
//      accident (commander review, measured against a 6-case layout matrix).
// This file tests design 3: relative imports resolve exactly by file position; absolute imports compare
// the dotted path as a path-SEGMENT suffix of `rootFile` (never a raw string .endsWith(), which would let
// `my_pkg_a/users.py` satisfy a `pkg_a/users.py` suffix) - no package-root guess needed for a MULTI-segment
// dotted path, so no resolution-failure case exists to have a policy for there. All cases here are
// re-derivations of the isolated probe matrices already run before implementing (see the work document),
// pinned as executable tests.
//
// Design 3 still degenerates for a SINGLE-segment absolute import (`from users import x` - no dots at
// all): the suffix comparison collapses to a bare-basename match, true at ANY depth. M4 gate 4
// single-segment-import follow-up (docs/work/task-m4-gate4-single-segment-import.md, design 4, current)
// closes this by additionally requiring `rootFile` sit directly under the new `workspace` parameter for
// this one case - see the "single-segment absolute import" test block below. `workspace` is `/ws` for
// every test in this file unless a test's own comment says otherwise; most calls here use a multi-segment
// or relative import, so the added parameter is inert for them (the guard only ever fires when the
// resolved module path is exactly one segment) - passing a consistent `/ws` throughout just keeps every
// call site uniform.
//
// Every positive case here is also fed as CRLF (a trailing `\r` on the line) - the Windows-only `$`-anchor
// regression this file's sibling design already hit once (this repo's slowest, least reliable CI signal is
// windows-latest; these are fast, platform-independent regression tests instead).

const WS = '/ws';

test('relative import, same directory as importing file', () => {
  assert.equal(
    importsNameFromModule(['from .users import router'], 'router', '/ws/pkg_a/users.py', '/ws/pkg_a/main.py', WS),
    true,
  );
  assert.equal(
    importsNameFromModule(['from .users import router\r'], 'router', '/ws/pkg_a/users.py', '/ws/pkg_a/main.py', WS),
    true,
  );
});

test('relative import, one level up (from ..mod import x)', () => {
  assert.equal(
    importsNameFromModule(['from ..users import router'], 'router', '/ws/pkg_a/users.py', '/ws/pkg_a/sub/main.py', WS),
    true,
  );
  assert.equal(
    importsNameFromModule(['from ..users import router\r'], 'router', '/ws/pkg_a/users.py', '/ws/pkg_a/sub/main.py', WS),
    true,
  );
});

test('relative import into a subpackage', () => {
  assert.equal(
    importsNameFromModule(['from .sub.users import router'], 'router', '/ws/pkg_a/sub/users.py', '/ws/pkg_a/main.py', WS),
    true,
  );
});

test('relative import rejects a cross-package basename collision (root and importer in different packages, no dots resolve across)', () => {
  assert.equal(
    importsNameFromModule(['from .users import router'], 'router', '/ws/pkg_a/users.py', '/ws/pkg_b/main.py', WS),
    false,
  );
});

test('absolute import, flat layout, correct package', () => {
  assert.equal(
    importsNameFromModule(['from pkg_a.users import router'], 'router', '/ws/pkg_a/users.py', '/ws/main.py', WS),
    true,
  );
  assert.equal(
    importsNameFromModule(['from pkg_a.users import router\r'], 'router', '/ws/pkg_a/users.py', '/ws/main.py', WS),
    true,
  );
});

test('absolute import, flat layout, WRONG package - rejected (the cross-package collision this function exists to close)', () => {
  assert.equal(
    importsNameFromModule(['from pkg_b.users import router'], 'router', '/ws/pkg_a/users.py', '/ws/main.py', WS),
    false,
  );
});

test('absolute import, src layout, correct package (regression: a workspace-root-exact comparison broke this, a plain last-segment comparison had accidentally gotten it right)', () => {
  assert.equal(
    importsNameFromModule(['from pkg_a.users import router'], 'router', '/ws/src/pkg_a/users.py', '/ws/main.py', WS),
    true,
  );
  assert.equal(
    importsNameFromModule(['from pkg_a.users import router\r'], 'router', '/ws/src/pkg_a/users.py', '/ws/main.py', WS),
    true,
  );
});

test('absolute import, src layout, WRONG package - still rejected', () => {
  assert.equal(
    importsNameFromModule(['from pkg_b.users import router'], 'router', '/ws/src/pkg_a/users.py', '/ws/main.py', WS),
    false,
  );
});

test('absolute import, nested package, correct leaf package', () => {
  assert.equal(
    importsNameFromModule(['from pkg.sub.users import router'], 'router', '/ws/pkg/sub/users.py', '/ws/main.py', WS),
    true,
  );
});

test('absolute import, nested package, wrong leaf package - rejected', () => {
  assert.equal(
    importsNameFromModule(['from pkg.other.users import router'], 'router', '/ws/pkg/sub/users.py', '/ws/main.py', WS),
    false,
  );
});

test('absolute import suffix comparison is segment-based, not a raw string suffix (my_pkg_a must not satisfy a pkg_a/users.py suffix)', () => {
  assert.equal(
    importsNameFromModule(['from pkg_a.users import router'], 'router', '/ws/my_pkg_a/users.py', '/ws/main.py', WS),
    false,
  );
});

test('aliased import is rejected on both relative and absolute forms (alias changes the local identifier - accepted miss)', () => {
  assert.equal(
    importsNameFromModule(['from .users import router as user_router'], 'router', '/ws/pkg_a/users.py', '/ws/pkg_a/main.py', WS),
    false,
  );
  assert.equal(
    importsNameFromModule(['from pkg_a.users import router as user_router'], 'router', '/ws/pkg_a/users.py', '/ws/main.py', WS),
    false,
  );
});

test('import from an unrelated module is rejected regardless of relative/absolute form', () => {
  assert.equal(
    importsNameFromModule(['from .orders import router'], 'router', '/ws/pkg_a/users.py', '/ws/pkg_a/main.py', WS),
    false,
  );
  // Single-segment absolute import ('unrelated_module', no dots) - workspace set to rootFile's own
  // directory so the single-segment depth guard (tested in its own block below) trivially passes and
  // this assertion isolates what it actually claims to test: a name mismatch, not a depth mismatch.
  assert.equal(
    importsNameFromModule(['from unrelated_module import router'], 'router', '/ws/pkg_a/users.py', '/ws/main.py', '/ws/pkg_a'),
    false,
  );
});

test('finds the import when it is not the only line, mixed LF/CRLF', () => {
  const lines = 'from fastapi import FastAPI\r\nfrom .users import router\r\napp = FastAPI()\r\n'.split('\n');
  assert.equal(importsNameFromModule(lines, 'router', '/ws/pkg_a/users.py', '/ws/pkg_a/main.py', WS), true);
});

test('reverse alias is rejected - importing an unrelated symbol and renaming it locally to the target name (round 3, reviewer finding)', () => {
  assert.equal(
    importsNameFromModule(['from adversary_reversealias_target import other_thing as router'], 'router', '/ws/adversary_reversealias_target.py', '/ws/main.py', WS),
    false,
  );
  assert.equal(
    importsNameFromModule(['from .target import other_thing as router'], 'router', '/ws/pkg_a/target.py', '/ws/pkg_a/main.py', WS),
    false,
  );
});

test('reverse alias is rejected regardless of position in a comma-separated list', () => {
  assert.equal(
    importsNameFromModule(['from target import router as decoy_router, other_thing as router'], 'router', '/ws/target.py', '/ws/main.py', WS),
    false,
  );
});

test('KNOWN, ACCEPTED false negative (round 3, commander finding): a single-line parenthesized import is not detected', () => {
  // The previous word-boundary comparison matched this shape (parentheses are non-word characters, valid
  // boundaries for `\bname\b`) - the exact-entry comparison this function now uses cannot, since the
  // captured entry is the literal text "(router)", which never string-equals "router". A new, deliberate
  // narrowing (see importsBareNameEntry()'s own doc comment and the work document's "누적된 좁힘" list).
  assert.equal(
    importsNameFromModule(['from pkg.users import (router)'], 'router', '/ws/pkg/users.py', '/ws/main.py', WS),
    false,
  );
});

// ---------------------------------------------------------------------------
// M4 gate 4 single-segment-import follow-up (docs/work/task-m4-gate4-single-segment-import.md). A
// single-segment absolute import (`from users import router`, no dots in the module path) has no second
// path segment to anchor the suffix comparison above - it degenerates to a bare-basename match at ANY
// depth. Design 4 (current) additionally requires `rootFile` sit directly under `workspace` for this one
// case, since a single-segment import only plausibly resolves to a file reachable as a top-level module
// from the assumed package root - `workspace` is the only root available without reading package
// metadata. Two cheaper alternatives (workspace-wide uniqueness of the basename, and none at all) were
// measured and rejected before this one - see the work document's "대안 검토" for the 5-case matrix that
// ruled uniqueness out in both directions, not just one.
// ---------------------------------------------------------------------------

test('single-segment absolute import, root NESTED (not directly under workspace) - rejected (the primary bug this design closes, no colliding basename needed)', () => {
  assert.equal(
    importsNameFromModule(['from users import router'], 'router', '/ws/deeply/nested/users.py', '/ws/consumer.py', WS),
    false,
  );
});

test('single-segment absolute import, root directly under workspace (flat layout) - confirmed', () => {
  assert.equal(
    importsNameFromModule(['from users import router'], 'router', '/ws/users.py', '/ws/consumer.py', WS),
    true,
  );
  assert.equal(
    importsNameFromModule(['from users import router\r'], 'router', '/ws/users.py', '/ws/consumer.py', WS),
    true,
  );
});

test('KNOWN, ACCEPTED false negative (M4 gate 4 single-segment-import follow-up): a single-segment absolute import naming a genuinely top-level module of a nested project layout (e.g. src/) is not detected', () => {
  // A real src-layout project might run with `src` on sys.path, making `src/users.py` a legitimate
  // top-level module reachable as `from users import x` - but this function has no way to distinguish
  // that from an arbitrary nested directory without reading project metadata (out of scope), so it is
  // rejected the same as the primary bug case above. Accepted (false-negative direction), not silently
  // dropped - see the work document's "누적된 좁힘"-style accounting.
  assert.equal(
    importsNameFromModule(['from users import router'], 'router', '/ws/src/users.py', '/ws/src/consumer.py', WS),
    false,
  );
});

// ---------------------------------------------------------------------------
// KNOWN, ACCEPTED RESIDUAL FALSE POSITIVE (commander review - NOT closed by the single-segment guard
// above, which only fires when the dotted path has exactly one segment). A MULTI-segment absolute import
// still confirms EITHER of two files whose paths happen to end in the same dotted-path suffix ("two
// vendored copies of the same nested path" - a vendored/duplicated package layout, not an ordinary one).
// This is a genuine false positive, not a false negative - deliberately NOT pinned in
// pythonFastapiIntegration.test.ts (the precision-denominator corpus), since asserting it as "expected"
// there would count a real false positive toward that corpus's "precision 100%" claim, making the claim
// false. Pinned here only, as executable evidence of an accepted (not fixed) limitation, tracked in
// docs/work/task-m4-gate4-single-segment-import.md's "gate 4 판정" - gate 4 was closed CARRYING this
// residual, not on a false claim that no false-positive paths remained.
// ---------------------------------------------------------------------------

test('KNOWN, ACCEPTED RESIDUAL FALSE POSITIVE: a multi-segment absolute import confirms EITHER of two files ending in the same dotted-path suffix (vendored/duplicated package layout)', () => {
  const lines = ['from pkg_a.users import router'];
  const nestedVendoredCopy = importsNameFromModule(lines, 'router', '/ws/vendor/pkg_a/users.py', '/ws/main.py', WS);
  const realTopLevelCopy = importsNameFromModule(lines, 'router', '/ws/pkg_a/users.py', '/ws/main.py', WS);
  assert.equal(nestedVendoredCopy, true, 'documents the current (accepted, not desired) behavior - see the doc comment above for why this is not fixed');
  assert.equal(realTopLevelCopy, true, 'the same import statement also confirms the other file - at most one of these two can be correct');
});
