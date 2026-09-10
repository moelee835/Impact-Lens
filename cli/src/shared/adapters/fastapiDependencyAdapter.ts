// M4 stage 2 - the first framework adapter (`fastapi-static-v1`, named per IL-LIM-002's own "권장
// 대응"). FastAPI is the actual first adapter, not Spring (the milestone document named Spring, but
// no Java/Kotlin preset exists yet - see docs/work/task-m4-stage2-fastapi-adapter.md).
//
// What this closes: `Depends(target)` and `Annotated[T, Depends(target)]` genuinely call `target` at
// request time (M2's pythonFastapiIntegration.test.ts proved this directly, instrumenting a real
// TestClient run), but never through a call expression a static Call Hierarchy can see - that is
// exactly why `provider_null_incoming_calls` exists. This adapter finds the handler/dependant
// function that references `target` and reports it as a candidate caller, alongside (never instead
// of) that existing signal.
//
// Detection is regex-based text scanning, not a Python AST - a real, bounded heuristic, not a fake
// one, but it does not follow re-exports, `import module as m; m.get_db(...)`-style qualified access,
// or dynamic construction. Every Depends()/route-handler candidate this finds is then verified through
// the real provider (`prepare()`), which is what turns a text match into a genuine finding: a text
// match alone proves nothing about which real symbol (if any) it refers to (M4 stage 1 corpus case 1 -
// "same name, different symbol").
//
// The router-mount check (`isRouterMounted()`, used to confirm a route decorated on a plain
// `APIRouter()` is actually reachable) has NO equivalent provider step - `CallHierarchyProvider` only
// resolves callable symbols (`prepare()`/`incoming()`), and a router variable is not one (see
// `isRouterMounted()`'s own doc comment).
//
// WHERE A SCOPE/ALIAS MISTAKE CAN ACTUALLY REACH A USER - an argument, not an inventory (M4 gate 4
// module-resolution follow-up, docs/work/task-m4-gate4-module-resolution.md, commander/reviewer round 3).
// Every OTHER text match this adapter makes (`findDependsReferences()`, `aliasBindingsFor()`,
// `findEnclosingDef()`) is re-verified through `resolveEndpoint()` -> `input.provider.prepare()` before
// it becomes an edge (every `resolveEndpoint(input, ...)` call site in this file, not cited by line
// number here on purpose - a correction insert once already shifted these exact numbers past the code
// they pointed at, M4 gate 4 module-resolution follow-up) - a regex
// that mistakes scope or alias direction there still cannot mislabel a route, because pyright's own
// symbol resolution is what actually decides the edge, not the regex. `isRouterMounted()` (via
// `importsNameFromModule()`) and `isDirectFastapiApp()` are the ONLY two predicates in this file with no
// such re-verification step, for the structural reason above (a router/app variable is not a callable
// symbol `prepare()` can resolve) - which is exactly why both of M4 gate 4's post-hoc rounds (mount
// false-positive, module-resolution round 3) found their defects in one of these two functions and
// nowhere else: a scope- or alias-blind regex is only user-visible where nothing downstream can catch it.
// `importsNameFromModule()` and `MODULE_LEVEL_LINE_PATTERN` close the mount-import and mount-call-site
// exposure; `isDirectFastapiApp()` receiving `stripCommentsAndStrings()`'d text (not raw) closes the
// other. This argument is why the fix belongs at these two functions specifically, not a claim that no
// fifth defect can exist within them - a regex is still a regex.
//
// THIS ARGUMENT BREAKS if a second framework adapter (this file's own SPI already anticipates one - see
// `./types.ts`) makes an unverified text match of its own without routing it through `prepare()` first;
// the exposure boundary this comment describes is a property of THIS adapter's current design, not a
// guarantee the SPI enforces. Recorded here rather than added to `./types.ts` as an SPI requirement: only
// one adapter exists today, and inventing a contract rule for a shape the SPI has not seen yet risks
// exactly the over-fitting IL-LIM-001's own "대안 검토" already rejected (this file's own top-of-file
// comment on why the SPI stays a plain function type, not a plugin system). A second adapter's author
// should read this comment before adding a text-match predicate of their own.
//
// `./types.ts`'s `FrameworkAdapter` doc comment carries a fuller version of this argument, added after
// this paragraph (M4 gate 4 module-resolution follow-up round 4) - it explains why a `prepare()` call
// throwing is not a hole in this protection (re-verification failing, exceptions included, always folds
// to no-edge, verified directly with stub-provider mutations), and narrows "the Depends() path has not
// needed a fix for a scope/alias mistake" against three real, unrelated bugs git history actually shows
// on that path (candidate-counting bugs downstream of a correct `prepare()` result, not this pattern).
// Read that version, not just this one, before trusting either claim.

import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { externalRange, relativeFile, symbolKindName, uriFile } from '../impactHelpers';
import { AugmentedEdge, CallHierarchyItem, LspPosition, RejectedInferenceCategory, RejectedInferenceTally } from '../../types';
import { AdapterBudget, AdapterInput, AdapterResult } from './types';

const IGNORED_DIRECTORIES = new Set([
  '.git', 'node_modules', 'out', 'dist', '.pnpm-store',
  '__pycache__', 'venv', '.venv', 'env', 'site-packages',
]);

const ROUTE_DECORATOR_PATTERN = /^\s*@(\w+)(?:\.\w+)*\.(get|post|put|delete|patch|options|head)\(\s*(?:['"]([^'"]*)['"])?/;
const DEF_PATTERN = /^(\s*)(?:async\s+)?def\s+(\w+)\s*\(/;

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

interface AliasBinding {
  readonly alias: string;
  /** Position of `targetName`'s OWN occurrence in the import statement (not the alias name) - this is
   * what makes the binding provider-verifiable, see `aliasBindingsFor`'s doc comment. */
  readonly line: number;
  readonly character: number;
}

/**
 * Bounded alias detection (`from module import target as alias`) - not a real import graph, and narrower
 * than "every local name this file could plausibly use" (this comment's own earlier wording, found
 * inaccurate by a direct regex probe - the same kind of shipped-doc/reality gap this milestone has
 * already caught twice elsewhere). `targetName` is detected as aliased only when it is the FIRST name
 * immediately after the `import` keyword, on one line. Two common real shapes are NOT detected - both
 * false-negative (a missed candidate, never a wrong one), not incorrect:
 * - `from module import other, targetName as alias` - target is not first in a comma-separated list.
 * - `from module import (\n    targetName as alias,\n)` - a parenthesized multi-line import (a common
 *   black/isort output shape).
 * Widening the regex to catch these was considered and rejected: without a real parser, dropping the
 * `import` anchor to catch a non-first name risks matching Python's OTHER `X as Y` syntax
 * (`except SomeError as e`), which has nothing to do with imports - trading a safe false negative for a
 * possible false positive is the wrong direction here (confirmed empirically: `except get_db as db:`
 * matches a name-only widened pattern). `import module as m` followed by `m.targetName(...)` (qualified
 * access through a module alias) is separately out of scope, per this file's own top-of-file comment.
 *
 * Each binding returned here still MUST be verified before its alias is trusted - `prepare()` at the
 * alias name's OWN use site (e.g. `target_alias` inside `Depends(target_alias)`) resolves to the import
 * statement's local binding as its own distinct symbol identity, not through to `targetName`'s real
 * definition (found empirically: an alias fixture that should resolve produced a different `symbolId`
 * than root's). `targetName`'s own occurrence in the import line, by contrast, is a genuine reference to
 * the original symbol and resolves correctly - that is the position this returns, precisely so the
 * caller can call `prepare()` there and confirm it actually names root before trusting the alias, the
 * same "verify through the real provider" discipline `Depends()` references get elsewhere in this file.
 */
function aliasBindingsFor(text: string, targetName: string): readonly AliasBinding[] {
  const aliasPattern = new RegExp(`\\bimport\\s+(${escapeRegExp(targetName)})\\s+as\\s+(\\w+)`, 'g');
  const bindings: AliasBinding[] = [];
  text.split('\n').forEach((line, index) => {
    for (const match of line.matchAll(aliasPattern)) {
      bindings.push({ alias: match[2], line: index, character: match.index! + match[0].indexOf(match[1]) });
    }
  });
  return bindings;
}

function importsFastapi(text: string): boolean {
  return /\bimport\s+fastapi\b/.test(text) || /\bfrom\s+fastapi(\.\w+)*\s+import\b/.test(text);
}

interface DependsMatch {
  readonly line: number;
  readonly character: number;
  /** Column of the literal `Depends` keyword itself on `line`, i.e. `match.index` - separate from
   * `character` (the target NAME's own column) because `classifyDependsReferenceContext()` needs to
   * scan backward from just BEFORE this call, never into its own `(...)` argument list (which would
   * otherwise be miscounted as an extra unclosed paren belonging to whatever encloses `Depends(...)`
   * itself). */
  readonly dependsCharacter: number;
  /** Which local name this matched (root's own name, or a verified alias) - needed downstream because an
   * alias reference cannot be re-verified the same way (see the note where this is consumed), and because
   * the evidence range must use THIS name's length, not root's (an alias is rarely the same length). */
  readonly name: string;
}

function findDependsReferences(lines: readonly string[], localNames: readonly string[]): readonly DependsMatch[] {
  const matches: DependsMatch[] = [];
  for (const name of localNames) {
    const pattern = new RegExp(`\\bDepends\\(\\s*${escapeRegExp(name)}\\b`, 'g');
    lines.forEach((line, index) => {
      for (const match of line.matchAll(pattern)) {
        matches.push({
          line: index,
          character: match.index! + match[0].length - name.length,
          dependsCharacter: match.index!,
          name,
        });
      }
    });
  }
  return matches;
}

interface EnclosingDef {
  readonly name: string;
  readonly line: number;
  readonly character: number;
}

const DECORATOR_CALL_OPEN_PATTERN = /@[\w.]+\s*$/;

/**
 * M4 gate 7 real-code measurement (docs/work/task-m4-fastapi-depends-enclosing-scope-fix.md): the
 * PREVIOUS version of this function ("nearest preceding `def`, indentation not considered") was wrong
 * in a way no fixture caught, because every fixture in this corpus has exactly one route per file.
 * Measured directly against two real, pinned open-source FastAPI projects: `Depends()` used as a route
 * decorator's `dependencies=[...]` argument (which sits ABOVE the `def` it decorates, not inside it)
 * mis-attributed to whatever unrelated function happened to be defined earlier in the same file -
 * confirmed with a real query producing FOUR wrong-shaped candidates from ONE target, two of them
 * genuinely unrelated functions, in a project with more than one route per file (the exact shape no
 * fixture here had).
 *
 * `Depends()` has exactly three real usage shapes, and each needs a DIFFERENT rule, not one scanner
 * incrementally patched to cover all three (that path is how `dynamicCallbackAdapter.ts`'s own
 * `findEnclosingFunction` ended up finding the same defect class four separate times, in four different
 * disguises - see that file's history before repeating it here):
 *
 * 1. **Parameter form** (`def f(x: T = Depends(y)):`) - the reference sits INSIDE the function's own
 *    parameter list, i.e. inside an unclosed `(` opened by a `def` line. Backward-scan-to-nearest-def
 *    already gets this right (measured directly: `common_parameters`/`get_current_role` in
 *    `Netflix/dispatch`) - left unchanged.
 * 2. **Route decorator form** (`@router.get(..., dependencies=[Depends(y)])`) - the reference sits
 *    inside an unclosed `(` opened by a decorator (`@name(` or a dotted chain `@a.b.c(`). Its enclosing
 *    def is NOT found by scanning backward at all - decorators sit ABOVE the def they decorate, so the
 *    scan must go FORWARD from the decorator to the def, the same "decorators sit directly above their
 *    def with nothing in between" rule `findRouteDecorator` already exploits, applied in the opposite
 *    direction.
 * 3. **Module-level form** (`XDep = Annotated[T, Depends(y)]`, not inside any `(` opened by a `def` or
 *    decorator at all) - there IS NO enclosing function. `Depends()` fires wherever `XDep` is later USED
 *    as a parameter type elsewhere, which this SPI has no way to follow (that needs `definition`/
 *    `reference` resolution across the workspace, a capability this adapter does not have - see
 *    `docs/development-management/stories/il-lim-002-framework-di-routing.md`'s "미해결 질문", the
 *    same gap `dynamic-callback-static-v1`'s emit/on pairing and Spring bean resolution already point
 *    at). The correct v1 answer is to REJECT, not guess - and this is what the OLD version's "nearest
 *    preceding def" accidentally did most of the time anyway when it landed on the WRONG function,
 *    except silently wrong instead of openly absent.
 *
 * Classifying which of the three a reference is in is itself not always unambiguous (a multi-line
 * decorator's `Depends()` line does not itself contain the `@` - `classifyDependsReferenceContext`
 * handles this by tracking paren depth backward from the reference to the innermost unclosed `(`, not
 * by looking at the reference's own line in isolation). When that classification cannot confidently
 * land on "parameter" or "decorator", this rejects rather than guesses - the same discipline this
 * codebase has already applied five other times (string/regex/method-opener/arrow-argument channels in
 * `dynamicCallbackAdapter.ts`, and this file's own fold-to-abandonment on an ambiguous alias/mount
 * match) rather than risk a sixth silently-wrong-answer channel.
 */
/** M4 IL-LIM-001/002 inference-unresolved lane (docs/work/task-m4-il-lim001-002-inference-limitations.md):
 * a rejection now carries WHY, so the caller can tally it instead of silently dropping the candidate -
 * this is the exact reject path gate 7 measured as a silent 40%-of-real-references drop. `reasonCode`
 * for the "malformed structure" fallback (`findNearestPrecedingDef`/`findDecoratedDef` themselves
 * returning nothing after a successful `parameter`/`decorator` classification) is folded into the same
 * `unclassified-enclosing-call`/`technique-blocked` pair used for `classifyDependsReferenceContext`'s own
 * generic reject - that fallback is documented elsewhere as "should not happen for real Python", so a
 * separate reasonCode for it is not worth the extra vocabulary. */
type EnclosingDefResult =
  | { readonly def: EnclosingDef; readonly reasonCode?: undefined; readonly category?: undefined }
  | { readonly def: undefined; readonly reasonCode: string; readonly category: RejectedInferenceCategory };

const MALFORMED_STRUCTURE_REJECTION = { reasonCode: 'unclassified-enclosing-call', category: 'technique-blocked' as const };

function findEnclosingDef(
  lines: readonly string[],
  strippedLines: readonly string[],
  fromLine: number,
  fromCharacter: number,
): EnclosingDefResult {
  const context = classifyDependsReferenceContext(strippedLines, fromLine, fromCharacter);
  if (context.kind === 'reject') {
    return { def: undefined, reasonCode: context.reasonCode, category: context.category };
  }
  if (context.kind === 'parameter') {
    const def = findNearestPrecedingDef(lines, fromLine);
    return def ? { def } : { def: undefined, ...MALFORMED_STRUCTURE_REJECTION };
  }
  const def = findDecoratedDef(lines, context.decoratorLine);
  return def ? { def } : { def: undefined, ...MALFORMED_STRUCTURE_REJECTION };
}

type DependsReferenceContext =
  | { readonly kind: 'parameter' }
  | { readonly kind: 'decorator'; readonly decoratorLine: number }
  | { readonly kind: 'reject'; readonly reasonCode: string; readonly category: RejectedInferenceCategory };

/**
 * Length-preserving strip of Python `#` comments and single/double-quoted strings (triple-quoted
 * strings blanked line-by-line in a first full-text pass) - blanks matched spans with equal-length
 * whitespace rather than removing them. Deliberately NOT the same as this file's existing
 * `stripCommentsAndStrings()` above: that function REMOVES matched text, which shifts every column
 * position after the removal - fine for its own whole-file substring/membership uses, but incompatible
 * with `classifyDependsReferenceContext()` below, which counts parens at exact column offsets computed
 * against the ORIGINAL, unstripped text (`fromCharacter`, from `findDependsReferences`). An unterminated
 * quote is blanked to the end of its line - safe, since Python cannot span a single/double-quoted string
 * across lines without an explicit `\` continuation (rare enough to accept as a residual, matching this
 * file's existing bounded-heuristic philosophy elsewhere).
 */
function stripForParenClassification(text: string): string {
  const withoutTripleQuoted = text.replace(/"""[\s\S]*?"""|'''[\s\S]*?'''/g, match => match.replace(/[^\n]/g, ' '));
  return withoutTripleQuoted
    .split('\n')
    .map(line => {
      let result = '';
      let index = 0;
      while (index < line.length) {
        const character = line[index];
        if (character === '#') {
          result += ' '.repeat(line.length - index);
          break;
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
          const end = terminated ? cursor + 1 : line.length;
          result += ' '.repeat(end - index);
          index = end;
          continue;
        }
        result += character;
        index += 1;
      }
      return result;
    })
    .join('\n');
}

/**
 * Scans backward from just before the `Depends(` token itself (never into its own argument list, which
 * would otherwise be counted as an extra open paren) tracking paren depth on `strippedLines` (comments/
 * strings already blanked to equal length by `stripForParenClassification`, so a stray `(`/`)` inside a
 * docstring or string literal cannot mis-count, and column positions still line up with the original
 * text). The first unclosed `(` found (depth reaches 0 while scanning a `)` would have taken it
 * negative) is the call this `Depends()` reference is nested inside; what immediately precedes that `(`
 * decides the shape. No unclosed `(` at all by the time the scan reaches the top of the file means a
 * bare module-level statement.
 */
function classifyDependsReferenceContext(
  strippedLines: readonly string[],
  fromLine: number,
  fromCharacter: number,
): DependsReferenceContext {
  let depth = 0;
  for (let index = fromLine; index >= 0; index -= 1) {
    const line = strippedLines[index];
    const endColumn = index === fromLine ? fromCharacter : line.length;
    for (let column = endColumn - 1; column >= 0; column -= 1) {
      const character = line[column];
      if (character === ')') {
        depth += 1;
      } else if (character === '(') {
        if (depth === 0) {
          const before = line.slice(0, column);
          if (/(?:^|\s)(?:async\s+)?def\s+\w+\s*$/.test(before)) {
            return { kind: 'parameter' };
          }
          if (DECORATOR_CALL_OPEN_PATTERN.test(before)) {
            return { kind: 'decorator', decoratorLine: index };
          }
          // Some other unclosed call (a plain function call, `Annotated[...]`'s own brackets are not
          // parens so never reach here, etc.) - not confidently parameter or decorator. This is a
          // TECHNIQUE limit, not a missing capability: a real parser could classify this call safely,
          // this paren-depth scan cannot without risking exactly the kind of scope/alias mistake gate 4
          // reopened twice on this file already (M4 IL-LIM-001/002 inference-unresolved lane).
          return { kind: 'reject', reasonCode: 'unclassified-enclosing-call', category: 'technique-blocked' };
        }
        depth -= 1;
      }
    }
  }
  // No unclosed `(` at all by the time the scan reaches the top of the file - a bare module-level
  // statement (`XDep = Annotated[T, Depends(y)]` or `XDep = Depends(y)`). Following `XDep` to where it is
  // later USED as a parameter default needs workspace-wide `reference`/`definition` resolution, a
  // capability this adapter's SPI does not have (M4 IL-LIM-001/002 inference-unresolved lane;
  // il-lim-002-framework-di-routing.md's own "미해결 질문") - CAPABILITY-blocked, not technique-blocked.
  return { kind: 'reject', reasonCode: 'module-level-alias', category: 'capability-blocked' };
}

/** The pre-fix behavior, kept for the one shape it was always correct for (parameter form): nearest
 * preceding `def`/`async def` line, indentation not considered - safe here specifically because a
 * parameter-form reference is, by construction (verified by `classifyDependsReferenceContext` already
 * finding it inside a `def(`-opened paren), never anywhere but inside that same def's own signature. */
function findNearestPrecedingDef(lines: readonly string[], fromLine: number): EnclosingDef | undefined {
  for (let index = fromLine; index >= 0; index -= 1) {
    const match = lines[index].match(DEF_PATTERN);
    if (match) {
      return { name: match[2], line: index, character: lines[index].indexOf(match[2], match[1].length) };
    }
  }
  return undefined;
}

/** Given the line index of a decorator (`@...`), walks FORWARD - past any other consecutive decorator
 * lines and past this decorator's own (possibly multi-line) argument list, neither of which can match
 * `DEF_PATTERN` - to the `def` line it actually decorates. Mirrors `findRouteDecorator`'s own backward
 * version of the same Python syntax rule ("decorators sit directly above their def with nothing else in
 * between"), applied forward instead. Reaching the end of the file without a `def` (malformed input,
 * should not happen for real Python) folds to abandonment rather than guessing. */
function findDecoratedDef(lines: readonly string[], decoratorLine: number): EnclosingDef | undefined {
  for (let index = decoratorLine; index < lines.length; index += 1) {
    const match = lines[index].match(DEF_PATTERN);
    if (match) {
      return { name: match[2], line: index, character: lines[index].indexOf(match[2], match[1].length) };
    }
  }
  return undefined;
}

interface RouteDecorator {
  readonly routerName: string;
  readonly method: string;
  readonly path: string | undefined;
  readonly line: number;
}

/** Consecutive decorator lines immediately above `defLine` - stops at the first line that is not a
 * decorator, matching Python's own syntax rule that decorators sit directly above `def` with nothing
 * in between. */
function findRouteDecorator(lines: readonly string[], defLine: number): RouteDecorator | undefined {
  for (let index = defLine - 1; index >= 0; index -= 1) {
    const line = lines[index];
    if (!/^\s*@/.test(line)) {
      return undefined;
    }
    const match = line.match(ROUTE_DECORATOR_PATTERN);
    if (match) {
      return { routerName: match[1], method: match[2], path: match[3], line: index };
    }
  }
  return undefined;
}

/** True when `name` is bound to a `FastAPI()` instance directly in this file - the top-level app object
 * is reachable by definition (nothing needs to `include_router()` it), so no mount check applies. Root
 * file only, not workspace-wide - the same bounded scope `importsFastapi` already uses; an app
 * instantiated elsewhere and merely imported here is a documented limitation, not silently guessed at.
 *
 * `rootText` MUST already be passed through `stripCommentsAndStrings()` by the caller - M4 gate 4
 * module-resolution follow-up round 3 (docs/work/task-m4-gate4-module-resolution.md, reviewer finding):
 * this function used to test the raw file text directly, so a comment like `# Example usage elsewhere:
 * app = FastAPI()` in a file where `app` is actually an `APIRouter()` made this return `true` - and a
 * `true` here skips `isRouterMounted()` ENTIRELY (see the call site), bypassing every check this lane
 * built (import provenance, module-level scoping) with a single comment line. `isRouterMounted()` itself
 * already treats a comment/docstring/string-literal mention as no evidence at all
 * (`commented_out_router.py`/`docstring_mention_router.py`/`string_literal_router.py` fixtures prove it) -
 * this function was the one place that principle was not applied. Confirmed directly (reviewer, real
 * CLI) before this fix: a route decorator on a genuinely unmounted `APIRouter()` produced a confirmed
 * edge purely because of a comment naming the same variable a `FastAPI()` instance.
 */
function isDirectFastapiApp(name: string, strippedRootText: string): boolean {
  return new RegExp(`\\b${escapeRegExp(name)}\\s*=\\s*FastAPI\\s*\\(`).test(strippedRootText);
}

/**
 * A bounded pass to strip text that is not real code, before it is searched for an
 * `include_router(...)`/`APIRouter(...)` mention - not a Python lexer. Order matters: triple-quoted
 * blocks are removed first, so a `#` or a quote character inside a docstring cannot confuse the next
 * steps; then each line's single/double-quoted string literals are removed, so a `#` inside a string
 * (e.g. `x = "#"`) cannot be mistaken for a comment marker; then each line is truncated at its first
 * remaining `#`. This does not guarantee "real code only" survives - nested or escaped edge cases outside
 * this bounded pass can still slip through in either direction - but it removes the three confounders
 * this adapter's own corpus fixtures exercise: a commented-out mount call, one mentioned in a docstring,
 * and one mentioned in a string literal.
 */
function stripCommentsAndStrings(text: string): string {
  const withoutTripleQuoted = text.replace(/"""[\s\S]*?"""|'''[\s\S]*?'''/g, '');
  return withoutTripleQuoted
    .split('\n')
    .map(line => {
      const withoutStrings = line.replace(/"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'/g, '');
      const hashIndex = withoutStrings.indexOf('#');
      return hashIndex === -1 ? withoutStrings : withoutStrings.slice(0, hashIndex);
    })
    .join('\n');
}

interface MountSearchResult {
  readonly found: boolean;
  readonly truncated: boolean;
}

/** One `from <module> import <list>` statement's parsed shape - `dots.length` leading dots (0 = absolute
 * import) and `modulePath` the dotted segments after them (empty for a bare `from . import x`, which
 * names no module and is out of scope - see `resolveImportTargetFile()`). */
interface FromImportClause {
  readonly dots: number;
  readonly modulePath: readonly string[];
  readonly importList: string;
}

// No trailing `$` on this pattern - `.` excludes `\r`/`\n`, so a CRLF-checked-out file (Windows CI, no
// .gitattributes forcing LF here) leaves a trailing `\r` on each split line that `$` cannot match past,
// silently failing the whole pattern on every line (found on Windows CI, `clangd / windows-latest`,
// M4 gate 4's mount-provenance fix - docs/work/task-m4-gate4-mount-false-positive.md). `(.+)` alone still
// stops before any `\r` (the same exclusion), so dropping the anchor loses nothing on LF files.
const FROM_IMPORT_PATTERN = /^\s*from\s+(\.*)((?:\w+(?:\.\w+)*)?)\s+import\s+(.+)/;

function parseFromImport(line: string): FromImportClause | undefined {
  // String#match, deliberately not RegExp#exec - buildInvocation.sources.test.ts's spawn-family scan
  // flags every member call in this family of method names as a possible child_process call site (it
  // cannot distinguish a regex method call on a named variable from a real one without a literal
  // `/pattern/` receiver immediately before it, which this pattern is not). String#match against a
  // non-global pattern returns the identical result shape and is a different method name, so it never
  // enters that scan at all.
  const match = line.match(FROM_IMPORT_PATTERN);
  if (!match) {
    return undefined;
  }
  return {
    dots: match[1].length,
    modulePath: match[2].length > 0 ? match[2].split('.') : [],
    importList: match[3],
  };
}

/**
 * Resolves a RELATIVE `from` import clause (`clause.dots > 0`) to the exact `.py` file it names, purely
 * from file positions - no package metadata (`__init__.py`, `setup.py`/`pyproject.toml`) is read, none is
 * needed. By Python's own rule, `dots === 1` (`from .mod import x`) means "this module's own package",
 * i.e. `importingFile`'s containing directory; each additional dot goes up one more parent directory from
 * there. This is exact, not an approximation - both halves (the dot count and `importingFile`'s real path)
 * are known precisely. `undefined` for `from . import x` / `from .. import x` (dots with no module name):
 * there is no module file to resolve, only names defined directly in a package's `__init__.py`, which
 * this adapter's mount search (always a specific `.py` module, never a package) has no use for - already
 * unreachable before this function existed, since the old stem-only comparison also needed a module name
 * to compare against.
 */
function resolveRelativeImportTargetFile(clause: FromImportClause, importingFile: string): string | undefined {
  if (clause.modulePath.length === 0) {
    return undefined;
  }
  const moduleFileParts = [...clause.modulePath.slice(0, -1), `${clause.modulePath[clause.modulePath.length - 1]}.py`];
  let baseDirectory = path.dirname(importingFile);
  for (let level = 1; level < clause.dots; level += 1) {
    baseDirectory = path.dirname(baseDirectory);
  }
  return path.join(baseDirectory, ...moduleFileParts);
}

/**
 * True when `fullPath`'s path SEGMENTS end with exactly `suffixParts`, compared segment-by-segment (never
 * a raw substring/`.endsWith()` on the joined string) - `my_pkg_a/users.py` must NOT satisfy a suffix of
 * `pkg_a/users.py` just because one string ends with the other; comparing whole path segments makes that
 * kind of partial-name collision structurally impossible, confirmed directly against that exact case.
 * Case-insensitive on `win32`, matching `sameFile()`'s own platform handling below, for the same reason
 * (Windows path case-insensitivity).
 */
function pathEndsWithSegments(fullPath: string, suffixParts: readonly string[]): boolean {
  const fullSegments = path.resolve(fullPath).split(path.sep);
  if (suffixParts.length > fullSegments.length) {
    return false;
  }
  const tail = fullSegments.slice(fullSegments.length - suffixParts.length);
  const segmentsEqual = (a: string, b: string): boolean => (process.platform === 'win32' ? a.toLowerCase() === b.toLowerCase() : a === b);
  return tail.every((segment, index) => segmentsEqual(segment, suffixParts[index]));
}

/**
 * True when `lines` contains a plain `from <module> import ... NAME ...` statement (one line, no alias)
 * that names `rootFile` - exactly, for a relative import (`resolveRelativeImportTargetFile()`), or by
 * dotted-path-as-directory-suffix, for an absolute one. This is the only cross-file link
 * `isRouterMounted()` can verify without a real import graph or provider support (see the doc comment
 * above `isRouterMounted()` and this file's top-of-file comment for why provider verification is not
 * available here).
 *
 * This is what distinguishes `crossfile_positive_app.py` (imports `crossfile_positive_router` BY NAME
 * from `crossfile_positive_router.py`, so a mount call using that name genuinely refers to root's own
 * router) from a same-named identifier that has no connection to root at all - a function parameter, a
 * loop variable, a dict/attribute value, a factory return, a non-`APIRouter`-typed variable, or an import
 * of the same name from a DIFFERENT module (found by direct reproduction, M4 gate 4 reopening,
 * docs/work/task-m4-gate4-mount-false-positive.md - `mountPattern` alone matches every one of these,
 * because it only checks the literal text `include_router(NAME`, with no requirement that `NAME` resolve
 * to anything).
 *
 * M4 gate 4 module-resolution follow-up (docs/work/task-m4-gate4-module-resolution.md), two rounds:
 *
 * - Round 1 compared only the module path's LAST dotted segment against `rootFile`'s basename, which
 *   could not tell `pkg_a/users.py` apart from an unrelated `pkg_b/users.py` - confirmed directly. That
 *   gap was masked, not closed, by `isRouterMounted()`'s old `nameAmbiguous` check (a real `pkg_b/users.py`
 *   almost always also binds `router = APIRouter()`, which happened to trip that separate check) - a
 *   coincidence of two checks' side effects, and the reason a router-per-file FastAPI project (the common
 *   case - `router` is FastAPI's own tutorial convention) could not use this feature at all: two router
 *   files sharing that name anywhere in the workspace was enough to make `nameAmbiguous` block every mount.
 * - Round 2 (commander review) replaced round 1's ABSOLUTE-import handling again: resolving an absolute
 *   import against `workspace` as an assumed package root broke a `src/` layout (real file at
 *   `workspace/src/pkg/mod.py`, absolute import `from pkg.mod import x` with no `src` segment - the normal
 *   shape) that round 1's cruder last-segment comparison had actually gotten right by accident. Measured
 *   directly against a 6-case matrix (flat/`src`/nested layout x correct/wrong package): round 1 got 3 of
 *   6 wrong, the `workspace`-as-root approach got 1 of 6 wrong (exactly the `src`-layout regression), and
 *   comparing the dotted path as a path-segment SUFFIX of `rootFile` (this version) got all 6 right - it
 *   needs no package-root guess at all, so it has no "resolution failed" case to have a policy for.
 *
 * Full resolution (both import forms) removes the need for `isRouterMounted()`'s old `nameAmbiguous` check
 * entirely - see that function's own doc comment for the self-mount reasoning this uncovered along the way.
 *
 * Deliberately narrow otherwise, matching this file's existing bounded-heuristic style
 * (`aliasBindingsFor`, `findDependsReferences`):
 * - `name` must appear un-aliased in the import list (`import name as other` does not count - an alias
 *   changes the local identifier used at the call site, so `mountPattern` searching for `name` itself
 *   would not have matched that file's mount call under the alias in the first place; this only guards
 *   the un-aliased case, which is the only case `mountPattern` can even see).
 * - The import must be on one line - a parenthesized multi-line `from module import (\n  name,\n)` is not
 *   matched (the same accepted limitation `aliasBindingsFor` already documents, for the same reason: a
 *   false negative here, never a false positive).
 * - Qualified access through a module alias (`import mod; mod.name`) is separately out of scope, per this
 *   file's top-of-file comment - the same accepted miss `attr_mount_router.py` already documents for the
 *   `Depends()` path.
 * - A SINGLE-SEGMENT absolute import (`from users import router`, no dots in the module path at all)
 *   would otherwise compare a one-element suffix - i.e. just `rootFile`'s bare basename - which matches a
 *   `users.py` at ANY depth, in any unrelated package (confirmed directly before this guard existed). A
 *   top-level `from <module> import x` is an ordinary, common Python import shape, so this degenerate case
 *   is reachable far more easily than a deep-path collision - not a rare coincidence like two vendored
 *   copies of the same nested path. M4 gate 4 single-segment-import follow-up
 *   (docs/work/task-m4-gate4-single-segment-import.md): closed by additionally requiring `rootFile` sit
 *   DIRECTLY under `workspace` for this one-segment case only (`sameFile(path.dirname(rootFile),
 *   workspace)`) - a single-segment import only plausibly resolves to a file reachable as a top-level
 *   module from the assumed package root, and `workspace` is the only root this function has without
 *   reading package metadata. Two round-1/round-2 candidates were measured and rejected before this one:
 *   accepting whenever `rootFile`'s basename is the workspace's only file with that name (cheap - the
 *   workspace walk this runs inside already visits every file) answers "does this collide with a
 *   DIFFERENT file", not "is this file at the right depth", so it is wrong in BOTH directions - it still
 *   confirms a nested file with no colliding basename anywhere (the actual common shape of this bug,
 *   nothing to collide with), and it wrongly WITHHOLDS a correct flat-layout match merely because an
 *   unrelated same-named file happens to exist somewhere deeper in the workspace. Measured directly
 *   against a 5-case matrix (see the work document) before rejecting it - left here because it looks
 *   enough like the removed `nameAmbiguous` check (this file's own git history) to be re-proposed.
 *
 * - NEW ACCEPTED FALSE NEGATIVE from the depth requirement above: a single-segment absolute import naming
 *   a genuinely top-level module of a nested project layout (a `src/` layout's `src/users.py`, imported
 *   as `from users import x` because `src` is on `sys.path`) is no longer confirmed, because `src/users.py`
 *   does not sit directly under `workspace` - this function has no way to know `src` is a package root
 *   without reading project metadata, which stays out of scope. Narrower than losing ALL single-segment
 *   imports (multi-project-root layouts are the exception, not the common case) and in the same
 *   precision-over-recall direction as every other narrowing in this file.
 *
 * - This single-segment guard is what fully exposes gate 4's now-removed `nameAmbiguous` check as
 *   something that was never actually protecting against this class of bug on purpose: before
 *   `nameAmbiguous` was removed (round 1/2 above), a same-named router binding colliding somewhere else in
 *   the workspace would often coincidentally trip it and block confirmation anyway, PARTIALLY masking this
 *   exact single-segment degeneracy the same way it masked round 1's now-fixed multi-segment gap - not
 *   because `nameAmbiguous` was checking import provenance (it never did), but because the two failure
 *   conditions frequently co-occurred in practice. With `nameAmbiguous` gone, this residual had nothing
 *   left masking it.
 *
 * - KNOWN, ACCEPTED RESIDUAL FALSE POSITIVE (commander review, confirmed directly - NOT closed by this
 *   guard, which only applies when `moduleFileParts.length === 1`): a MULTI-segment absolute import still
 *   confirms EITHER of two files whose paths happen to end in the same dotted-path suffix - e.g.
 *   `root=/w/vendor/pkg_a/users.py` and `root=/w/pkg_a/users.py` both satisfy `from pkg_a.users import
 *   router` under `pathEndsWithSegments()`, so the same import statement would wrongly confirm whichever
 *   one of the two this function is asked about. This is exactly the "two vendored copies of the same
 *   nested path" scenario named a few lines above as a contrast to the (now-closed) single-segment case -
 *   narrower because it requires two real directory trees ending in the identical multi-segment suffix
 *   (a vendored/duplicated package layout, not an ordinary one), but still a live false-positive path, not
 *   a false negative. Accepted rather than fixed: the only fix considered (resolving the full dotted path
 *   from `workspace` as an exact package root) is the design PR #85 already measured and rejected for
 *   breaking a `src/`-layout project's ordinary absolute imports (this file's own git history, the
 *   "round 2" note a few lines above `pathEndsWithSegments()`'s own doc comment) - closing this residual
 *   would need something narrower than either design tried so far, which this lane did not attempt. Not
 *   pinned in `pythonFastapiIntegration.test.ts` (the precision-denominator corpus) on purpose - a test
 *   asserting this behavior as "expected" would count a real false positive toward "precision 100%",
 *   which would make that claim false; pinned only as a unit test against `importsNameFromModule()`
 *   directly (`fastapiDependencyAdapterImportsNameFromModule.test.ts`), which is out of that corpus's
 *   scope.
 */
// Exported for fastapiDependencyAdapterImportsNameFromModule.test.ts only - a unit test feeding this
// function CRLF input directly, so the Windows-only `$`-anchor regression (git history: the anchor was
// added, then found broken on `windows-latest` CI, then removed) has a fast, every-platform regression
// test instead of depending on Windows CI alone to catch a reintroduction (Windows CI is this repo's
// slowest, least reliable signal - documented gopls hang history elsewhere in this codebase). Not part of
// this adapter's public surface otherwise.
/**
 * True when `importList` (the text after `import` on a `from module import ...` line) contains `name`
 * as its OWN, un-aliased entry - `entry.trim() === name` on each comma-separated item, not a substring
 * or word-boundary test against the whole list. M4 gate 4 module-resolution follow-up round 3
 * (docs/work/task-m4-gate4-module-resolution.md, commander/reviewer review): an earlier version tested
 * whether the word `name` appeared ANYWHERE in the list (`\bname\b`) and separately excluded only the
 * FORWARD alias direction (`name as other` - our own name being renamed away). That missed the REVERSE
 * direction entirely - `other_thing as name` imports a completely different symbol and merely renames it
 * to `name` locally, but the word-anywhere test still matched, and the forward-only alias exclusion never
 * fired (there is no `name as` in that text, only `as name`). Confirmed directly (reviewer, real CLI):
 * this produced a confirmed mount edge for a router whose actual export was an unrelated object entirely.
 * Comparing whole comma-separated entries closes both directions at once - a bare, un-aliased `name` is
 * still found anywhere in the list (first position or not, matching this function's existing behavior),
 * but any entry containing `as` in either position is rejected, because the exact string can never equal
 * `name` once `as` is part of it.
 *
 * NEW ACCEPTED FALSE NEGATIVE from this exact-entry comparison (commander review, confirmed directly): a
 * single-line PARENTHESIZED import - `from module import (name)` - is no longer detected, because the
 * captured entry is the literal text `(name)`, which cannot string-equal `name`. The previous word-
 * boundary test (`\bname\b`) matched this shape (parentheses are non-word characters, so they acted as
 * valid boundaries) - this is a genuinely new narrowing, not a pre-existing gap carried forward. Distinct
 * from the already-documented multi-line parenthesized import limitation (`aliasBindingsFor()`'s doc
 * comment) - that one spans multiple lines and was never reachable by this per-line function either way;
 * this is a single line. Accepted for the same reason every other narrowing in this file is accepted
 * (false-negative direction, matching the asymmetry principle) - see `docs/work/task-m4-gate4-module-
 * resolution.md`'s "누적된 좁힘" (cumulative narrowing) list for this fix alongside the other precision-
 * over-recall trades this lane made, so a future reader can judge the accumulated cost in one place
 * instead of rediscovering each one independently.
 */
function importsBareNameEntry(importList: string, name: string): boolean {
  return importList.split(',').some(entry => entry.trim() === name);
}

export function importsNameFromModule(
  lines: readonly string[],
  name: string,
  rootFile: string,
  importingFile: string,
  workspace: string,
): boolean {
  return lines.some(line => {
    const clause = parseFromImport(line);
    if (!clause || clause.modulePath.length === 0) {
      return false;
    }
    if (!importsBareNameEntry(clause.importList, name)) {
      return false;
    }
    if (clause.dots > 0) {
      const resolved = resolveRelativeImportTargetFile(clause, importingFile);
      return resolved !== undefined && sameFile(resolved, rootFile);
    }
    const moduleFileParts = [
      ...clause.modulePath.slice(0, -1),
      `${clause.modulePath[clause.modulePath.length - 1]}.py`,
    ];
    if (moduleFileParts.length === 1 && !sameFile(path.dirname(rootFile), workspace)) {
      // Single-segment absolute import: the suffix comparison below would otherwise degenerate to a
      // bare-basename match at any depth - see this function's own doc comment, the single-segment
      // bullet, for why this depth check is required instead of a cheaper uniqueness check.
      return false;
    }
    return pathEndsWithSegments(rootFile, moduleFileParts);
  });
}

/** Windows drive letters and directory names are case-insensitive at the filesystem level, and this
 * adapter's two path provenances (`fileURLToPath()` for `rootFile` vs `path.join()` while walking the
 * workspace) are not guaranteed to agree on case even for the identical file - a plain `===` on resolved
 * paths falsely treats root's own file as "some other file" there, which is exactly what turned root's
 * own router binding into a phantom name collision (CI, Windows only: `mounted_router.py`'s regression
 * test dropped its expected edge). `path.resolve()` alone does not fix this - Node's `path` module is a
 * string utility, not filesystem-aware, and does not case-fold. Linux/macOS stay a strict comparison.
 * The reverse error is possible on a case-SENSITIVE NTFS volume (rare, opt-in): two genuinely different
 * files whose paths differ only by case would be treated as the same file, so a real competing binding in
 * one of them would be skipped as "root's own" instead of counted - an unsafe direction in principle, but
 * accepted here as the ordinary Windows default is case-insensitive. */
function sameFile(a: string, b: string): boolean {
  const resolvedA = path.resolve(a);
  const resolvedB = path.resolve(b);
  return process.platform === 'win32' ? resolvedA.toLowerCase() === resolvedB.toLowerCase() : resolvedA === resolvedB;
}

/**
 * Corpus case 3 (docs/work/task-m4-stage1-evidence-contract.md): a route decorator on a plain
 * `APIRouter()` is not reachable until something actually mounts it - `include_router(name)` referencing
 * this exact variable, anywhere in the workspace. This is a text search, not a provider-resolved
 * reference lookup: `CallHierarchyProvider` only resolves callable symbols (functions/methods), and a
 * router variable is neither - the reason `Depends()`/route-handler resolution elsewhere in this file CAN
 * be provider-verified and this cannot.
 *
 * Two things this search must NOT claim are mount evidence, both found empirically (a reviewer fixture,
 * and a direct regex probe against representative Python shapes before this was written):
 *
 * 1. A bare identifier match inside a comment, docstring or string literal - `stripCommentsAndStrings`
 *    removes these before either pattern below is tested against a file's text, incidentally (not the
 *    reason the patterns are written the way they are).
 * 2. A bare identifier match in a file whose `name` refers to an UNRELATED `APIRouter()` - REMOVED, M4
 *    gate 4 module-resolution follow-up (docs/work/task-m4-gate4-module-resolution.md), after commander
 *    review found the reasoning behind it did not survive contact with Python's own scoping rules. This
 *    used to be `isRouterMounted()`'s `nameAmbiguous`/`bindingPattern`: any file OTHER than `rootFile`
 *    binding `name = APIRouter(...)` anywhere in the workspace made mount confirmation fail, for BOTH a
 *    cross-file mount (already made irrelevant by `importsNameFromModule()`'s exact resolution - once a
 *    specific import statement is confirmed to name `rootFile`, an unrelated file using the same bare name
 *    elsewhere says nothing about what THAT import statement resolves to) AND a SELF-mount (a binding and
 *    its `include_router(name)` call in the very same file). The self-mount case is where the removal
 *    actually changes behavior: `collision_router_mounted.py`/`collision_typed_mounted.py`/
 *    `collision_qualified_mounted.py` each bind their router and mount it in their OWN file - by Python's
 *    own name resolution, that binding and that call refer to the same object regardless of what any other
 *    file in the workspace happens to name its own, unrelated `APIRouter()`. There is no real ambiguity to
 *    protect against there; the fixtures' original "must produce mount-unresolved" expectation encoded a
 *    false negative that had no evidence behind it once actually examined (their own `_unmounted` sibling
 *    fixtures still correctly report unresolved - they have no self-mount OR cross-file mount at all,
 *    unaffected by this). This was the check making `router` (the common name FastAPI's own tutorial
 *    uses) collide across ANY two files anywhere in the workspace, self-mount or not - the reason a
 *    router-per-file FastAPI project (the ordinary case) could not use this feature at all.
 * 3. A bare identifier match sitting in a NESTED scope that shadows the binding this search actually
 *    means - `MODULE_LEVEL_LINE_PATTERN` below (M4 gate 4 module-resolution follow-up round 2,
 *    docs/work/task-m4-gate4-module-resolution.md). Point 2's "self-mount is unambiguous" argument
 *    assumed a single scope; a second commander round found the counterexample that breaks it:
 *    ```
 *    router = APIRouter()
 *    @router.get("/x")
 *    def handler() -> str: ...
 *    def setup(app, router):        # <- parameter SHADOWS the module-level `router`
 *        app.include_router(router) # <- refers to the parameter, not the module-level binding
 *    ```
 *    confirmed directly: querying `handler` produced a confident edge even though the module-level
 *    router is never actually mounted anywhere. A function parameter, a `for`/comprehension target, or a
 *    nested `def` binding the same name all reproduce this - the same shape `adversary_param_router.py`
 *    already tests, just inside root's OWN file instead of an unrelated one, which is exactly why the
 *    self-mount branch's "no import statement to verify" reasoning missed it: it never claimed to check
 *    scope, only file identity. Requiring the matched `include_router(...)` line itself to have no
 *    leading whitespace (Python's own top-level indentation) rejects every nested-scope shadow, on BOTH
 *    the self-mount and cross-file paths - the cross-file path has the identical exposure (confirming a
 *    file imports the right name from the right module says nothing about whether the specific
 *    `include_router(...)` call being credited is the module-level reference or a shadowed one in some
 *    nested function in that same file). Deliberately false-negative-directed, matching this file's own
 *    asymmetry principle: a genuine module-level mount written inside an indented `if`/`try` block (rare,
 *    and indentation-visible only, e.g. `if condition:\n    app.include_router(router)`) is now also
 *    missed - accepted, not fixed, for the same reason `dynamic_mount_router.py`'s call-expression miss
 *    is accepted.
 *
 * One more thing this search must NOT do: treat a TRUNCATED walk as having confirmed a mount that was only
 * ever found in a file the walk happened to visit. `mountFound` is a positive claim - a truncated search
 * that never finds it is safely "not found", same as always, and every confirmed contribution now comes
 * from an already-visited, already-exactly-matched file (`nameAmbiguous`'s removal above means there is no
 * longer a negative/universal claim here that truncation could undermine). `found` still requires
 * `!truncated` anyway, as a general "incomplete work should not report full confidence" default consistent
 * with how `augmentation_budget_exceeded` already treats an adapter that stopped early elsewhere - not
 * because a specific correctness gap was found in a truncated positive match itself.
 *
 * The concrete cost of that, spelled out rather than left as "some extra cost" (commander review round
 * 2): this made `maxFiles` (`DEFAULT_BUDGET` in `./index.ts`, 200 as of this writing) mean
 * something stronger than it used to. Before this fix, exceeding it degraded mount detection partially -
 * a mount might still be found. After this fix, a workspace whose `.py` file count (after
 * `IGNORED_DIRECTORIES` pruning - `venv`/`site-packages` etc. do not count against this) exceeds
 * `maxFiles` can NEVER confirm a plain-`APIRouter()` route's mount, at all - every such route's edge is
 * suppressed, unconditionally, for as long as the workspace stays over budget. `maxFiles: 200` was picked
 * back when truncation only meant partial degradation; it WAS re-reviewed against this new, stronger
 * meaning in stage 3 (`docs/work/task-m4-stage3-accuracy-latency-gates.md`, latency section) and kept
 * unchanged - two separate findings, kept separate on purpose:
 *
 * 1. MEASURED: the cost of this walk at the cap, worst case (mount never found, so every visited file is
 *    read to the end), is ~0.2ms/file locally: ~41ms at `maxFiles: 200`, and ~75ms measured with the cap
 *    actually raised to 400 (not merely a 400-file workspace under the 200 cap, which measures a
 *    different thing - a truncated walk stops at 200 regardless of how many more files exist, so that
 *    experiment alone cannot show what raising the cap itself costs; both were measured, see the work
 *    document's latency table). Cheap enough, and close enough to linear across the one real data point
 *    pair collected, that latency alone is not a reason to keep the cap where it is.
 * 2. STRUCTURAL, also not a guess: `maxFiles` only controls whether this walk finishes without
 *    truncating - it has nothing to do with which mount SHAPES the regex above can recognize once a file
 *    is actually visited. A module-attribute (`x.router`) or alias-variable mount is missed by this
 *    pattern even at infinite budget, in a visited file, on line one. Raising `maxFiles` therefore only
 *    ever helps a mount this adapter would already have recognized, had truncation not cut its file off.
 *
 * What is genuinely NOT known, and was not guessed at to fill the gap: whether real FastAPI workspaces
 * commonly exceed 200 `.py` files in the first place (if they don't, truncation rarely fires and the cap
 * is moot), and separately, how common a bare-identifier mount is relative to the shapes this adapter
 * cannot recognize regardless of `maxFiles` (that second question is the accuracy gate's territory, not
 * this one's - an early draft of this very comment conflated the two: "raising the cap mostly helps a
 * shape already well covered" is a claim about real-world shape distribution this lane never measured,
 * not something this walk's code lets anyone conclude). Absent either measurement, `maxFiles: 200` stays
 * unchanged - not because it was shown to be right, but because no evidence pushed it in a specific other
 * direction.
 *
 * 2026-09-09 CORRECTION (gate 7, `docs/work/task-m4-gate7-budget-and-real-code-measurement.md`) - the
 * first of the two open questions above is now answered: yes, real FastAPI workspaces commonly exceed
 * 200 `.py` files. Querying `Netflix/dispatch` (717 `.py` files after `IGNORED_DIRECTORIES` pruning,
 * unmodified) hit `augmentation_budget_exceeded` on 7 of 8 real cross-file queries - the file that
 * answered one of them correctly sits at position #281 of 717, well inside an ordinary project, not at
 * some pathological tail. `DEFAULT_BUDGET.maxFiles` in `./index.ts` moved to 1500 (derived from the
 * latency budget that same gate set, not an independent guess - see that constant's own comment). The
 * second open question (how common a bare-identifier mount is relative to unrecognized shapes) is still
 * not measured - this correction only closes the first.
 *
 * Matching only a bare identifier argument (`include_router(name` / `include_router(name,`, never
 * `include_router(name()` or `include_router(get_name())`) IS deliberate: it is exactly what leaves
 * dynamic registration (stage 1's own out-of-scope example) unmatched, with no special-casing needed.
 */
// A line with no leading whitespace - Python's own top-level indentation, not a claim about syntax
// validity. See isRouterMounted()'s doc comment (point 2) for why every include_router(...) match this
// file counts, self-mount or cross-file, is required to sit on one of these lines.
//
// SUSPECTED, THEN MEASURED SAFE (commander review): this pattern runs against `stripCommentsAndStrings()`
// output, which removes triple-quoted blocks LINEBREAKS AND ALL (not line-by-line), raising the question
// of whether that could shift a real module-level line's indentation or create a false module-level line
// out of docstring remnants. Checked directly against five shapes (indented mount after an in-function
// docstring, a genuine module-level mount, an odd number of `"""` inside a docstring, a triple-quote
// inside a one-line string, code on the same line as a closing `"""`) - none leaked a false positive; the
// match boundary always stays inside one line, and surrounding newlines and leading whitespace on
// unrelated lines are preserved. Recorded so a future reader who has the same suspicion does not have to
// re-derive it - this was checked, not assumed.
const MODULE_LEVEL_LINE_PATTERN = /^\S/;

async function isRouterMounted(name: string, rootFile: string, workspace: string, budget: AdapterBudget): Promise<MountSearchResult> {
  const mountPattern = new RegExp(`\\binclude_router\\(\\s*${escapeRegExp(name)}\\s*[,)]`);
  const walkState = { filesVisited: 0, maxFiles: budget.maxFiles, truncated: false };
  let mountFound = false;
  await walkPythonFiles(workspace, walkState, async file => {
    let text: string;
    try {
      text = await fs.readFile(file, 'utf8');
    } catch {
      return;
    }
    const searchable = stripCommentsAndStrings(text);
    const lines = searchable.split('\n');
    const hasModuleLevelMountCall = lines.some(line => MODULE_LEVEL_LINE_PATTERN.test(line) && mountPattern.test(line));
    if (!hasModuleLevelMountCall) {
      return;
    }
    if (sameFile(file, rootFile)) {
      // A mount call alongside root's own binding, in the same file, IS that binding by construction
      // (`mounted_router.py`'s self-mount case) - no import statement to verify, and Python's own name
      // resolution already settles it regardless of what any other file in the workspace names its own,
      // unrelated `APIRouter()` (see this function's own doc comment, point 2) - AS LONG AS the mount
      // call itself is not inside a nested scope that shadows the module-level binding (also point 2,
      // `MODULE_LEVEL_LINE_PATTERN` above).
      mountFound = true;
    } else if (importsNameFromModule(lines, name, rootFile, file, workspace)) {
      mountFound = true;
    }
  });
  return { found: mountFound && !walkState.truncated, truncated: walkState.truncated };
}

async function walkPythonFiles(
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
      await walkPythonFiles(full, state, visit);
    } else if (entry.isFile() && entry.name.endsWith('.py')) {
      state.filesVisited += 1;
      await visit(full);
    }
  }
}

async function resolveEndpoint(
  input: AdapterInput,
  file: string,
  position: LspPosition,
): Promise<{ readonly items: readonly CallHierarchyItem[] }> {
  try {
    const items = await input.provider.prepare(file, position);
    return { items };
  } catch {
    return { items: [] };
  }
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

function syntheticRouteSource(input: AdapterInput, decorator: RouteDecorator, lines: readonly string[]): AugmentedEdge['source'] {
  const pathLabel = decorator.path ?? '?';
  return {
    kind: 'synthetic',
    name: `HTTP ${decorator.method.toUpperCase()} ${pathLabel}`,
    kindLabel: 'framework-route',
    file: relativeFile(input.workspace, uriFile(input.root.uri)),
    range: externalRange({
      start: { line: decorator.line, character: 0 },
      end: { line: decorator.line, character: lines[decorator.line].length },
    }),
  };
}

/**
 * `fastapi-static-v1`. Covers the primary v1 pattern this story's "권장 대응" lists first: parameter
 * `Depends(target)` / `Annotated[T, Depends(target)]`, including sub-dependencies (a dependency
 * function's own `Depends(...)` parameters are just another enclosing-function match of the same
 * mechanism) and cross-file references (the workspace walk is not limited to root's own file).
 * Decorator-level (`dependencies=[Depends(target)]`) and router-level
 * (`APIRouter(..., dependencies=[...])`) dependency declarations are NOT covered by this pass -
 * deferred, not silently dropped (docs/work/task-m4-stage2-fastapi-adapter.md records this as an
 * explicit scope decision, not an oversight).
 */
export async function fastapiDependencyAdapter(input: AdapterInput): Promise<AdapterResult> {
  const edges: AugmentedEdge[] = [];
  const seenPairs = new Set<string>();
  let budgetExceeded = false;
  let mountUnresolved = false;
  // M4 IL-LIM-001/002 inference-unresolved lane (docs/work/task-m4-il-lim001-002-inference-limitations.md):
  // aggregated by reasonCode, never one entry per occurrence (commander's direction) - converted to
  // `AdapterResult.rejectedInferences` just before returning.
  const rejectionTallies = new Map<string, RejectedInferenceTally>();
  function recordRejection(reasonCode: string, category: RejectedInferenceCategory): void {
    const existing = rejectionTallies.get(reasonCode);
    rejectionTallies.set(reasonCode, { reasonCode, category, count: (existing?.count ?? 0) + 1 });
  }

  // No blanket "root's own file must import fastapi" gate: root can be a plain dependency function
  // (e.g. a shared db.py with no fastapi import of its own) whose only FastAPI-relevant reference lives
  // in a DIFFERENT file (whichever one actually calls `Depends(root)`). The relevance check happens
  // per file, inside the workspace walk below - a real bug this exact shape caught in stage 2's own
  // corpus case 1 fixture (`real_module.py` defines `get_db` but never imports fastapi itself;
  // `consumer.py` does).
  const rootFile = uriFile(input.root.uri);
  let rootText: string;
  try {
    rootText = await fs.readFile(rootFile, 'utf8');
  } catch {
    return { edges: [], budgetExceeded: false, mountUnresolved: false };
  }

  // 1. Is root itself a route handler? The framework's router dispatch calls it, with no user-code
  // caller to name - a synthetic entrypoint node, never a `data.nodes` entry (IL-LIM-002's own
  // "권장 대응": "일반 function node와 다른 kind·provenance로 표시"). But a decorator alone is not proof
  // of reachability (corpus case 3) - if the decorator's target is a plain `APIRouter()` rather than the
  // app itself, an edge is only emitted once `include_router(...)` mounting it is actually found; if not
  // found, no edge is fabricated and `mountUnresolved` is raised instead (surfaced as
  // `framework_route_mount_unresolved`, never as a claim that the router is definitely unmounted).
  const rootLines = rootText.split('\n');
  const rootDefLine = input.root.selectionRange.start.line;
  const routeDecorator = findRouteDecorator(rootLines, rootDefLine);
  if (routeDecorator) {
    // stripCommentsAndStrings(rootText), NOT raw rootText - see isDirectFastapiApp()'s own doc comment.
    // rootText itself stays raw for rootLines above (evidence ranges/positions must index the real file).
    let mountConfirmed = isDirectFastapiApp(routeDecorator.routerName, stripCommentsAndStrings(rootText));
    if (!mountConfirmed) {
      const mountCheck = await isRouterMounted(routeDecorator.routerName, rootFile, input.workspace, input.budget);
      mountConfirmed = mountCheck.found;
      if (mountCheck.truncated) {
        budgetExceeded = true;
      }
    }
    if (!mountConfirmed) {
      mountUnresolved = true;
    } else {
      const pairKey = `route|${input.rootId}`;
      if (!seenPairs.has(pairKey)) {
        seenPairs.add(pairKey);
        edges.push({
          source: syntheticRouteSource(input, routeDecorator, rootLines),
          target: { kind: 'existing', id: input.rootId },
          adapterId: 'fastapi-static-v1',
          evidenceSource: 'static-inference',
          resolution: 'single',
          reasonCode: 'fastapi-route-handler',
          evidenceRanges: [externalRange({
            start: { line: routeDecorator.line, character: 0 },
            end: { line: rootDefLine, character: rootLines[rootDefLine].length },
          })],
        });
      }
    }
  }

  // 2. Is root referenced as a Depends() target anywhere in the workspace?
  const walkState = { filesVisited: 0, maxFiles: input.budget.maxFiles, truncated: false };
  let matchesProcessed = 0;

  await walkPythonFiles(input.workspace, walkState, async file => {
    let text: string;
    try {
      text = await fs.readFile(file, 'utf8');
    } catch {
      return;
    }
    if (!importsFastapi(text) && !text.includes('Depends(')) {
      return;
    }
    // Per file, not computed once from rootText: an alias (`from module import target as alias`) is a
    // property of whichever file DOES the importing, never of root's own definition file - the original
    // one-shot-from-rootText version could never see it (found empirically: an alias fixture referencing
    // root only through its alias produced zero edges), since a plain definition file has no reason to
    // import its own top-level symbol under another name.
    const localNames = [input.root.name];
    // Alongside `localNames` (which `findDependsReferences` needs, just to know which names to search
    // for) - the candidate count `verified.items.length` for each verified alias, checked at exactly the
    // same import-line position `verified` was already computed from. Closure audit finding
    // (docs/work/task-m4-milestone-closure-audit.md, gate 4): `verified.items.some(... === rootId)`
    // below is a MEMBERSHIP check ("is root among the candidates"), not an ambiguity RESOLUTION ("how
    // many candidates are there") - conflating the two silently discarded this count and always reported
    // `resolution: 'single'` for a verified alias, even when the import line genuinely resolved to
    // several candidates including root. Recording the real count here, once, is what lets the literal-
    // name branch below and this one share the same `resolution: 'multiple'` meaning: "this reference
    // resolves to more than one real candidate, one of which is root."
    const aliasCandidateCounts = new Map<string, number>();
    for (const binding of aliasBindingsFor(text, input.root.name)) {
      if (matchesProcessed >= input.budget.maxFiles * input.budget.maxMatchesPerFile) {
        budgetExceeded = true;
        break;
      }
      matchesProcessed += 1;
      // Verify before trusting - see aliasBindingsFor's doc comment for why this specific position (not
      // the alias's own use site) is what a text match alone cannot substitute for.
      const verified = await resolveEndpoint(input, file, { line: binding.line, character: binding.character });
      if (verified.items.some(item => input.idOf(item) === input.rootId)) {
        localNames.push(binding.alias);
        aliasCandidateCounts.set(binding.alias, verified.items.length);
      }
    }
    const lines = text.split('\n');
    const parenClassificationLines = stripForParenClassification(text).split('\n');
    const references = findDependsReferences(lines, localNames);
    for (const reference of references) {
      if (matchesProcessed >= input.budget.maxFiles * input.budget.maxMatchesPerFile) {
        budgetExceeded = true;
        return;
      }
      matchesProcessed += 1;
      // A reference matching a verified alias cannot be re-verified the same way a literal-name reference
      // can: `prepare()` at the alias's OWN use site resolves to the import statement's local binding as
      // its own distinct symbol identity, never through to root's (found empirically - the reason
      // aliasBindingsFor verifies at the ORIGINAL name's position in the import line instead, once per
      // file, not per use site). That verification already happened before `localNames` was built, so an
      // alias reference is trusted here; a literal-name reference still goes through the same
      // provider-based check corpus case 1 requires (a same-named symbol resolving to something else must
      // still produce nothing for root).
      const isVerifiedAlias = reference.name !== input.root.name;
      let resolutionCandidateCount: number;
      if (isVerifiedAlias) {
        // Always present: `isVerifiedAlias` is true only for a name `findDependsReferences` matched from
        // `localNames`, and every alias entered there was also given a count in the same loop above.
        resolutionCandidateCount = aliasCandidateCounts.get(reference.name)!;
      } else {
        const resolved = await resolveEndpoint(input, file, { line: reference.line, character: reference.character });
        if (resolved.items.length === 0) {
          // M4 IL-LIM-001/002 inference-unresolved lane (docs/work/task-m4-il-lim001-002-inference-
          // limitations.md, reviewer's six-site audit): NOT tallied, deliberately. This resolves the
          // EXACT text position `findDependsReferences` matched as root's own literal name - unlike the
          // enclosing-def checks below, there is no separately-confirmed relationship here yet for a
          // zero-item result to be "narrowing a failure" on. Zero items at this exact spot means the
          // matched text most likely was never a real reference to root at all (a false-positive text
          // match `stripForParenClassification`/`findDependsReferences` did not catch, not a genuine
          // Depends() reference we simply cannot pin down) - the same "we do not yet know a real
          // relationship exists here" shape as `dynamicCallbackAdapter.ts`'s callee-resolution check.
          // Counting it would assert existence of a relationship this adapter never actually confirmed.
          continue;
        }
        const matchesRoot = resolved.items.some(item => input.idOf(item) === input.rootId);
        if (!matchesRoot) {
          // A same-named symbol that resolved to something other than root (corpus case 1) - correctly
          // produces nothing for root, since this reference is not actually about root.
          continue;
        }
        resolutionCandidateCount = resolved.items.length;
      }
      const enclosing = findEnclosingDef(lines, parenClassificationLines, reference.line, reference.dependsCharacter);
      if (!enclosing.def) {
        // M4 IL-LIM-001/002 inference-unresolved lane: this reference WAS recognized (it just resolved
        // to root, above) - only the enclosing caller could not be pinned. Tallied, never silently
        // dropped (gate 7 measured this exact drop at ~40% of real references before this lane).
        recordRejection(enclosing.reasonCode, enclosing.category);
        continue;
      }
      const enclosingResolved = await resolveEndpoint(input, file, { line: enclosing.def.line, character: enclosing.def.character });
      if (enclosingResolved.items.length === 0) {
        // M4 IL-LIM-001/002 inference-unresolved lane (docs/work/task-m4-il-lim001-002-inference-
        // limitations.md, reviewer's six-site audit): tallied - UNLIKE the target-side zero-item check
        // above, the relationship itself is already confirmed by this point (this reference resolved to
        // root, or was a verified alias) - only the ENCLOSING caller's identity could not be pinned. That
        // is "found the relation, failed to narrow it", commander's own counting criterion, not "we do
        // not know a relation exists".
        recordRejection('enclosing-function-unresolved', 'technique-blocked');
        continue;
      }
      if (enclosingResolved.items.length > 1) {
        // Closure audit finding (docs/work/task-m4-milestone-closure-audit.md, gate 4): unlike the
        // target side above (which reports `resolution: 'multiple'` when a reference resolves to more
        // than one real candidate), the SOURCE side has no field that can express "more than one
        // function could be this edge's caller" - `source` is a single endpoint, not a list. So the
        // only choice that does not arbitrarily promote one candidate to a confirmed caller is to
        // produce no edge at all here (M4 stage 1's own rule: if a single caller cannot be confirmed,
        // do not assert one).
        //
        // M4 IL-LIM-001/002 inference-unresolved lane: this WAS a silent drop before this lane - a
        // caller dropped here was indistinguishable from a query that never found a candidate reference
        // at all, the same "empty result, ambiguous cause" problem `provider_null_incoming_calls` exists
        // to solve for the static traversal (this comment used to end here, unresolved - reviewer's
        // six-site audit closed it). Category is `backlog`, not `capability-blocked`: the provider
        // already gave a perfectly good answer (multiple real candidates); what is missing is a place in
        // `AugmentedEdge`'s own schema to express more than one source, the same way `resolution:
        // 'multiple'` already does for the target side - a schema/implementation task, not a missing
        // provider capability.
        recordRejection('multiple-source-candidates', 'backlog');
        continue;
      }
      const { id: sourceId, endpoint: sourceEndpoint } = endpointFor(input, enclosingResolved.items[0]);
      const pairKey = `${sourceId}|${input.rootId}`;
      if (seenPairs.has(pairKey)) {
        continue;
      }
      seenPairs.add(pairKey);
      edges.push({
        source: sourceEndpoint,
        target: { kind: 'existing', id: input.rootId },
        adapterId: 'fastapi-static-v1',
        evidenceSource: 'static-inference',
        // More than one real candidate for the same reference (rare - genuine provider-side
        // ambiguity) is reported as `multiple`; the common case, a single resolved symbol, is
        // `single`. Never `confirmed` - this array is by definition what the provider did not
        // confirm (M4 stage 1 Q2 decision). A verified alias's count comes from the same
        // import-line verification `aliasCandidateCounts` recorded above, not from re-checking here -
        // there is no separate use-site count to fall back to (see `aliasBindingsFor`'s own doc comment
        // for why the use site cannot be re-verified the same way).
        resolution: resolutionCandidateCount > 1 ? 'multiple' : 'single',
        reasonCode: 'fastapi-depends',
        evidenceRanges: [externalRange({
          start: { line: reference.line, character: reference.character },
          // `reference.name`, not `input.root.name` - an alias is rarely the same length as the name it
          // stands for, and using root's length here for an alias reference would misalign the range.
          end: { line: reference.line, character: reference.character + reference.name.length },
        })],
      });
    }
  });
  if (walkState.truncated) {
    budgetExceeded = true;
  }

  return { edges, budgetExceeded, mountUnresolved, rejectedInferences: [...rejectionTallies.values()] };
}
