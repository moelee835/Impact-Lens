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
// Scope and an honest limit on what a textual scan proves:
//   - Scanned: cli/src, excluding cli/src/test. The Extension (src/**) was checked by hand
//     (`grep -rn "child_process" src/*.ts`) and spawns nothing at all - not even the launch primitives
//     this file allowlists - so it has no invariant to pin here. If that ever changes, this file's
//     silence would not catch it; the same scan would need to be reproduced for `src/`.
//   - This proves the CLI never hardcodes an invocation of a package manager, build tool or a
//     state-mutating VCS command, and never even imports a child_process primitive beyond the two the
//     launch path actually needs (`spawn`, `spawnSync`).
//   - This does NOT and cannot prove that a *user-supplied* `provider.command` (raw custom provider) or a
//     *catalog-declared* preset command could never itself be `npm`/`make`/etc. Launching an arbitrary
//     executable the caller named is the CLI's entire purpose - it has to start a Language Server - so
//     that value is explicit, caller-approved configuration (the request JSON or the shipped catalog),
//     not a hidden action this scan can or should forbid. `providers/discovery.ts`'s `probeVersion` and
//     `jsonRpc.ts`'s session constructor both take their command from exactly that configuration, never
//     from a literal in this codebase - which is what the inventory below checks for every spawn-family
//     call site that exists today.
//   - This is textual, like every other *.sources.test.ts file in this directory: it proves no matching
//     call site exists in the files it reads, not that one could never be reached by some other means
//     (a `require('child_process')` at runtime, a re-exported wrapper, etc.). The codebase uses ES
//     `import` exclusively in production sources today, so that residual gap is currently theoretical.

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

const SPAWN_CALL = /\bspawn(?:Sync)?\s*\(/g;
const SPAWN_LITERAL_COMMAND = /\bspawn(?:Sync)?\s*\(\s*(['"])((?:(?!\1).)*)\1/g;
const CHILD_PROCESS_IMPORT = /import\s*\{([^}]*)\}\s*from\s*'node:child_process'/g;

function literalCommandsIn(sources: string): readonly string[] {
  return [...sources.matchAll(SPAWN_LITERAL_COMMAND)].map(match => match[2]!);
}

/** Every identifier any `import { ... } from 'node:child_process'` brings in, types included. */
function importedChildProcessNames(sources: string): readonly string[] {
  const names = new Set<string>();
  for (const match of sources.matchAll(CHILD_PROCESS_IMPORT)) {
    for (const specifier of match[1]!.split(',')) {
      const name = specifier.trim().split(/\s+as\s+/)[0]?.trim();
      if (name) {
        names.add(name);
      }
    }
  }
  return [...names].sort();
}

test('the source scan actually reads the real CLI sources (not a vacuous pass)', () => {
  const sources = readSources(nonTestSources());
  assert.ok(sources.includes("from 'node:child_process'"), 'expected to have read the real CLI sources');
  assert.ok([...sources.matchAll(SPAWN_CALL)].length > 0, 'expected to find at least one spawn-family call');
});

test('cli/src imports nothing from node:child_process beyond the launch primitives it uses today', () => {
  const sources = readSources(nonTestSources());
  assert.deepEqual(
    importedChildProcessNames(sources),
    // `spawn`/`spawnSync` are the two launch primitives the inventory below accounts for.
    // `ChildProcessWithoutNullStreams` is jsonRpc.ts's type-only import for the handle `spawn` returns,
    // not a second way to start a process.
    ['ChildProcessWithoutNullStreams', 'spawn', 'spawnSync'],
    'a new child_process import appeared (exec/execFile/fork/...). Every spawn-family call site has to be ' +
      'inventoried by the next test, and a call this scan cannot see is a call nobody is guarding.',
  );
});

test('every spawn-family call site in cli/src is inventoried, and none hardcodes a command outside the allowed list', () => {
  const sources = readSources(nonTestSources());
  const totalCalls = [...sources.matchAll(SPAWN_CALL)].length;
  // Pinned inventory, one line per call site as of this test. A new spawn-family call site must be added
  // here deliberately, not discovered by accident:
  //   - childIpc.ts:   spawn(process.execPath, ['-e', ...])        probes this same Node binary, not a
  //                                                                 command of any kind
  //   - jsonRpc.ts:     spawn(command, [...args], ...)             launches the caller-configured LSP
  //                                                                 provider (request JSON or catalog)
  //   - discovery.ts:   spawnSync(executable, [...probe.args], .)  runs the caller-configured provider's
  //                                                                 own version probe (e.g. `--version`)
  //   - notes.ts:       spawnSync('git', [...], ...)                the one hardcoded command; proven
  //                                                                 read-only by the next test
  assert.equal(
    totalCalls,
    4,
    `expected exactly 4 spawn-family call sites in cli/src, found ${totalCalls}. Audit the new one: if it ` +
      'hardcodes a command, it belongs in the literal-command allowlist below and must be proven read-only ' +
      'the way notes.ts is; if it takes its command from caller configuration like the other three, update ' +
      'this count and the comment above.',
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
