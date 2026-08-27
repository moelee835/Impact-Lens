import * as vscode from 'vscode';
import { ImpactCodeLensProvider } from './codeLensProvider';
import { providerLabel } from './completeness';
import { GraphPanel } from './graphPanel';
import { computeImpactDelta, EMPTY_IMPACT_DELTA } from './impactDelta';
import { ImpactAnalyzer, symbolKey } from './impactAnalyzer';
import { ImpactTreeProvider } from './impactTreeProvider';
import { formatProviderDoctorReport, ProviderDoctorFacts } from './providerDoctor';
import { NoteStore } from './noteStore';
import { matchesPendingNavigation, PendingNavigation } from './navigationGuard';
import { ImpactResult } from './types';

export class ImpactLensController implements vscode.Disposable {
  private currentResult: ImpactResult | undefined;
  private currentSymbolKey: string | undefined;
  private analysisVersion = 0;
  private selectionTimer: ReturnType<typeof setTimeout> | undefined;
  private liveAnalysisTimer: ReturnType<typeof setTimeout> | undefined;
  private noteRefreshTimer: ReturnType<typeof setTimeout> | undefined;
  private readonly changedSymbolKeys = new Set<string>();
  private readonly reviewedByRoot = new Map<string, Set<string>>();
  private readonly baselineByRoot = new Map<string, ImpactResult>();
  private readonly rootHistory: vscode.CallHierarchyItem[] = [];
  private pendingGraphNavigation: PendingNavigation | undefined;
  private navigationExpiryTimer: ReturnType<typeof setTimeout> | undefined;
  private ignoreNextDepthConfigurationChange = false;
  private readonly pendingChangeIdentification = new Set<Promise<void>>();
  private lastChangeAt: number | undefined;
  private analyzedDocumentVersion: number | undefined;
  private readonly status: vscode.StatusBarItem;
  private readonly graph: GraphPanel;
  private doctorOutput: vscode.OutputChannel | undefined;
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
          this.pendingGraphNavigation = {
            uri: node.item.uri.toString(),
            range: node.item.selectionRange,
          };
          if (this.navigationExpiryTimer) {
            clearTimeout(this.navigationExpiryTimer);
          }
          this.navigationExpiryTimer = setTimeout(() => {
            this.pendingGraphNavigation = undefined;
            this.navigationExpiryTimer = undefined;
          }, 1500);
          await openLocation(node.item.uri, node.item.selectionRange);
        }
      },
      async result => {
        await this.editNoteForItem(result.root.item);
      },
      async (nodeId, result) => {
        const reviewed = this.reviewedForRoot(result.root.id);
        if (reviewed.has(nodeId)) {
          reviewed.delete(nodeId);
        } else {
          reviewed.add(nodeId);
        }
        const node = result.nodes.find(candidate => candidate.id === nodeId);
        if (node) {
          node.reviewed = reviewed.has(nodeId);
        }
        this.tree.setResult(result);
        this.graph.update(result);
      },
      () => this.clearLiveChanges(),
      async (nodeId, result) => this.setGraphRoot(nodeId, result),
      async () => this.restorePreviousRoot(),
      async depth => this.setAnalysisDepth(depth),
      () => this.rootHistory.length > 0,
    );

    this.disposables.push(
      this.status,
      this.graph,
      vscode.window.onDidChangeTextEditorSelection(event => this.onSelectionChanged(event)),
      vscode.workspace.onDidChangeTextDocument(event => this.onDocumentChanged(event)),
      vscode.workspace.onDidSaveTextDocument(document => {
        if (this.currentResult) {
          void this.analyzePreparedItem(this.currentResult.root.item, true);
          return;
        }
        const editor = vscode.window.activeTextEditor;
        if (editor?.document.uri.toString() === document.uri.toString()) {
          void this.analyze(editor, editor.selection.active, { force: true, quiet: true });
        }
      }),
      vscode.languages.onDidChangeDiagnostics(event => this.onDiagnosticsChanged(event)),
      vscode.workspace.onDidChangeConfiguration(event => {
        if (event.affectsConfiguration('impactLens.showCodeLens')) {
          this.codeLenses.refresh();
        }
        if (event.affectsConfiguration('impactLens.maxDepth') || event.affectsConfiguration('impactLens.maxNodes')) {
          if (this.ignoreNextDepthConfigurationChange && event.affectsConfiguration('impactLens.maxDepth')) {
            this.ignoreNextDepthConfigurationChange = false;
          } else {
            void this.refreshCurrentRoot();
          }
        }
      }),
      this.notes.onDidChangeNotes(() => {
        this.codeLenses.refresh();
        if (this.noteRefreshTimer) {
          clearTimeout(this.noteRefreshTimer);
        }
        this.noteRefreshTimer = setTimeout(() => {
          this.noteRefreshTimer = undefined;
          void this.refreshNotePresentation();
        }, 100);
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
          void vscode.window.showInformationMessage('Place the cursor in a function before managing its role note.');
          return;
        }
        await this.editNoteForItem(item);
      }),
      vscode.commands.registerCommand('impactLens.refresh', async () => {
        await this.refresh();
      }),
      vscode.commands.registerCommand('impactLens.clearLiveChanges', () => {
        this.clearLiveChanges();
      }),
      vscode.commands.registerCommand(
        'impactLens.openLocation',
        async (uri: vscode.Uri, range: vscode.Range) => openLocation(uri, range),
      ),
      vscode.commands.registerCommand('impactLens.runProviderDoctor', async () => {
        await this.runProviderDoctor();
      }),
    );
  }

  start(): void {
    const editor = vscode.window.activeTextEditor;
    if (editor && autoAnalyzeEnabled(editor.document.uri)) {
      this.scheduleAnalysis(editor, editor.selection.active);
    }
  }

  private onSelectionChanged(event: vscode.TextEditorSelectionChangeEvent): void {
    const selection = event.selections[0] ?? event.textEditor.selection;
    if (
      this.pendingGraphNavigation
      && matchesPendingNavigation(
        this.pendingGraphNavigation,
        event.textEditor.document.uri.toString(),
        selection,
      )
    ) {
      this.pendingGraphNavigation = undefined;
      if (this.navigationExpiryTimer) {
        clearTimeout(this.navigationExpiryTimer);
        this.navigationExpiryTimer = undefined;
      }
      if (this.selectionTimer) {
        clearTimeout(this.selectionTimer);
        this.selectionTimer = undefined;
      }
      return;
    }
    if (!autoAnalyzeEnabled(event.textEditor.document.uri)) {
      return;
    }
    this.scheduleAnalysis(event.textEditor, selection.active);
  }

  private scheduleAnalysis(editor: vscode.TextEditor, position: vscode.Position): void {
    if (this.liveAnalysisTimer) {
      return;
    }
    if (this.selectionTimer) {
      clearTimeout(this.selectionTimer);
    }
    this.selectionTimer = setTimeout(() => {
      this.selectionTimer = undefined;
      void this.analyze(editor, position, { force: false, quiet: true });
    }, 450);
  }

  private onDocumentChanged(event: vscode.TextDocumentChangeEvent): void {
    if (
      event.contentChanges.length === 0
      || !liveAnalysisEnabled(event.document.uri)
      || event.document.uri.scheme !== 'file'
      || event.document.uri.path.endsWith('/.impact-lens/notes.json')
    ) {
      return;
    }

    this.analysisVersion += 1;
    this.lastChangeAt = Date.now();
    const current = this.currentResult;
    if (current) {
      if (!this.baselineByRoot.has(current.root.id)) {
        this.baselineByRoot.set(current.root.id, cloneResult(current));
      }
      current.analysisState = 'stale';
      current.changedAt = this.lastChangeAt;
      for (const node of current.nodes) {
        if (node.relation === 'test') {
          node.testFreshness = 'outdated';
        }
      }
      this.tree.setResult(current);
      this.graph.update(current);
      this.updateStatus(current);
    }

    const positions = event.contentChanges.map(change => change.range.start);
    const identification = this.identifyChangedFunctions(event.document, positions);
    this.pendingChangeIdentification.add(identification);
    void identification.finally(() => this.pendingChangeIdentification.delete(identification));
    this.scheduleLiveAnalysis(event.document);
  }

  private async identifyChangedFunctions(
    document: vscode.TextDocument,
    positions: readonly vscode.Position[],
  ): Promise<void> {
    let identified = false;
    for (const position of positions) {
      const item = await this.analyzer.prepare(document, position);
      if (item) {
        this.changedSymbolKeys.add(symbolKey(item));
        identified = true;
      }
    }
    const current = this.currentResult;
    if (
      current
      && current.root.item.uri.toString() === document.uri.toString()
      && !identified
    ) {
      this.changedSymbolKeys.add(current.root.id);
    }
  }

  private scheduleLiveAnalysis(document: vscode.TextDocument): void {
    if (this.liveAnalysisTimer) {
      clearTimeout(this.liveAnalysisTimer);
    }
    const delay = vscode.workspace
      .getConfiguration('impactLens', document.uri)
      .get<number>('liveAnalysisDebounceMs', 600);
    this.liveAnalysisTimer = setTimeout(() => {
      this.liveAnalysisTimer = undefined;
      void this.runLiveAnalysis(document);
    }, delay);
  }

  private async runLiveAnalysis(document: vscode.TextDocument): Promise<void> {
    await Promise.all([...this.pendingChangeIdentification]);
    const current = this.currentResult;
    if (current) {
      await this.analyzePreparedItem(current.root.item, true);
      return;
    }
    const editor = vscode.window.activeTextEditor;
    if (editor?.document.uri.toString() === document.uri.toString()) {
      await this.analyze(editor, editor.selection.active, { force: true, quiet: true });
    }
  }

  private onDiagnosticsChanged(event: vscode.DiagnosticChangeEvent): void {
    const result = this.currentResult;
    if (!result) {
      return;
    }
    const affected = new Set(event.uris.map(uri => uri.toString()));
    if (!result.nodes.some(node => affected.has(node.item.uri.toString()))) {
      return;
    }
    this.analyzer.refreshDiagnostics(result);
    const baseline = this.baselineByRoot.get(result.root.id);
    result.delta = computeImpactDelta(baseline, result);
    this.tree.setResult(result);
    this.graph.update(result);
    this.updateStatus(result);
  }

  private async analyze(
    editor: vscode.TextEditor,
    position: vscode.Position,
    options: { force: boolean; quiet: boolean },
  ): Promise<ImpactResult | undefined> {
    const version = ++this.analysisVersion;
    const documentVersion = editor.document.version;
    try {
      const rootItem = await this.analyzer.prepare(editor.document, position);
      if (version !== this.analysisVersion) {
        return undefined;
      }
      if (!rootItem) {
        const unavailableMessage = 'No Call Hierarchy root was returned. Verify that this language has a Call Hierarchy provider and that the cursor is on a callable declaration.';
        if (!options.quiet) {
          void vscode.window.showInformationMessage(unavailableMessage);
        }
        this.currentResult = undefined;
        this.currentSymbolKey = undefined;
        this.tree.setResult(undefined, unavailableMessage);
        this.updateStatus(undefined);
        return undefined;
      }

      const key = symbolKey(rootItem);
      if (
        !options.force
        && key === this.currentSymbolKey
        && this.currentResult
        && this.analyzedDocumentVersion === documentVersion
      ) {
        return this.currentResult;
      }

      if (this.currentResult?.root.id === key) {
        this.currentResult.analysisState = 'analyzing';
        this.tree.setResult(this.currentResult);
        this.graph.update(this.currentResult);
      } else {
        this.tree.setLoading(rootItem.name);
      }
      this.status.text = `$(loading~spin) Analyzing ${rootItem.name}`;
      const result = await this.analyzer.analyzeItem(rootItem);
      if (version !== this.analysisVersion || editor.document.version !== documentVersion) {
        if (editor.document.version !== documentVersion) {
          this.scheduleLiveAnalysis(editor.document);
        }
        return undefined;
      }

      this.applyLiveMetadata(result);
      this.currentResult = result;
      this.currentSymbolKey = key;
      this.analyzedDocumentVersion = documentVersion;
      this.tree.setResult(result);
      this.graph.update(result);
      this.updateStatus(result);
      return result;
    } catch (error) {
      if (version !== this.analysisVersion) {
        return undefined;
      }
      const message = error instanceof Error ? error.message : String(error);
      if (this.currentResult) {
        this.currentResult.analysisState = 'failed';
        this.tree.setResult(this.currentResult);
        this.graph.update(this.currentResult);
      } else {
        this.tree.setResult(undefined, `Impact analysis failed: ${message}`);
      }
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

  private async analyzePreparedItem(
    item: vscode.CallHierarchyItem,
    quiet: boolean,
  ): Promise<ImpactResult | undefined> {
    const version = ++this.analysisVersion;
    try {
      if (this.currentResult) {
        this.currentResult.analysisState = 'analyzing';
        this.tree.setResult(this.currentResult);
        this.graph.update(this.currentResult);
        this.updateStatus(this.currentResult);
      }
      const result = await this.analyzer.analyzeItem(item);
      if (version !== this.analysisVersion) {
        return undefined;
      }
      this.applyLiveMetadata(result);
      this.currentResult = result;
      this.currentSymbolKey = symbolKey(item);
      this.tree.setResult(result);
      this.graph.update(result);
      this.updateStatus(result);
      return result;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (this.currentResult) {
        this.currentResult.analysisState = 'failed';
        this.tree.setResult(this.currentResult);
        this.graph.update(this.currentResult);
        this.updateStatus(this.currentResult);
      }
      if (!quiet) {
        void vscode.window.showErrorMessage(`Impact Lens analysis failed: ${message}`);
      }
      return undefined;
    }
  }

  private async prepareActiveItem(): Promise<vscode.CallHierarchyItem | undefined> {
    const editor = vscode.window.activeTextEditor;
    return editor ? this.analyzer.prepare(editor.document, editor.selection.active) : undefined;
  }

  private async editNoteForItem(item: vscode.CallHierarchyItem): Promise<void> {
    try {
      const changed = await this.notes.promptAndManage(item);
      if (!changed) {
        return;
      }
      if (this.noteRefreshTimer) {
        clearTimeout(this.noteRefreshTimer);
        this.noteRefreshTimer = undefined;
      }
      this.codeLenses.refresh();
      await this.refreshNotePresentation();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      void vscode.window.showErrorMessage(`Could not update function note: ${message}`);
    }
  }

  private async refresh(): Promise<void> {
    await this.refreshCurrentRoot();
  }

  private async refreshCurrentRoot(): Promise<void> {
    if (this.currentResult) {
      await this.analyzePreparedItem(this.currentResult.root.item, false);
      return;
    }
    await this.analyzeActiveEditor(true);
  }

  private reviewedForRoot(rootId: string): Set<string> {
    let reviewed = this.reviewedByRoot.get(rootId);
    if (!reviewed) {
      reviewed = new Set<string>();
      this.reviewedByRoot.set(rootId, reviewed);
    }
    return reviewed;
  }

  private async setGraphRoot(nodeId: string, result: ImpactResult): Promise<void> {
    const node = result.nodes.find(candidate => candidate.id === nodeId);
    if (!node || node.id === result.root.id) {
      return;
    }
    this.rootHistory.push(result.root.item);
    await this.analyzePreparedItem(node.item, false);
  }

  private async restorePreviousRoot(): Promise<void> {
    const previous = this.rootHistory.pop();
    if (previous) {
      await this.analyzePreparedItem(previous, false);
    }
  }

  private async setAnalysisDepth(depth: number): Promise<void> {
    const normalized = Math.max(1, Math.min(20, Math.round(depth)));
    const current = vscode.workspace.getConfiguration('impactLens').get<number>('maxDepth', 5);
    if (current === normalized) {
      return;
    }
    this.ignoreNextDepthConfigurationChange = true;
    await vscode.workspace.getConfiguration('impactLens').update(
      'maxDepth',
      normalized,
      vscode.ConfigurationTarget.Workspace,
    );
    await this.refreshCurrentRoot();
  }

  private applyLiveMetadata(result: ImpactResult): void {
    const reviewed = this.reviewedForRoot(result.root.id);
    for (const node of result.nodes) {
      node.changed = this.changedSymbolKeys.has(node.id);
      node.reviewed = reviewed.has(node.id);
      if (node.relation === 'test' && this.lastChangeAt) {
        node.testFreshness = 'outdated';
      }
    }
    result.analysisState = result.truncated ? 'partial' : 'current';
    result.changedAt = this.lastChangeAt;
    result.delta = computeImpactDelta(this.baselineByRoot.get(result.root.id), result);
  }

  private clearLiveChanges(): void {
    this.changedSymbolKeys.clear();
    this.reviewedByRoot.clear();
    this.baselineByRoot.clear();
    this.lastChangeAt = undefined;
    const result = this.currentResult;
    if (!result) {
      return;
    }
    result.delta = EMPTY_IMPACT_DELTA;
    result.changedAt = undefined;
    result.analysisState = result.truncated ? 'partial' : 'current';
    for (const node of result.nodes) {
      node.changed = false;
      node.reviewed = false;
      if (node.relation === 'test') {
        node.testFreshness = 'notRun';
      }
    }
    this.tree.setResult(result);
    this.graph.update(result);
    this.updateStatus(result);
  }

  private async refreshNotePresentation(): Promise<void> {
    const result = this.currentResult;
    if (!result) {
      return;
    }
    await Promise.all(result.nodes.map(async node => {
      const note = await this.notes.resolve(node.item);
      node.note = note.text;
      node.noteSource = note.source;
    }));
    this.tree.setResult(result);
    this.graph.update(result);
  }

  /**
   * Reports what this host can observe about the analysis provider, and offers - but never performs on its
   * own - the Agent CLI check the user configured.
   *
   * Two rules shape this method. Impact Lens does not run build, configure or sync steps without approval,
   * so the configured command line only reaches a terminal after an explicit pick. And it must not couple
   * to the CLI's doctor output, so the command line is passed through verbatim and its output is never
   * read back.
   */
  private async runProviderDoctor(): Promise<void> {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      void vscode.window.showInformationMessage(
        'Open a source file and place the cursor in a function before running the provider doctor.',
      );
      return;
    }

    const position = editor.selection.active;
    const document = editor.document;
    const doctorCommandLine = vscode.workspace
      .getConfiguration('impactLens', document.uri)
      .get<string>('provider.doctorCommandLine', '')
      .trim();

    const [rootItem, symbols] = await Promise.all([
      this.analyzer.prepare(document, position),
      vscode.commands.executeCommand<Array<vscode.DocumentSymbol | vscode.SymbolInformation>>(
        'vscode.executeDocumentSymbolProvider',
        document.uri,
      ),
    ]);

    const last = this.currentResult;
    const facts: ProviderDoctorFacts = {
      languageId: document.languageId,
      fileName: vscode.workspace.asRelativePath(document.uri, false),
      callHierarchyRootFound: rootItem !== undefined,
      documentSymbolsFound: (symbols?.length ?? 0) > 0,
      lastAnalysis: last
        ? {
          provider: providerLabel(last.provider),
          traversalStatus: last.coverage.traversal.status,
          semanticStatus: last.coverage.semantic.status,
          indexingStatus: last.coverage.indexing.status,
          callerCount: Math.max(0, last.nodes.length - 1),
          reasons: last.coverage.reasons,
        }
        : undefined,
      doctorCommandLine,
    };

    if (!this.doctorOutput) {
      this.doctorOutput = vscode.window.createOutputChannel('Impact Lens Provider Doctor');
      this.disposables.push(this.doctorOutput);
    }
    this.doctorOutput.clear();
    this.doctorOutput.appendLine(formatProviderDoctorReport(facts).join('\n'));
    this.doctorOutput.show(true);

    if (!doctorCommandLine) {
      return;
    }
    const run = 'Run in terminal';
    const choice = await vscode.window.showInformationMessage(
      `Run the configured Agent CLI check? ${doctorCommandLine}`,
      { modal: false },
      run,
    );
    if (choice !== run) {
      return;
    }
    const terminal = vscode.window.createTerminal({ name: 'Impact Lens provider doctor' });
    terminal.show(true);
    terminal.sendText(doctorCommandLine, true);
  }

  private updateStatus(result: ImpactResult | undefined): void {
    if (!result) {
      this.status.text = '$(references) Impact Lens';
      this.status.tooltip = 'Place the cursor in a function to analyze its impact';
      return;
    }
    if (result.analysisState === 'stale') {
      this.status.text = `$(edit) ${result.root.item.name}: changes pending`;
      this.status.tooltip = 'The graph is stale and will update after you pause typing';
      return;
    }
    if (result.analysisState === 'analyzing') {
      this.status.text = `$(loading~spin) ${result.root.item.name}: updating impact`;
      this.status.tooltip = 'Impact Lens is asking the language service for an updated call hierarchy';
      return;
    }
    if (result.analysisState === 'failed') {
      this.status.text = `$(warning) ${result.root.item.name}: analysis failed`;
      this.status.tooltip = 'The previous graph is retained but is not current';
      return;
    }
    const direct = result.nodes.filter(node => node.relation === 'direct').length;
    const tests = result.nodes.filter(node => node.relation === 'test').length;
    const diagnostics = result.nodes.reduce((sum, node) => sum + node.diagnostics.length, 0);
    const outdatedTests = result.nodes.filter(node => node.testFreshness === 'outdated').length;
    const potential = Math.max(0, result.nodes.length - 1);
    this.status.text = `$(references) ${result.root.item.name}: ${potential} affected${diagnostics ? ` · ${diagnostics} issues` : ''}`;
    this.status.tooltip = [
      `${direct} direct callers`,
      `${tests} related test symbols`,
      outdatedTests ? `${outdatedTests} test verifications required` : '',
      result.delta.addedNodeIds.length ? `${result.delta.addedNodeIds.length} newly affected` : '',
      `reached depth ${result.reachedDepth} of ${result.requestedDepth}`,
      result.traversalLimits.includes('depth') ? 'depth limit reached' : '',
      result.traversalLimits.includes('nodes') ? 'node limit reached' : '',
      `static Call Hierarchy via ${result.provider.host}/${result.provider.name}`,
      `language ${result.provider.detectedLanguageId}`,
      `indexing ${result.coverage.indexing.status}`,
      'dynamic and framework calls may be missing',
    ].filter(Boolean).join(' · ');
  }

  dispose(): void {
    if (this.selectionTimer) {
      clearTimeout(this.selectionTimer);
    }
    if (this.noteRefreshTimer) {
      clearTimeout(this.noteRefreshTimer);
    }
    if (this.liveAnalysisTimer) {
      clearTimeout(this.liveAnalysisTimer);
    }
    if (this.navigationExpiryTimer) {
      clearTimeout(this.navigationExpiryTimer);
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

function liveAnalysisEnabled(uri: vscode.Uri): boolean {
  return vscode.workspace
    .getConfiguration('impactLens', uri)
    .get<boolean>('liveAnalysisEnabled', true);
}

function cloneResult(result: ImpactResult): ImpactResult {
  const nodes = result.nodes.map(node => ({
    ...node,
    diagnostics: node.diagnostics.map(diagnostic => ({ ...diagnostic })),
  }));
  return {
    ...result,
    root: nodes.find(node => node.id === result.root.id) ?? nodes[0]!,
    nodes,
    edges: result.edges.map(edge => ({
      ...edge,
      callSiteRanges: [...edge.callSiteRanges],
    })),
    delta: {
      ...result.delta,
      addedNodeIds: [...result.delta.addedNodeIds],
      removedNodeIds: [...result.delta.removedNodeIds],
    },
  };
}
