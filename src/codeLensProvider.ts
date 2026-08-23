import * as vscode from 'vscode';
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
      const range = getSelectionRange(symbol);
      const note = this.notes.readFromDocument(document, range.start.line);
      lenses.push(new vscode.CodeLens(range, {
        command: 'impactLens.showImpactAt',
        title: note
          ? `$(note) ${truncate(note, 54)}  ·  $(references) impact`
          : '$(references) Show impact  ·  $(note) Add role note',
        arguments: [document.uri, range.start],
        tooltip: note || 'Analyze incoming calls and potential impact',
      }));
    }
    return lenses;
  }
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

function truncate(value: string, maximum: number): string {
  return value.length > maximum ? `${value.slice(0, maximum - 1)}…` : value;
}
