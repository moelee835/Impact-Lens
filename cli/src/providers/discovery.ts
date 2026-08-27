import { spawnSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { ProviderVersionProbe, ProviderVersionRange } from './preset';

/**
 * Finding a provider executable and asking it for its version.
 *
 * Two rules govern this file.
 *
 * No shell, ever. `spawnSync` is called with an argument array and `shell` left at its default of
 * false, and PATH lookup is done by joining directory entries rather than by asking a shell to
 * resolve a name. A provider path containing a space, a semicolon or a backtick is a filename here
 * and nothing else. `assertNoShell` below is the executable form of that promise.
 *
 * Discovery does not start a process. Only `probeVersion` does, and only doctor calls it. Selection
 * during a normal analyze must not pay for a process it is about to start anyway.
 */

export interface ExecutableLookupOptions {
  readonly env?: NodeJS.ProcessEnv;
  readonly platform?: NodeJS.Platform;
}

export interface ExecutableCandidate {
  readonly name: string;
  readonly path?: string;
}

/**
 * Resolves an executable name against PATH, or verifies an explicit path.
 *
 * A name containing a path separator is treated as a path and never searched for, matching what an
 * exec call would do and keeping a relative path from silently matching some unrelated PATH entry.
 */
export function findExecutable(name: string, options: ExecutableLookupOptions = {}): string | undefined {
  assertNoShell(name);
  const platform = options.platform ?? process.platform;
  const env = options.env ?? process.env;
  if (name.includes('/') || (platform === 'win32' && name.includes('\\'))) {
    return isExecutableFile(name, platform) ? name : undefined;
  }
  const searchPath = env.PATH ?? env.Path ?? '';
  const delimiter = platform === 'win32' ? ';' : ':';
  const suffixes = executableSuffixes(platform, env);
  for (const directory of searchPath.split(delimiter)) {
    if (directory.length === 0) {
      continue;
    }
    for (const suffix of suffixes) {
      const candidate = path.join(directory, `${name}${suffix}`);
      if (isExecutableFile(candidate, platform)) {
        return candidate;
      }
    }
  }
  return undefined;
}

/**
 * Windows has no execute bit; whether a file runs is decided by its extension. PATHEXT is read rather
 * than hard-coded because a shim installed as `.cmd` and one installed as `.exe` are both normal.
 */
function executableSuffixes(platform: NodeJS.Platform, env: NodeJS.ProcessEnv): readonly string[] {
  if (platform !== 'win32') {
    return [''];
  }
  const declared = (env.PATHEXT ?? '.COM;.EXE;.BAT;.CMD')
    .split(';')
    .map(entry => entry.trim())
    .filter(entry => entry.length > 0);
  return ['', ...declared];
}

function isExecutableFile(candidate: string, platform: NodeJS.Platform): boolean {
  try {
    if (!fs.statSync(candidate).isFile()) {
      return false;
    }
  } catch {
    return false;
  }
  if (platform === 'win32') {
    return true;
  }
  try {
    fs.accessSync(candidate, fs.constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

/**
 * Rejects the two characters that could only matter if this module ever grew a shell.
 *
 * Nothing here evaluates a shell, so these characters are harmless today. The check exists so that a
 * future change that does introduce one fails a test instead of silently becoming an injection.
 */
export function assertNoShell(name: string): void {
  if (name.includes('\0')) {
    throw new Error('Executable names may not contain a NUL byte.');
  }
}

export type VersionProbeOutcome =
  | { readonly kind: 'found'; readonly version: string; readonly output: string }
  | { readonly kind: 'unreadable'; readonly output: string }
  | { readonly kind: 'timeout' }
  | { readonly kind: 'failed'; readonly exitCode: number | null; readonly signal: string | null };

/**
 * Runs a preset's version command inside its declared timeout and output ceiling.
 *
 * stdout and stderr are both read because servers disagree about where a version belongs, and both
 * are truncated to the declared byte ceiling so that a provider printing a stream of text cannot make
 * this call unbounded.
 */
export function probeVersion(executable: string, probe: ProviderVersionProbe): VersionProbeOutcome {
  assertNoShell(executable);
  const result = spawnSync(executable, [...probe.args], {
    encoding: 'utf8',
    timeout: probe.timeoutMs,
    maxBuffer: probe.maxOutputBytes,
    windowsHide: true,
  });
  if (result.error !== undefined && (result.error as NodeJS.ErrnoException).code === 'ETIMEDOUT') {
    return { kind: 'timeout' };
  }
  const output = truncate(`${result.stdout ?? ''}${result.stderr ?? ''}`, probe.maxOutputBytes);
  if (result.error !== undefined) {
    return { kind: 'failed', exitCode: result.status, signal: result.signal ?? null };
  }
  const version = parseVersion(output);
  if (version === undefined) {
    return result.status === 0 || result.status === null
      ? { kind: 'unreadable', output }
      : { kind: 'failed', exitCode: result.status, signal: result.signal ?? null };
  }
  return { kind: 'found', version, output };
}

function truncate(text: string, maxBytes: number): string {
  return Buffer.byteLength(text, 'utf8') <= maxBytes ? text : Buffer.from(text, 'utf8').subarray(0, maxBytes).toString('utf8');
}

/**
 * The version out of whatever prose the server wraps it in.
 *
 * A dotted run is preferred over a bare number so that `fixture-server-v2 1.4.0` reports `1.4.0`
 * rather than the `2` in the product name. Neither pattern requires a word boundary before the
 * digits, because `v3.0` has none between the `v` and the `3`.
 */
export function parseVersion(output: string): string | undefined {
  const dotted = /(?<![\d.])(\d+(?:\.\d+){1,3})(?![\d.])/.exec(output);
  return (dotted ?? /(?<![\d.])(\d+)(?![\d.])/.exec(output))?.[1];
}

/**
 * Dotted numeric comparison, shorter version padded with zeroes so `1.2` and `1.2.0` compare equal.
 * Pre-release suffixes are not modelled; a preset that needs them should pin its bounds to releases.
 */
export function compareVersions(left: string, right: string): number {
  const a = left.split('.').map(Number);
  const b = right.split('.').map(Number);
  for (let index = 0; index < Math.max(a.length, b.length); index += 1) {
    const difference = (a[index] ?? 0) - (b[index] ?? 0);
    if (difference !== 0) {
      return difference < 0 ? -1 : 1;
    }
  }
  return 0;
}

export function isVersionSupported(version: string, range: ProviderVersionRange): boolean {
  if (compareVersions(version, range.minimum) < 0) {
    return false;
  }
  return range.maximum === undefined || compareVersions(version, range.maximum) <= 0;
}

export function describeVersionRange(range: ProviderVersionRange): string {
  return range.maximum === undefined ? `>=${range.minimum}` : `>=${range.minimum} <=${range.maximum}`;
}
