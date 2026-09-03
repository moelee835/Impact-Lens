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

/** Bounded alias tracking (`from module import target as alias`) - not a real import graph. Returns
 * every local name this file could plausibly use to refer to `targetName`, `targetName` itself first. */
function localNamesFor(text: string, targetName: string): readonly string[] {
  const names = new Set([targetName]);
  const aliasPattern = new RegExp(`\\bimport\\s+${escapeRegExp(targetName)}\\s+as\\s+(\\w+)`, 'g');
  for (const match of text.matchAll(aliasPattern)) {
    names.add(match[1]);
  }
  return [...names];
}

function importsFastapi(text: string): boolean {
  return /\bimport\s+fastapi\b/.test(text) || /\bfrom\s+fastapi(\.\w+)*\s+import\b/.test(text);
}

interface DependsMatch {
  readonly line: number;
  readonly character: number;
}

function findDependsReferences(lines: readonly string[], localNames: readonly string[]): readonly DependsMatch[] {
  const matches: DependsMatch[] = [];
  for (const name of localNames) {
    const pattern = new RegExp(`\\bDepends\\(\\s*${escapeRegExp(name)}\\b`, 'g');
    lines.forEach((line, index) => {
      for (const match of line.matchAll(pattern)) {
        matches.push({ line: index, character: match.index! + match[0].length - name.length });
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

interface MountSearchResult {
  readonly found: boolean;
  readonly truncated: boolean;
}

/**
 * Corpus case 3 (docs/work/task-m4-stage1-evidence-contract.md): a route decorator on a plain
 * `APIRouter()` is not reachable until something actually mounts it - `include_router(name)` referencing
 * this exact variable, anywhere in the workspace. This is a text search, not a provider-resolved
 * reference lookup: `CallHierarchyProvider` only resolves callable symbols (functions/methods), and a
 * router variable is neither - the reason `Depends()`/route-handler resolution elsewhere in this file CAN
 * be provider-verified and this cannot. Matching only a bare identifier argument
 * (`include_router(name` / `include_router(name,`, never `include_router(name()` or
 * `include_router(get_name())`) is deliberate: it is exactly what leaves dynamic registration (stage 1's
 * own out-of-scope example) unmatched, with no special-casing needed.
 */
async function isRouterMounted(name: string, workspace: string, budget: AdapterBudget): Promise<MountSearchResult> {
  const pattern = new RegExp(`\\binclude_router\\(\\s*${escapeRegExp(name)}\\s*[,)]`);
  const walkState = { filesVisited: 0, maxFiles: budget.maxFiles, truncated: false };
  let found = false;
  await walkPythonFiles(workspace, walkState, async file => {
    if (found) {
      return;
    }
    let text: string;
    try {
      text = await fs.readFile(file, 'utf8');
    } catch {
      return;
    }
    if (pattern.test(text)) {
      found = true;
    }
  });
  return { found, truncated: walkState.truncated };
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
      const mountCheck = await isRouterMounted(routeDecorator.routerName, input.workspace, input.budget);
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
  const localNames = localNamesFor(rootText, input.root.name);
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
    const lines = text.split('\n');
    const references = findDependsReferences(lines, localNames);
    for (const reference of references) {
      if (matchesProcessed >= input.budget.maxFiles * input.budget.maxMatchesPerFile) {
        budgetExceeded = true;
        return;
      }
      matchesProcessed += 1;
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
      const enclosing = findEnclosingDef(lines, reference.line);
      if (!enclosing) {
        continue;
      }
      const enclosingResolved = await resolveEndpoint(input, file, { line: enclosing.line, character: enclosing.character });
      if (enclosingResolved.items.length === 0) {
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
        // confirm (M4 stage 1 Q2 decision).
        resolution: resolved.items.length > 1 ? 'multiple' : 'single',
        reasonCode: 'fastapi-depends',
        evidenceRanges: [externalRange({
          start: { line: reference.line, character: reference.character },
          end: { line: reference.line, character: reference.character + input.root.name.length },
        })],
      });
    }
  });
  if (walkState.truncated) {
    budgetExceeded = true;
  }

  return { edges, budgetExceeded, mountUnresolved };
}
