import * as vscode from 'vscode';
import { STATIC_SCOPE_NOTICE } from './completeness';
import { findDeclarationAnchorWithLineAt } from './declarationAnchor';
import { NoteStore } from './noteStore';

const supportedKinds = new Set([
  vscode.SymbolKind.Function,
  vscode.SymbolKind.Method,
  vscode.SymbolKind.Constructor,
]);

export class ImpactCodeLensProvider implements vscode.CodeLensProvider {
  private readonly changeEmitter = new vscode.EventEmitter<void>();
  readonly onDidChangeCodeLenses = this.changeEmitter.event;

  constructor(private readonly notes: NoteStore) {}

  refresh(): void {
    this.changeEmitter.fire();
  }

  async provideCodeLenses(
    document: vscode.TextDocument,
    token: vscode.CancellationToken,
  ): Promise<vscode.CodeLens[]> {
    const enabled = vscode.workspace
      .getConfiguration('impactLens', document.uri)
      .get<boolean>('showCodeLens', true);
    if (!enabled || token.isCancellationRequested) {
      return [];
    }

    const symbols = await vscode.commands.executeCommand<
      Array<vscode.DocumentSymbol | vscode.SymbolInformation>
    >('vscode.executeDocumentSymbolProvider', document.uri);
    if (!symbols || token.isCancellationRequested) {
      return [];
    }

    const lenses: vscode.CodeLens[] = [];
    for (const symbol of flattenSymbols(symbols)) {
      if (!supportedKinds.has(symbol.kind)) {
        continue;
      }
      const providerRange = getSelectionRange(symbol);
      const symbolRange = getSymbolRange(symbol);
      const anchor = findDeclarationAnchorWithLineAt(
        line => document.lineAt(line).text,
        document.lineCount,
        {
          name: symbol.name,
          symbolRange,
          providerSelection: providerRange,
        },
      );
      const position = new vscode.Position(anchor.line, anchor.character);
      const range = new vscode.Range(position, position);
      const resolved = await this.notes.resolveForSymbol(
        document,
        symbol.name,
        symbol.kind,
        getDetail(symbol),
        range.start,
      );
      const note = resolved.text;
      lenses.push(new vscode.CodeLens(range, {
        command: 'impactLens.showImpactAt',
        title: note
          ? `$(note) ${truncate(note, 54)}  ·  $(references) impact`
          : '$(references) Show impact  ·  $(note) Add role note',
        arguments: [document.uri, range.start],
        // The title stays as it was. A code lens renders on every function in the file, so it is the one
        // surface where per-result state would be noise rather than information; the provider state it
        // could show is also not available here, because this provider never sees an analysis result.
        // What does belong is the boundary that holds for every result, which is why it sits in the
        // tooltip rather than in the lens itself.
        tooltip: [note, 'Analyze incoming calls and potential impact.', STATIC_SCOPE_NOTICE]
          .filter(Boolean)
          .join('\n\n'),
      }));
    }
    return lenses;
  }
}

function getDetail(
  symbol: vscode.DocumentSymbol | vscode.SymbolInformation,
): string {
  return 'selectionRange' in symbol ? symbol.detail : symbol.containerName;
}

function flattenSymbols(
  symbols: readonly (vscode.DocumentSymbol | vscode.SymbolInformation)[],
): Array<vscode.DocumentSymbol | vscode.SymbolInformation> {
  const result: Array<vscode.DocumentSymbol | vscode.SymbolInformation> = [];
  for (const symbol of symbols) {
    result.push(symbol);
    if ('children' in symbol) {
      result.push(...flattenSymbols(symbol.children));
    }
  }
  return result;
}

function getSelectionRange(
  symbol: vscode.DocumentSymbol | vscode.SymbolInformation,
): vscode.Range {
  return 'selectionRange' in symbol ? symbol.selectionRange : symbol.location.range;
}

function getSymbolRange(
  symbol: vscode.DocumentSymbol | vscode.SymbolInformation,
): vscode.Range {
  return 'selectionRange' in symbol ? symbol.range : symbol.location.range;
}

function truncate(value: string, maximum: number): string {
  return value.length > maximum ? `${value.slice(0, maximum - 1)}…` : value;
}
