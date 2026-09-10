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
//
// 2026-09-10 (IL-LIM-010 stage 1 completion, commander's observation): the five DEFAULT rules below
// happen to tolerate an unrelativized absolute path more often than not - `test-directory` scans every
// path segment regardless of depth, and the naming rules only ever look at the basename - so an
// accidentally-absolute input frequently still lands on the intended answer. That tolerance is a
// COINCIDENCE of how these five rules are written, not a design guarantee this module makes anywhere
// (the paragraph above is explicit that relativizing is the caller's job). Do not read the fact that
// existing fixtures "still pass" with an absolute path as evidence that passing one is fine: a caller-
// supplied USER PATTERN (`compileTestPatterns()` below) has no such accidental tolerance - an anchored
// pattern like `contracts/**/*.contract.ts` requires the path to literally start with `contracts/`, and
// a stray absolute-path prefix breaks that match with no warning. This exact gap was found in a TEST
// FIXTURE, not production code, by `cli/src/test/impact.test.ts`'s `workspaceFixture()` - see that
// function's own comment for the mechanism and `docs/work/task-m4-il-lim-010-stage1-completion.md` for
// the full account.

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
  /** Unchanged meaning (IL-LIM-010 stage 1 completion, docs/work/task-m4-il-lim-010-stage1-
   * completion.md): the default-convention rule's stable id when one matched, else null. A user
   * include pattern match does NOT populate this - a user's own glob text is not the kind of stable,
   * do-not-rename identifier this field has always promised callers. */
  readonly ruleId: string | null;
  /** Which channel decided the final `isTest` value. */
  readonly source: 'default-convention' | 'user-include' | 'user-exclude' | 'none';
  /** The literal user pattern that matched, when `source` is `'user-include'`/`'user-exclude'`; null
   * otherwise (including `'default-convention'` - a default rule has a stable `ruleId`, not a pattern
   * string, to report). */
  readonly matchedPattern: string | null;
  /** Only meaningful when `source === 'user-exclude'`: the default-convention rule id that would have
   * matched had the exclude pattern not suppressed it, or null when no default rule would have (the
   * exclude pattern matched a path nothing was otherwise going to classify as a test - there is
   * nothing to report as "suppressed", so this collapses to the same null rather than inventing a
   * distinct "pointless exclude" state). */
  readonly suppressedRuleId: string | null;
}

/** One compiled user pattern, keeping the original text alongside the compiled matcher so a match can
 * be reported back to the user verbatim (see `TestFileClassification.matchedPattern`). */
export interface CompiledTestPattern {
  readonly source: string;
  readonly regex: RegExp;
}

export interface CompiledTestPatterns {
  readonly include: readonly CompiledTestPattern[];
  readonly exclude: readonly CompiledTestPattern[];
}

/** Thrown by `compileTestPatterns()` for a pattern this module cannot understand - callers turn this
 * into a host-appropriate visible failure (CLI: `test_pattern_config_invalid`; Extension: the existing
 * analysis-failure error path) rather than silently dropping the pattern. Never thrown for I/O or
 * missing-file reasons - those are the caller's concern, this module only validates pattern syntax. */
export class InvalidTestPatternError extends Error {
  constructor(
    readonly pattern: string,
    readonly field: 'include' | 'exclude',
    message: string,
  ) {
    super(message);
    this.name = 'InvalidTestPatternError';
  }
}

// Deliberately narrow: `cli/src/shared/**` ships into the Extension's VSIX with a hard require-
// boundary check against npm runtime dependencies (`scripts/test-vsix-contents.mjs`), so a glob
// library (minimatch/micromatch/...) is not an option here - this is a hand-rolled compiler instead.
// This repository has already paid for exactly this class of mistake once: the callback adapter's
// scope-boundary defect surfaced through FOUR separate channels (a brace inside a string, then inside
// a regex literal, then an unrecognized method-shorthand opener, then an inline arrow scope), and every
// one of those four passed every fixture that existed at the time (see the m4-gate7 lane's own account
// of that history). Treat this compiler as carrying the same risk: validated with a NEGATIVE fixture
// suite at least as large as the positive one (`cli/src/test/testPatternGlob.test.ts`), not just enough
// positive cases to look correct.
const UNSUPPORTED_GLOB_CHARACTERS = /[\\?[\]{}!]/;
const UNSUPPORTED_PATTERN_HELP =
  'only "*" (matches within one path segment) and "**" (matches across path segments, including zero) '
  + 'are supported; "?", "[...]", "{...}", "!" and "\\" are not';

/** Returns a human-readable problem description, or null when `pattern` is supported syntax. Says what
 * IS supported rather than just "invalid" - a user who reaches for `?`/`[...]` has no way to guess why
 * it failed otherwise. */
export function validateTestPattern(pattern: string): string | null {
  if (pattern.length === 0) {
    return `pattern must not be empty (${UNSUPPORTED_PATTERN_HELP})`;
  }
  if (UNSUPPORTED_GLOB_CHARACTERS.test(pattern)) {
    return `pattern "${pattern}" is not supported: ${UNSUPPORTED_PATTERN_HELP}`;
  }
  if (/\*{3,}/.test(pattern)) {
    return `pattern "${pattern}" is not supported: three or more consecutive "*" have no defined `
      + `meaning here (${UNSUPPORTED_PATTERN_HELP})`;
  }
  return null;
}

// Every character a JS RegExp gives special meaning to, apart from `*` (handled by the tokenizer below,
// never reaches this function) and `/` (a plain literal here - it has no special regex meaning either).
const REGEXP_SPECIAL_CHARACTER = /[.+^${}()|[\]\\]/;

function escapeLiteralCharacter(char: string): string {
  return REGEXP_SPECIAL_CHARACTER.test(char) ? `\\${char}` : char;
}

// Compiles one already-validated pattern into a whole-path-anchored RegExp. A single "*" matches any
// run of characters except "/" (never crosses a path segment); a double "*" token immediately followed
// by a "/" separator compiles to an OPTIONAL ".*"-then-"/" group so a pattern that starts with that
// double-star-slash idiom followed by "*.spec.ts" matches both a top-level "a.spec.ts" (zero leading
// directories) and a nested "e2e/sub/a.spec.ts" (any number) - this mirrors Jest's own default
// testMatch, which begins with exactly that idiom; a bare double "*" anywhere else matches any run of
// characters INCLUDING "/". Every other character is escaped as a regex literal - this is the step
// that keeps a pattern like "foo.test.ts" from ever accidentally matching "fooXtestXts" (an un-escaped
// "." would make that happen silently, exactly the kind of scope-boundary mistake this module's own
// comment above warns about).
//
// NOTE for anyone editing this comment: do not write the two-star-then-slash token followed
// immediately by another star as a literal example inside this block comment - that four-character
// sequence closes a block comment early and breaks the parser. Spell it out in words instead, as above.
function compileGlobToRegExp(pattern: string): RegExp {
  let source = '';
  let index = 0;
  while (index < pattern.length) {
    const char = pattern[index];
    if (char === '*' && pattern[index + 1] === '*') {
      if (pattern[index + 2] === '/') {
        source += '(?:.*/)?';
        index += 3;
      } else {
        source += '.*';
        index += 2;
      }
    } else if (char === '*') {
      source += '[^/]*';
      index += 1;
    } else {
      source += escapeLiteralCharacter(char);
      index += 1;
    }
  }
  return new RegExp(`^${source}$`);
}

function compilePatternList(patterns: readonly string[], field: 'include' | 'exclude'): readonly CompiledTestPattern[] {
  return patterns.map(pattern => {
    const problem = validateTestPattern(pattern);
    if (problem !== null) {
      throw new InvalidTestPatternError(pattern, field, problem);
    }
    return { source: pattern, regex: compileGlobToRegExp(pattern) };
  });
}

/** Compiles a project's user-defined test patterns once, up front, so `classifyTestFile()` never has to
 * touch pattern SYNTAX (only matching) per call. Throws `InvalidTestPatternError` on the first
 * unsupported pattern - callers read `.impact-lens/test-patterns.json`/`.local.json` (see the work
 * document's "설정 소스" section for why both hosts read the same files) and are expected to let this
 * throw turn into a visible failure, never to catch-and-ignore it. */
export function compileTestPatterns(include: readonly string[], exclude: readonly string[]): CompiledTestPatterns {
  return {
    include: compilePatternList(include, 'include'),
    exclude: compilePatternList(exclude, 'exclude'),
  };
}

export function classifyTestFile(filePath: string, userPatterns?: CompiledTestPatterns): TestFileClassification {
  const normalized = filePath.replace(/\\/g, '/');
  const segments = normalized.split('/').filter(Boolean);
  const fileName = segments.at(-1) ?? '';
  const directorySegments = segments.slice(0, -1);

  const defaultRule = RULES.find(
    rule => hasScopedExtension(fileName, rule.extensions) && rule.matches(fileName, directorySegments),
  );
  const includeMatch = userPatterns?.include.find(pattern => pattern.regex.test(normalized));
  const excludeMatch = userPatterns?.exclude.find(pattern => pattern.regex.test(normalized));
  const wouldBeTest = defaultRule !== undefined || includeMatch !== undefined;

  if (wouldBeTest && excludeMatch !== undefined) {
    return {
      isTest: false,
      ruleId: null,
      source: 'user-exclude',
      matchedPattern: excludeMatch.source,
      suppressedRuleId: defaultRule?.id ?? null,
    };
  }
  if (defaultRule !== undefined) {
    return { isTest: true, ruleId: defaultRule.id, source: 'default-convention', matchedPattern: null, suppressedRuleId: null };
  }
  if (includeMatch !== undefined) {
    return { isTest: true, ruleId: null, source: 'user-include', matchedPattern: includeMatch.source, suppressedRuleId: null };
  }
  return { isTest: false, ruleId: null, source: 'none', matchedPattern: null, suppressedRuleId: null };
}

export function isTestFilePath(filePath: string, userPatterns?: CompiledTestPatterns): boolean {
  return classifyTestFile(filePath, userPatterns).isTest;
}
