import assert from 'node:assert/strict';
import test from 'node:test';
import {
  findStoredNote,
  NoteIdentity,
  resolveNote,
  StoredNote,
  upsertStoredNote,
} from '../noteModel';

const identity: NoteIdentity = {
  workspace: 'file:///workspace',
  file: 'src/pricing.ts',
  symbol: 'calculateTotal',
  kind: 11,
  detail: 'pricing',
  line: 20,
  character: 16,
};

test('resolves personal, shared, and source notes in priority order', () => {
  assert.deepEqual(
    resolveNote({ personal: 'Mine', shared: 'Team', sourceComment: 'Legacy' }),
    {
      personal: 'Mine',
      shared: 'Team',
      sourceComment: 'Legacy',
      text: 'Mine',
      source: 'personal',
    },
  );
  assert.equal(resolveNote({ shared: 'Team', sourceComment: 'Legacy' }).source, 'shared');
  assert.equal(resolveNote({ sourceComment: 'Legacy' }).source, 'sourceComment');
  assert.equal(resolveNote({}).text, '');
});

test('finds a moved function by stable symbol identity', () => {
  const stored: StoredNote = { ...identity, text: 'Role', updatedAt: '2026-08-24T00:00:00Z' };
  const moved = { ...identity, line: 80 };
  assert.equal(findStoredNote([stored], moved)?.text, 'Role');
});

test('upserts the nearest matching symbol without duplicating it', () => {
  const first: StoredNote = { ...identity, text: 'Old', updatedAt: 'before' };
  const result = upsertStoredNote([first], { ...identity, line: 23 }, 'New', 'after');
  assert.equal(result.length, 1);
  assert.equal(result[0]?.text, 'New');
  assert.equal(result[0]?.line, 23);
});
