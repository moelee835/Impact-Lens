import * as vscode from 'vscode';
import { idOf, toAdapterItem } from './adapterItemConversion';
import { createAdapterProvider } from './adapterProviderShim';
import { traverseIncoming } from './callGraph';
import { vscodeCoverage, vscodeProviderMetadata } from './coverage';
import { EMPTY_IMPACT_DELTA } from './impactDelta';
import { NoteStore } from './noteStore';
import { createSymbolKey } from './symbolIdentity';
import { classifyImpactRelation } from './testFile';
import { ImpactDiagnostic, ImpactEdge, ImpactNode, ImpactResult } from './types';
// This relative path depends on `src/` and `out/` being siblings ONE level under the repo root, both
// today (`tsconfig.json`'s `rootDir: "src"`/`outDir: "out"`) - `src/foo.ts`'s `../cli/dist/...` compiles
// unchanged into `out/foo.js`'s `require("../cli/dist/...")`, and that resolves correctly only because
// both directories sit at the same depth. Confirmed directly before relying on it (M4 gate 2 shared-
// adapter lane, docs/work/task-m4-gate2-shared-adapter.md): importing from `cli/src/...` under a
// TypeScript project reference type-checked fine but broke at runtime with `Cannot find module`, exactly
// this kind of path assumption failing silently until executed. If `outDir` (or `rootDir`) is ever
// nested deeper, this import (and adapterItemConversion.ts's/adapterProviderShim.ts's own `cli/dist/types`
// type-only imports) needs updating alongside it - nothing enforces that automatically.
import { runAugmentation } from '../cli/dist/shared/adapters';

interface CallEntry {
  readonly item: vscode.CallHierarchyItem;
  readonly callSiteRanges: readonly vscode.Range[];
}

export class ImpactAnalyzer {
  constructor(private readonly notes: NoteStore) {}

  async prepare(
    document: vscode.TextDocument,
    position: vscode.Position,
  ): Promise<vscode.CallHierarchyItem | undefined> {
    let items = await vscode.commands.executeCommand<vscode.CallHierarchyItem[]>(
      'vscode.prepareCallHierarchy',
      document.uri,
      position,
    );
    if (!items?.length) {
      const enclosing = await findEnclosingCallable(document, position);
      if (enclosing && !enclosing.isEqual(position)) {
        items = await vscode.commands.executeCommand<vscode.CallHierarchyItem[]>(
          'vscode.prepareCallHierarchy',
          document.uri,
          enclosing,
        );
      }
    }
    return items?.[0];
  }

  async analyze(
    document: vscode.TextDocument,
    position: vscode.Position,
  ): Promise<ImpactResult | undefined> {
    const rootItem = await this.prepare(document, position);
    if (!rootItem) {
      return undefined;
    }
    return this.analyzeItem(rootItem);
  }

  async analyzeItem(rootItem: vscode.CallHierarchyItem): Promise<ImpactResult> {
    const configuration = vscode.workspace.getConfiguration('impactLens');
    const maxDepth = configuration.get<number>('maxDepth', 5);
    const maxNodes = configuration.get<number>('maxNodes', 120);
    const rangesByEdge = new Map<string, readonly vscode.Range[]>();
    const root: CallEntry = { item: rootItem, callSiteRanges: [] };
    const languageId = (await vscode.workspace.openTextDocument(rootItem.uri)).languageId;

    const traversal = await traverseIncoming(
      root,
      {
        key: value => symbolKey(value.item),
        incoming: async value => {
          const calls = await vscode.commands.executeCommand<vscode.CallHierarchyIncomingCall[]>(
            'vscode.provideIncomingCalls',
            value.item,
          );
          const target = symbolKey(value.item);
          return (calls ?? []).map(call => {
            const source = symbolKey(call.from);
            rangesByEdge.set(edgeKey(source, target), call.fromRanges);
            return { item: call.from, callSiteRanges: call.fromRanges };
          });
        },
      },
      maxDepth,
      maxNodes,
    );

    const nodes: ImpactNode[] = await Promise.all(
      traversal.entries.map(async entry => {
        // IL-LIM-010 stage 1 (docs/work/task-m4-il-lim-010-test-classifier.md). `.uri.path` is an
        // absolute path - its own ancestor directories (a home directory literally named `test`, a
        // checkout under `.../spec/...`) are not this project's own test directories, and the
        // classifier's directory-convention rule cannot tell the difference from the outside.
        // `asRelativePath(uri, false)` is this repository's own existing convention for exactly this
        // (graphPanel.ts:255, impactTreeProvider.ts:267, controller.ts:672 all already use it for the
        // path shown to the user) - passed the `Uri` object itself, not the string `.path`, so a
        // Windows `/c:/...`-shaped path never has to be reparsed. The second argument MUST stay `false`:
        // `true` prefixes multi-root workspace folder names onto the result, which reintroduces this
        // exact bug through another door for a folder named `test`/`spec`.
        const relation = classifyImpactRelation(entry.depth, vscode.workspace.asRelativePath(entry.value.item.uri, false));
        const isTest = relation === 'test';
        const note = await this.notes.resolve(entry.value.item);
        return {
          id: symbolKey(entry.value.item),
          item: entry.value.item,
          depth: entry.depth,
          relation,
          callSiteRanges: entry.value.callSiteRanges,
          note: note.text,
          noteSource: note.source,
          diagnostics: diagnosticsForItem(entry.value.item),
          changed: false,
          reviewed: false,
          testFreshness: isTest ? 'notRun' : undefined,
        };
      }),
    );

    const edges: ImpactEdge[] = traversal.edges.map(edge => ({
      source: edge.source,
      target: edge.target,
      callSiteRanges: rangesByEdge.get(edgeKey(edge.source, edge.target)) ?? [],
    }));

    // M4 gate 2 shared-adapter lane (docs/work/task-m4-gate2-shared-adapter.md). Shipped disabled by
    // default (the CLI's own kill-switch default, M4 stage 2) - `runAugmentation()` itself already
    // returns an empty result unconditionally when `enabled` is false, so this setting is the only new
    // surface, not a second place the default could drift from the CLI's. No workspace folder (a
    // single-file window) means no directory the adapter could search for a cross-file mount, so
    // augmentation is skipped entirely rather than guessing a scope - the same "if the boundary is
    // unknown, do not claim a result" reasoning M4 stage 1 already applies to the static traversal.
    //
    // `augmentationEnabled` is checked BEFORE the workspace-scheme check below, not after, so the new
    // limitation code only ever appears when it would actually matter to the user - reporting "cannot
    // augment" for a feature nobody turned on would be noise, not a limitation.
    const augmentationEnabled = configuration.get<boolean>('augmentationEnabled', false);
    const workspaceFolder = vscode.workspace.getWorkspaceFolder(rootItem.uri);
    // commander's finding, confirmed directly (package.json has no `browser`/`extensionKind`/
    // `capabilities.virtualWorkspaces` entry at all, so VS Code treats this extension as virtual-
    // workspace-capable by default; the adapter's own `walkPythonFiles()` catches ANY `fs.readdir()`
    // failure - including the ENOENT a virtual-filesystem URI's `.fsPath` would produce - and silently
    // returns zero files, `fastapiDependencyAdapter.ts`): a `vscode-vfs://`-scheme workspace (GitHub
    // Repositories, and similar virtual filesystems) would make augmentation run, find nothing, and
    // report nothing wrong - the static graph still renders normally, so nothing tells the user
    // augmentation never actually searched anything. This is exactly the failure shape this milestone
    // exists to prevent ("an empty result read as an answer") - a silent false negative is worse than a
    // loud one, so this is skipped explicitly (not merely accepted as a known gap).
    //
    // NOT YET SURFACED TO THE USER (commander's finding, checked directly - `git grep
    // "\.limitations\b" -- src/` outside this file/types.ts/tests returns nothing; `graphPanel.ts`'s
    // header tooltip reads `coverage.reasons` via `completeness.ts`, never `result.limitations`):
    // pushing `augmentation_unsupported_workspace` onto `limitations` below records it in the data
    // model, but nothing in this repo currently reads that field for display, so a user still cannot
    // see it. This is NOT the same claim the CLI can make for `framework_route_mount_unresolved`/
    // `augmentation_budget_exceeded` - the CLI's agent-facing JSON is read by an agent and the response-
    // policy engine enforces disclosure of high-severity codes; nothing analogous exists on this path
    // yet. Recording this limitation now (rather than skipping it) is still correct - it makes the fact
    // available to whatever reads `ImpactResult` next - but actually showing it to a VS Code user is
    // explicitly the UI PR's job (docs/work/task-m4-gate2-shared-adapter.md's UI to-do list), not
    // something this comment should imply is already done.
    // NOT MEASURED IN THIS ENVIRONMENT (commander's finding, recorded rather than assumed away): the
    // CLI's own latency gate (docs/work/task-m4-stage3-accuracy-latency-gates.md, "+41ms worst case
    // against 200 files") was measured as a separate OS process, against local disk, on that process's
    // own cache state. None of that transfers here - this runs inside the extension host process
    // (competing with every other extension's own work), on every graph refresh (not once per CLI
    // invocation), and if the workspace is a Remote-SSH/Container/WSL folder, every file `walkPythonFiles`
    // reads is a network round trip the CLI's own benchmark never paid. "Measured acceptable in the CLI"
    // must not be read as "measured acceptable here" - it has not been measured in this environment at
    // all. Not urgent to fix (`augmentationEnabled` defaults to false), but a real gap that must be closed
    // with an actual measurement in this environment before any default-on decision, not carried forward
    // on the CLI's numbers.
    const isLocalFileWorkspace = workspaceFolder?.uri.scheme === 'file';
    const augmentationLimitations: string[] = [];
    if (augmentationEnabled && workspaceFolder && !isLocalFileWorkspace) {
      augmentationLimitations.push('augmentation_unsupported_workspace');
    }
    const augmentedEdges = workspaceFolder && isLocalFileWorkspace
      ? (await runAugmentation(
        augmentationEnabled,
        languageId,
        workspaceFolder.uri.fsPath,
        toAdapterItem(rootItem),
        symbolKey(rootItem),
        createAdapterProvider(),
        new Set(nodes.map(node => node.id)),
        idOf,
      )).edges
      : [];

    const coverage = vscodeCoverage(
      traversal.limits,
      maxDepth,
      traversal.reachedDepth,
      maxNodes,
    );
    return {
      root: nodes[0],
      nodes,
      edges,
      truncated: traversal.truncated,
      traversalLimits: traversal.limits,
      requestedDepth: maxDepth,
      reachedDepth: traversal.reachedDepth,
      maxNodes,
      provider: vscodeProviderMetadata(languageId),
      coverage,
      // Augmentation limitations are appended, never merged into `coverage.reasons` itself - `coverage`
      // is about what the STATIC traversal could confirm (M4 stage 1's own "budget/limits leak"
      // decision, unaffected by augmentation either way); augmentation's own limitations are a separate
      // concern that happens to share this one array with it today, the same way the CLI's
      // `limitations`/`limitationDetails` carry both static and augmentation-sourced codes side by side
      // without conflating their meaning.
      limitations: [...coverage.reasons, ...augmentationLimitations],
      analyzedAt: Date.now(),
      analysisState: 'current',
      delta: EMPTY_IMPACT_DELTA,
      augmentedEdges,
    };
  }

  refreshDiagnostics(result: ImpactResult): void {
    for (const node of result.nodes) {
      node.diagnostics = diagnosticsForItem(node.item);
    }
  }
}

export function symbolKey(item: vscode.CallHierarchyItem): string {
  return createSymbolKey({
    uri: item.uri.toString(),
    kind: item.kind,
    name: item.name,
    detail: item.detail,
    line: item.selectionRange.start.line,
    character: item.selectionRange.start.character,
  });
}

function edgeKey(source: string, target: string): string {
  return `${source}\u0000${target}`;
}

function diagnosticsForItem(item: vscode.CallHierarchyItem): ImpactDiagnostic[] {
  return vscode.languages.getDiagnostics(item.uri)
    .filter(diagnostic => (
      (diagnostic.severity === vscode.DiagnosticSeverity.Error
        || diagnostic.severity === vscode.DiagnosticSeverity.Warning)
      && item.range.intersection(diagnostic.range) !== undefined
    ))
    .map(diagnostic => ({
      severity: diagnostic.severity === vscode.DiagnosticSeverity.Error ? 'error' : 'warning',
      message: diagnostic.message,
      line: diagnostic.range.start.line + 1,
    }));
}

async function findEnclosingCallable(
  document: vscode.TextDocument,
  position: vscode.Position,
): Promise<vscode.Position | undefined> {
  const symbols = await vscode.commands.executeCommand<
    Array<vscode.DocumentSymbol | vscode.SymbolInformation>
  >('vscode.executeDocumentSymbolProvider', document.uri);
  if (!symbols) {
    return undefined;
  }

  const candidates: vscode.DocumentSymbol[] = [];
  const visit = (items: readonly (vscode.DocumentSymbol | vscode.SymbolInformation)[]): void => {
    for (const item of items) {
      if ('selectionRange' in item) {
        if (
          item.range.contains(position)
          && (
            item.kind === vscode.SymbolKind.Function
            || item.kind === vscode.SymbolKind.Method
            || item.kind === vscode.SymbolKind.Constructor
          )
        ) {
          candidates.push(item);
        }
        visit(item.children);
      }
    }
  };
  visit(symbols);
  candidates.sort((left, right) => {
    const leftSpan = left.range.end.line - left.range.start.line;
    const rightSpan = right.range.end.line - right.range.start.line;
    return leftSpan - rightSpan;
  });
  return candidates[0]?.selectionRange.start;
}
