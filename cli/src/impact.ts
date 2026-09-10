import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { classifyRelationDetailed, toSuppressedTestRule, toTestRule } from './testFile';
import { readProjectTestPatterns } from './testPatternsConfig';
import { projectCompletion } from './coverage';
import { inspectCompileDatabase } from './providers/compileDatabase';
import { inspectJvmProjectModel } from './providers/jvmProjectModel';
import { C_FAMILY_LANGUAGE_IDS, JVM_LANGUAGE_IDS } from './providers/resolve';
import { AugmentationResult, runAugmentation } from './shared/adapters';
import { externalRange, isOutside, relativeFile, symbolId, symbolKindName, uriFile } from './shared/impactHelpers';
import {
  AnalysisObservations,
  AnalyzeRequest,
  CallHierarchyItem,
  CallHierarchyProvider,
  CliError,
  LspRange,
  ProviderDiagnostic,
  SourceMode,
} from './types';

interface TraversalEntry {
  readonly item: CallHierarchyItem;
  readonly depth: number;
}

interface TraversalEdge {
  readonly source: string;
  readonly target: string;
  readonly fromRanges: readonly LspRange[];
}

export async function analyzeImpact(
  request: AnalyzeRequest,
  provider: CallHierarchyProvider,
  noteResolver?: (item: CallHierarchyItem) => Promise<unknown>,
  // Facts the traversal cannot observe itself: why it stopped early, what the provider's index was doing,
  // and whether anything but the static call hierarchy contributed edges. What the caller passes here wins
  // over what the provider reports, because an explicit argument is a deliberate statement by a test or an
  // enclosing lane, while the provider's own answer is a default. Omitting both reproduces today's response
  // exactly.
  observations: AnalysisObservations = {},
): Promise<Record<string, unknown>> {
  const started = Date.now();
  const workspace = await canonicalWorkspace(request.workspace);
  // IL-LIM-010 stage 1 completion (docs/work/task-m4-il-lim-010-stage1-completion.md). Read once, up
  // front, before any provider work starts - an invalid `.impact-lens/test-patterns.json`/`.local.json`
  // fails the request immediately (`test_pattern_config_invalid`) rather than after an expensive
  // traversal, and every node below shares the exact same compiled patterns rather than each
  // re-reading/re-compiling its own copy.
  const userTestPatterns = readProjectTestPatterns(workspace);
  const file = await resolveWorkspaceFileSecure(workspace, request.file);
  validatePosition(request.line, request.column);
  const requestedDepth = integerInRange(request.depth ?? 5, 1, 20, 'depth');
  const maxNodes = integerInRange(request.maxNodes ?? 120, 1, 1000, 'maxNodes');
  // Read after `prepare`, which is what forces the handshake and therefore the readiness decision. Reading
  // it earlier would sample the index state before the session had one, and always report `unknown`.
  const items = await provider.prepare(file, { line: request.line - 1, character: request.column - 1 });
  const root = selectRoot(items, request.expectedSymbol);
  const traversal = await traverse(root, provider, requestedDepth, maxNodes);
  const diagnostics = await provider.collectDiagnostics([...new Set(traversal.entries.map(entry => entry.item.uri))]);
  const diagnosticMap = groupDiagnostics(diagnostics);

  const nodes = await Promise.all(traversal.entries.map(async entry => {
    const itemFile = uriFile(itemUri(entry.item));
    const note = noteResolver ? await noteResolver(entry.item) : unavailableNote();
    // IL-LIM-010 stage 1 (docs/work/task-m4-il-lim-010-test-classifier.md). `classifyRelation()` must
    // see the SAME workspace-relative path already computed for `file` below, not the raw absolute
    // `itemFile` - an absolute path's own ancestor directories (a home directory literally named `test`,
    // a checkout under `.../spec/...`) are not the project's own test directories, and the classifier's
    // directory-convention rule cannot tell the difference from the outside. Computed once and reused so
    // this doesn't run `relativeFile()` a third time.
    const relativeItemFile = relativeFile(workspace, itemFile);
    const { relation, classification } = classifyRelationDetailed(entry.depth, relativeItemFile, userTestPatterns);
    return {
      id: symbolId(entry.item),
      name: entry.item.name,
      kind: symbolKindName(entry.item.kind),
      kindCode: entry.item.kind,
      detail: entry.item.detail ?? '',
      file: relativeItemFile,
      uri: entry.item.uri,
      outsideWorkspace: isOutside(workspace, itemFile),
      declarationRange: externalRange(entry.item.range),
      selectionRange: externalRange(entry.item.selectionRange),
      depth: entry.depth,
      relation,
      // The CLI response has no test-execution status field at all (unlike the Extension's
      // `TestFreshness`, which at least declares the concept even though it only ever holds
      // 'notRun'/'outdated' today - see that type's own comment in `src/types.ts`). So "does the CLI
      // ever report an unrun test as passed" is true for the same underlying reason as the Extension's
      // case (the acceptance criterion holds because the feature to violate it does not exist yet, not
      // because a safeguard was verified) but for a stronger structural reason here: there is no
      // vocabulary at all to add a wrong value to, not merely an incomplete one.
      testDistance: relation === 'test' ? entry.depth : null,
      testRule: toTestRule(classification),
      testRuleSuppressed: toSuppressedTestRule(classification),
      note,
      diagnostics: diagnosticsForItem(diagnosticMap.get(entry.item.uri) ?? [], entry.item),
      source: await sourceForItem(entry.item, request.includeSource ?? 'none'),
    };
  }));
  nodes.sort(compareNodes);
  const edges = traversal.edges.map(edge => ({
    source: edge.source,
    target: edge.target,
    callSites: edge.fromRanges.map(range => ({
      file: relativeFile(workspace, uriFile(traversal.byId.get(edge.source)?.uri ?? root.uri)),
      range: externalRange(range),
    })).sort((left, right) => left.file.localeCompare(right.file)
      || left.range.start.line - right.range.start.line
      || left.range.start.column - right.range.start.column),
  })).sort((left, right) => left.source.localeCompare(right.source)
    || left.target.localeCompare(right.target)
    || JSON.stringify(left.callSites).localeCompare(JSON.stringify(right.callSites)));
  // M4 stage 2: entirely separate from the traversal above - `nodes`/`edges` are read here only to
  // check which ids already exist (M4 stage 1's dangling-id decision), never written to. Runs on its
  // own budget (M4 stage 1's "budget/limits leak" decision), so nothing it does can affect
  // `traversal.limits`/`reachedDepth`/anything `projectCompletion` below derives from `facts`.
  //
  // M4 augmentation-failure-isolation lane (docs/work/task-m4-augmentation-failure-isolation.md,
  // closing the M4 closure audit's Gate 1): `runAugmentation()` already isolates each adapter's own
  // throw from every other adapter (its per-adapter catch, `./shared/adapters/index.ts`). This second,
  // outer catch is for `runAugmentation()`'s own orchestration code breaking outside that loop - a bug
  // in this codebase, not in an adapter, which is why it produces `augmentation_internal_error` rather
  // than `augmentation_adapter_failed` below. Either way, `nodes`/`edges` above are already computed and
  // this catch cannot touch them - only `augmentedEdges`/the two observations below are affected.
  let augmentation: AugmentationResult;
  let internalErrorKind: string | undefined;
  try {
    augmentation = await runAugmentation(
      request.augmentationEnabled ?? false,
      provider.capabilities.detectedLanguageId,
      workspace,
      root,
      symbolId(root),
      provider,
      new Set(nodes.map(node => node.id)),
      symbolId,
    );
  } catch (error) {
    augmentation = {
      edges: [],
      budgetExceededAdapterIds: [],
      mountUnresolvedAdapterIds: [],
      failedAdapters: [],
      inferenceUnresolved: [],
    };
    internalErrorKind = error instanceof Error ? error.name : 'unknown';
  }
  const augmentedEdges = [...augmentation.edges].sort((left, right) =>
    JSON.stringify(left).localeCompare(JSON.stringify(right)));
  const reachedDepth = Math.max(0, ...traversal.entries.map(entry => entry.depth));
  // Every state field below comes out of this one call. Nothing in this function decides `complete`,
  // `truncated`, `traversalLimits`, `coverage` or `limitations` on its own, which is what keeps the
  // contradictions X1, X7 and X10 out of the response by construction rather than by review.
  const projection = projectCompletion({
    limits: traversal.limits,
    requestedDepth,
    reachedDepth,
    maxNodes,
    // The traversal seeds `entries` with the root, so this is 0 exactly when the provider returned no caller.
    //
    // Load-bearing invariant `coverage.ts` depends on for `nullIncomingCallsObserved`: this is 0 if and
    // only if `traverse()` below called `provider.incoming()` exactly once (for the root). `entries` only
    // grows inside the `entries.push(entry)` branch of the loop below, which runs only when a returned
    // call's source is unseen - so a second `incoming()` call happens only after that branch already
    // pushed a new entry, which this being 0 rules out. A root that calls itself does not break this: the
    // self-reference hits `seen.has(source)` and becomes an edge only, so `entries.length` and the query
    // count both still read 1. (`impact.test.ts`: "the invariant..." and "a self-recursive root..." guard
    // this by counting `incoming()` calls directly.) If `traverse()` is ever changed to query anything
    // before deciding there are no callers - a pre-check, a provider instance reused across requests, or
    // any second query on the root's own path - this count can exceed 1 while still leaving
    // `incomingCallerCount` at 0, and a `null` observed on that *other* query would then attach to a
    // result it says nothing about. Re-verify this invariant before making that kind of change.
    incomingCallerCount: traversal.entries.length - 1,
    diagnosticsSupported: provider.capabilities.diagnostics,
  }, {
    // Read-only filesystem discovery, not a provider-reported fact - only C_FAMILY_LANGUAGE_IDS
    // requests pay for it, and every other language keeps `observations.compileDatabase` unset
    // (M2 clangd lane stage 3, `docs/work/task-m2-clangd-preset.md`). Lowest precedence of the three
    // layers: a provider's own claim or an explicit test/caller observation can still override it,
    // matching how `provider.analysisObservations?.()` and `observations` already relate below.
    ...(C_FAMILY_LANGUAGE_IDS.has(provider.capabilities.detectedLanguageId)
      ? { compileDatabase: await inspectCompileDatabase(workspace) }
      : {}),
    // Same shape as compileDatabase above: read-only, lowest precedence, only for the languages it
    // applies to (M3 Java Lane J, docs/work/task-m3-java-project-import-readiness.md).
    ...(JVM_LANGUAGE_IDS.has(provider.capabilities.detectedLanguageId)
      ? { jvmProjectModel: await inspectJvmProjectModel(workspace) }
      : {}),
    // M4 stage 2: signals augmentation's own findings the same way `compileDatabase` above signals
    // its own read-only discovery - computed here, lowest precedence, so an explicit test/caller
    // observation can still override it. `evidenceSources` uses the `inferred-` prefix
    // `coverage.ts`'s `REQUIRED_EVIDENCE_PREFIX` already requires for `static-plus-inference` (M1
    // scaffolding this lane reuses unmodified, per M4 stage 1's Q1 decision).
    ...(augmentedEdges.length > 0
      ? { semantic: { scope: 'static-plus-inference' as const, evidenceSources: [...new Set(augmentedEdges.map(edge => `inferred-${edge.adapterId}`))] } }
      : {}),
    ...(augmentation.budgetExceededAdapterIds.length > 0
      ? { augmentationBudgetExceeded: augmentation.budgetExceededAdapterIds }
      : {}),
    ...(augmentation.mountUnresolvedAdapterIds.length > 0
      ? { augmentationMountUnresolved: augmentation.mountUnresolvedAdapterIds }
      : {}),
    ...(augmentation.failedAdapters.length > 0
      ? { augmentationAdapterFailed: augmentation.failedAdapters }
      : {}),
    ...(augmentation.inferenceUnresolved.length > 0
      ? { augmentationInferenceUnresolved: augmentation.inferenceUnresolved }
      : {}),
    ...(internalErrorKind !== undefined
      ? { augmentationInternalError: { errorKind: internalErrorKind } }
      : {}),
    ...provider.analysisObservations?.(),
    ...observations,
  });
  return {
    rootId: symbolId(root),
    nodes,
    edges,
    augmentedEdges,
    requestedDepth,
    reachedDepth,
    maxNodes,
    truncated: projection.truncated,
    traversalLimits: projection.traversalLimits,
    complete: projection.complete,
    provider: provider.capabilities,
    coverage: projection.coverage,
    completion: projection.completion,
    coordinateBase: 1,
    positionEncoding: 'utf-16',
    limitations: projection.limitations,
    limitationDetails: projection.limitationDetails,
    analyzedAt: new Date().toISOString(),
    timings: { totalMs: Date.now() - started },
  };
}

async function traverse(
  root: CallHierarchyItem,
  provider: CallHierarchyProvider,
  maxDepth: number,
  maxNodes: number,
): Promise<{
  entries: TraversalEntry[];
  edges: TraversalEdge[];
  limits: Set<'depth' | 'nodes'>;
  byId: Map<string, CallHierarchyItem>;
}> {
  const rootId = symbolId(root);
  const entries: TraversalEntry[] = [{ item: root, depth: 0 }];
  const edges: TraversalEdge[] = [];
  const queue: TraversalEntry[] = [{ item: root, depth: 0 }];
  const seen = new Set([rootId]);
  const byId = new Map([[rootId, root]]);
  const limits = new Set<'depth' | 'nodes'>();
  while (queue.length > 0) {
    const current = queue.shift();
    if (!current) {
      continue;
    }
    const target = symbolId(current.item);
    const incoming = await provider.incoming(current.item);
    if (current.depth >= maxDepth) {
      if (incoming.some(call => !seen.has(symbolId(call.from)))) {
        limits.add('depth');
      }
      continue;
    }
    for (const call of incoming) {
      const source = symbolId(call.from);
      if (seen.has(source)) {
        edges.push({ source, target, fromRanges: call.fromRanges });
        continue;
      }
      if (entries.length >= maxNodes) {
        limits.add('nodes');
        continue;
      }
      const entry = { item: call.from, depth: current.depth + 1 };
      seen.add(source);
      edges.push({ source, target, fromRanges: call.fromRanges });
      byId.set(source, call.from);
      entries.push(entry);
      queue.push(entry);
    }
  }
  return { entries, edges, limits, byId };
}

export function selectRoot(items: readonly CallHierarchyItem[], expected: AnalyzeRequest['expectedSymbol']): CallHierarchyItem {
  const candidates = items.filter(item => matchesExpected(item, expected));
  if (candidates.length === 1) {
    return candidates[0];
  }
  if (candidates.length === 0) {
    throw new CliError('target_not_found', 'No callable symbol was found at the requested position.', 3);
  }
  throw new CliError('target_ambiguous', 'More than one callable symbol matched the requested position.', 3, false, {
    candidates: candidates.map(item => ({ name: item.name, kind: symbolKindName(item.kind), detail: item.detail ?? '' })),
  });
}

function matchesExpected(item: CallHierarchyItem, expected: AnalyzeRequest['expectedSymbol']): boolean {
  if (!expected) {
    return true;
  }
  return (expected.name === undefined || expected.name === item.name)
    && (expected.detail === undefined || expected.detail === (item.detail ?? ''))
    && (expected.kind === undefined || expected.kind === item.kind || expected.kind === symbolKindName(item.kind));
}

export function resolveWorkspaceFile(workspace: string, file: string): string {
  const resolved = path.resolve(workspace, file);
  if (isOutside(workspace, resolved)) {
    throw new CliError('workspace_escape', 'The target file is outside the workspace.', 2);
  }
  return resolved;
}

export async function resolveWorkspaceFileSecure(workspace: string, file: string): Promise<string> {
  const resolved = resolveWorkspaceFile(workspace, file);
  try {
    const [realWorkspace, realFile] = await Promise.all([fs.realpath(workspace), fs.realpath(resolved)]);
    if (isOutside(realWorkspace, realFile)) {
      throw new CliError('workspace_escape', 'The target resolves outside the workspace.', 2);
    }
    return realFile;
  } catch (error) {
    if (error instanceof CliError) {
      throw error;
    }
    throw new CliError(
      'target_not_found',
      `Cannot resolve the target file: ${error instanceof Error ? error.message : String(error)}`,
      3,
    );
  }
}

export async function canonicalWorkspace(workspace: string): Promise<string> {
  try {
    return await fs.realpath(path.resolve(workspace));
  } catch (error) {
    throw new CliError(
      'workspace_not_found',
      `Cannot resolve the workspace: ${error instanceof Error ? error.message : String(error)}`,
      3,
    );
  }
}

function itemUri(item: CallHierarchyItem): string {
  return item.uri || pathToFileURL('').toString();
}

function groupDiagnostics(diagnostics: readonly ProviderDiagnostic[]): Map<string, ProviderDiagnostic[]> {
  const result = new Map<string, ProviderDiagnostic[]>();
  for (const diagnostic of diagnostics) {
    const values = result.get(diagnostic.uri) ?? [];
    values.push(diagnostic);
    result.set(diagnostic.uri, values);
  }
  return result;
}

function diagnosticsForItem(diagnostics: readonly ProviderDiagnostic[], item: CallHierarchyItem): unknown[] {
  return diagnostics.filter(diagnostic => rangesIntersect(diagnostic.range, item.range)).map(diagnostic => ({
    severity: diagnostic.severity,
    message: diagnostic.message,
    range: externalRange(diagnostic.range),
  })).sort((left, right) => left.range.start.line - right.range.start.line
    || left.range.start.column - right.range.start.column
    || left.severity.localeCompare(right.severity)
    || left.message.localeCompare(right.message));
}

function rangesIntersect(left: LspRange, right: LspRange): boolean {
  return comparePosition(left.end, right.start) > 0 && comparePosition(right.end, left.start) > 0;
}

function comparePosition(left: { line: number; character: number }, right: { line: number; character: number }): number {
  return left.line - right.line || left.character - right.character;
}

async function sourceForItem(item: CallHierarchyItem, mode: SourceMode): Promise<string | null> {
  if (mode === 'none' || !item.uri.startsWith('file:')) {
    return null;
  }
  const text = await fs.readFile(fileURLToPath(item.uri), 'utf8');
  const lines = text.split(/\r?\n/);
  if (mode === 'declaration') {
    return lines[item.selectionRange.start.line] ?? '';
  }
  return sliceRange(lines, item.range);
}

function sliceRange(lines: readonly string[], range: LspRange): string {
  const selected = lines.slice(range.start.line, range.end.line + 1);
  if (selected.length === 0) {
    return '';
  }
  selected[0] = selected[0]?.slice(range.start.character) ?? '';
  const last = selected.length - 1;
  selected[last] = selected[last]?.slice(0, range.end.character) ?? '';
  return selected.join('\n');
}

function unavailableNote(): unknown {
  return {
    effective: null,
    effectiveSource: null,
    layers: {
      local: null,
      shared: null,
      sourceComment: null,
      personal: { available: false, reason: 'vscode_workspace_state_unavailable' },
    },
  };
}

function validatePosition(line: number, column: number): void {
  integerInRange(line, 1, Number.MAX_SAFE_INTEGER, 'line');
  integerInRange(column, 1, Number.MAX_SAFE_INTEGER, 'column');
}

function integerInRange(value: number, minimum: number, maximum: number, field: string): number {
  if (!Number.isInteger(value) || value < minimum || value > maximum) {
    throw new CliError('invalid_request', `${field} must be an integer from ${minimum} to ${maximum}.`, 2);
  }
  return value;
}

function compareNodes(left: Record<string, unknown>, right: Record<string, unknown>): number {
  return Number(left.depth) - Number(right.depth)
    || String(left.file).localeCompare(String(right.file))
    || Number((left.selectionRange as { start: { line: number } }).start.line) - Number((right.selectionRange as { start: { line: number } }).start.line)
    || String(left.name).localeCompare(String(right.name));
}
