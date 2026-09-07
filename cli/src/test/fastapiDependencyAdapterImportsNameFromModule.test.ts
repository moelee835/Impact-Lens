import assert from 'node:assert/strict';
import test from 'node:test';
import { importsNameFromModule } from '../adapters/fastapiDependencyAdapter';

// M4 gate 4 reopening (docs/work/task-m4-gate4-mount-false-positive.md): `importsNameFromModule()`'s
// `fromPattern` briefly ended in `(.+)$`. JS regex `.` excludes `\r`, so a CRLF line (this repository has
// no .gitattributes forcing LF, and this is a real Windows-user bug, not a CI/fixture artifact - a
// Windows developer's own Python files are CRLF too, so the anchored version silently failed to confirm
// ANY cross-file mount on a real Windows workspace) leaves a trailing `\r` the anchor can never match
// past. This was found by Windows CI (`clangd`/`cli:test`/`gopls`, all `windows-latest`) failing the
// cross-file positive mount test - the slowest, least reliable signal in this repository's CI (documented
// gopls hang history elsewhere). These tests feed CRLF input directly so a reintroduced `$` anchor (or any
// other line-ending-sensitive regression here) fails fast, on every platform, without depending on
// Windows CI to catch it.
//
// Also closes a gap in the six adversarial fixtures added alongside the original fix
// (pythonFastapiIntegration.test.ts's MOUNT_UNRESOLVED_GUARD_FIXTURES): every one of their mount calls
// sits in a non-root ("shadow") file, so on Windows - where importsNameFromModule() was silently always
// false - they still correctly produced mount-unresolved, for the wrong reason (isRootFile was false and
// the (silently broken) import check was never the thing rejecting them). Their non-vacuity (mutating the
// guard to `|| true` and confirming exactly those six fail) was proven on LF only; on CRLF/Windows it
// would have proven nothing, since the function they exercise never returned true there regardless. The
// import-provenance-succeeds direction below is what those six fixtures had no equivalent of.

test('importsNameFromModule finds a same-line, un-aliased import on an LF line', () => {
  assert.equal(
    importsNameFromModule(['from .users import router'], 'router', 'users'),
    true,
  );
});

test('importsNameFromModule finds the same import on a CRLF line (regression: a trailing $ anchor broke this on Windows)', () => {
  assert.equal(
    importsNameFromModule(['from .users import router\r'], 'router', 'users'),
    true,
  );
});

test('importsNameFromModule finds a dotted-package import on a CRLF line', () => {
  assert.equal(
    importsNameFromModule(['from pkg.sub.users import router\r'], 'router', 'users'),
    true,
  );
});

test('importsNameFromModule still rejects an aliased import on a CRLF line (alias changes the local identifier - accepted miss)', () => {
  assert.equal(
    importsNameFromModule(['from .users import router as user_router\r'], 'router', 'users'),
    false,
  );
});

test('importsNameFromModule still rejects an import from an unrelated module on a CRLF line', () => {
  assert.equal(
    importsNameFromModule(['from .orders import router\r'], 'router', 'users'),
    false,
  );
});

test('importsNameFromModule finds the import when it is not the only line, mixed LF/CRLF', () => {
  const lines = 'from fastapi import FastAPI\r\nfrom .users import router\r\napp = FastAPI()\r\n'.split('\n');
  assert.equal(importsNameFromModule(lines, 'router', 'users'), true);
});
