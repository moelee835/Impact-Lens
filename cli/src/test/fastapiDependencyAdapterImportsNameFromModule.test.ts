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
// This file tests design 3 (current): relative imports resolve exactly by file position; absolute imports
// compare the dotted path as a path-SEGMENT suffix of `rootFile` (never a raw string .endsWith(), which
// would let `my_pkg_a/users.py` satisfy a `pkg_a/users.py` suffix) - no package-root guess needed, so no
// resolution-failure case exists to have a policy for. All cases here are re-derivations of the isolated
// probe matrices already run before implementing (see the work document), pinned as executable tests.
//
// Every positive case here is also fed as CRLF (a trailing `\r` on the line) - the Windows-only `$`-anchor
// regression this file's sibling design already hit once (this repo's slowest, least reliable CI signal is
// windows-latest; these are fast, platform-independent regression tests instead).

test('relative import, same directory as importing file', () => {
  assert.equal(
    importsNameFromModule(['from .users import router'], 'router', '/ws/pkg_a/users.py', '/ws/pkg_a/main.py'),
    true,
  );
  assert.equal(
    importsNameFromModule(['from .users import router\r'], 'router', '/ws/pkg_a/users.py', '/ws/pkg_a/main.py'),
    true,
  );
});

test('relative import, one level up (from ..mod import x)', () => {
  assert.equal(
    importsNameFromModule(['from ..users import router'], 'router', '/ws/pkg_a/users.py', '/ws/pkg_a/sub/main.py'),
    true,
  );
  assert.equal(
    importsNameFromModule(['from ..users import router\r'], 'router', '/ws/pkg_a/users.py', '/ws/pkg_a/sub/main.py'),
    true,
  );
});

test('relative import into a subpackage', () => {
  assert.equal(
    importsNameFromModule(['from .sub.users import router'], 'router', '/ws/pkg_a/sub/users.py', '/ws/pkg_a/main.py'),
    true,
  );
});

test('relative import rejects a cross-package basename collision (root and importer in different packages, no dots resolve across)', () => {
  assert.equal(
    importsNameFromModule(['from .users import router'], 'router', '/ws/pkg_a/users.py', '/ws/pkg_b/main.py'),
    false,
  );
});

test('absolute import, flat layout, correct package', () => {
  assert.equal(
    importsNameFromModule(['from pkg_a.users import router'], 'router', '/ws/pkg_a/users.py', '/ws/main.py'),
    true,
  );
  assert.equal(
    importsNameFromModule(['from pkg_a.users import router\r'], 'router', '/ws/pkg_a/users.py', '/ws/main.py'),
    true,
  );
});

test('absolute import, flat layout, WRONG package - rejected (the cross-package collision this function exists to close)', () => {
  assert.equal(
    importsNameFromModule(['from pkg_b.users import router'], 'router', '/ws/pkg_a/users.py', '/ws/main.py'),
    false,
  );
});

test('absolute import, src layout, correct package (regression: a workspace-root-exact comparison broke this, a plain last-segment comparison had accidentally gotten it right)', () => {
  assert.equal(
    importsNameFromModule(['from pkg_a.users import router'], 'router', '/ws/src/pkg_a/users.py', '/ws/main.py'),
    true,
  );
  assert.equal(
    importsNameFromModule(['from pkg_a.users import router\r'], 'router', '/ws/src/pkg_a/users.py', '/ws/main.py'),
    true,
  );
});

test('absolute import, src layout, WRONG package - still rejected', () => {
  assert.equal(
    importsNameFromModule(['from pkg_b.users import router'], 'router', '/ws/src/pkg_a/users.py', '/ws/main.py'),
    false,
  );
});

test('absolute import, nested package, correct leaf package', () => {
  assert.equal(
    importsNameFromModule(['from pkg.sub.users import router'], 'router', '/ws/pkg/sub/users.py', '/ws/main.py'),
    true,
  );
});

test('absolute import, nested package, wrong leaf package - rejected', () => {
  assert.equal(
    importsNameFromModule(['from pkg.other.users import router'], 'router', '/ws/pkg/sub/users.py', '/ws/main.py'),
    false,
  );
});

test('absolute import suffix comparison is segment-based, not a raw string suffix (my_pkg_a must not satisfy a pkg_a/users.py suffix)', () => {
  assert.equal(
    importsNameFromModule(['from pkg_a.users import router'], 'router', '/ws/my_pkg_a/users.py', '/ws/main.py'),
    false,
  );
});

test('aliased import is rejected on both relative and absolute forms (alias changes the local identifier - accepted miss)', () => {
  assert.equal(
    importsNameFromModule(['from .users import router as user_router'], 'router', '/ws/pkg_a/users.py', '/ws/pkg_a/main.py'),
    false,
  );
  assert.equal(
    importsNameFromModule(['from pkg_a.users import router as user_router'], 'router', '/ws/pkg_a/users.py', '/ws/main.py'),
    false,
  );
});

test('import from an unrelated module is rejected regardless of relative/absolute form', () => {
  assert.equal(
    importsNameFromModule(['from .orders import router'], 'router', '/ws/pkg_a/users.py', '/ws/pkg_a/main.py'),
    false,
  );
  assert.equal(
    importsNameFromModule(['from unrelated_module import router'], 'router', '/ws/pkg_a/users.py', '/ws/main.py'),
    false,
  );
});

test('finds the import when it is not the only line, mixed LF/CRLF', () => {
  const lines = 'from fastapi import FastAPI\r\nfrom .users import router\r\napp = FastAPI()\r\n'.split('\n');
  assert.equal(importsNameFromModule(lines, 'router', '/ws/pkg_a/users.py', '/ws/pkg_a/main.py'), true);
});

test('reverse alias is rejected - importing an unrelated symbol and renaming it locally to the target name (round 3, reviewer finding)', () => {
  assert.equal(
    importsNameFromModule(['from adversary_reversealias_target import other_thing as router'], 'router', '/ws/adversary_reversealias_target.py', '/ws/main.py'),
    false,
  );
  assert.equal(
    importsNameFromModule(['from .target import other_thing as router'], 'router', '/ws/pkg_a/target.py', '/ws/pkg_a/main.py'),
    false,
  );
});

test('reverse alias is rejected regardless of position in a comma-separated list', () => {
  assert.equal(
    importsNameFromModule(['from target import router as decoy_router, other_thing as router'], 'router', '/ws/target.py', '/ws/main.py'),
    false,
  );
});

test('KNOWN, ACCEPTED false negative (round 3, commander finding): a single-line parenthesized import is not detected', () => {
  // The previous word-boundary comparison matched this shape (parentheses are non-word characters, valid
  // boundaries for `\bname\b`) - the exact-entry comparison this function now uses cannot, since the
  // captured entry is the literal text "(router)", which never string-equals "router". A new, deliberate
  // narrowing (see importsBareNameEntry()'s own doc comment and the work document's "누적된 좁힘" list).
  assert.equal(
    importsNameFromModule(['from pkg.users import (router)'], 'router', '/ws/pkg/users.py', '/ws/main.py'),
    false,
  );
});
