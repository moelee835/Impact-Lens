import assert from 'node:assert/strict';
import test from 'node:test';
import {
  findImpactNote,
  formatImpactNote,
  lineCommentPrefix,
  parseImpactNote,
} from '../noteSyntax';

test('parses an impact note from common comment styles', () => {
  assert.equal(parseImpactNote('// @impact-note Calculates final price'), 'Calculates final price');
  assert.equal(parseImpactNote('# @impact-note Normalizes the address'), 'Normalizes the address');
  assert.equal(parseImpactNote('const value = 1;'), undefined);
});

test('finds a nearby note before a declaration', () => {
  const lines = ['const before = true;', '// @impact-note Handles checkout', 'export function run() {}'];
  assert.deepEqual(findImpactNote(lines, 2), { line: 1, text: 'Handles checkout' });
});

test('does not attach a previous function note across executable code', () => {
  const lines = [
    '// @impact-note First function',
    'function first() {}',
    '',
    'function second() {}',
  ];
  assert.equal(findImpactNote(lines, 3), undefined);
});

test('formats notes using language-specific line comments', () => {
  assert.equal(lineCommentPrefix('python'), '#');
  assert.equal(lineCommentPrefix('typescript'), '//');
  assert.equal(formatImpactNote('python', 'Validates input', '  '), '  # @impact-note Validates input');
});
