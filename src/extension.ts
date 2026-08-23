import * as vscode from 'vscode';
import { ImpactCodeLensProvider } from './codeLensProvider';
import { ImpactLensController } from './controller';
import { ImpactAnalyzer } from './impactAnalyzer';
import { ImpactTreeProvider } from './impactTreeProvider';
import { NoteStore } from './noteStore';

export function activate(context: vscode.ExtensionContext): void {
  const notes = new NoteStore();
  const analyzer = new ImpactAnalyzer(notes);
  const tree = new ImpactTreeProvider();
  const codeLenses = new ImpactCodeLensProvider(notes);
  const controller = new ImpactLensController(analyzer, notes, tree, codeLenses);

  context.subscriptions.push(
    vscode.window.registerTreeDataProvider('impactLens.explorer', tree),
    vscode.languages.registerCodeLensProvider({ scheme: 'file' }, codeLenses),
    controller,
  );

  controller.registerCommands(context);
  controller.start();
}

export function deactivate(): void {}
