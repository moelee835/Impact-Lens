// IL-LIM-001 stage 3 (docs/work/task-il-lim-001-stage3-callback-adapter-design.md) - the second
// framework/dynamic-dispatch adapter (`dynamic-callback-static-v1`), TypeScript/JavaScript's entry.
//
// WHAT THIS CLOSES: a function passed by reference to a standard scheduling/event/iteration API
// (`setTimeout(handler, 0)`, `element.addEventListener('click', handler)`, `arr.forEach(handler)`) is
// never called through a call expression a static Call Hierarchy can see at the passing site - the
// provider only ever sees the STANDARD LIBRARY function being called, never `handler`. This adapter
// finds the enclosing function that passes `handler` this way and reports it as a candidate caller,
// alongside (never instead of) the static graph.
//
// WHAT THIS ADAPTER ACTUALLY CLAIMS (design doc, "2026-09-09 추가 4" - read before changing anything
// below): NOT "this function will be called" - that is unknowable statically and untrue in general
// (an empty array makes `forEach` call zero times, a cleared timer makes `setTimeout` call zero times,
// an unfired event makes `addEventListener` call zero times, none of that makes this adapter wrong).
// The actual claim is narrower and fully static: "the language's own specification defines this
// argument position as a callback slot, and the function passed there really is the symbol this
// adapter thinks it is". The existing `candidate caller` label (never `confirmed`) already carries
// this meaning - no new UI wording is needed.
//
// TWO SEPARATE VERIFICATION AXES, NEITHER OF WHICH ALONE IS SUFFICIENT - measured directly, not
// assumed (see the design doc's measurement tables):
// 1. Is the argument POSITION a callback slot at all? This is `CALLBACK_ARGUMENT_ALLOWLIST` below - a
//    human-curated list, because `prepare()` re-verification gives ZERO signal here.
//    `Array.prototype.push`/`sort`/`reduce` all resolve to the exact same trusted `lib.es5.d.ts`
//    declaration file as `forEach` (measured) - resolving to a standard library file proves the NAME is
//    real, not that the argument position is a callback. `push`'s argument is data, `forEach`'s is a
//    callback - the specification says so, `prepare()` cannot.
// 2. Is the resolved callee REALLY that standard declaration, not a same-named user function
//    (shadowing)? This is what `prepare()` on the callee position closes - measured directly: a
//    workspace `register` function resolves to the workspace file itself, `setTimeout`/
//    `addEventListener`/`forEach` resolve into TypeScript's own bundled `lib.*.d.ts` (or, when
//    `@types/node` is installed, ALSO into a workspace `node_modules/@types/node` declaration - see
//    `isTrustedStandardDeclaration()`'s own doc comment for why both are accepted and why they are not
//    the same trust tier).
//
// The `handler` argument itself gets the SAME re-verification FastAPI's adapter already established
// for `Depends(target)`: resolve via `prepare()`, and only emit an edge if the resolved item's id
// matches the expected root. A same-named local variable shadowing the real target (measured directly)
// resolves to its OWN declaration, a different id - it is silently rejected, not promoted, exactly
// gate 4's fold-to-abandonment discipline.
//
// NOT COVERED (capability absence, not an accuracy judgment - all three trace back to the same missing
// LSP capability, `definition`/`reference` resolution, absent from this SPI today):
// - Property/slot assignment (`element.onclick = handler`, `{ onEvent: handler }`) - the assignment
//   target itself is not `prepareCallHierarchy`-eligible at all (measured: `[]` for a plain property
//   position), so there is no way to confirm whether the slot is a real callback slot or an arbitrary
//   object key.
// - An event's `emit`/`dispatch` site connecting back to its `on`/`addEventListener` registration -
//   the receiver (`emitter`, a variable) is not `prepareCallHierarchy`-eligible either (measured: `[]`).
// - This is the SAME reason `fastapiDependencyAdapter.ts` hand-parses Python imports instead of asking
//   the language server "where did this name come from" - see that file's own top-of-file comment.

import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { externalRange, relativeFile, symbolKindName, uriFile } from '../impactHelpers';
import { AugmentedEdge, CallHierarchyItem } from '../../types';
import { AdapterInput, AdapterResult } from './types';

const IGNORED_DIRECTORIES = new Set(['.git', 'node_modules', 'out', 'dist', 'build', '.pnpm-store']);
const SOURCE_EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs']);

type CallbackCategory = 'deferred' | 'event' | 'sync-traversal';

interface CallbackSlot {
  readonly functionName: string;
  /** 0-based index of the callback argument in the call's argument list. */
  readonly argIndex: number;
  readonly category: CallbackCategory;
}

// Design doc "2026-09-09 추가 4": inclusion criterion is "does the specification define this argument
// position as a callback", checked against each API's own docs/spec - NOT "does prepare() resolve the
// callee to a standard declaration" (that check comes later, in `isTrustedStandardDeclaration()`, and
// answers a different question). `setTimeout`/`addEventListener` verified against MDN directly
// (quoted in the design doc); the rest share the same well-established, uncontested argument order from
// their own standard type declarations (`lib.dom.d.ts`/`lib.es5.d.ts`) - not re-verified against a
// primary source individually, since argument order itself is not in dispute the way a test framework's
// discovery convention was in IL-LIM-010.
const CALLBACK_ARGUMENT_ALLOWLIST: readonly CallbackSlot[] = [
  { functionName: 'setTimeout', argIndex: 0, category: 'deferred' },
  { functionName: 'setInterval', argIndex: 0, category: 'deferred' },
  { functionName: 'queueMicrotask', argIndex: 0, category: 'deferred' },
  { functionName: 'nextTick', argIndex: 0, category: 'deferred' },
  { functionName: 'addEventListener', argIndex: 1, category: 'event' },
  { functionName: 'forEach', argIndex: 0, category: 'sync-traversal' },
  { functionName: 'map', argIndex: 0, category: 'sync-traversal' },
  { functionName: 'filter', argIndex: 0, category: 'sync-traversal' },
  { functionName: 'find', argIndex: 0, category: 'sync-traversal' },
  { functionName: 'sort', argIndex: 0, category: 'sync-traversal' },
  { functionName: 'reduce', argIndex: 0, category: 'sync-traversal' },
];

const REASON_CODE_FOR_CATEGORY: Record<CallbackCategory, string> = {
  deferred: 'callback-registration',
  event: 'event-subscription',
  'sync-traversal': 'callback-registration',
};

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

interface CallSiteMatch {
  readonly slot: CallbackSlot;
  readonly line: number;
  /** Character offset of the callee NAME itself (not any receiver prefix like `window.`). */
  readonly calleeCharacter: number;
  /** The raw text of the callback argument, trimmed - only used if it is a bare identifier. */
  readonly argumentText: string;
  readonly argumentCharacter: number;
}

/**
 * Single-line, non-nested-parens text scan - a bounded heuristic (same philosophy as
 * `fastapiDependencyAdapter.ts`'s own regex approach), not a real parser. Accepted false negatives,
 * not silently guessed at: a call whose arguments span multiple lines, or whose relevant argument is
 * itself a call expression (`fn(getHandler())`), is not detected - both require real parsing to do
 * safely, and a missed candidate is far cheaper than a wrong one for this feature (IL-LIM-010's same
 * "false positives are worse" reasoning). An inline function expression/arrow function as the argument
 * is also not detected: this adapter only connects to an EXISTING named symbol elsewhere in the graph,
 * and an inline callback has no such symbol to connect to.
 */
function findCallSitesInLine(line: string, lineIndex: number): readonly CallSiteMatch[] {
  const matches: CallSiteMatch[] = [];
  for (const slot of CALLBACK_ARGUMENT_ALLOWLIST) {
    // A lookbehind excluding only a preceding word character/`$`, NOT `.` - a `.` must stay allowed
    // right before the name so a method call (`arr.forEach(`, `button.addEventListener(`) still
    // matches; only a same-named longer identifier (`xsetTimeout(`) needs excluding.
    const pattern = new RegExp(`(?<![\\w$])(${escapeRegExp(slot.functionName)})\\s*\\(([^()]*)\\)`, 'g');
    // Deliberately `matchAll`, not RegExp's own iterate-and-call-repeatedly method named the same as
    // one of the child_process spawn family - this codebase's buildInvocation.sources.test.ts
    // inventories every source line shaped like a member call to that family, and its documented
    // exclusion for this exact RegExp method only covers an inline regex literal receiver or a very
    // short receiver name, not a named variable like `pattern` here. Using that method here would add
    // a real-looking new call site to that inventory for no reason - `matchAll` avoids the whole
    // question.
    for (const match of line.matchAll(pattern)) {
      const calleeCharacter = (match.index ?? 0) + match[0].indexOf(match[1]);
      const args = match[2].split(',').map(part => part.trim());
      const argumentText = args[slot.argIndex];
      if (argumentText === undefined || !/^[A-Za-z_$][A-Za-z0-9_$]*$/.test(argumentText)) {
        continue;
      }
      // Character offset of the argument within the original line - re-find it starting from the
      // opening paren, not `line.indexOf(argumentText)` globally (a same-named token could appear
      // earlier in the line, e.g. as part of a different argument or a comment).
      const parenStart = (match.index ?? 0) + match[0].indexOf('(', match[0].indexOf(match[1]));
      const argumentCharacter = line.indexOf(argumentText, parenStart);
      matches.push({ slot, line: lineIndex, calleeCharacter, argumentText, argumentCharacter });
    }
  }
  return matches;
}

interface EnclosingFunction {
  readonly name: string;
  readonly line: number;
  readonly character: number;
}

const ENCLOSING_FUNCTION_PATTERNS: readonly RegExp[] = [
  /^\s*(?:export\s+)?(?:default\s+)?(?:async\s+)?function\s+([A-Za-z_$][A-Za-z0-9_$]*)\s*\(/,
  /^\s*(?:export\s+)?(?:const|let|var)\s+([A-Za-z_$][A-Za-z0-9_$]*)\s*=\s*(?:async\s+)?\([^()]*\)\s*=>/,
  /^\s*(?:export\s+)?(?:const|let|var)\s+([A-Za-z_$][A-Za-z0-9_$]*)\s*=\s*(?:async\s+)?function\s*\(/,
];

// M4 gate 7 real-code measurement (docs/work/task-m4-gate7-budget-and-real-code-measurement.md,
// "3-1 실행 결과"): `findEnclosingFunction`'s own doc comment used to call class method shorthand
// (`name() { ... }`) and object-literal method shorthand "accepted false negatives" - measured
// against this repo's own real code, that direction was wrong. When the backward scan crosses a line
// like that, none of the three patterns above match it, but the line's own `{` still doesn't raise
// `depth` past 0 on the way back up (an unmatched open, seen while scanning backward with depth
// already at 0, clamps at 0 rather than going negative) - so the scan does not stop, it walks straight
// through the unrecognized method and keeps matching at depth 0 further out, landing on whatever
// OUTER named scope happens to enclose it. Reproduced directly: `toAdapterItem`'s real caller is the
// object-literal method `prepare` in `adapterProviderShim.ts`, but the adapter reported the outer
// factory `createAdapterProvider` - a function that returns `prepare` but never itself calls
// `toAdapterItem`. That is not a missed candidate, it is a wrong one - worse than the false negative
// the old comment described, and the same shape reviewer already found twice in this file (a brace
// inside a string, then inside a regex literal): a "known limitation" whose actual FAILURE DIRECTION
// was never measured turned out not to be the direction the comment claimed.
//
// Fix (commander's direction, in preference to widening ENCLOSING_FUNCTION_PATTERNS to also match
// these shapes - that trades this mis-attribution for a different one, since `name() {` is
// syntactically indistinguishable from a call passed a block, the same over-fitting risk that keeps
// this out of ENCLOSING_FUNCTION_PATTERNS in the first place): when the scan is at depth 0 and meets a
// line that LOOKS like a function/method scope opener (an identifier, optional generics, a
// parenthesized argument list, an optional TypeScript return-type annotation, ending in `{`) but
// matches none of the three known patterns and is not a control-flow keyword, fold to abandonment
// immediately - the same "a caught exception must join the could-not-confirm branch" discipline this
// codebase already applies to `resolveEndpoint()`'s `prepare()` failures and to
// `stripSameLineCommentsAndStrings()`'s unsafe-line handling. This turns the mis-attribution back into
// a false negative, which is this adapter's one accepted failure direction everywhere else.
//
// Deliberately narrow, not "abort on any line ending in `{`" - that repeats the all-or-nothing guard's
// own mistake (measured to cost ~half of resolvable recall on this repo's own trees, see this file's
// top-of-file comment). Control-flow keywords (`if`/`for`/`while`/`switch`/`catch`/`do`) open blocks
// too but are not function scopes and must keep passing through unaffected; the exclusion list below
// is deliberately just those six, not e.g. `else` (which can never syntactically satisfy the
// identifier-then-parens shape below on its own) or a bare `{` with no parens at all (already outside
// this pattern's shape).
const UNRECOGNIZED_FUNCTION_LIKE_LINE_OPENER =
  /^\s*(?:export\s+)?(?:default\s+)?(?:public\s+|private\s+|protected\s+|static\s+|readonly\s+|abstract\s+|override\s+|async\s+|get\s+|set\s+|\*\s*)*([A-Za-z_$][A-Za-z0-9_$]*)\s*(?:<[^<>]*>)?\s*\([^()]*\)\s*(?::\s*[^{};]+)?\s*\{\s*$/;
const CONTROL_FLOW_KEYWORDS = new Set(['if', 'for', 'while', 'switch', 'catch', 'do']);

// reviewer, executed directly: a brace inside a string on an already-closed nested function's line
// (`function inner() { const msg = "shape: {"; ... }`) throws the depth counter off by one, and the
// counter recovers to 0 exactly on `inner`'s own declaration line - `findEnclosingFunction` returns
// `inner`, a real, wrong answer, not a missed one. commander: don't reuse `fastapiDependencyAdapter.ts`'s
// `stripCommentsAndStrings()` to fix this - it is Python-specific in three ways that would each create
// a NEW mis-attribution in TypeScript: it never strips `//`/`/* */` at all, it never strips backtick
// template literals (exactly where `{` hides most often in TS), and it treats a bare `#` as a comment
// marker - but `#` in TypeScript introduces a private class field (`this.#count`), so a line containing
// one would have its real remainder silently discarded.
//
// First fix shipped here was even cheaper than that: abort brace-counting entirely the moment a line
// combines any brace with any quote/backtick/comment marker, regardless of whether they actually
// interact. commander measured its real cost directly against this repo's own two source trees
// (`src/`, `cli/src/`, every line where an allowlisted API name appears) and found it lost roughly HALF
// of what the plain (unguarded, but wrong-on-shadowed-nesting) version could already resolve - most of
// that loss from completely ordinary lines like `if (x) { log('a'); }` or a declaration's own trailing
// `// comment`, not the rare deep-nested-string shape the guard was built for. Recall costs of that
// size need to be paid deliberately, not discovered after merge - so this is the ONE non-cheap fix in
// this file: a real (still single-line, still not a parser) same-line strip of comments/strings, replacing
// their contents with same-length blanks so real braces outside them count correctly and column
// positions elsewhere never shift.
/**
 * Blanks out same-line `//`/`/* *\/` comments and single/double-quoted string contents, and single-line
 * backtick strings with no `${` interpolation, so `{`/`}` inside any of them cannot be miscounted as
 * real structure - unlike the all-or-nothing guard this replaced, this recovers the common cases
 * (measured: roughly +10-15 percentage points of resolvable call sites across this repo's own two
 * trees) instead of aborting on all of them. Returns `null` - genuinely unsafe, caller must abort - for
 * anything that could plausibly span multiple lines, or whose content this single-line scan cannot
 * safely evaluate: an unterminated block comment, an unterminated quoted or backtick string (template
 * literals routinely span lines in this codebase's own doc-comment style), and a same-line backtick
 * string containing `${` - interpolation can itself contain arbitrary expressions including braces this
 * scan has no safe way to evaluate, so it is rejected even when both backticks are on this one line.
 * A `//` comment can never itself span lines, so finding one (outside a string) always ends the scan for
 * that line safely, with everything after it blanked regardless of what it contains.
 */
export function stripSameLineCommentsAndStrings(line: string): string | null {
  let result = '';
  let index = 0;
  while (index < line.length) {
    const character = line[index];
    if (character === '/' && line[index + 1] === '/') {
      result += ' '.repeat(line.length - index);
      break;
    }
    if (character === '/' && line[index + 1] === '*') {
      const close = line.indexOf('*/', index + 2);
      if (close === -1) {
        return null;
      }
      result += ' '.repeat(close + 2 - index);
      index = close + 2;
      continue;
    }
    if (character === '"' || character === '\'') {
      const quote = character;
      let cursor = index + 1;
      let terminated = false;
      while (cursor < line.length) {
        if (line[cursor] === '\\') {
          cursor += 2;
          continue;
        }
        if (line[cursor] === quote) {
          terminated = true;
          break;
        }
        cursor += 1;
      }
      if (!terminated) {
        return null;
      }
      result += ' '.repeat(cursor - index + 1);
      index = cursor + 1;
      continue;
    }
    if (character === '`') {
      const close = line.indexOf('`', index + 1);
      if (close === -1) {
        return null;
      }
      if (line.slice(index + 1, close).includes('${')) {
        return null;
      }
      result += ' '.repeat(close + 1 - index);
      index = close + 1;
      continue;
    }
    result += character;
    index += 1;
  }
  // commander, executed directly: a regex literal (`/\{/`, `/[{]/`) is a THIRD channel to the exact
  // same false-attribution reviewer found via strings - this scanner strips `//`/`/* */`/quotes/simple
  // backticks but never recognized `/.../ ` as a regex literal at all, so a brace inside one was still
  // counted as real structure. Reproduced directly (`regexBraceTrap.ts` fixture): `regexInner` was
  // mis-attributed instead of the true enclosing `regexOuterCaller`, the same wrong-answer shape as the
  // original string bug. Distinguishing a real regex literal from a division expression needs the
  // surrounding expression context (what token precedes the `/`) - out of scope for a single-line
  // scanner - so, per commander's proposal, this does not try: any `/` still present after stripping
  // real comments/strings, on a line that also has a brace, makes the line unsafe. Measured cost of
  // this specific addition (commander, cross-checked): under 1% of this repo's own brace-bearing lines
  // in both `src/` and `cli/src/` - negligible next to what the original all-or-nothing guard cost.
  if (result.includes('/') && (result.includes('{') || result.includes('}'))) {
    return null;
  }
  return result;
}

/**
 * Nearest preceding function-shaped declaration line above `fromLine` that actually still ENCLOSES it -
 * a bounded heuristic (same philosophy as `fastapiDependencyAdapter.ts`'s `findEnclosingDef()`), not a
 * scope-accurate parse, but brace-depth-aware unlike a plain "nearest preceding declaration" scan would
 * be. That plain version was tried first and found wrong by direct execution: a NESTED function declared
 * and closed before the call site (`function outer() { function inner() {...} someCall(handler); }`)
 * would incorrectly match `inner` - it is textually the closest preceding declaration, but its own body
 * already closed before `fromLine`, so it is a SIBLING statement, not the enclosing scope. `depth` counts
 * net unmatched closing braces seen while scanning backward; a candidate line is only accepted when
 * `depth === 0` there, i.e. nothing between it and `fromLine` has already closed a nested block.
 * `stripSameLineCommentsAndStrings()` (see its own doc comment) aborts the whole scan the moment
 * brace-counting can no longer be trusted on a single line, rather than silently continuing on a count
 * that might already be wrong - name extraction still reads the ORIGINAL (unstripped) line, which is
 * fine, since a real declaration is never itself inside a string or comment. Still bounded, not a
 * parser: does not understand class method shorthand (`name() { ... }`) or IIFEs either - too easy to
 * confuse with an ordinary call to widen `ENCLOSING_FUNCTION_PATTERNS` to cover them (same over-fitting
 * risk the gate 7 real-code measurement, `docs/work/task-m4-gate7-budget-and-real-code-measurement.md`,
 * confirmed empirically). Unlike the two channels reviewer found before this one (a brace inside a
 * string, then inside a regex literal), this is NOT silently miscounted - `UNRECOGNIZED_FUNCTION_LIKE_
 * LINE_OPENER` below detects crossing one of these unrecognized scope openers and folds to
 * abandonment, the same "accepted false negative, never a wrong answer" direction `stripSameLine
 * CommentsAndStrings()` already applies. Measured directly: without this check, this exact shape
 * produced a real, wrong answer for `toAdapterItem` in `adapterProviderShim.ts` (the outer factory
 * `createAdapterProvider` was reported as the candidate caller instead of the object-literal method
 * `prepare`, which is what actually calls it) - the doc comment used to call this an "accepted false
 * negative" before that measurement showed it was sometimes a wrong answer instead, not a missing one.
 */
function findEnclosingFunction(lines: readonly string[], fromLine: number): EnclosingFunction | undefined {
  let depth = 0;
  for (let index = fromLine; index >= 0; index -= 1) {
    const line = lines[index];
    const stripped = stripSameLineCommentsAndStrings(line);
    if (stripped === null) {
      return undefined;
    }
    if (depth === 0) {
      for (const pattern of ENCLOSING_FUNCTION_PATTERNS) {
        const match = line.match(pattern);
        if (match) {
          return { name: match[1], line: index, character: line.indexOf(match[1], match.index ?? 0) };
        }
      }
      const unrecognizedMatch = line.match(UNRECOGNIZED_FUNCTION_LIKE_LINE_OPENER);
      if (unrecognizedMatch && !CONTROL_FLOW_KEYWORDS.has(unrecognizedMatch[1])) {
        return undefined;
      }
    }
    const closes = stripped.split('}').length - 1;
    const opens = stripped.split('{').length - 1;
    depth = Math.max(0, depth + closes - opens);
  }
  return undefined;
}

async function resolveAt(
  input: AdapterInput,
  file: string,
  line: number,
  character: number,
): Promise<readonly CallHierarchyItem[]> {
  try {
    return await input.provider.prepare(file, { line, character });
  } catch {
    return [];
  }
}

/**
 * Axis 1 of 2 (see this file's top-of-file comment): is the resolved callee really the trusted standard
 * declaration `CALLBACK_ARGUMENT_ALLOWLIST` expects, not a same-named workspace function? Two accepted
 * trust tiers, NOT one "standard declaration" bucket (design doc "2026-09-09 추가 2", measured
 * directly with `@types/node` installed):
 * - The provider's own bundled TypeScript installation's `lib/lib.*.d.ts` - never user-modifiable.
 * - A workspace `node_modules/@types/**` declaration (e.g. `@types/node`'s `setTimeout`) - a real npm
 *   package the workspace controls, so a user COULD shim or replace it. Accepted anyway: without it,
 *   `setTimeout` would never verify in an ordinary Node project (measured: with `@types/node` present,
 *   `prepare()` on `setTimeout` returns BOTH declarations together). This is the same class of trust
 *   this tool already extends to workspace code/dependencies generally, not a new risk this adapter
 *   introduces - but it is weaker than the bundled-lib tier, and callers of this function must not
 *   blur the two into one "verified" bit without knowing which tier fired, should a future need to
 *   distinguish them arise.
 *
 * reviewer, executed directly: BOTH tiers are the same literal-segment-name check, not real
 * package-manager provenance verification - `.../src/node_modules/typescript/lib/fake.d.ts` and
 * `.../src/node_modules/@types/fake-package/evil.d.ts` (a hand-created or committed directory
 * literally named `node_modules`, anywhere, never installed by npm/pnpm) both return `true` from this
 * function exactly like a real install would. The bundled-lib tier is NOT more strictly enforced than
 * the `@types` tier despite reading that way above - the difference described there is what the path
 * REPRESENTS when it genuinely comes from a real toolchain (never user-modifiable vs. a real npm
 * package the workspace controls), not a difference in how hard either check is to satisfy. Accepted at
 * the same severity as the `@types` tier's own trust already is: reaching this requires the ability to
 * write files into the analyzed workspace, which this tool already trusts generally - not a risk this
 * function adds.
 *
 * Path comparison is by SEGMENT, never substring/suffix (gate 4's `pathEndsWithSegments` lesson,
 * IL-LIM-010's ancestor-directory lesson) - a file named `lib.dom.d.ts`, or a directory named
 * `typescript`, could exist anywhere, vendored or otherwise. Both checks below require a real
 * `node_modules` segment IMMEDIATELY before the rest of the pattern, precisely to rule that out: a
 * source file the workspace itself wrote at `src/typescript/lib/fake.d.ts` has no `node_modules`
 * ancestor at all and is correctly rejected, while a real installation - flat (`node_modules/typescript/
 * lib/...`) or pnpm's nested form (`node_modules/.pnpm/typescript@5.9.3/node_modules/typescript/lib/
 * ...`) - always has SOME `node_modules` segment directly followed by `typescript`/`lib`, because that
 * is what "installed" means regardless of package manager. The `@types` tier is anchored the same way
 * (measured directly: pnpm's real `@types/node` path is `node_modules/.pnpm/@types+node@22.20.1/
 * node_modules/@types/node/timers.d.ts` - the workspace-relative first two segments are
 * `node_modules`/`.pnpm`, NOT `node_modules`/`@types`, so an earlier version of this function that only
 * checked the path relative to the workspace root would have wrongly rejected it under pnpm).
 */
export function isTrustedStandardDeclaration(uri: string): boolean {
  if (!uri.startsWith('file:')) {
    return false;
  }
  // windows-latest CI, real failure (not hypothetical): `fileURLToPath()` on Windows requires the URL's
  // path portion to look like a Windows absolute path (a drive letter) - `getPathFromURLWin32` throws
  // `ERR_INVALID_FILE_URL_PATH` for a POSIX-shaped `file:///repo/...` URI, which every literal test URI
  // in dynamicCallbackAdapterTrustedDeclaration.test.ts used to be, and which a real CallHierarchyItem's
  // URI should never be from an actual provider - but "should never" is exactly the assumption this
  // whole adapter otherwise refuses to make about provider input (FastAPI's `resolveEndpoint()` catches
  // every exception `prepare()` can throw for the same reason). try/catch here, folding to `false`
  // (not trusted) on anything `uriFile()`/`fileURLToPath()` cannot parse, matches that discipline: an
  // unparseable URI is exactly the kind of uncertainty this function already exists to reject on.
  let filePath: string;
  try {
    filePath = uriFile(uri);
  } catch {
    return false;
  }
  // Normalize to `/` before splitting - NOT `path.sep` (this repo's own established lesson,
  // `cli/src/shared/testFileClassifier.ts`'s identical normalization step): `fileURLToPath()`'s output
  // format is platform-dependent, and splitting a path that may still contain `\` on POSIX's `path.sep`
  // (`/`) - or the reverse on Windows - would silently produce a single unsplit segment, so
  // `node_modules` could never match anywhere.
  const segments = filePath.replace(/\\/g, '/').split('/').filter(Boolean);
  for (let index = 0; index < segments.length - 1; index += 1) {
    if (segments[index] !== 'node_modules') {
      continue;
    }
    if (segments[index + 1] === 'typescript' && segments[index + 2] === 'lib') {
      return true;
    }
    if (segments[index + 1] === '@types') {
      return true;
    }
  }
  return false;
}

function endpointFor(input: AdapterInput, item: CallHierarchyItem): { readonly id: string; readonly endpoint: AugmentedEdge['source'] } {
  const id = input.idOf(item);
  if (input.existingNodeIds.has(id)) {
    return { id, endpoint: { kind: 'existing', id } };
  }
  return {
    id,
    endpoint: {
      kind: 'synthetic',
      name: item.name,
      kindLabel: symbolKindName(item.kind),
      file: relativeFile(input.workspace, uriFile(item.uri)),
      range: externalRange(item.selectionRange),
    },
  };
}

async function walkSourceFiles(
  root: string,
  state: { filesVisited: number; readonly maxFiles: number; truncated: boolean },
  visit: (file: string) => Promise<void>,
): Promise<void> {
  if (state.filesVisited >= state.maxFiles) {
    state.truncated = true;
    return;
  }
  let entries;
  try {
    entries = await fs.readdir(root, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    if (state.filesVisited >= state.maxFiles) {
      state.truncated = true;
      return;
    }
    if (IGNORED_DIRECTORIES.has(entry.name)) {
      continue;
    }
    const full = path.join(root, entry.name);
    if (entry.isDirectory()) {
      await walkSourceFiles(full, state, visit);
    } else if (entry.isFile() && SOURCE_EXTENSIONS.has(path.extname(entry.name))) {
      state.filesVisited += 1;
      await visit(full);
    }
  }
}

export async function dynamicCallbackAdapter(input: AdapterInput): Promise<AdapterResult> {
  const edges: AugmentedEdge[] = [];
  const seenPairs = new Set<string>();
  const walkState = { filesVisited: 0, maxFiles: input.budget.maxFiles, truncated: false };

  await walkSourceFiles(input.workspace, walkState, async file => {
    let text: string;
    try {
      text = await fs.readFile(file, 'utf8');
    } catch {
      return;
    }
    const lines = text.split('\n');
    let matchesInFile = 0;
    for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
      if (matchesInFile >= input.budget.maxMatchesPerFile) {
        break;
      }
      const callSites = findCallSitesInLine(lines[lineIndex], lineIndex);
      for (const callSite of callSites) {
        if (matchesInFile >= input.budget.maxMatchesPerFile) {
          break;
        }
        matchesInFile += 1;

        // Axis 2: is `handler` really the target this run is looking for?
        const handlerResolved = await resolveAt(input, file, callSite.line, callSite.argumentCharacter);
        if (handlerResolved.length !== 1) {
          continue;
        }
        const handlerId = input.idOf(handlerResolved[0]);
        if (handlerId !== input.rootId) {
          continue;
        }

        // Axis 1: is the callee really the trusted standard declaration the allowlist expects?
        const calleeResolved = await resolveAt(input, file, callSite.line, callSite.calleeCharacter);
        if (calleeResolved.length === 0) {
          continue;
        }
        const calleeIsTrusted = calleeResolved.some(item => isTrustedStandardDeclaration(item.uri));
        if (!calleeIsTrusted) {
          continue;
        }

        const enclosing = findEnclosingFunction(lines, callSite.line);
        if (!enclosing) {
          continue;
        }
        const enclosingResolved = await resolveAt(input, file, enclosing.line, enclosing.character);
        if (enclosingResolved.length !== 1) {
          continue;
        }
        const { id: sourceId, endpoint: sourceEndpoint } = endpointFor(input, enclosingResolved[0]);
        const pairKey = `${sourceId}|${input.rootId}`;
        if (seenPairs.has(pairKey)) {
          continue;
        }
        seenPairs.add(pairKey);
        edges.push({
          source: sourceEndpoint,
          target: { kind: 'existing', id: input.rootId },
          adapterId: 'dynamic-callback-static-v1',
          evidenceSource: 'static-inference',
          resolution: 'single',
          reasonCode: REASON_CODE_FOR_CATEGORY[callSite.slot.category],
          evidenceRanges: [externalRange({
            start: { line: callSite.line, character: callSite.argumentCharacter },
            end: { line: callSite.line, character: callSite.argumentCharacter + callSite.argumentText.length },
          })],
        });
      }
    }
  });

  return { edges, budgetExceeded: walkState.truncated };
}
