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
        const relation = classifyImpactRelation(entry.depth, entry.value.item.uri.path);
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
    const workspaceFolder = vscode.workspace.getWorkspaceFolder(rootItem.uri);
    const augmentedEdges = workspaceFolder
      ? (await runAugmentation(
        configuration.get<boolean>('augmentationEnabled', false),
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
      limitations: coverage.reasons,
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
