// M4 gate 2 shared-adapter lane (docs/work/task-m4-gate2-shared-adapter.md). Moved out of `../impact.ts`
// verbatim (no logic change - see the CLI test suite, unchanged before/after this move) because these
// six functions are the ENTIRE runtime dependency `shared/adapters/fastapiDependencyAdapter.ts` has on
// CLI-only code: stateless, no I/O, no CLI-specific imports beyond `node:crypto`/`node:path`/`node:url`
// and the shared type definitions in `../types`. Everything else `impact.ts` does (the analyze pipeline,
// workspace-escape checks, CliError-throwing path resolution) stays CLI-only and is never reachable from
// the VS Code extension's compiled output - only this file's exports are.
//
// Living inside `cli/src/shared/` (not moved up to a new top-level `shared/` package) is itself a
// decision, not a default: `cli/tsconfig.json`'s existing `rootDir: "src"` already covers this path with
// zero change, which matters because `cli/dist/index.js`'s exact location is hardcoded by real,
// documented consumers outside this repo's own build (the Claude Code/Codex plugin runner script,
// INSTALL.md's fallback chain) - widening `cli`'s own rootDir to reach a sibling `shared/` folder would
// have reshaped `cli/dist/` and broken all of them. The VS Code extension reaches this file instead via
// a TypeScript project reference to the whole `cli` project, which does not require `cli`'s own output
// layout to change at all.

import { createHash } from 'node:crypto';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { CallHierarchyItem, LspRange } from '../types';

export function symbolId(item: CallHierarchyItem): string {
  return createHash('sha256').update(JSON.stringify([
    item.uri,
    item.kind,
    item.name,
    item.detail ?? '',
    item.selectionRange.start.line,
    item.selectionRange.start.character,
  ])).digest('hex').slice(0, 24);
}

export function symbolKindName(kind: number): string {
  const names: Record<number, string> = {
    5: 'class', 6: 'method', 9: 'constructor', 11: 'interface', 12: 'function',
  };
  return names[kind] ?? `symbol-${kind}`;
}

export function relativeFile(workspace: string, file: string): string {
  if (isOutside(workspace, file)) {
    return file;
  }
  return path.relative(workspace, file).split(path.sep).join('/');
}

export function isOutside(workspace: string, file: string): boolean {
  const relative = path.relative(path.resolve(workspace), path.resolve(file));
  return relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative);
}

export function uriFile(uri: string): string {
  return uri.startsWith('file:') ? fileURLToPath(uri) : uri;
}

export function externalRange(range: LspRange): { start: { line: number; column: number }; end: { line: number; column: number } } {
  return {
    start: { line: range.start.line + 1, column: range.start.character + 1 },
    end: { line: range.end.line + 1, column: range.end.character + 1 },
  };
}
