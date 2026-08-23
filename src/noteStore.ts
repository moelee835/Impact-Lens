import * as path from 'node:path';
import * as vscode from 'vscode';
import {
  findStoredNote,
  NoteIdentity,
  NoteSource,
  removeStoredNote,
  ResolvedFunctionNote,
  resolveNote,
  SharedNoteDocument,
  StoredNote,
  upsertStoredNote,
} from './noteModel';
import {
  findImpactNote,
  formatImpactNote,
} from './noteSyntax';

const PERSONAL_NOTES_KEY = 'impactLens.personalNotes.v1';
const SHARED_NOTE_DIRECTORY = '.impact-lens';
const SHARED_NOTE_FILE = 'notes.json';

interface SharedCacheEntry {
  readonly notes: readonly StoredNote[];
  readonly error?: string;
}

interface NoteAction extends vscode.QuickPickItem {
  readonly id: 'personal' | 'shared' | 'sourceComment' | 'publish' | 'revertPersonal';
}

export class NoteStore implements vscode.Disposable {
  private readonly changeEmitter = new vscode.EventEmitter<void>();
  readonly onDidChangeNotes = this.changeEmitter.event;
  private readonly sharedCache = new Map<string, SharedCacheEntry>();
  private readonly watcher: vscode.FileSystemWatcher;

  constructor(private readonly context: vscode.ExtensionContext) {
    this.watcher = vscode.workspace.createFileSystemWatcher('**/.impact-lens/notes.json');
    const invalidate = (): void => {
      this.sharedCache.clear();
      this.changeEmitter.fire();
    };
    this.watcher.onDidCreate(invalidate);
    this.watcher.onDidChange(invalidate);
    this.watcher.onDidDelete(invalidate);
  }

  async read(item: vscode.CallHierarchyItem): Promise<string> {
    return (await this.resolve(item)).text;
  }

  async resolve(item: vscode.CallHierarchyItem): Promise<ResolvedFunctionNote> {
    const document = await vscode.workspace.openTextDocument(item.uri);
    return this.resolveAt(
      document,
      item.name,
      item.kind,
      item.detail ?? '',
      item.selectionRange.start,
    );
  }

  async resolveForSymbol(
    document: vscode.TextDocument,
    name: string,
    kind: vscode.SymbolKind,
    detail: string,
    position: vscode.Position,
  ): Promise<ResolvedFunctionNote> {
    return this.resolveAt(document, name, kind, detail, position);
  }

  readFromDocument(document: vscode.TextDocument, declarationLine: number): string {
    const start = Math.max(0, declarationLine - 5);
    const lines: string[] = [];
    for (let line = start; line <= declarationLine; line += 1) {
      lines.push(document.lineAt(line).text);
    }
    return findImpactNote(lines, declarationLine - start)?.text ?? '';
  }

  async promptAndManage(item: vscode.CallHierarchyItem): Promise<boolean> {
    const resolved = await this.resolve(item);
    const defaultSource = vscode.workspace
      .getConfiguration('impactLens', item.uri)
      .get<NoteSource>('defaultNoteStorage', 'personal');
    const actions = this.actionsFor(resolved, defaultSource);
    const action = await vscode.window.showQuickPick(actions, {
      title: `Function note: ${item.name}`,
      placeHolder: 'Choose where this function note is stored',
      ignoreFocusOut: true,
    });
    if (!action) {
      return false;
    }

    if (action.id === 'publish') {
      return this.publishToShared(item, resolved);
    }
    if (action.id === 'revertPersonal') {
      await this.writeStored(item, 'personal', '');
      return true;
    }

    const source = action.id;
    const current = resolved[source] ?? resolved.text;
    const value = await vscode.window.showInputBox({
      title: `${sourceLabel(source)} note: ${item.name}`,
      prompt: `Stored in ${sourceDescription(source)}. Leave empty to remove this note.`,
      value: current,
      placeHolder: 'Example: Calculates the final checkout amount including tax',
      ignoreFocusOut: true,
    });
    if (value === undefined) {
      return false;
    }

    if (source === 'sourceComment') {
      await this.writeSourceComment(item, value.trim());
    } else {
      await this.writeStored(item, source, value.trim());
    }
    return true;
  }

  private async resolveAt(
    document: vscode.TextDocument,
    name: string,
    kind: vscode.SymbolKind,
    detail: string,
    position: vscode.Position,
  ): Promise<ResolvedFunctionNote> {
    const identity = this.identity(document.uri, name, kind, detail, position);
    const personal = findStoredNote(this.personalNotes(), identity)?.text;
    const folder = vscode.workspace.getWorkspaceFolder(document.uri);
    const sharedIdentity = { ...identity, workspace: '' };
    const sharedNotes = folder ? (await this.loadShared(folder)).notes : [];
    const shared = findStoredNote(sharedNotes, sharedIdentity)?.text;
    const sourceComment = this.readFromDocument(document, position.line) || undefined;
    return resolveNote({ personal, shared, sourceComment });
  }

  private actionsFor(
    note: ResolvedFunctionNote,
    defaultSource: NoteSource,
  ): NoteAction[] {
    const actions: NoteAction[] = [
      {
        id: 'personal',
        label: note.personal ? '$(person) Edit personal note' : '$(person-add) Add personal override',
        description: defaultSource === 'personal' ? 'Default' : undefined,
        detail: 'Visible only in this VS Code workspace',
      },
      {
        id: 'shared',
        label: note.shared ? '$(organization) Edit shared note' : '$(organization) Add shared note',
        description: defaultSource === 'shared' ? 'Default' : undefined,
        detail: `Stored in ${SHARED_NOTE_DIRECTORY}/${SHARED_NOTE_FILE} for version control`,
      },
      {
        id: 'sourceComment',
        label: note.sourceComment ? '$(code) Edit source comment' : '$(code) Add source comment',
        description: defaultSource === 'sourceComment' ? 'Default' : undefined,
        detail: 'Uses the existing @impact-note comment format',
      },
    ];

    if (note.text && note.source !== 'shared') {
      actions.push({
        id: 'publish',
        label: '$(cloud-upload) Publish current note to shared',
        description: note.shared ? 'Replace shared note' : undefined,
        detail: note.source === 'personal'
          ? 'Moves the personal note into the shared project file'
          : 'Copies the source-comment note into the shared project file',
      });
    }
    if (note.personal) {
      actions.push({
        id: 'revertPersonal',
        label: '$(discard) Revert personal override',
        detail: note.shared
          ? 'Remove the personal note and show the shared note'
          : 'Remove the personal note and fall back to the source comment',
      });
    }

    return actions.sort((left, right) => {
      const leftDefault = left.id === defaultSource ? 0 : 1;
      const rightDefault = right.id === defaultSource ? 0 : 1;
      return leftDefault - rightDefault;
    });
  }

  private async publishToShared(
    item: vscode.CallHierarchyItem,
    resolved: ResolvedFunctionNote,
  ): Promise<boolean> {
    if (!resolved.text) {
      return false;
    }
    if (resolved.shared && resolved.shared !== resolved.text) {
      const confirmation = await vscode.window.showWarningMessage(
        'Publishing will replace the existing shared note.',
        { modal: true },
        'Publish',
      );
      if (confirmation !== 'Publish') {
        return false;
      }
    }
    await this.writeStored(item, 'shared', resolved.text);
    if (resolved.source === 'personal') {
      await this.writeStored(item, 'personal', '');
    }
    return true;
  }

  private async writeStored(
    item: vscode.CallHierarchyItem,
    source: 'personal' | 'shared',
    text: string,
  ): Promise<void> {
    const identity = this.identity(
      item.uri,
      item.name,
      item.kind,
      item.detail ?? '',
      item.selectionRange.start,
    );
    if (source === 'personal') {
      const notes = text
        ? upsertStoredNote(this.personalNotes(), identity, text, new Date().toISOString())
        : removeStoredNote(this.personalNotes(), identity);
      await this.context.workspaceState.update(PERSONAL_NOTES_KEY, notes);
      this.changeEmitter.fire();
      return;
    }

    const folder = vscode.workspace.getWorkspaceFolder(item.uri);
    if (!folder) {
      throw new Error('Shared notes require the function to be inside an open workspace folder.');
    }
    const cache = await this.loadShared(folder);
    if (cache.error) {
      throw new Error(`Cannot update shared notes: ${cache.error}`);
    }
    const sharedIdentity = { ...identity, workspace: '' };
    const notes = text
      ? upsertStoredNote(cache.notes, sharedIdentity, text, new Date().toISOString())
      : removeStoredNote(cache.notes, sharedIdentity);
    await this.saveShared(folder, notes);
  }

  private async writeSourceComment(item: vscode.CallHierarchyItem, text: string): Promise<void> {
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
      throw new Error('VS Code could not apply the source-comment note edit.');
    }
    this.changeEmitter.fire();
  }

  private personalNotes(): readonly StoredNote[] {
    return this.context.workspaceState.get<StoredNote[]>(PERSONAL_NOTES_KEY, []);
  }

  private async loadShared(folder: vscode.WorkspaceFolder): Promise<SharedCacheEntry> {
    const cacheKey = folder.uri.toString();
    const cached = this.sharedCache.get(cacheKey);
    if (cached) {
      return cached;
    }
    const uri = sharedNoteUri(folder);
    let entry: SharedCacheEntry;
    try {
      const bytes = await vscode.workspace.fs.readFile(uri);
      const value = JSON.parse(new TextDecoder().decode(bytes)) as Partial<SharedNoteDocument>;
      if (value.version !== 1 || !Array.isArray(value.notes)) {
        throw new Error('expected a version 1 document with a notes array');
      }
      entry = { notes: value.notes.filter(isStoredNote) };
    } catch (error) {
      if (error instanceof vscode.FileSystemError && error.code === 'FileNotFound') {
        entry = { notes: [] };
      } else {
        const message = error instanceof Error ? error.message : String(error);
        entry = { notes: [], error: message };
      }
    }
    this.sharedCache.set(cacheKey, entry);
    return entry;
  }

  private async saveShared(
    folder: vscode.WorkspaceFolder,
    notes: readonly StoredNote[],
  ): Promise<void> {
    const directory = vscode.Uri.joinPath(folder.uri, SHARED_NOTE_DIRECTORY);
    const uri = vscode.Uri.joinPath(directory, SHARED_NOTE_FILE);
    const document: SharedNoteDocument = { version: 1, notes };
    await vscode.workspace.fs.createDirectory(directory);
    await vscode.workspace.fs.writeFile(
      uri,
      new TextEncoder().encode(`${JSON.stringify(document, null, 2)}\n`),
    );
    this.sharedCache.set(folder.uri.toString(), { notes });
    this.changeEmitter.fire();
  }

  private identity(
    uri: vscode.Uri,
    symbol: string,
    kind: vscode.SymbolKind,
    detail: string,
    position: vscode.Position,
  ): NoteIdentity {
    const folder = vscode.workspace.getWorkspaceFolder(uri);
    const file = folder
      ? path.relative(folder.uri.fsPath, uri.fsPath).split(path.sep).join('/')
      : uri.toString();
    return {
      workspace: folder?.uri.toString() ?? 'detached',
      file,
      symbol,
      kind,
      detail,
      line: position.line,
      character: position.character,
    };
  }

  dispose(): void {
    this.watcher.dispose();
    this.changeEmitter.dispose();
  }
}

function sharedNoteUri(folder: vscode.WorkspaceFolder): vscode.Uri {
  return vscode.Uri.joinPath(folder.uri, SHARED_NOTE_DIRECTORY, SHARED_NOTE_FILE);
}

function sourceLabel(source: NoteSource): string {
  if (source === 'personal') {
    return 'Personal';
  }
  if (source === 'shared') {
    return 'Shared';
  }
  return 'Source comment';
}

function sourceDescription(source: NoteSource): string {
  if (source === 'personal') {
    return 'VS Code workspace storage';
  }
  if (source === 'shared') {
    return `${SHARED_NOTE_DIRECTORY}/${SHARED_NOTE_FILE}`;
  }
  return 'the source file';
}

function isStoredNote(value: unknown): value is StoredNote {
  if (!value || typeof value !== 'object') {
    return false;
  }
  const note = value as Partial<StoredNote>;
  return typeof note.workspace === 'string'
    && typeof note.file === 'string'
    && typeof note.symbol === 'string'
    && typeof note.kind === 'number'
    && typeof note.detail === 'string'
    && typeof note.line === 'number'
    && typeof note.character === 'number'
    && typeof note.text === 'string'
    && typeof note.updatedAt === 'string';
}
