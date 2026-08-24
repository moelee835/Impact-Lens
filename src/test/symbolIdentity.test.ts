import assert from 'node:assert/strict';
import test from 'node:test';
import { createSymbolKey } from '../symbolIdentity';

test('includes both line and character in a symbol key', () => {
  const base = {
    uri: 'file:///workspace/api.py',
    kind: 11,
    name: 'handler',
    detail: '',
    character: 4,
  };

  assert.notEqual(
    createSymbolKey({ ...base, line: 10 }),
    createSymbolKey({ ...base, line: 20 }),
  );
});

test('keeps otherwise identical symbols from different files distinct', () => {
  const base = {
    kind: 11,
    name: 'handler',
    detail: '',
    line: 10,
    character: 4,
  };

  assert.notEqual(
    createSymbolKey({ ...base, uri: 'file:///workspace/routes/a.py' }),
    createSymbolKey({ ...base, uri: 'file:///workspace/routes/b.py' }),
  );
});
