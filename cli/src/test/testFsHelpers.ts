import * as fs from 'node:fs';

// Rule for every test anywhere in this suite that overrides `platform` in a `lookup`/`findExecutable()`
// option (see `syntheticPosixDirectory` below for why): a path handed to that call must be a synthetic
// POSIX string, built by hand, never a value that came from `os.tmpdir()`, `path.join()`, or any other
// host-native path API - not even indirectly through a helper's return value. If the host is Windows, a
// drive-letter colon or a `path.join()`-normalized backslash will falsify the simulation regardless of
// what `platform` claims. This rule has been violated more than once across this suite
// (`docs/work/task-fix-cli-test-windows-compat.md` has the detail on each instance - both the original
// three in providers.test.ts and the two later found in doctor.test.ts, which is why this helper lives
// here instead of as a private function in one test file), and none were visible until Windows CI
// actually ran `cli:test` for the first time - a review or a type system cannot catch this, only running
// it on the host it pretends to be can.

/**
 * A real, writable directory at a literal path containing no colon, for tests that force
 * `platform: 'linux'` (or `'darwin'`) lookup semantics regardless of the host OS actually running them.
 *
 * A directory built from `os.tmpdir()` is a real path, which on a Windows host is
 * `C:\Users\...\AppData\Local\Temp\...`. `findExecutable()` under a forced non-`win32` platform splits
 * `PATH` on `:` - the very character a Windows drive letter embeds right after itself - so a test that
 * simulates POSIX lookup semantics with a real Windows-native path silently corrupts its own PATH value
 * (`"C:\Users\...".split(':')` becomes `["C", "\Users\..."]`, neither of which exists) no matter what
 * `platform` it claims to be testing. `platform: 'linux'` and a directory string with an embedded
 * drive-letter colon are mutually exclusive; a test gets one or the other, never both. A literal `/tmp/...`
 * path has no such colon on any host, which is what makes the simulation actually hold everywhere.
 *
 * This directory is safe to join with `path.join()` for actually writing/reading files (real disk I/O
 * needs the host's real separator), but never pass a `path.join()`-built string as an EXPLICIT PATH into
 * a `platform`-overridden `findExecutable()` call - `path.join()` normalizes to `\` on a Windows host
 * regardless of this string's own forward slashes, and `findExecutable()` only recognizes `\` as a path
 * separator when `platform` is actually `'win32'` (correctly: a literal backslash is an ordinary filename
 * character on real Linux, and "fixing" that to accept it under `platform: 'linux'` would be a real
 * production bug, not a test fix - see the judgement call recorded for this exact case in
 * `docs/work/task-fix-cli-test-windows-compat.md`). Build such a path by hand instead:
 * `` `${directory}/name` ``.
 */
export function syntheticPosixDirectory(t: { after(fn: () => void): void }, prefix: string): string {
  const directory = `/tmp/impact-lens-test-${prefix}${process.pid}-${Math.random().toString(36).slice(2)}`;
  fs.mkdirSync(directory, { recursive: true });
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  return directory;
}
