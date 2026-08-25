import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import test from 'node:test';
import { pathToFileURL } from 'node:url';
import { NoteService } from '../notes';
import { CallHierarchyItem, NoteMutationRequest } from '../types';

async function fixture(): Promise<{ workspace: string; file: string; item: CallHierarchyItem }> {
  const workspace = await fs.mkdtemp(path.join(os.tmpdir(), 'impact-lens-notes-'));
  const file = path.join(workspace, 'src', 'order.ts');
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, 'export function calculateTotal(): number {\n  return 1;\n}\n');
  return {
    workspace,
    file,
    item: {
      name: 'calculateTotal',
      kind: 12,
      detail: '(): number',
      uri: pathToFileURL(file).toString(),
      range: { start: { line: 0, character: 0 }, end: { line: 2, character: 1 } },
      selectionRange: { start: { line: 0, character: 16 }, end: { line: 0, character: 30 } },
    },
  };
}

function request(workspace: string, scope: 'shared' | 'source' | 'local', values: Partial<NoteMutationRequest> = {}): NoteMutationRequest {
  return {
    workspace,
    target: { file: 'src/order.ts', position: { line: 1, column: 17 } },
    scope,
    ...values,
  };
}

test('previews, applies, resolves, and deletes a shared note', async t => {
  const value = await fixture();
  t.after(() => fs.rm(value.workspace, { recursive: true, force: true }));
  const notes = new NoteService(value.workspace);
  const preview = await notes.mutate(value.item, request(value.workspace, 'shared', { text: 'Calculates total' }), 'set');
  assert.equal(preview.applied, false);
  assert.equal(preview.changed, true);
  const applied = await notes.mutate(value.item, request(value.workspace, 'shared', {
    text: 'Calculates total',
    apply: true,
    expectedToken: String(preview.conflictToken),
  }), 'set');
  assert.equal(applied.applied, true);
  const resolved = await notes.resolve(value.item);
  assert.equal(resolved.effective, 'Calculates total');
  assert.equal(resolved.effectiveSource, 'shared');

  const removePreview = await notes.mutate(value.item, request(value.workspace, 'shared'), 'delete');
  const removed = await notes.mutate(value.item, request(value.workspace, 'shared', {
    apply: true,
    expectedToken: String(removePreview.conflictToken),
  }), 'delete');
  assert.equal(removed.applied, true);
  assert.equal((await notes.resolve(value.item)).effective, null);
});

test('preserves unknown shared document and entry fields', async t => {
  const value = await fixture();
  t.after(() => fs.rm(value.workspace, { recursive: true, force: true }));
  const directory = path.join(value.workspace, '.impact-lens');
  await fs.mkdir(directory);
  await fs.writeFile(path.join(directory, 'notes.json'), JSON.stringify({
    version: 1,
    customDocumentField: 'keep',
    notes: [{
      workspace: '',
      file: 'src/order.ts',
      symbol: 'calculateTotal',
      kind: 12,
      detail: '(): number',
      line: 0,
      character: 16,
      text: 'old',
      updatedAt: '2026-01-01T00:00:00.000Z',
      customEntryField: 'keep',
    }],
  }));
  const notes = new NoteService(value.workspace);
  const preview = await notes.mutate(value.item, request(value.workspace, 'shared', { text: 'new' }), 'set');
  await notes.mutate(value.item, request(value.workspace, 'shared', {
    text: 'new', apply: true, expectedToken: String(preview.conflictToken),
  }), 'set');
  const document = JSON.parse(await fs.readFile(path.join(directory, 'notes.json'), 'utf8'));
  assert.equal(document.customDocumentField, 'keep');
  assert.equal(document.notes[0].customEntryField, 'keep');
  assert.equal(document.notes[0].text, 'new');
});

test('requires the latest conflict token before applying a stored note', async t => {
  const value = await fixture();
  t.after(() => fs.rm(value.workspace, { recursive: true, force: true }));
  const notes = new NoteService(value.workspace);
  await assert.rejects(
    notes.mutate(value.item, request(value.workspace, 'local', { text: 'unsafe', apply: true }), 'set'),
    (error: unknown) => Boolean(error && typeof error === 'object' && 'code' in error && error.code === 'expected_token_required'),
  );
});

test('stores CLI-local notes separately and reports Git ignore status', async t => {
  const value = await fixture();
  t.after(() => fs.rm(value.workspace, { recursive: true, force: true }));
  await fs.writeFile(path.join(value.workspace, '.gitignore'), '.impact-lens/notes.local.json\n');
  assert.equal(spawnSync('git', ['init', '--quiet', value.workspace]).status, 0);
  const notes = new NoteService(value.workspace);
  const preview = await notes.mutate(value.item, request(value.workspace, 'local', { text: 'Agent only' }), 'set');
  assert.deepEqual(preview.warnings, []);
  await notes.mutate(value.item, request(value.workspace, 'local', {
    text: 'Agent only', apply: true, expectedToken: String(preview.conflictToken),
  }), 'set');
  const resolved = await notes.resolve(value.item);
  assert.equal(resolved.effective, 'Agent only');
  assert.equal(resolved.effectiveSource, 'local');
  await assert.rejects(fs.access(path.join(value.workspace, '.impact-lens', 'notes.json')));
});

test('rejects note mutations through a symlink outside the workspace', async t => {
  const value = await fixture();
  const outside = await fs.mkdtemp(path.join(os.tmpdir(), 'impact-lens-outside-'));
  t.after(() => Promise.all([
    fs.rm(value.workspace, { recursive: true, force: true }),
    fs.rm(outside, { recursive: true, force: true }),
  ]));
  const outsideFile = path.join(outside, 'outside.ts');
  await fs.writeFile(outsideFile, 'export function outside(): void {}\n');
  const link = path.join(value.workspace, 'src', 'linked.ts');
  await fs.symlink(outsideFile, link);
  const linkedItem = { ...value.item, uri: pathToFileURL(link).toString() };
  const notes = new NoteService(value.workspace);
  await assert.rejects(
    notes.mutate(linkedItem, request(value.workspace, 'source', { text: 'unsafe' }), 'set'),
    (error: unknown) => Boolean(error && typeof error === 'object' && 'code' in error && error.code === 'workspace_escape'),
  );
});

test('previews and applies source-comment insertion and deletion', async t => {
  const value = await fixture();
  t.after(() => fs.rm(value.workspace, { recursive: true, force: true }));
  const notes = new NoteService(value.workspace);
  const preview = await notes.mutate(value.item, request(value.workspace, 'source', { text: 'Calculates total' }), 'set');
  assert.deepEqual(preview.change, {
    range: { startLine: 1, endLine: 1 },
    replacement: '// @impact-note Calculates total',
  });
  await notes.mutate(value.item, request(value.workspace, 'source', {
    text: 'Calculates total', apply: true, expectedToken: String(preview.conflictToken),
  }), 'set');
  assert.match(await fs.readFile(value.file, 'utf8'), /^\/\/ @impact-note Calculates total\nexport function/);
  const movedItem = {
    ...value.item,
    range: { start: { line: 1, character: 0 }, end: { line: 3, character: 1 } },
    selectionRange: { start: { line: 1, character: 16 }, end: { line: 1, character: 30 } },
  };
  assert.equal((await notes.resolve(movedItem)).effectiveSource, 'source');
  const deletePreview = await notes.mutate(movedItem, request(value.workspace, 'source'), 'delete');
  await notes.mutate(movedItem, request(value.workspace, 'source', {
    apply: true, expectedToken: String(deletePreview.conflictToken),
  }), 'delete');
  assert.doesNotMatch(await fs.readFile(value.file, 'utf8'), /@impact-note/);
});

test('lists source comments only when source scope is requested', async t => {
  const value = await fixture();
  t.after(() => fs.rm(value.workspace, { recursive: true, force: true }));
  await fs.writeFile(value.file, '// @impact-note Listed note\nexport function calculateTotal(): number { return 1; }\n');
  const notes = new NoteService(value.workspace);
  const listed = await notes.list({ workspace: value.workspace, scope: 'source' });
  assert.deepEqual(listed, { scopes: { source: [{ file: 'src/order.ts', line: 1, text: 'Listed note' }] } });
});
