// IL-LIM-010 stage 1 (docs/work/task-m4-il-lim-010-test-classifier.md). Single source of truth for
// "is this file a test file" - previously `src/testFile.ts` (Extension) and `cli/src/testFile.ts` (CLI)
// each carried their own regex and measurably disagreed on multiple paths, and (independently of that
// disagreement) both hosts also AGREED on false positives no real test framework's default discovery
// convention produces - see the work document's decision table for the primary-source verification
// (pytest, Jest, `go test`, Maven Surefire) each rule below is built from, and for why each candidate
// rule was kept, dropped, or scoped rather than picked by "whichever host said true".
//
// Contract: `classifyTestFile()`/`isTestFilePath()` take a path string ONLY - no workspace, no
// filesystem access. Callers are responsible for passing a workspace-relative path when the file is
// inside a workspace (CLI: `relativeFile(workspace, file)`; Extension:
// `vscode.workspace.asRelativePath(uri, false)`). When the file is outside any workspace, both of those
// existing helpers already fall back to returning the original, unrelativized path unchanged - this
// module classifies that residual as-is (an accepted, tested residual - see the work document's
// "outside-workspace 잔여" section), rather than inventing a new "skip the directory rule outside a
// workspace" special case that neither host has today. Passing a raw, unrelativized absolute path from
// INSIDE a workspace would defeat the point of this contract: an ancestor directory that is merely part
// of the machine's own filesystem layout (a home directory named `test`, a checkout under
// `.../spec/...`) must never itself be mistaken for a test directory of the project being analyzed.

const TEST_DIRECTORIES = new Set(['__tests__', 'test', 'tests', 'spec', 'specs']);

// IMPORTANT: this scoping is NOT bounded by `cli/src/providers/catalog.ts`'s four preset languages.
// That was this lane's first draft and it was wrong - the catalog only bounds what the CLI's own preset
// LSPs can index. The VS Code Extension has no such gate: `package.json`'s relevant menu entry keys off
// `editorHasCallHierarchyProvider`, a VS Code-BUILT-IN context key this repository never defines or
// restricts (verified: `git grep editorHasCallHierarchyProvider` -> one use, zero definitions);
// `activationEvents` is `onStartupFinished` plus command/view triggers, no language restriction; and
// `src/impactAnalyzer.ts`'s own `languageId` (lines near 69/174/199) is read only for payload/metadata,
// never as a gate. A user with ANY language extension that registers a call-hierarchy provider (Java,
// Ruby, Rust, ...) can run Impact Lens on that language today. So the extension lists below are scoped
// by "which real test framework's default discovery convention this rule reproduces" (verified against
// each framework's own docs, cited per rule below), never by "which language this repo's own CLI presets
// happen to support" - the two are genuinely different questions.
const TYPESCRIPT_JAVASCRIPT_EXTENSIONS = ['.ts', '.mts', '.cts', '.tsx', '.js', '.jsx', '.mjs', '.cjs'];
const GO_EXTENSIONS = ['.go'];
const PYTHON_EXTENSIONS = ['.py'];
const RUBY_EXTENSIONS = ['.rb'];
const JAVA_EXTENSIONS = ['.java'];
// C/C++ (`.c/.cc/.cpp/.cxx/.h/.hh/.hpp/.hxx`) and C#/Kotlin intentionally have no naming-convention rule
// below: unlike Jest/pytest/Go/Surefire, there is no single dominant default FILE-naming discovery
// convention to source a rule from (C/C++: no shared default across CMake/CTest/GoogleTest/Catch2;
// C#/.NET: `dotnet test` discovers test PROJECTS via the `Microsoft.NET.Test.Sdk` package reference, not
// file names - verified against Microsoft's own docs, no primary source found for a Kotlin default
// either). Only the unscoped `test-directory` rule can still classify a file in these languages as a
// test. This is a real, disclosed behavior change from before this lane: both hosts previously agreed
// (wrongly, by this same standard) that `OrderServiceTests.cs` and a bare `FooTest.kt` were tests with
// no framework default backing that answer - see the work document's decision table.

interface ClassificationRule {
  /** Stable identifier - do not rename once shipped, callers may key limitations/UI off it. */
  readonly id: string;
  /** File extensions (lowercase, with leading dot) this rule may fire on, or 'any' for no scoping. */
  readonly extensions: readonly string[] | 'any';
  matches(fileName: string, directorySegments: readonly string[]): boolean;
}

function hasScopedExtension(fileName: string, extensions: readonly string[] | 'any'): boolean {
  if (extensions === 'any') {
    return true;
  }
  const lower = fileName.toLowerCase();
  return extensions.some(extension => lower.endsWith(extension));
}

// Order matters only in that the first match wins; today's rules never overlap on the same input, so
// the order is otherwise arbitrary.
const RULES: readonly ClassificationRule[] = [
  {
    // Ancestor directory only - never the file's own basename. A file literally named `test` or `spec`
    // (no extension) is not "inside a directory named test".
    id: 'test-directory',
    extensions: 'any',
    matches: (_fileName, directorySegments) =>
      directorySegments.some(segment => TEST_DIRECTORIES.has(segment.toLowerCase())),
  },
  {
    // order.test.ts, order.test.jsx (matches regardless of how many further extensions follow
    // "test." - EXCEPT `.d.ts`, excluded below: `a.test.d.ts` does NOT match, see the guard's own
    // comment). Scope: Jest/Vitest's default `testMatch` (`**/?(*.)+(spec|test).?([mc])[jt]s?(x)`,
    // verified against Jest's own docs) - suffix only, dot-delimited, JS/TS extensions only.
    id: 'dot-suffix',
    extensions: TYPESCRIPT_JAVASCRIPT_EXTENSIONS,
    // `.d.ts` is excluded because Jest's own default `testMatch` extension group
    // (`?([mc])[jt]s?(x)`) never matches "d.ts" - NOT because a `.d.ts` file is unreachable. It is
    // reachable: reviewer built a `.d.ts` that illegally contains an implementation (a real ambient-
    // context violation, `tsc` rejects it with TS1183) and confirmed with real tsserver that its call
    // hierarchy still returns it as a depth-1 node - the "declaration files have no executable content"
    // argument this exclusion first shipped with was wrong, in the same way this milestone has
    // repeatedly found "unreachable" arguments wrong elsewhere (gate 4's accepted residual). Keep this
    // guard on the Jest-default ground alone.
    matches: fileName => !/\.d\.ts$/i.test(fileName) && /\.(?:test|spec)\.[^/]+$/i.test(fileName),
  },
  {
    // test_order.py - pytest's own default `python_files` convention (verified: pytest's docs describe
    // discovery as `test_*.py` or `*_test.py`). RSpec's default (`**/*_spec.rb`, verified against
    // RSpec's own docs) is suffix-only - it has no `spec_*.rb` prefix convention, so `.rb` is
    // deliberately absent here (see `underscore-suffix` below).
    id: 'underscore-prefix',
    extensions: PYTHON_EXTENSIONS,
    matches: fileName => /^(?:test|spec)_.+\.[^/]+$/i.test(fileName),
  },
  {
    // order_test.go (Go's compiler-enforced `_test.go` suffix, verified against the `go` command docs),
    // order_test.py (pytest's other default shape, same source as underscore-prefix), order_spec.rb
    // (RSpec's default `**/*_spec.rb`, verified against RSpec's own docs).
    id: 'underscore-suffix',
    extensions: [...GO_EXTENSIONS, ...PYTHON_EXTENSIONS, ...RUBY_EXTENSIONS],
    matches: fileName => /_(?:test|spec)\.[^/]+$/i.test(fileName),
  },
  {
    // OrderServiceTest.java - Maven Surefire's default `**/*Test.java`/`**/*Tests.java` (verified
    // against Surefire's own docs). Case-sensitive by design - a lowercase "test" here is covered by the
    // other rules; this one exists for the PascalCase JVM convention only, and is scoped away from every
    // other language on purpose: none of Jest, pytest, `go test` or RSpec recognize a bare
    // `FooTest.ts`/`FooTest.py`/`FooTest.go`/`FooTest.rb` as a test by default, and every host measurably
    // agreed `true` for exactly that shape before this rule was scoped (see work doc).
    id: 'pascal-suffix',
    extensions: JAVA_EXTENSIONS,
    matches: fileName => /(?:Test|Tests)\.[^/]+$/.test(fileName),
  },
];

export interface TestFileClassification {
  readonly isTest: boolean;
  /** The rule that matched, or null when `isTest` is false. */
  readonly ruleId: string | null;
}

export function classifyTestFile(filePath: string): TestFileClassification {
  const normalized = filePath.replace(/\\/g, '/');
  const segments = normalized.split('/').filter(Boolean);
  const fileName = segments.at(-1) ?? '';
  const directorySegments = segments.slice(0, -1);
  for (const rule of RULES) {
    if (hasScopedExtension(fileName, rule.extensions) && rule.matches(fileName, directorySegments)) {
      return { isTest: true, ruleId: rule.id };
    }
  }
  return { isTest: false, ruleId: null };
}

export function isTestFilePath(filePath: string): boolean {
  return classifyTestFile(filePath).isTest;
}
