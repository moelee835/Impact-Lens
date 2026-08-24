import * as vscode from 'vscode';
import { traverseIncoming } from './callGraph';
import { EMPTY_IMPACT_DELTA } from './impactDelta';
import { NoteStore } from './noteStore';
import { createSymbolKey } from './symbolIdentity';
import { classifyImpactRelation } from './testFile';
import { ImpactDiagnostic, ImpactEdge, ImpactNode, ImpactResult } from './types';

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

    return {
      root: nodes[0],
      nodes,
      edges,
      truncated: traversal.truncated,
      traversalLimits: traversal.limits,
      requestedDepth: maxDepth,
      reachedDepth: traversal.reachedDepth,
      analyzedAt: Date.now(),
      analysisState: 'current',
      delta: EMPTY_IMPACT_DELTA,
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
