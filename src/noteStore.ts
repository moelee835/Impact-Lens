import * as vscode from 'vscode';
import {
  findImpactNote,
  formatImpactNote,
} from './noteSyntax';

export class NoteStore {
  async read(item: vscode.CallHierarchyItem): Promise<string> {
    try {
      const document = await vscode.workspace.openTextDocument(item.uri);
      return this.readFromDocument(document, item.selectionRange.start.line);
    } catch {
      return '';
    }
  }

  readFromDocument(document: vscode.TextDocument, declarationLine: number): string {
    const start = Math.max(0, declarationLine - 5);
    const lines: string[] = [];
    for (let line = start; line <= declarationLine; line += 1) {
      lines.push(document.lineAt(line).text);
    }
    return findImpactNote(lines, declarationLine - start)?.text ?? '';
  }

  async promptAndWrite(item: vscode.CallHierarchyItem): Promise<boolean> {
    const current = await this.read(item);
    const value = await vscode.window.showInputBox({
      title: `Function note: ${item.name}`,
      prompt: 'Describe the role of this function. Leave empty to remove the note.',
      value: current,
      placeHolder: 'Example: Calculates the final checkout amount including tax',
      ignoreFocusOut: true,
    });
    if (value === undefined) {
      return false;
    }
    await this.write(item, value.trim());
    return true;
  }

  async write(item: vscode.CallHierarchyItem, text: string): Promise<void> {
    const document = await vscode.workspace.openTextDocument(item.uri);
    const declarationLine = item.selectionRange.start.line;
    const start = Math.max(0, declarationLine - 5);
    const nearbyLines: string[] = [];
    for (let line = start; line <= declarationLine; line += 1) {
      nearbyLines.push(document.lineAt(line).text);
    }
    const existing = findImpactNote(nearbyLines, declarationLine - start);
    const edit = new vscode.WorkspaceEdit();

    if (existing) {
      const existingLine = start + existing.line;
      const line = document.lineAt(existingLine);
      if (text.length === 0) {
        const endLine = Math.min(existingLine + 1, document.lineCount - 1);
        const end = existingLine + 1 < document.lineCount
          ? new vscode.Position(endLine, 0)
          : line.rangeIncludingLineBreak.end;
        edit.delete(document.uri, new vscode.Range(new vscode.Position(existingLine, 0), end));
      } else {
        const indentation = line.text.match(/^\s*/)?.[0] ?? '';
        edit.replace(
          document.uri,
          line.range,
          formatImpactNote(document.languageId, text, indentation),
        );
      }
    } else if (text.length > 0) {
      const declaration = document.lineAt(declarationLine);
      const indentation = declaration.text.match(/^\s*/)?.[0] ?? '';
      edit.insert(
        document.uri,
        new vscode.Position(declarationLine, 0),
        `${formatImpactNote(document.languageId, text, indentation)}\n`,
      );
    }

    const applied = await vscode.workspace.applyEdit(edit);
    if (!applied) {
      throw new Error('VS Code could not apply the function note edit.');
    }
  }
}
