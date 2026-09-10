import * as vscode from 'vscode';
import { ImpactCodeLensProvider } from './codeLensProvider';
import { ImpactLensController } from './controller';
import { ImpactAnalyzer } from './impactAnalyzer';
import { ImpactTreeProvider } from './impactTreeProvider';
import { NoteStore } from './noteStore';
import { TestPatternsStore } from './testPatternsStore';

export function activate(context: vscode.ExtensionContext): void {
  const notes = new NoteStore(context);
  const testPatterns = new TestPatternsStore();
  const analyzer = new ImpactAnalyzer(notes, testPatterns);
  const tree = new ImpactTreeProvider();
  const codeLenses = new ImpactCodeLensProvider(notes);
  const controller = new ImpactLensController(analyzer, notes, tree, codeLenses);

  context.subscriptions.push(
    vscode.window.registerTreeDataProvider('impactLens.explorer', tree),
    vscode.languages.registerCodeLensProvider({ scheme: 'file' }, codeLenses),
    notes,
    testPatterns,
    controller,
  );

  controller.registerCommands(context);
  controller.start();
}

export function deactivate(): void {}
