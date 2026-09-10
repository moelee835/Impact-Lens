import assert from 'node:assert/strict';
import test from 'node:test';
import {
  InvalidTestPatternsDocumentError,
  validateTestPatternsDocumentShape,
} from '../shared/testPatternsDocument';

// IL-LIM-010 stage 1 completion (docs/work/task-m4-il-lim-010-stage1-completion.md). reviewer's finding:
// before this module existed, `cli/src/testPatternsConfig.ts` (CLI) and `src/testPatternsStore.ts`
// (Extension) each carried their own hand-copied shape-validation function, and nothing proved the two
// agreed - the exact "same rule, two independently-copied implementations, no parity guarantee" shape
// PR #91 measured and fixed for path classification itself. Extracting the validation into this single
// shared, dependency-free function (used by both hosts) removes that class of bug outright: there is no
// second implementation left to drift out of sync with this one. This file is that function's own
// correctness proof - `src/testPatternsStore.ts` cannot be exercised the same way in this test runner
// (it requires the real `vscode` module, unavailable under plain `node --test` - see that file's own
// comment), so its correctness for this half of its behavior rests entirely on calling this exact
// function, not on a parity test running both hosts side by side.

function assertRejected(parsed: unknown, messageParts: readonly RegExp[]): void {
  assert.throws(() => validateTestPatternsDocumentShape(parsed), (error: unknown) => {
    assert.ok(error instanceof InvalidTestPatternsDocumentError);
    for (const part of messageParts) {
      assert.match(error.message, part);
    }
    return true;
  });
}

test('a normal document with both fields populated is accepted unchanged', () => {
  const doc = validateTestPatternsDocumentShape({ include: ['e2e/**/*.contract.ts'], exclude: ['vendor/**'] });
  assert.deepEqual(doc, { include: ['e2e/**/*.contract.ts'], exclude: ['vendor/**'] });
});

test('an empty object defaults both fields to empty arrays, not an error', () => {
  assert.deepEqual(validateTestPatternsDocumentShape({}), { include: [], exclude: [] });
});

test('either field alone, with the other omitted, defaults the omitted one to empty', () => {
  assert.deepEqual(validateTestPatternsDocumentShape({ include: ['a.ts'] }), { include: ['a.ts'], exclude: [] });
  assert.deepEqual(validateTestPatternsDocumentShape({ exclude: ['b.ts'] }), { include: [], exclude: ['b.ts'] });
});

test('an explicit empty array for either field is accepted as-is', () => {
  assert.deepEqual(validateTestPatternsDocumentShape({ include: [], exclude: [] }), { include: [], exclude: [] });
});

test('a non-object document (array, string, number, null) is rejected', () => {
  for (const parsed of [[], 'x', 42, null, true]) {
    assertRejected(parsed, [/must contain a JSON object/]);
  }
});

test('a type error on either field (not a string array) is rejected, naming the field', () => {
  assertRejected({ include: 'not-an-array' }, [/field "include" must be an array of strings/]);
  assertRejected({ exclude: 42 }, [/field "exclude" must be an array of strings/]);
  assertRejected({ include: ['a.ts', 7] }, [/field "include" must be an array of strings/]);
});

test('an unknown field is rejected, naming both the unknown field and the allowed ones', () => {
  assertRejected({ include: [], typo: ['x'] }, [/unknown fields: typo/, /Allowed fields: include, exclude/]);
});

test('the thrown error carries which field the problem is in, when it is field-specific', () => {
  try {
    validateTestPatternsDocumentShape({ include: 'not-an-array' });
    assert.fail('expected a throw');
  } catch (error) {
    assert.ok(error instanceof InvalidTestPatternsDocumentError);
    assert.equal(error.field, 'include');
  }
});
