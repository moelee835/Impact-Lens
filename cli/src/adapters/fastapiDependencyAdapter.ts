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
// or dynamic construction. Every candidate this finds is then verified through the real provider
// (`prepare()`), which is what turns a text match into a genuine finding: a text match alone proves
// nothing about which real symbol (if any) it refers to (M4 stage 1 corpus case 1 - "same name,
// different symbol").

import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { externalRange, relativeFile, symbolId, symbolKindName, uriFile } from '../impact';
import { AugmentedEdge, CallHierarchyItem, LspPosition } from '../types';
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
        matches.push({ line: index, character: match.index! + match[0].length - name.length, name });
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

/** Nearest preceding `def`/`async def` line above `fromLine`, indentation not considered - a bounded
 * heuristic (documented limitation), not a scope-accurate parse. */
function findEnclosingDef(lines: readonly string[], fromLine: number): EnclosingDef | undefined {
  for (let index = fromLine; index >= 0; index -= 1) {
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
 * instantiated elsewhere and merely imported here is a documented limitation, not silently guessed at. */
function isDirectFastapiApp(name: string, rootText: string): boolean {
  return new RegExp(`\\b${escapeRegExp(name)}\\s*=\\s*FastAPI\\s*\\(`).test(rootText);
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
 * 2. A bare identifier match in a file whose `name` refers to an UNRELATED `APIRouter()` - two files can
 *    each define their own router under the same local name (e.g. both call it `router`), and a text
 *    search that only matches by name cannot tell them apart. If any file OTHER than `rootFile` also
 *    binds `name = APIRouter(...)` - a type-annotated (`name: APIRouter = APIRouter(...)`) or
 *    module-qualified (`name = fastapi.APIRouter(...)`) binding counts too, not just the bare form - the
 *    name is ambiguous workspace-wide and mount can never be confirmed for it (stage 1's "if it cannot be
 *    confirmed, do not assert" - matching the false-negative direction corpus case 3 already requires,
 *    not a new relaxation).
 *
 * A third thing this search must NOT do: treat a TRUNCATED walk as having confirmed there is no
 * collision. `mountFound` is a positive claim - a truncated search that never finds it is safely "not
 * found", same as always. `nameAmbiguous` is the opposite, a negative/universal claim ("no OTHER file
 * anywhere binds this name") - a walk that stopped early cannot support it, because the one colliding
 * file could be exactly the one it never reached (found by direct reproduction: a 1-file budget that
 * happened to visit only root's own self-mounting file produced a confident edge while a real competing
 * binding sat unread in a second file). So `found` is `true` only when the walk actually completed
 * (`!truncated`) - a truncated walk is always reported unresolved.
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
 * Matching only a bare identifier argument (`include_router(name` / `include_router(name,`, never
 * `include_router(name()` or `include_router(get_name())`) IS deliberate: it is exactly what leaves
 * dynamic registration (stage 1's own out-of-scope example) unmatched, with no special-casing needed.
 */
async function isRouterMounted(name: string, rootFile: string, workspace: string, budget: AdapterBudget): Promise<MountSearchResult> {
  const mountPattern = new RegExp(`\\binclude_router\\(\\s*${escapeRegExp(name)}\\s*[,)]`);
  // Allows an optional type annotation (`name: APIRouter = ...`) and an optional module-qualified prefix
  // before the constructor call (`name = fastapi.APIRouter(...)`) - both found missing in an isolated
  // regex probe before this was written, which is what "same name, different symbol" (corpus case 1)
  // already warned this adapter to check for empirically rather than assume.
  const bindingPattern = new RegExp(`\\b${escapeRegExp(name)}(?:\\s*:\\s*[^=\\n]+)?\\s*=\\s*(?:\\w+\\.)*APIRouter\\s*\\(`);
  const walkState = { filesVisited: 0, maxFiles: budget.maxFiles, truncated: false };
  let mountFound = false;
  let nameAmbiguous = false;
  await walkPythonFiles(workspace, walkState, async file => {
    let text: string;
    try {
      text = await fs.readFile(file, 'utf8');
    } catch {
      return;
    }
    const searchable = stripCommentsAndStrings(text);
    if (mountPattern.test(searchable)) {
      mountFound = true;
    }
    if (!sameFile(file, rootFile) && bindingPattern.test(searchable)) {
      nameAmbiguous = true;
    }
  });
  // A truncated walk cannot support the negative claim `!nameAmbiguous` makes - see the doc comment above.
  return { found: mountFound && !nameAmbiguous && !walkState.truncated, truncated: walkState.truncated };
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
  const id = symbolId(item);
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
    let mountConfirmed = isDirectFastapiApp(routeDecorator.routerName, rootText);
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
      if (verified.items.some(item => symbolId(item) === input.rootId)) {
        localNames.push(binding.alias);
        aliasCandidateCounts.set(binding.alias, verified.items.length);
      }
    }
    const lines = text.split('\n');
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
          continue;
        }
        const matchesRoot = resolved.items.some(item => symbolId(item) === input.rootId);
        if (!matchesRoot) {
          // A same-named symbol that resolved to something other than root (corpus case 1) - correctly
          // produces nothing for root, since this reference is not actually about root.
          continue;
        }
        resolutionCandidateCount = resolved.items.length;
      }
      const enclosing = findEnclosingDef(lines, reference.line);
      if (!enclosing) {
        continue;
      }
      const enclosingResolved = await resolveEndpoint(input, file, { line: enclosing.line, character: enclosing.character });
      if (enclosingResolved.items.length === 0) {
        continue;
      }
      if (enclosingResolved.items.length > 1) {
        // Closure audit finding (docs/work/task-m4-milestone-closure-audit.md, gate 4): unlike the
        // target side above (which reports `resolution: 'multiple'` when a reference resolves to more
        // than one real candidate), the SOURCE side has no field that can express "more than one
        // function could be this edge's caller" - `source` is a single endpoint, not a list. So the
        // only choice that does not arbitrarily promote one candidate to a confirmed caller is to
        // produce no edge at all here (M4 stage 1's own rule: if a single caller cannot be confirmed,
        // do not assert one). No dedicated limitation code exists for this specific case, and one was
        // deliberately not added in this lane (commander's explicit scope decision: reusing an existing
        // code that does not actually fit this situation, or inventing a new one, is a separate cost -
        // V1_WITHHELD_REASON_CODES, the plugin skill docs, cli-contract.md and the response-policy eval
        // all have to move together for a new code, per this same file's other limitation codes). The
        // real cost of that: a caller silently dropped here is indistinguishable from a query that
        // never found a candidate reference at all - the same "empty result, ambiguous cause" problem
        // `provider_null_incoming_calls` exists to solve for the static traversal, unsolved here. This
        // adapter already accepts an equivalent silent gap in the other direction for several known
        // false-negative shapes (module-attribute mount, alias-variable mount - both undetectable, both
        // silent) - consistent with that choice, but not a good state, and not resolved by this comment.
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

  return { edges, budgetExceeded, mountUnresolved };
}
