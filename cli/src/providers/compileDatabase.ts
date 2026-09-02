// Read-only compile_commands.json discovery for C/C++ workspaces.
//
// Why this exists: M2 clangd lane stage 1/2 (docs/work/task-m2-clangd-preset.md) found, by direct
// observation against real clangd, that a missing compile database degrades silently - clangd logs
// "Failed to find compilation database" only to its own stderr, never as an LSP-protocol-visible
// diagnostic, and falls back to an isolated single-file parse with no cross-file index at all. A
// header query in that state returned `[]` for a symbol whose real caller was never even indexed - not
// `null`, so M2 Python lane's `provider_null_incoming_calls` signal (which fires only on a literal
// `null`) does not catch it. This is the exact failure IL-LIM-009 exists to prevent: an incomplete
// answer that looks like a complete one. This module supplies the one signal that can catch it -
// compile database state itself - independent of any provider response value.
//
// Never generates, configures or builds anything (IL-LIM-004's "no automatic install" rule and this
// story's own excluded scope apply the same way here): `compile_commands.json` is read, never written.

import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { CompileDatabaseObservation } from '../types';

/**
 * Where a CMake/Meson/Bazel build commonly writes `compile_commands.json`, without running any
 * build-system tool to find out. This is NOT the search clangd itself performs (`--compile-commands-dir`,
 * or scanning the current directory and parent paths of each source file, per clangd's own docs) - this
 * CLI's read-only discovery does not need to replicate clangd's exact algorithm, only to tell a user
 * whether a database exists at all, is stale, or is ambiguous. A small, common-case candidate list is
 * proportionate to that; walking the whole tree is not (this story's own excluded scope: no attempt to
 * verify every build system).
 */
const CANDIDATE_DIRECTORIES = ['.', 'build', 'out', 'cmake-build-debug', 'cmake-build-release'];
const COMPILE_COMMANDS_FILENAME = 'compile_commands.json';

async function mtimeMs(file: string): Promise<number | undefined> {
  try {
    return (await fs.stat(file)).mtimeMs;
  } catch {
    return undefined;
  }
}

function toRelativeSlashPath(workspace: string, absolute: string): string {
  return path.relative(workspace, absolute).split(path.sep).join('/');
}

/**
 * Read-only discovery of compile_commands.json state for a workspace.
 *
 * Staleness is judged only against the workspace root's `CMakeLists.txt` mtime - the one signal
 * available without a build-system adapter, which this story's own "미해결 질문" section already
 * names as an open question, not something this function pretends to solve precisely. No
 * `CMakeLists.txt` (a non-CMake build, or a hand-placed database) means staleness cannot be judged, so
 * `stale` reads `false` rather than guessing - an unproven "stale" would be the same false confidence
 * this function exists to prevent on the missing/present axis.
 */
export async function inspectCompileDatabase(workspace: string): Promise<CompileDatabaseObservation> {
  const found: Array<{ relativePath: string; mtimeMs: number }> = [];
  for (const directory of CANDIDATE_DIRECTORIES) {
    const candidate = path.join(workspace, directory, COMPILE_COMMANDS_FILENAME);
    const stat = await mtimeMs(candidate);
    if (stat !== undefined) {
      found.push({ relativePath: toRelativeSlashPath(workspace, candidate), mtimeMs: stat });
    }
  }
  if (found.length === 0) {
    return { status: 'missing' };
  }
  if (found.length > 1) {
    return { status: 'ambiguous', relativePaths: found.map(entry => entry.relativePath).sort() };
  }
  const [only] = found;
  const cmakeListsMtime = await mtimeMs(path.join(workspace, 'CMakeLists.txt'));
  const stale = cmakeListsMtime !== undefined && cmakeListsMtime > only.mtimeMs;
  return { status: 'present', relativePath: only.relativePath, stale };
}
