import * as vscode from 'vscode';
import { ImpactCodeLensProvider } from './codeLensProvider';
import { GraphPanel } from './graphPanel';
import { ImpactAnalyzer, symbolKey } from './impactAnalyzer';
import { ImpactTreeProvider } from './impactTreeProvider';
import { NoteStore } from './noteStore';
import { ImpactResult } from './types';

export class ImpactLensController implements vscode.Disposable {
  private currentResult: ImpactResult | undefined;
  private currentSymbolKey: string | undefined;
  private analysisVersion = 0;
  private selectionTimer: ReturnType<typeof setTimeout> | undefined;
  private readonly status: vscode.StatusBarItem;
  private readonly graph: GraphPanel;
  private readonly disposables: vscode.Disposable[] = [];

  constructor(
    private readonly analyzer: ImpactAnalyzer,
    private readonly notes: NoteStore,
    private readonly tree: ImpactTreeProvider,
    private readonly codeLenses: ImpactCodeLensProvider,
  ) {
    this.status = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 80);
    this.status.name = 'Impact Lens';
    this.status.command = 'impactLens.showGraph';
    this.status.text = '$(references) Impact Lens';
    this.status.tooltip = 'Analyze the impact of the function at the cursor';
    this.status.show();

    this.graph = new GraphPanel(
      async (nodeId, result) => {
        const node = result.nodes.find(candidate => candidate.id === nodeId);
        if (node) {
          await openLocation(node.item.uri, node.item.selectionRange);
        }
      },
      async result => {
        await this.editNoteForItem(result.root.item);
      },
    );

    this.disposables.push(
      this.status,
      this.graph,
      vscode.window.onDidChangeTextEditorSelection(event => this.onSelectionChanged(event)),
      vscode.workspace.onDidSaveTextDocument(document => {
        const editor = vscode.window.activeTextEditor;
        if (editor?.document.uri.toString() === document.uri.toString()) {
          void this.analyze(editor, editor.selection.active, { force: true, quiet: true });
        }
      }),
      vscode.workspace.onDidChangeConfiguration(event => {
        if (event.affectsConfiguration('impactLens.showCodeLens')) {
          this.codeLenses.refresh();
        }
        if (event.affectsConfiguration('impactLens.maxDepth') || event.affectsConfiguration('impactLens.maxNodes')) {
          void this.refresh();
        }
      }),
    );
  }

  registerCommands(context: vscode.ExtensionContext): void {
    context.subscriptions.push(
      vscode.commands.registerCommand('impactLens.showImpact', async () => {
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
          void vscode.window.showInformationMessage('Open a source file and place the cursor in a function.');
          return;
        }
        await vscode.commands.executeCommand('workbench.view.extension.impactLens');
        const result = await this.analyze(editor, editor.selection.active, { force: true, quiet: false });
        if (result) {
          this.graph.show(result);
        }
      }),
      vscode.commands.registerCommand(
        'impactLens.showImpactAt',
        async (uri: vscode.Uri, position: vscode.Position) => {
          const document = await vscode.workspace.openTextDocument(uri);
          const actualPosition = new vscode.Position(position.line, position.character);
          const editor = await vscode.window.showTextDocument(document, { preview: false, preserveFocus: true });
          editor.selection = new vscode.Selection(actualPosition, actualPosition);
          const result = await this.analyze(editor, actualPosition, { force: true, quiet: false });
          await vscode.commands.executeCommand('workbench.view.extension.impactLens');
          if (result) {
            this.graph.show(result);
          }
        },
      ),
      vscode.commands.registerCommand('impactLens.showGraph', async () => {
        const result = this.currentResult ?? await this.analyzeActiveEditor(true);
        if (result) {
          this.graph.show(result);
        }
      }),
      vscode.commands.registerCommand('impactLens.editNote', async () => {
        const item = this.currentResult?.root.item ?? await this.prepareActiveItem();
        if (!item) {
          void vscode.window.showInformationMessage('Place the cursor in a function before adding a role note.');
          return;
        }
        await this.editNoteForItem(item);
      }),
      vscode.commands.registerCommand('impactLens.refresh', async () => {
        await this.refresh();
      }),
      vscode.commands.registerCommand(
        'impactLens.openLocation',
        async (uri: vscode.Uri, range: vscode.Range) => openLocation(uri, range),
      ),
    );
  }

  start(): void {
    const editor = vscode.window.activeTextEditor;
    if (editor && autoAnalyzeEnabled(editor.document.uri)) {
      this.scheduleAnalysis(editor, editor.selection.active);
    }
  }

  private onSelectionChanged(event: vscode.TextEditorSelectionChangeEvent): void {
    if (!autoAnalyzeEnabled(event.textEditor.document.uri)) {
      return;
    }
    this.scheduleAnalysis(event.textEditor, event.selections[0]?.active ?? event.textEditor.selection.active);
  }

  private scheduleAnalysis(editor: vscode.TextEditor, position: vscode.Position): void {
    if (this.selectionTimer) {
      clearTimeout(this.selectionTimer);
    }
    this.selectionTimer = setTimeout(() => {
      this.selectionTimer = undefined;
      void this.analyze(editor, position, { force: false, quiet: true });
    }, 450);
  }

  private async analyze(
    editor: vscode.TextEditor,
    position: vscode.Position,
    options: { force: boolean; quiet: boolean },
  ): Promise<ImpactResult | undefined> {
    const version = ++this.analysisVersion;
    try {
      const rootItem = await this.analyzer.prepare(editor.document, position);
      if (version !== this.analysisVersion) {
        return undefined;
      }
      if (!rootItem) {
        if (!options.quiet) {
          void vscode.window.showInformationMessage('No call hierarchy is available at this position.');
        }
        this.currentResult = undefined;
        this.currentSymbolKey = undefined;
        this.tree.setResult(undefined);
        this.updateStatus(undefined);
        return undefined;
      }

      const key = symbolKey(rootItem);
      if (!options.force && key === this.currentSymbolKey && this.currentResult) {
        return this.currentResult;
      }

      this.tree.setLoading(rootItem.name);
      this.status.text = `$(loading~spin) Analyzing ${rootItem.name}`;
      const result = await this.analyzer.analyzeItem(rootItem);
      if (version !== this.analysisVersion) {
        return undefined;
      }

      this.currentResult = result;
      this.currentSymbolKey = key;
      this.tree.setResult(result);
      this.graph.update(result);
      this.updateStatus(result);
      return result;
    } catch (error) {
      if (version !== this.analysisVersion) {
        return undefined;
      }
      const message = error instanceof Error ? error.message : String(error);
      this.tree.setResult(undefined, `Impact analysis failed: ${message}`);
      this.status.text = '$(warning) Impact Lens';
      this.status.tooltip = message;
      if (!options.quiet) {
        void vscode.window.showErrorMessage(`Impact Lens analysis failed: ${message}`);
      }
      return undefined;
    }
  }

  private async analyzeActiveEditor(force: boolean): Promise<ImpactResult | undefined> {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      return undefined;
    }
    return this.analyze(editor, editor.selection.active, { force, quiet: false });
  }

  private async prepareActiveItem(): Promise<vscode.CallHierarchyItem | undefined> {
    const editor = vscode.window.activeTextEditor;
    return editor ? this.analyzer.prepare(editor.document, editor.selection.active) : undefined;
  }

  private async editNoteForItem(item: vscode.CallHierarchyItem): Promise<void> {
    try {
      const changed = await this.notes.promptAndWrite(item);
      if (!changed) {
        return;
      }
      this.codeLenses.refresh();
      const result = await this.analyzer.analyzeItem(item);
      this.currentResult = result;
      this.currentSymbolKey = symbolKey(item);
      this.tree.setResult(result);
      this.graph.update(result);
      this.updateStatus(result);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      void vscode.window.showErrorMessage(`Could not update function note: ${message}`);
    }
  }

  private async refresh(): Promise<void> {
    await this.analyzeActiveEditor(true);
  }

  private updateStatus(result: ImpactResult | undefined): void {
    if (!result) {
      this.status.text = '$(references) Impact Lens';
      this.status.tooltip = 'Place the cursor in a function to analyze its impact';
      return;
    }
    const direct = result.nodes.filter(node => node.relation === 'direct').length;
    const tests = result.nodes.filter(node => node.relation === 'test').length;
    const potential = Math.max(0, result.nodes.length - 1);
    this.status.text = `$(references) ${result.root.item.name}: ${direct} direct · ${potential} potential`;
    this.status.tooltip = `${tests} related test symbols${result.truncated ? ' · result truncated' : ''}`;
  }

  dispose(): void {
    if (this.selectionTimer) {
      clearTimeout(this.selectionTimer);
    }
    this.disposables.forEach(disposable => disposable.dispose());
  }
}

async function openLocation(uri: vscode.Uri, range: vscode.Range): Promise<void> {
  const document = await vscode.workspace.openTextDocument(uri);
  const editor = await vscode.window.showTextDocument(document, { preview: false });
  editor.selection = new vscode.Selection(range.start, range.end);
  editor.revealRange(range, vscode.TextEditorRevealType.InCenterIfOutsideViewport);
}

function autoAnalyzeEnabled(uri: vscode.Uri): boolean {
  return vscode.workspace
    .getConfiguration('impactLens', uri)
    .get<boolean>('autoAnalyzeOnCursorChange', true);
}
