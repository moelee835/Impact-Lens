import { ProviderPreset } from './preset';

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

export const PROVIDER_CATALOG: readonly ProviderPreset[] = [bundledTypeScript, gopls, bundledPyright];

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
