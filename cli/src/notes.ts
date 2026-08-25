import { createHash, randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { isOutside, relativeFile } from './impact';
import {
  CallHierarchyItem,
  CliError,
  NoteLayers,
  NoteListRequest,
  NoteMutationRequest,
  NoteScope,
  ResolvedNote,
  StoredNote,
  StoredNoteIdentity,
} from './types';

const sharedPath = '.impact-lens/notes.json';
const localPath = '.impact-lens/notes.local.json';
const impactNoteTag = '@impact-note';

interface NoteDocument extends Record<string, unknown> {
  readonly version: 1;
  readonly notes: readonly Record<string, unknown>[];
}

interface LoadedDocument {
  readonly path: string;
  readonly document: NoteDocument;
  readonly token: string;
}

interface LocatedSourceNote {
  readonly line: number;
  readonly text: string;
}

export class NoteService {
  private readonly documentCache = new Map<'local' | 'shared', Promise<LoadedDocument>>();

  constructor(private readonly workspace: string) {}

  async resolve(item: CallHierarchyItem): Promise<ResolvedNote & { readonly conflictTokens: Record<string, string> }> {
    const identity = identityFor(this.workspace, item);
    const [local, shared, source] = await Promise.all([
      this.loadStored('local'),
      this.loadStored('shared'),
      readSource(item),
    ]);
    const localNote = findStoredNote(local.document.notes, identity)?.text;
    const sharedNote = findStoredNote(shared.document.notes, { ...identity, workspace: '' })?.text;
    return {
      ...resolveLayers({ local: localNote, shared: sharedNote, sourceComment: source.note?.text }),
      conflictTokens: {
        local: local.token,
        shared: shared.token,
        source: source.token,
      },
    };
  }

  async get(item: CallHierarchyItem): Promise<Record<string, unknown>> {
    return {
      target: publicIdentity(identityFor(this.workspace, item)),
      note: await this.resolve(item),
    };
  }

  async list(request: NoteListRequest): Promise<Record<string, unknown>> {
    const scopes: NoteScope[] = request.scope ? [request.scope] : ['local', 'shared'];
    const result: Record<string, unknown[]> = {};
    for (const scope of scopes) {
      if (scope === 'source') {
        result.source = await listSourceNotes(this.workspace);
        continue;
      }
      const loaded = await loadDocument(path.join(this.workspace, scope === 'local' ? localPath : sharedPath));
      result[scope] = loaded.document.notes.filter(isStoredNote).map(note => ({
        file: note.file,
        symbol: note.symbol,
        kind: note.kind,
        detail: note.detail,
        line: note.line + 1,
        column: note.character + 1,
        text: note.text,
        updatedAt: note.updatedAt,
      }));
    }
    return { scopes: result };
  }

  async mutate(
    item: CallHierarchyItem,
    request: NoteMutationRequest,
    operation: 'set' | 'delete',
  ): Promise<Record<string, unknown>> {
    if (operation === 'set' && (typeof request.text !== 'string' || request.text.trim().length === 0)) {
      throw new CliError('invalid_request', 'note.set requires non-empty text; use note.delete to remove a note.', 2);
    }
    await assertMutableItem(this.workspace, item);
    const before = await this.resolve(item);
    const result = request.scope === 'source'
      ? await mutateSource(item, request, operation)
      : await this.mutateStored(item, request, operation);
    const after = result.applied
      ? await this.resolve(item)
      : simulatedNote(before, request.scope, operation === 'delete' ? undefined : request.text?.trim());
    return {
      ...result,
      effectiveBefore: { text: before.effective, source: before.effectiveSource },
      effectiveAfter: { text: after.effective, source: after.effectiveSource },
    };
  }

  private async mutateStored(
    item: CallHierarchyItem,
    request: NoteMutationRequest,
    operation: 'set' | 'delete',
  ): Promise<Record<string, unknown>> {
    const file = path.join(this.workspace, request.scope === 'shared' ? sharedPath : localPath);
    const loaded = await loadDocument(file);
    const baseIdentity = identityFor(this.workspace, item);
    const identity = request.scope === 'shared' ? { ...baseIdentity, workspace: '' } : baseIdentity;
    const existing = findStoredNote(loaded.document.notes, identity);
    const text = request.text?.trim() ?? '';
    const changed = operation === 'delete' ? existing !== undefined : existing?.text !== text;
    const notes = operation === 'delete'
      ? removeStoredNote(loaded.document.notes, identity)
      : upsertStoredNote(loaded.document.notes, identity, text, new Date().toISOString());
    const next: NoteDocument = { ...loaded.document, version: 1, notes };
    const preview = {
      scope: request.scope,
      target: publicIdentity(identity),
      before: existing?.text ?? null,
      after: operation === 'delete' ? null : text,
      changed,
      applied: false,
      conflictToken: loaded.token,
      warnings: request.scope === 'local' && !isGitIgnored(this.workspace, file)
        ? ['local_note_file_not_git_ignored']
        : [],
    };
    if (!request.apply || !changed) {
      return preview;
    }
    requireExpectedToken(request.expectedToken, loaded.token);
    await atomicSave(file, next, loaded.token);
    this.documentCache.delete(request.scope === 'shared' ? 'shared' : 'local');
    return { ...preview, applied: true, conflictToken: hashText(serializeDocument(next)) };
  }

  private loadStored(scope: 'local' | 'shared'): Promise<LoadedDocument> {
    let loaded = this.documentCache.get(scope);
    if (!loaded) {
      loaded = loadDocument(path.join(this.workspace, scope === 'local' ? localPath : sharedPath));
      this.documentCache.set(scope, loaded);
    }
    return loaded;
  }
}

async function assertMutableItem(workspace: string, item: CallHierarchyItem): Promise<void> {
  if (!item.uri.startsWith('file:')) {
    throw new CliError('unsupported_uri', 'Note mutations require a local file URI.', 2);
  }
  try {
    const [realWorkspace, realFile] = await Promise.all([
      fs.realpath(workspace),
      fs.realpath(fileURLToPath(item.uri)),
    ]);
    if (isOutside(realWorkspace, realFile)) {
      throw new CliError('workspace_escape', 'The note target resolves outside the workspace.', 2);
    }
  } catch (error) {
    if (error instanceof CliError) {
      throw error;
    }
    throw new CliError(
      'target_not_found',
      `Cannot resolve the note target: ${error instanceof Error ? error.message : String(error)}`,
      3,
    );
  }
}

function isGitIgnored(workspace: string, file: string): boolean {
  const result = spawnSync('git', ['-C', workspace, 'check-ignore', '--quiet', '--no-index', '--', file], {
    stdio: 'ignore',
  });
  return result.status === 0;
}

export function resolveLayers(layers: NoteLayers): ResolvedNote {
  const effectiveSource: NoteScope | null = layers.local
    ? 'local'
    : layers.shared
      ? 'shared'
      : layers.sourceComment
        ? 'source'
        : null;
  return {
    effective: effectiveSource === 'local'
      ? layers.local ?? null
      : effectiveSource === 'shared'
        ? layers.shared ?? null
        : layers.sourceComment ?? null,
    effectiveSource,
    layers: {
      local: layers.local ?? null,
      shared: layers.shared ?? null,
      sourceComment: layers.sourceComment ?? null,
      personal: { available: false, reason: 'vscode_workspace_state_unavailable' },
    },
  };
}

export function identityFor(workspace: string, item: CallHierarchyItem): StoredNoteIdentity {
  const itemFile = item.uri.startsWith('file:') ? fileURLToPath(item.uri) : item.uri;
  return {
    workspace: pathToFileURL(path.resolve(workspace)).toString(),
    file: relativeFile(workspace, itemFile),
    symbol: item.name,
    kind: item.kind,
    detail: item.detail ?? '',
    line: item.selectionRange.start.line,
    character: item.selectionRange.start.character,
  };
}

export function findStoredNote(
  notes: readonly Record<string, unknown>[],
  identity: StoredNoteIdentity,
): StoredNote | undefined {
  const candidates = notes.filter(isStoredNote).filter(note => (
    note.workspace === identity.workspace
      && note.file === identity.file
      && note.symbol === identity.symbol
      && note.kind === identity.kind
  ));
  return [...candidates].sort((left, right) => matchScore(right, identity) - matchScore(left, identity))[0];
}

function matchScore(note: StoredNote, identity: StoredNoteIdentity): number {
  let score = 0;
  if (note.detail === identity.detail) {
    score += 100;
  }
  if (note.character === identity.character) {
    score += 20;
  }
  return score + Math.max(0, 10 - Math.abs(note.line - identity.line));
}

function upsertStoredNote(
  notes: readonly Record<string, unknown>[],
  identity: StoredNoteIdentity,
  text: string,
  updatedAt: string,
): Record<string, unknown>[] {
  const existing = findStoredNote(notes, identity);
  const remaining = existing ? notes.filter(note => note !== existing) : [...notes];
  return [...remaining, { ...(existing ?? {}), ...identity, text, updatedAt }].sort(compareStoredNotes);
}

function removeStoredNote(
  notes: readonly Record<string, unknown>[],
  identity: StoredNoteIdentity,
): Record<string, unknown>[] {
  const existing = findStoredNote(notes, identity);
  return existing ? notes.filter(note => note !== existing) : [...notes];
}

function compareStoredNotes(left: Record<string, unknown>, right: Record<string, unknown>): number {
  return String(left.file ?? '').localeCompare(String(right.file ?? ''))
    || String(left.symbol ?? '').localeCompare(String(right.symbol ?? ''))
    || Number(left.line ?? 0) - Number(right.line ?? 0);
}

function isStoredNote(value: Record<string, unknown>): value is StoredNote {
  return typeof value.workspace === 'string'
    && typeof value.file === 'string'
    && typeof value.symbol === 'string'
    && typeof value.kind === 'number'
    && typeof value.detail === 'string'
    && typeof value.line === 'number'
    && typeof value.character === 'number'
    && typeof value.text === 'string'
    && typeof value.updatedAt === 'string';
}

async function loadDocument(file: string): Promise<LoadedDocument> {
  try {
    const text = await fs.readFile(file, 'utf8');
    const value = JSON.parse(text) as Partial<NoteDocument>;
    if (value.version !== 1 || !Array.isArray(value.notes)) {
      throw new Error('expected a version 1 document with a notes array');
    }
    return { path: file, document: value as NoteDocument, token: hashText(text) };
  } catch (error) {
    if (isMissing(error)) {
      return { path: file, document: { version: 1, notes: [] }, token: missingToken(file) };
    }
    throw new CliError(
      'invalid_note_document',
      `Cannot read note document ${file}: ${error instanceof Error ? error.message : String(error)}`,
      4,
    );
  }
}

async function atomicSave(file: string, document: NoteDocument, initialToken: string): Promise<void> {
  await fs.mkdir(path.dirname(file), { recursive: true });
  const current = await loadDocument(file);
  if (current.token !== initialToken) {
    throw new CliError('conflict', 'The note document changed while the operation was running.', 4, true, {
      expectedToken: initialToken,
      actualToken: current.token,
    });
  }
  const temporary = `${file}.${process.pid}.${randomUUID()}.tmp`;
  try {
    await fs.writeFile(temporary, serializeDocument(document), { encoding: 'utf8', flag: 'wx' });
    await preserveMode(file, temporary);
    await fs.rename(temporary, file);
  } catch (error) {
    try {
      await fs.unlink(temporary);
    } catch {
      // Nothing to clean up when the temporary file was not created.
    }
    throw error;
  }
}

function serializeDocument(document: NoteDocument): string {
  return `${JSON.stringify(document, null, 2)}\n`;
}

async function readSource(item: CallHierarchyItem): Promise<{ note?: LocatedSourceNote; token: string; text: string }> {
  if (!item.uri.startsWith('file:')) {
    return { token: 'unsupported-uri', text: '' };
  }
  const text = await fs.readFile(fileURLToPath(item.uri), 'utf8');
  const lines = splitLines(text);
  return { note: findSourceNote(lines, item.selectionRange.start.line), token: hashText(text), text };
}

async function mutateSource(
  item: CallHierarchyItem,
  request: NoteMutationRequest,
  operation: 'set' | 'delete',
): Promise<Record<string, unknown>> {
  if (!item.uri.startsWith('file:')) {
    throw new CliError('unsupported_uri', 'Source notes require a local file URI.', 2);
  }
  const file = fileURLToPath(item.uri);
  const source = await readSource(item);
  const lines = splitLines(source.text);
  const newline = source.text.includes('\r\n') ? '\r\n' : '\n';
  const declarationLine = item.selectionRange.start.line;
  const existing = source.note;
  const text = request.text?.trim() ?? '';
  const changed = operation === 'delete' ? existing !== undefined : existing?.text !== text;
  const afterLines = [...lines];
  let changedRange: { startLine: number; endLine: number } | null = null;
  let replacement: string | null = null;
  if (operation === 'delete' && existing) {
    afterLines.splice(existing.line, 1);
    changedRange = { startLine: existing.line + 1, endLine: existing.line + 1 };
    replacement = '';
  } else if (operation === 'set') {
    const targetLine = existing?.line ?? declarationLine;
    const reference = lines[existing?.line ?? declarationLine] ?? '';
    const indentation = reference.match(/^\s*/)?.[0] ?? '';
    replacement = `${indentation}${commentPrefix(file)} ${impactNoteTag} ${text}`;
    if (existing) {
      afterLines[existing.line] = replacement;
    } else {
      afterLines.splice(declarationLine, 0, replacement);
    }
    changedRange = { startLine: targetLine + 1, endLine: targetLine + 1 };
  }
  const trailingNewline = source.text.endsWith('\n');
  const afterText = `${afterLines.join(newline)}${trailingNewline ? newline : ''}`;
  const preview = {
    scope: 'source',
    file,
    before: existing?.text ?? null,
    after: operation === 'delete' ? null : text,
    changed,
    applied: false,
    conflictToken: source.token,
    change: changedRange ? { range: changedRange, replacement } : null,
    afterToken: changed ? hashText(afterText) : source.token,
  };
  if (!request.apply || !changed) {
    return preview;
  }
  requireExpectedToken(request.expectedToken, source.token);
  const latest = await fs.readFile(file, 'utf8');
  if (hashText(latest) !== source.token) {
    throw new CliError('conflict', 'The source file changed while the operation was running.', 4, true);
  }
  const temporary = `${file}.${process.pid}.${randomUUID()}.tmp`;
  try {
    await fs.writeFile(temporary, afterText, { encoding: 'utf8', flag: 'wx' });
    await preserveMode(file, temporary);
    await fs.rename(temporary, file);
  } catch (error) {
    try {
      await fs.unlink(temporary);
    } catch {
      // Nothing to clean up when the temporary file was not created.
    }
    throw error;
  }
  return { ...preview, applied: true, conflictToken: hashText(afterText) };
}

function splitLines(text: string): string[] {
  const lines = text.split(/\r?\n/);
  if (text.endsWith('\n')) {
    lines.pop();
  }
  return lines;
}

function findSourceNote(lines: readonly string[], declarationLine: number): LocatedSourceNote | undefined {
  const first = Math.max(0, declarationLine - 5);
  for (let line = declarationLine - 1; line >= first; line -= 1) {
    const value = lines[line] ?? '';
    const index = value.indexOf(impactNoteTag);
    if (index >= 0) {
      return { line, text: value.slice(index + impactNoteTag.length).trim() };
    }
    const trimmed = value.trim();
    if (trimmed.length > 0 && !/^(\/\/|#|--|\/\*|\*|\*\/|@)/.test(trimmed)) {
      break;
    }
  }
  return undefined;
}

function commentPrefix(file: string): string {
  const extension = path.extname(file).toLowerCase();
  if (['.py', '.rb', '.sh', '.pl', '.r', '.yaml', '.yml'].includes(extension) || path.basename(file) === 'Dockerfile') {
    return '#';
  }
  if (['.sql', '.lua', '.hs'].includes(extension)) {
    return '--';
  }
  if (['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.java', '.cs', '.go', '.rs', '.c', '.cc', '.cpp', '.h', '.hpp'].includes(extension)) {
    return '//';
  }
  throw new CliError('unsupported_note_language', `No source-comment syntax is configured for ${extension || file}.`, 2);
}

async function listSourceNotes(workspace: string): Promise<unknown[]> {
  const result: unknown[] = [];
  await walk(workspace, async file => {
    const text = await fs.readFile(file, 'utf8');
    const lines = splitLines(text);
    for (let index = 0; index < lines.length; index += 1) {
      const position = lines[index]?.indexOf(impactNoteTag) ?? -1;
      if (position >= 0) {
        result.push({
          file: relativeFile(workspace, file),
          line: index + 1,
          text: lines[index]?.slice(position + impactNoteTag.length).trim() ?? '',
        });
      }
    }
  });
  return result.sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right)));
}

async function walk(directory: string, visit: (file: string) => Promise<void>): Promise<void> {
  const ignored = new Set(['.git', 'node_modules', 'out', 'dist', '.pnpm-store']);
  for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
    if (ignored.has(entry.name)) {
      continue;
    }
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      await walk(target, visit);
    } else if (entry.isFile() && supportsSourceComment(target)) {
      await visit(target);
    }
  }
}

function simulatedNote(
  before: ResolvedNote,
  scope: NoteScope,
  value: string | undefined,
): ResolvedNote {
  return resolveLayers({
    local: scope === 'local' ? value : before.layers.local ?? undefined,
    shared: scope === 'shared' ? value : before.layers.shared ?? undefined,
    sourceComment: scope === 'source' ? value : before.layers.sourceComment ?? undefined,
  });
}

async function preserveMode(source: string, target: string): Promise<void> {
  try {
    const stat = await fs.stat(source);
    await fs.chmod(target, stat.mode);
  } catch (error) {
    if (!isMissing(error)) {
      throw error;
    }
  }
}

function supportsSourceComment(file: string): boolean {
  try {
    commentPrefix(file);
    return true;
  } catch {
    return false;
  }
}

function requireExpectedToken(expected: string | undefined, actual: string): void {
  if (!expected) {
    throw new CliError('expected_token_required', 'Applying a note mutation requires the conflict token returned by preview or get.', 4, true);
  }
  if (expected !== actual) {
    throw new CliError('conflict', 'The note target changed after it was read.', 4, true, {
      expectedToken: expected,
      actualToken: actual,
    });
  }
}

function publicIdentity(identity: StoredNoteIdentity): Record<string, unknown> {
  return {
    file: identity.file,
    symbol: identity.symbol,
    kind: identity.kind,
    detail: identity.detail,
    line: identity.line + 1,
    column: identity.character + 1,
  };
}

function hashText(text: string): string {
  return `sha256:${createHash('sha256').update(text).digest('hex')}`;
}

function missingToken(file: string): string {
  return `missing:${hashText(path.resolve(file)).slice(7)}`;
}

function isMissing(error: unknown): boolean {
  return Boolean(error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT');
}
