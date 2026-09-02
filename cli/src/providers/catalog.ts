import { AMBIGUOUS_LANGUAGE_ID, ProviderPreset } from './preset';

/**
 * The shipped preset catalog.
 *
 * M1 shipped exactly one entry (`bundled-typescript`) on purpose: it delivered the preset machinery,
 * not a list of languages. A preset may only enter this file once a real fixture has passed against a
 * pinned version range, because `verified-external` in a catalog is a claim users act on: it says
 * "point this at your project and the answer will be trustworthy". Listing a language we have not
 * exercised would make the tool's own support table the first thing it is wrong about.
 *
 * `gopls` (M2, IL-LIM-004 stage 3) is the first entry to actually earn that claim through the
 * `verified-external` tier rather than through `bundled`'s shipped-in-the-tarball shortcut — see
 * docs/work/task-m2-gopls-preset.md for the investigation this preset is built from. It is also the
 * first preset to declare `readiness`, which is what lets `coverage.indexing.status` report anything
 * other than `unknown`.
 *
 * `bundled-pyright` (M2, docs/work/task-m2-python-preset.md) is Python's entry. The catalog comment this
 * replaced conflated two different questions into one sentence: "Pylance cannot legally be discovered or
 * bundled" (true, and irrelevant here - Pylance and pyright are different projects) and "its alternatives
 * have not been confirmed to support Call Hierarchy" (was true, no longer is -
 * docs/work/task-m2-python-investigation.md ran a real JSON-RPC round trip against pyright, basedpyright
 * and Pyrefly and all three answered correctly). `pyright` was chosen over `basedpyright` because it is
 * the canonical Microsoft-maintained upstream and treats the npm channel this preset bundles as primary,
 * where `basedpyright`'s own README tells users to prefer PyPI - see task-m2-python-preset.md stage 2 for
 * the full comparison. `Pyrefly` was never a `bundled` candidate: it has no npm distribution at all.
 *
 * `clangd` (M2, docs/work/task-m2-clangd-preset.md) is C/C++'s entry, closing M2's three-language
 * milestone (Python, Go, C/C++). `verified-external` like gopls, not `bundled`, because clangd is an
 * LLVM binary this CLI cannot ship inside its own npm tarball. Two findings this preset's design turns
 * on: clangd's readiness signal is `didOpen`-triggered like pyright's, not workspace-level like gopls's
 * (so this preset declares no `readiness`, same reasoning as `bundled-pyright`'s), and a missing compile
 * database degrades silently at the protocol level but clangd still answers correctly when the query
 * needs nothing project-specific (so this preset surfaces that risk via `limitationDetails` rather than
 * gating on it the way gopls gates on `go.mod`). `.h` reaches this preset through
 * `AMBIGUOUS_LANGUAGE_ID`, not `'c'` or `'cpp'` - see that constant's own comment in `preset.ts`.
 */

const TYPESCRIPT_FIXTURE_TSCONFIG = `${JSON.stringify(
  {
    compilerOptions: {
      target: 'ES2022',
      module: 'commonjs',
      moduleResolution: 'node',
      strict: true,
      noEmit: true,
    },
    include: ['src/**/*'],
  },
  null,
  2,
)}\n`;

export const BUNDLED_TYPESCRIPT_PRESET_ID = 'bundled-typescript';

/** The specifier `bundledModuleEntry` is allowed to resolve. See `cli/src/runtime.ts`. */
export const BUNDLED_TYPESCRIPT_MODULE = 'typescript-language-server/lib/cli.mjs';

const bundledTypeScript: ProviderPreset = {
  id: BUNDLED_TYPESCRIPT_PRESET_ID,
  displayName: 'Bundled TypeScript Language Server',
  tier: 'bundled',
  languageIds: ['typescript', 'typescriptreact', 'javascript', 'javascriptreact'],
  extensions: ['.ts', '.mts', '.cts', '.tsx', '.js', '.jsx', '.mjs', '.cjs'],
  command: {
    // The command is a runtime value, not a literal: it is this Node executable running the entry
    // point resolved out of the CLI package's own dependency tree. That is why the manifest needs
    // references at all — the only preset in the catalog cannot be written without them.
    candidates: [{ $ref: 'nodeExecutable' }],
    args: [{ $ref: 'bundledModuleEntry', module: BUNDLED_TYPESCRIPT_MODULE }, '--stdio'],
    languageIdFrom: 'detected',
  },
  // No `version`: the server ships inside the tarball, so its version is read from package metadata
  // by the bundled artifact check rather than by starting a process.
  // No `initializationOptions`, no `settings`: both absent resolve to the empty tree, which is the
  // exact initialize frame this CLI sends today.
  // No `readiness`: this preset claims nothing about indexing, so the reported status stays `unknown`.
  fixture: {
    files: [
      { path: 'tsconfig.json', content: TYPESCRIPT_FIXTURE_TSCONFIG },
      {
        path: 'src/target.ts',
        content: 'export function fixtureTarget(value: number): number {\n  return value + 1;\n}\n',
      },
      {
        path: 'src/caller.ts',
        content: [
          "import { fixtureTarget } from './target';",
          '',
          'export function fixtureCaller(value: number): number {',
          '  return fixtureTarget(value);',
          '}',
          '',
        ].join('\n'),
      },
    ],
    // Column 17 is the first character of the exported name on line 1.
    target: { file: 'src/target.ts', line: 1, column: 17 },
    expectedCaller: 'fixtureCaller',
  },
  docs: {
    install: 'https://github.com/typescript-language-server/typescript-language-server#installing',
    limitations: [
      'Dynamic dispatch and reflection-based calls are not part of the Call Hierarchy result.',
      'Cross-file results depend on the project being described by a tsconfig.json or jsconfig.json.',
    ],
  },
};

const GOPLS_FIXTURE_GOMOD = 'module fixture\n\ngo 1.21\n';

export const GOPLS_PRESET_ID = 'gopls';

const gopls: ProviderPreset = {
  id: GOPLS_PRESET_ID,
  displayName: 'gopls (Go)',
  tier: 'verified-external',
  languageIds: ['go'],
  extensions: ['.go'],
  command: {
    // PATH lookup only, no shell — the same mechanism the doctor executable check already exercises
    // generically. gopls speaks LSP over stdio when given this flag.
    candidates: ['gopls'],
    args: ['-mode=stdio'],
    languageIdFrom: 'detected',
  },
  version: {
    // Plain `gopls version`, never `-json`. `-json` prints `"GoVersion"` (the Go compiler's own
    // version) before gopls's own `"Version"` field, and `parseVersion()` takes the first dotted
    // number it finds in the combined output — so `-json` would report the *compiler's* version as
    // gopls's, silently. Plain `gopls version` prints exactly one dotted number
    // ("golang.org/x/tools/gopls v0.19.1"), which is what task-m2-gopls-preset.md's stage 1 confirmed
    // by running both forms side by side. buildInvocation.sources.test.ts guards this file's spawn
    // sites; versionProbe.test.ts guards this specific misparse.
    args: ['version'],
    timeoutMs: 5000,
    maxOutputBytes: 4096,
    // The floor actually run in stage 1 (v0.19.1, v0.23.0), not an assumed one. Lower versions were
    // not tested — one (v0.16.2) failed to even build against this repo's Go toolchain, which is a
    // toolchain fact, not evidence that 0.16.2 itself lacks Call Hierarchy support. Narrow this only
    // after testing a lower version, never by guessing.
    supported: { minimum: '0.19.1' },
  },
  // No `initializationOptions`, no `settings`: gopls answered the fixture's Call Hierarchy request
  // correctly with an empty initialize frame in stage 1. A future preset revision can add settings
  // (e.g. `build.buildFlags`) once a real need is observed.
  readiness: {
    // Read-only existence check, nothing else. Without a go.mod, gopls does not error — it silently
    // falls back to an "AdHoc" view (observed in stage 1: `view_type="AdHoc"` in its own log, and the
    // reported symbols carry a synthetic `_/abs/path` import path instead of the module name). AdHoc
    // results are indistinguishable from complete ones on the wire, which is exactly what IL-LIM-009
    // exists to prevent — an incomplete answer that reads like a proven one. So this preset still
    // requires go.mod even though gopls itself would "work" without it.
    //
    // This field does real work `readiness.signals` below CANNOT do: the "Setting up workspace" progress
    // cycle fires identically whether or not go.mod is present — readiness alone cannot tell a module
    // view from an AdHoc one (confirmed by probing both side by side). A future edit that removes this
    // as "redundant with readiness" would let an AdHoc result carry a `ready` label.
    requiredProjectFiles: ['go.mod'],
    signals: [
      // The exact signal gopls sends, observed identically on v0.19.1 and v0.23.0 in stage 1: a
      // work-done-progress cycle whose begin.title is "Setting up workspace" (message
      // "Loading packages..."), ending with message "Finished loading packages." Only the end counts
      // as ready — ReadinessTracker only promotes on the end of the token whose begin matched.
      { kind: 'work-done-progress', means: 'ready', titlePattern: 'Setting up workspace' },
    ],
    // A judgement call, not a measured production ceiling: stage 1's trivial two-file fixture indexed
    // in under a second, but real modules vary widely. proceed-partial over fail because a slow-but-
    // still-indexing gopls should downgrade the result rather than hard-fail the request.
    budgetMs: 10000,
    onBudgetExceeded: 'proceed-partial',
  },
  fixture: {
    files: [
      { path: 'go.mod', content: GOPLS_FIXTURE_GOMOD },
      {
        path: 'target.go',
        content: 'package fixture\n\nfunc FixtureTarget(value int) int {\n\treturn value + 1\n}\n',
      },
      {
        path: 'caller.go',
        content: [
          'package fixture',
          '',
          'func FixtureCaller(value int) int {',
          '\treturn FixtureTarget(value)',
          '}',
          '',
        ].join('\n'),
      },
    ],
    // Line 3, column 6 is the first character of "FixtureTarget" ("func " is 5 characters).
    target: { file: 'target.go', line: 3, column: 6 },
    expectedCaller: 'FixtureCaller',
  },
  docs: {
    install: 'https://github.com/golang/tools/blob/master/gopls/README.md#installation',
    limitations: [
      // Observed directly (stage 1's AdHoc-mode probe): without a go.mod describing the module, gopls
      // cannot reliably resolve cross-package references, which is why this preset requires one.
      'Cross-package results depend on the project being described by a go.mod.',
      // The universal static-analysis gap, not specific to gopls: calls reached only through
      // reflection (the `reflect` package) or other runtime-constructed dispatch are not part of the
      // Call Hierarchy result. (Ordinary interface method calls are resolved correctly — verified
      // directly during stage 2 by probing a call through an interface-typed parameter and confirming
      // it reached its concrete implementation; stage 1 did not test this, see
      // docs/work/task-m2-gopls-preset.md.)
      'Calls made only through reflection are not part of the Call Hierarchy result.',
      'Code produced by go:generate is only visible if it has already been generated on disk.',
    ],
  },
  // Evidence for the verified-external tier. Both 0.19.1 and 0.23.0 were verified on darwin/arm64 only
  // by hand (task-m2-gopls-preset.md stage 1). M2 stage 3 (task-m2-gopls-ci-verification.md) closed the
  // OS gap for 0.19.1 specifically: a dedicated CI job (`go-provider` in .github/workflows/unit-tests.yml)
  // installs that pinned version and runs a real, unmocked auto-discovery + Call Hierarchy + readiness
  // round trip on ubuntu-latest, macos-latest and windows-latest on every push. 0.23.0 itself has not
  // been exercised outside darwin/arm64 - this preset's "verified" claim is real on all three OSes only
  // for the version CI actually installs.
  lastVerified: {
    date: '2026-09-01',
    versions: ['0.19.1', '0.23.0'],
  },
};

const PYRIGHT_FIXTURE_TARGET = 'def fixture_target(value: int) -> int:\n    return value + 1\n';
const PYRIGHT_FIXTURE_CALLER = [
  'from target import fixture_target',
  '',
  '',
  'def fixture_caller(value: int) -> int:',
  '    return fixture_target(value)',
  '',
].join('\n');

export const BUNDLED_PYRIGHT_PRESET_ID = 'bundled-pyright';

/** The specifier `bundledModuleEntry` is allowed to resolve for this preset. See `cli/src/runtime.ts`. */
export const BUNDLED_PYRIGHT_MODULE = 'pyright/langserver.index.js';

const bundledPyright: ProviderPreset = {
  id: BUNDLED_PYRIGHT_PRESET_ID,
  displayName: 'Bundled pyright (Python)',
  tier: 'bundled',
  languageIds: ['python'],
  extensions: ['.py'],
  command: {
    candidates: [{ $ref: 'nodeExecutable' }],
    args: [{ $ref: 'bundledModuleEntry', module: BUNDLED_PYRIGHT_MODULE }, '--stdio'],
    languageIdFrom: 'detected',
  },
  // No `version`: same reasoning as `bundled-typescript` - it ships inside the tarball at a pinned
  // version (`cli/package.json`'s `dependencies.pyright`, no caret, same asymmetry as `typescript`), so
  // its version is read from package metadata by the bundled artifact check, not by starting a process.
  // No `initializationOptions`, no `settings`: pyright answered the fixture's Call Hierarchy request
  // correctly with an empty initialize frame (task-m2-python-investigation.md, reconfirmed by
  // task-m2-python-preset.md stage 2).
  //
  // No `readiness`, unlike gopls - found NOT to be safely usable, not simply skipped. pyright's
  // work-done-progress cycle is real (begin/report "N files to analyze"/end, confirmed both in the
  // investigation lane and this lane) but it is entirely `didOpen`-triggered: a probe that never opens a
  // file observes zero progress notifications even after 6 seconds, and the real transcript
  // (`IMPACT_LENS_LSP_TRANSCRIPT=1`) from an actual analyze run shows `"progress":[]` -
  // `LspCallHierarchyProvider.awaitReadiness()` runs inside `doInitialize()`, before `prepare()`'s
  // `open()` call ever fires, so pyright has nothing to analyze yet and never sends the signal this
  // preset would be waiting for. Declaring `readiness` here without changing that call order would not
  // improve `coverage.indexing.status` - it would just make every Python analysis pay the full
  // `budgetMs` as dead latency before `onBudgetExceeded: 'proceed-partial'` falls back to querying
  // anyway, for a query that then succeeds correctly. task-m2-python-preset.md stage 4 records this as
  // an open architectural question (reorder `open()` before `awaitReadiness()`, cross-cutting across
  // every provider) rather than deciding it here. Until it is resolved, `coverage.indexing.status` stays
  // `unknown` for Python - the same honest "no claim" default `bundled-typescript` already uses, not a
  // regression from some better state this preset could reach today.
  //
  // No `requiredProjectFiles`, unlike gopls's `go.mod`. This is a deliberate absence, not an oversight:
  // gopls needed it because a missing go.mod silently drops it into an AdHoc mode that is
  // indistinguishable on the wire from a complete module-aware result (task-m2-gopls-preset.md).
  // task-m2-python-preset.md stage 4 tested the equivalent pyright risk directly, twice: (1) a bare
  // multi-directory layout with no pyproject.toml, no setup.py and no __init__.py anywhere still
  // resolved a cross-directory import correctly (pyright's implicit-namespace-package resolution
  // roots at the workspace itself) - no gopls-style AdHoc fallback exists to gate against. (2) A
  // third-party import pyright cannot resolve (no venv configured) does NOT silently degrade - it
  // produces an explicit `reportMissingImports` diagnostic on the affected line, which this CLI already
  // surfaces per-node via `collectDiagnostics`. That gap is real (see `docs.limitations` below) but it
  // is not the silent-completeness failure `requiredProjectFiles` exists to prevent, and gating on a
  // project file's mere presence would not fix it anyway - a bare `.venv/` directory with no
  // `pyrightconfig.json` was tested and still left the import unresolved, while a `pythonPath` supplied
  // through `workspace/configuration` fixed it with no project file involved at all. Auto-detecting a
  // venv and supplying it that way is a real option this preset does not implement yet - flagged for
  // the next review rather than built speculatively here.
  fixture: {
    files: [
      { path: 'target.py', content: PYRIGHT_FIXTURE_TARGET },
      { path: 'caller.py', content: PYRIGHT_FIXTURE_CALLER },
    ],
    // Line 1, column 5 is the first character of "fixture_target" ("def " is 4 characters).
    target: { file: 'target.py', line: 1, column: 5 },
    expectedCaller: 'fixture_caller',
  },
  docs: {
    install: 'https://microsoft.github.io/pyright/#/installation',
    limitations: [
      'Calls made only through reflection or other runtime-constructed dispatch are not part of the Call Hierarchy result.',
      // The observed pyright/Pyrefly null-vs-[] divergence for exactly this shape (Depends()-style
      // reference-only calls) is what task-m2-python-preset.md stage 3's `provider_null_incoming_calls`
      // exists to flag per-response; this line documents the underlying static-analysis gap itself.
      'Calls made only through framework mechanisms such as dependency injection (for example FastAPI\'s Depends()) are not part of the Call Hierarchy result.',
      // Verified directly, task-m2-python-preset.md stage 4: this preset does not auto-detect a virtual
      // environment. A project needs its own pyrightconfig.json/pyproject.toml naming venvPath, or a
      // workspace/configuration response naming pythonPath, or symbols reached only through an
      // unresolved third-party import are missing from the graph - visibly, as a reportMissingImports
      // diagnostic on the affected file, never silently.
      'Third-party imports are not resolved unless pyright is told where the interpreter that has them installed lives; this preset does not auto-detect a virtual environment.',
    ],
  },
  // Evidence for the bundled tier. Verified on darwin/arm64 only, by hand (task-m2-python-preset.md
  // stage 4) - this preset has no CI job yet exercising windows-latest/ubuntu-latest, unlike gopls's
  // go-provider job. Stage 5 of the same document is where that gap closes.
  lastVerified: {
    date: '2026-09-02',
    versions: ['1.1.413'],
  },
};

// Single file, not two - see the fixture's own comment below for why: with no compile_commands.json,
// clangd's fallback command can only resolve a call within the same already-open file, not across two.
const CLANGD_FIXTURE_C = [
  'void fixture_target(void) {',
  '}',
  '',
  'void fixture_caller(void) {',
  '    fixture_target();',
  '}',
  '',
].join('\n');

export const CLANGD_PRESET_ID = 'clangd';

/**
 * `clangd` (M2, `docs/work/task-m2-clangd-preset.md`) is C/C++'s entry - `verified-external` like
 * gopls, never `bundled`, because clangd is an LLVM binary this CLI cannot ship inside its own npm
 * tarball. Built directly from that document's four stages, each cited at the field it produced.
 */
const clangd: ProviderPreset = {
  id: CLANGD_PRESET_ID,
  displayName: 'clangd (C/C++)',
  tier: 'verified-external',
  // AMBIGUOUS_LANGUAGE_ID (not 'c' or 'cpp') is what lets a `.h` request reach this preset at all -
  // stage 2 found `resolve.ts`'s auto-discovery matches purely on `detectedLanguageId` being present in
  // a preset's `languageIds`, so leaving this out would mean `.h` always fails with
  // `provider_required_for_language`, even for the common unambiguous case stage 2 proved clangd
  // answers correctly.
  languageIds: ['c', 'cpp', AMBIGUOUS_LANGUAGE_ID],
  extensions: ['.c', '.cc', '.cpp', '.cxx', '.h', '.hh', '.hpp', '.hxx'],
  command: {
    // PATH lookup only, same mechanism as gopls - no platform-specific search, no bundling (clangd is
    // an LLVM binary). Users installing via Homebrew's `llvm` formula need to know it is keg-only and
    // not linked onto PATH by default; that belongs in `docs.install`, not in a discovery workaround
    // here - this CLI does not manage a user's PATH, the same principle IL-LIM-004 states for every
    // preset.
    candidates: ['clangd'],
    // `--background-index`, not the bare default: every stage 1-3 probe against real clangd
    // (Apple 17.0.0 and upstream LLVM 23.1.0) ran with this flag, and the readiness-signal and
    // compile-database findings this preset is built from are specific to that configuration.
    args: ['--background-index'],
    languageIdFrom: 'detected',
  },
  version: {
    // Plain `--version`, one line of prose ("Apple clangd version 17.0.0 (...)" /
    // "Homebrew clangd version 23.1.0"). No JSON-flavored flag exists for clangd's version output
    // (checked: `--help-hidden` has nothing resembling gopls's `-json` trap), and `parseVersion()`
    // already extracts the first dotted number it finds regardless of what word precedes it - verified
    // directly against both real banners in stage 1/4, no preset-level parser needed. The version
    // banner's own prefix differs by distributor ("Apple clangd version" vs "Homebrew clangd version"),
    // which is exactly why nothing here depends on that prefix.
    args: ['--version'],
    timeoutMs: 5000,
    maxOutputBytes: 4096,
    // The two versions actually run: Apple clangd 17.0.0 (Xcode Command Line Tools) and upstream LLVM
    // clangd 23.1.0 (Homebrew `llvm`, stage 1's cross-check against Apple's `mac+xpc` build). Nothing
    // between them was tested - `minimum` is the lower of the two, not a guess that every version in
    // between also works. `lastVerified.versions` below lists both exact versions for the same reason
    // gopls's comment gives: narrow or widen this only after testing a version, never by assuming.
    supported: { minimum: '17.0.0' },
  },
  // No `initializationOptions`, no `settings`: every stage 1-3 probe answered correctly with an empty
  // initialize frame.
  //
  // No `readiness` - stage 1's gate conclusion, not an oversight. clangd's `backgroundIndexProgress`
  // signal is `textDocument/didOpen`-triggered, not workspace-level: waiting 15 seconds after
  // `initialize` with no file opened (cache cleared first, to rule out a stale on-disk index) produced
  // zero `$/progress` notifications, on both clangd builds; opening a file produced several almost
  // immediately. `LspCallHierarchyProvider.awaitReadiness()` runs inside `doInitialize()`, before any
  // `open()` call, so this signal is structurally unreachable at the point this preset would declare it
  // - the same architectural constraint the Python lane found for pyright. Declaring `readiness` here
  // would only add `budgetMs` as pure dead latency before `onBudgetExceeded` falls back to querying
  // anyway. `coverage.indexing.status` stays `unknown` for C/C++, the same honest "no claim" default
  // `bundled-typescript` and `bundled-pyright` already use, not a regression from a reachable better
  // state.
  //
  // No `requiredProjectFiles`, unlike gopls's `go.mod` - stage 3's explicit decision, not a gap
  // inherited from stage 1. A missing `compile_commands.json` does degrade silently at the protocol
  // level (clangd's own "Failed to find compilation database" never crosses the wire, stage 1/2), which
  // is the same shape of risk `go.mod` exists to gate - but clangd's fallback command can still answer
  // correctly with no compile database present, unlike gopls's AdHoc mode, for queries that stay within
  // one already-open translation unit (see the fixture comment directly below for the precise shape
  // this preset's own fixture had to learn the hard way). Gating here would turn every one of those
  // still-working queries into `unsupported`. Stage 3 surfaces the same risk instead, unconditionally
  // on caller count, via `compile_database_missing`/`_stale`/`_ambiguous` in `limitationDetails`
  // (`coverage.ts`) - see that stage's decision record for the alternatives considered and rejected.
  fixture: {
    files: [{ path: 'fixture.c', content: CLANGD_FIXTURE_C }],
    // Single file, not two - a real bug this preset's own stage 4 `--fixture` run caught, not something
    // reasoned out in advance. The original two-file version (target.c defines fixture_target, caller.c
    // calls it) failed `doctor clangd --fixture` with observedCallers: [] the first time it actually
    // ran. Stage 1's `without-db` probe had "proven" the fallback command answers a 2-function,
    // 2-file case correctly - but that probe manually opened BOTH files over the LSP wire before
    // querying, and `fixtureCheck()` (doctor/index.ts) only opens the ONE file `target` names before
    // asking for its incoming calls. Re-testing directly settled which claim was right: a same-file
    // call (both functions in one already-open file) still resolves correctly with no compile database
    // (clangd's fallback parses the whole open file as one translation unit); a cross-file call where
    // the callee's own file is opened first and the caller's file is never opened at all does not -
    // there is no background index to discover it with. `compile_commands.json` entries carry the
    // runtime temp-directory path anyway (`ProviderFixtureFile.content` is a static string,
    // `fixtureCheck()` only creates that directory via `fs.mkdtempSync()` after this preset's content
    // is already defined - no template-injection hook exists to supply it), so a fixture proving the
    // no-compile-database path has to stay within what a single opened file can resolve on its own.
    // Line 1, column 6 is the first character of "fixture_target" ("void " is 5 characters).
    target: { file: 'fixture.c', line: 1, column: 6 },
    expectedCaller: 'fixture_caller',
  },
  docs: {
    install: 'https://clangd.llvm.org/installation',
    // Each entry cites the real probe that grounds it (stage 4) rather than stating it as this
    // project's own judgment - commander's explicit stage 4 instruction. Every scenario below was run
    // against real clangd (Apple 17.0.0), not assumed from general C/C++ static-analysis knowledge.
    limitations: [
      // Probed directly: a function pointer initialized to fixture_target and invoked as `fp()`.
      // incomingCalls on fixture_target returned only the assignment site (surfaced as a reference
      // named "fp"), never the function that performed the indirect call through the pointer.
      'Calls made only through a function pointer invocation are not part of the Call Hierarchy result; only the pointer\'s own assignment site may appear as a reference.',
      // Probed directly: a virtual method Derived::target overriding Base::target, called through a
      // Base* as `b->target()`. incomingCalls on Base::target correctly included the call site;
      // incomingCalls on Derived::target was empty - the statically-typed call site never appears
      // under the override that could be reached at runtime through dynamic dispatch.
      'A call reached only through virtual dispatch on a base-class pointer or reference appears under the statically-declared base method\'s Call Hierarchy result, never under a derived override\'s.',
      // Probed directly, and the result contradicts the naive assumption: a simple macro expanding
      // directly to a function call (`#define CALL_TARGET() macro_target()`) WAS correctly resolved -
      // incomingCalls found the real caller, because clangd operates on the post-preprocessor AST.
      // More complex macro shapes (token-pasted names, conditionally-defined macros, X-macros) were not
      // tested and may behave differently; this is deliberately not phrased as "macros are unsupported"
      // because that would overclaim past what was actually measured.
      'A simple macro that expands directly to a function call is resolved correctly (verified); more complex macro patterns generating calls (token-pasting, X-macros) have not been tested.',
      // Probed directly: a call inside `#ifdef ENABLE_FEATURE` / `#endif`, queried without that macro
      // defined. incomingCalls on the target was empty - the untaken branch is not part of the compiled
      // AST at all, so a call inside it is invisible regardless of what the source text says.
      'A call inside a preprocessor branch not taken under the compile flags actually used (an #ifdef whose macro is undefined, for example) is invisible to the Call Hierarchy result - the branch is not part of the compiled AST.',
    ],
  },
  // Evidence for the verified-external tier. Both 17.0.0 (Apple clangd, Xcode Command Line Tools) and
  // 23.1.0 (upstream LLVM clangd, Homebrew) were verified on darwin/arm64 only, by hand, across stages
  // 1-4 of task-m2-clangd-preset.md - this preset has no CI job yet exercising windows-latest/
  // ubuntu-latest or a real MSVC/clang-cl toolchain, unlike gopls's go-provider job. Stage 5 of the same
  // document is where that gap closes.
  lastVerified: {
    date: '2026-09-02',
    versions: ['17.0.0', '23.1.0'],
  },
};

export const PROVIDER_CATALOG: readonly ProviderPreset[] = [bundledTypeScript, gopls, bundledPyright, clangd];

export function findPreset(catalog: readonly ProviderPreset[], id: string): ProviderPreset | undefined {
  return catalog.find(preset => preset.id === id);
}

export function presetIds(catalog: readonly ProviderPreset[]): readonly string[] {
  return catalog.map(preset => preset.id);
}

export function presetsForLanguage(
  catalog: readonly ProviderPreset[],
  languageId: string,
): readonly ProviderPreset[] {
  return catalog.filter(preset => preset.languageIds.includes(languageId));
}

/**
 * Every language some bundled preset answers for, in catalog order.
 *
 * This feeds `provider_required_for_language`, whose details tell the user which languages work
 * without any configuration. It is derived rather than written twice: a literal list that drifts from
 * the presets would advertise a language nothing can serve.
 */
export function bundledLanguageIds(catalog: readonly ProviderPreset[]): readonly string[] {
  return catalog.filter(preset => preset.tier === 'bundled').flatMap(preset => preset.languageIds);
}
