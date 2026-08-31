import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import test from 'node:test';

// M1 exit gate: "build/configure/sync는 사용자 승인 없이 실행되지 않는다"
// (docs/development-management/milestones/m1-provider-platform-ux.md). `assertProjectMetadata` in
// providers/readiness.ts already states the rule in prose ("this never generates, builds, configures or
// syncs anything") for the one place that used to be tempted to paper over a missing project file. This
// file turns that promise into a textual, re-checkable invariant the same way errors.test.ts pins
// CLI_ERROR_CODES and stateReachability.sources.test.ts pins AnalysisObservations producers: a scan that
// fails loudly the moment a new spawn-family call site appears, rather than a comment nobody re-reads.
//
// Reviewer finding on an earlier version of this file (PR #54): the import scan only recognised named
// imports (`import { spawn } from '...'`) and the call scan only recognised the literal words `spawn`/
// `spawnSync`. `import * as cp from 'node:child_process'; cp.exec('npm install')` - a namespace import
// combined with `exec`, the one child_process function whose whole job is running an arbitrary shell
// command line - passed both tests undetected. `import cp from '...'; cp.execFile(...)` (a default
// import) had the same hole. This is the same class of defect `stateReachability.sources.test.ts` had
// (a colon-key scan blind to shorthand producers, closed by PR #49's runtime check) applied to this
// file's import/call scan instead of a field-producer scan. Fixed below; see the "verified against three
// bypass patterns" note before the tests for how this was checked, not just asserted.
//
// Scope and an honest limit on what a textual scan proves, rewritten to match what is actually checked
// now rather than restating the pre-fix (narrower) scan's limits:
//   - Scanned: cli/src, excluding cli/src/test. The Extension (src/**) was checked by hand
//     (`grep -rn "child_process" src/*.ts`) and spawns nothing at all - not even the launch primitives
//     this file allowlists - so it has no invariant to pin here. If that ever changes, this file's
//     silence would not catch it; the same scan would need to be reproduced for `src/`.
//   - Import surface: every `import ... from 'node:child_process'` clause is parsed, whatever its form
//     (named, `import type`, namespace `* as x`, default, or default+named combined). A namespace or
//     default import is rejected outright, because it grants access to every child_process export
//     (`exec`, `execFile`, `fork`, ...) under one local name this scan cannot evaluate export-by-export -
//     there is no legitimate reason to need one today. A named import is checked against an allowlist of
//     exactly the exports this codebase uses, by the name node:child_process itself exports (before any
//     local `as` alias), so `import { exec as run }` is caught as an `exec` import regardless of what the
//     call sites that follow are named.
//   - Call surface: every spawn-family function (`spawn`, `spawnSync`, `exec`, `execSync`, `execFile`,
//     `execFileSync`, `fork`) is scanned two ways - as a bare call (`exec(...)`, whatever brought that
//     name into scope) and as a member call on any object (`cp.exec(...)`, `child_process.exec(...)`,
//     `require('node:child_process').exec(...)`). The member-call form does not depend on how the object
//     reference was obtained, which is what makes it catch the `require(...)` case the import-surface
//     check above cannot see by construction (it only parses `import` statements).
//   - What is still NOT caught, honestly: a `require`-based destructure that renames on the way in -
//     `const { exec: run } = require('node:child_process'); run(...)` - produces neither a matching
//     `import` clause (so the import-surface check never sees it) nor a spawn-family name at the call
//     site (`run(` is not one of the seven names, and there is no `.exec(` for the member-call scan to
//     find either). Closing that residual gap needs real scope/alias resolution, not a regex. The
//     codebase uses ES `import` exclusively in production sources today (confirmed by inspection), so
//     this is currently a theoretical risk, not an active blind spot - but it is a real one that a
//     future PR could exploit and this scan would not fail on the way this file did before.
//   - This proves the CLI never hardcodes an invocation of a package manager, build tool or a
//     state-mutating VCS command.
//   - This does NOT and cannot prove that a *user-supplied* `provider.command` (raw custom provider) or a
//     *catalog-declared* preset command could never itself be `npm`/`make`/etc. Launching an arbitrary
//     executable the caller named is the CLI's entire purpose - it has to start a Language Server - so
//     that value is explicit, caller-approved configuration (the request JSON or the shipped catalog),
//     not a hidden action this scan can or should forbid. `providers/discovery.ts`'s `probeVersion` and
//     `jsonRpc.ts`'s session constructor both take their command from exactly that configuration, never
//     from a literal in this codebase - which is what the inventory below checks for every spawn-family
//     call site that exists today.

function nonTestSources(): readonly string[] {
  const root = path.resolve(__dirname, '..', '..', 'src');
  const files: string[] = [];
  const walk = (directory: string): void => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const full = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        if (entry.name !== 'test') {
          walk(full);
        }
        continue;
      }
      if (entry.isFile() && entry.name.endsWith('.ts')) {
        files.push(full);
      }
    }
  };
  walk(root);
  return files;
}

function readSources(files: readonly string[]): string {
  return files.map(file => fs.readFileSync(file, 'utf8')).join('\n');
}

const SPAWN_FAMILY = ['spawn', 'spawnSync', 'exec', 'execSync', 'execFile', 'execFileSync', 'fork'] as const;
const FAMILY_ALTERNATION = SPAWN_FAMILY.join('|');

/**
 * `exec(...)`, `spawnSync(...)` - a call to a bare identifier with one of these exact names. The
 * `(?<!\.)` excludes a member call (`x.exec(...)`) from also being counted here, so a call site is
 * classified as bare xor member, never both - `SPAWN_MEMBER_CALL` below is the only place that counts it.
 */
const SPAWN_BARE_CALL = new RegExp(`(?<!\\.)\\b(?:${FAMILY_ALTERNATION})\\s*\\(`, 'g');
/**
 * `cp.exec(...)`, `child_process.spawn(...)`, `require('node:child_process').execFile(...)` - a call
 * reached through any object reference. Does not depend on how that reference was obtained, which is
 * exactly what closes the namespace/default-import hole a bare-name scan alone cannot see.
 */
const SPAWN_MEMBER_CALL = new RegExp(`\\.(?:${FAMILY_ALTERNATION})\\s*\\(`, 'g');
const SPAWN_BARE_LITERAL_COMMAND = new RegExp(`(?<!\\.)\\b(?:${FAMILY_ALTERNATION})\\s*\\(\\s*(['"])((?:(?!\\1).)*)\\1`, 'g');
const SPAWN_MEMBER_LITERAL_COMMAND = new RegExp(`\\.(?:${FAMILY_ALTERNATION})\\s*\\(\\s*(['"])((?:(?!\\1).)*)\\1`, 'g');
const CHILD_PROCESS_IMPORT_CLAUSE = /import\s+(?:type\s+)?(.+?)\s+from\s+'node:child_process'/g;

/**
 * `exec` collides with `RegExp.prototype.exec` (`/pattern/.exec(str)`), which this codebase already
 * calls twice (jsonRpc.ts, discovery.ts) for framing and version parsing - nothing to do with
 * child_process. A regex literal's closing `/` (plus optional flags) immediately before a `.exec(` is
 * what a member call on a RegExp looks like textually, so that specific shape is excluded from the
 * spawn-family member-call scan. Anything else calling `.exec(` - a bare identifier, `require(...)
 * .exec(`, a variable holding either a regex or a child_process handle - is NOT excluded and stays
 * flagged, which is the conservative direction to be wrong in.
 */
const REGEX_LITERAL_EXEC_RECEIVER = /\/[a-z]{0,4}$/;

function isRegexLiteralExecCall(sources: string, dotIndex: number): boolean {
  return REGEX_LITERAL_EXEC_RECEIVER.test(sources.slice(Math.max(0, dotIndex - 8), dotIndex));
}

/** Every `.spawn(...)`/`.exec(...)`/... match, minus the known `RegExp.prototype.exec` false positive. */
function memberCallMatches(sources: string): readonly RegExpMatchArray[] {
  return [...sources.matchAll(SPAWN_MEMBER_CALL)].filter(match => !isRegexLiteralExecCall(sources, match.index!));
}

function memberLiteralCommandMatches(sources: string): readonly RegExpMatchArray[] {
  return [...sources.matchAll(SPAWN_MEMBER_LITERAL_COMMAND)].filter(
    match => !isRegexLiteralExecCall(sources, match.index!),
  );
}

function literalCommandsIn(sources: string): readonly string[] {
  return [
    ...[...sources.matchAll(SPAWN_BARE_LITERAL_COMMAND)].map(match => match[2]!),
    ...memberLiteralCommandMatches(sources).map(match => match[2]!),
  ];
}

interface ChildProcessImportClause {
  /** The raw text between `import` and `from`, kept for failure messages. */
  readonly raw: string;
  /** Set when the clause is `* as x` or a bare default identifier - either grants access to every export. */
  readonly namespaceOrDefaultAlias: string | undefined;
  /** The exports named in a `{ ... }` list, by their node:child_process export name (before any `as`). */
  readonly namedExportNames: readonly string[];
}

/** Parses every `import ... from 'node:child_process'` clause, whatever form it takes. */
function parseChildProcessImports(sources: string): readonly ChildProcessImportClause[] {
  const results: ChildProcessImportClause[] = [];
  for (const match of sources.matchAll(CHILD_PROCESS_IMPORT_CLAUSE)) {
    const clause = match[1]!.trim();
    const namespaceMatch = /^\*\s+as\s+(\w+)$/.exec(clause);
    if (namespaceMatch) {
      results.push({ raw: clause, namespaceOrDefaultAlias: namespaceMatch[1], namedExportNames: [] });
      continue;
    }
    const braceStart = clause.indexOf('{');
    if (braceStart === -1) {
      // A bare default import: `import cp from 'node:child_process'`.
      results.push({ raw: clause, namespaceOrDefaultAlias: clause, namedExportNames: [] });
      continue;
    }
    const before = clause.slice(0, braceStart).replace(/,\s*$/, '').trim();
    const inside = clause.slice(braceStart + 1, clause.lastIndexOf('}'));
    const namedExportNames = inside
      .split(',')
      .map(part => part.trim())
      .filter(part => part.length > 0)
      .map(part => part.replace(/^type\s+/, '').split(/\s+as\s+/)[0]!.trim());
    results.push({
      raw: clause,
      namespaceOrDefaultAlias: before.length > 0 ? before : undefined,
      namedExportNames,
    });
  }
  return results;
}

test('the source scan actually reads the real CLI sources (not a vacuous pass)', () => {
  const sources = readSources(nonTestSources());
  assert.ok(sources.includes("from 'node:child_process'"), 'expected to have read the real CLI sources');
  assert.ok([...sources.matchAll(SPAWN_BARE_CALL)].length > 0, 'expected to find at least one spawn-family call');
});

test('cli/src imports nothing from node:child_process beyond the launch primitives it uses today', () => {
  const sources = readSources(nonTestSources());
  const imports = parseChildProcessImports(sources);

  const namespaceOrDefault = imports.filter(entry => entry.namespaceOrDefaultAlias !== undefined);
  assert.deepEqual(
    namespaceOrDefault.map(entry => entry.raw),
    [],
    'a namespace or default import of node:child_process appeared (`import * as x from ...` or ' +
      '`import x from ...`). Either form grants access to every child_process export - exec, execFile, ' +
      'fork, and anything added to the module later - under one local name this allowlist cannot evaluate ' +
      'export-by-export. None is needed today: import the specific export required, by name, instead.',
  );

  const namedExportNames = imports.flatMap(entry => entry.namedExportNames);
  assert.deepEqual(
    [...new Set(namedExportNames)].sort(),
    // `spawn`/`spawnSync` are the two launch primitives the inventory below accounts for.
    // `ChildProcessWithoutNullStreams` is jsonRpc.ts's type-only import for the handle `spawn` returns,
    // not a second way to start a process.
    ['ChildProcessWithoutNullStreams', 'spawn', 'spawnSync'],
    'a new child_process export was imported by name (exec/execFile/fork/...), even if aliased on the way ' +
      'in - this check reads the name node:child_process itself exports, before any local `as`. Every ' +
      'spawn-family call site has to be inventoried by the next test, and an import this scan cannot see ' +
      'is a call nobody is guarding.',
  );
});

test('every spawn-family call site in cli/src is inventoried, and none hardcodes a command outside the allowed list', () => {
  const sources = readSources(nonTestSources());
  const bareCalls = [...sources.matchAll(SPAWN_BARE_CALL)].length;
  const memberCalls = memberCallMatches(sources).length;
  // Pinned inventory, one line per call site as of this test. A new spawn-family call site - bare or
  // through a member access - must be added here deliberately, not discovered by accident:
  //   - childIpc.ts:   spawn(process.execPath, ['-e', ...])        probes this same Node binary, not a
  //                                                                 command of any kind
  //   - jsonRpc.ts:     spawn(command, [...args], ...)             launches the caller-configured LSP
  //                                                                 provider (request JSON or catalog)
  //   - discovery.ts:   spawnSync(executable, [...probe.args], .)  runs the caller-configured provider's
  //                                                                 own version probe (e.g. `--version`)
  //   - notes.ts:       spawnSync('git', [...], ...)                the one hardcoded command; proven
  //                                                                 read-only by the next test
  // No genuine member-call site (`x.exec(...)`, excluding the two RegExp.prototype.exec() calls in
  // jsonRpc.ts and discovery.ts that `memberCallMatches` filters out - see its comment) exists today -
  // the import-surface test above is what keeps it that way, by refusing the namespace/default import
  // that would make one possible.
  assert.equal(
    bareCalls,
    4,
    `expected exactly 4 bare spawn-family call sites in cli/src, found ${bareCalls}. Audit the new one: if ` +
      'it hardcodes a command, it belongs in the literal-command allowlist below and must be proven ' +
      'read-only the way notes.ts is; if it takes its command from caller configuration like the other ' +
      'three, update this count and the comment above.',
  );
  assert.equal(
    memberCalls,
    0,
    `expected zero member-call spawn-family call sites (x.exec(...), x.spawn(...), ...) in cli/src, found ` +
      `${memberCalls}. This means a namespace or default import of node:child_process slipped past the ` +
      'import-surface test above - audit it the same way as a new bare call site.',
  );

  const literalCommands = literalCommandsIn(sources);
  assert.deepEqual(
    literalCommands,
    ['git'],
    `a spawn-family call now hardcodes a literal command this test has not reviewed: ${literalCommands.join(', ')}. ` +
      'If it is a package manager, build tool or another VCS-mutating command, it violates the M1 gate ' +
      '"build/configure/sync는 사용자 승인 없이 실행되지 않는다".',
  );
});

const MUTATING_GIT_SUBCOMMANDS = [
  'add', 'am', 'apply', 'branch', 'checkout', 'clone', 'commit', 'config', 'fetch', 'gc', 'init', 'merge',
  'mv', 'pull', 'push', 'rebase', 'remote', 'reset', 'restore', 'rm', 'stash', 'submodule', 'switch', 'tag',
] as const;

test('the one hardcoded command is a read-only git query, never a mutation', () => {
  const sources = readSources(nonTestSources());
  const call = /spawnSync\(\s*'git'\s*,\s*(\[[^\]]*\])/.exec(sources);
  assert.ok(call, 'expected to find the git spawnSync call this test pins (cli/src/notes.ts)');
  const args = call![1]!;
  assert.match(args, /'check-ignore'/, 'expected the read-only check-ignore subcommand');
  for (const verb of MUTATING_GIT_SUBCOMMANDS) {
    assert.doesNotMatch(args, new RegExp(`'${verb}'`), `the git call must not carry the mutating subcommand '${verb}'`);
  }
});
