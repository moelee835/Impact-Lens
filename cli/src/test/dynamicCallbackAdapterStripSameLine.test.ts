import assert from 'node:assert/strict';
import test from 'node:test';
import { stripSameLineCommentsAndStrings } from '../shared/adapters/dynamicCallbackAdapter';

// IL-LIM-001 stage 3 (docs/work/task-il-lim-001-stage3-callback-adapter-design.md). This replaced an
// all-or-nothing "abort on any brace+quote/comment co-occurrence" guard that commander measured as
// losing roughly half of this repo's own otherwise-resolvable `findEnclosingFunction` call sites - most
// of that loss from completely ordinary lines a real stripper handles correctly instead of aborting on.

test('a real trailing line comment is blanked, braces before it still count', () => {
  const line = 'function outerCaller() { // handles clicks';
  const result = stripSameLineCommentsAndStrings(line);
  assert.notEqual(result, null);
  assert.equal(result!.length, line.length, 'blanking must preserve length so column positions elsewhere never shift');
  assert.equal(result!.trimEnd(), 'function outerCaller() {');
});

test('a same-line block comment is blanked, braces outside it still count', () => {
  const line = '/* note */ const y = 1; {';
  const result = stripSameLineCommentsAndStrings(line);
  assert.notEqual(result, null);
  assert.equal(result!.length, line.length);
  assert.equal(result!.trim(), 'const y = 1; {');
});

test('a double-quoted string containing a brace has the brace neutralized, not the whole line aborted', () => {
  const result = stripSameLineCommentsAndStrings('const msg = "shape: {";');
  assert.notEqual(result, null);
  assert.ok(!result!.includes('{'), `expected the brace inside the string to be blanked: ${JSON.stringify(result)}`);
});

test('a single-quoted string with an escaped quote is terminated correctly, not confused by the escape', () => {
  const result = stripSameLineCommentsAndStrings("if (x) { greet('it\\'s a brace: {'); }");
  assert.notEqual(result, null);
  // Exactly the two REAL braces (the if-block's own) survive; both braces inside the string are gone.
  assert.equal((result!.match(/[{}]/g) ?? []).length, 2);
});

test('a real call-shape line with an ordinary string and an unrelated brace strips cleanly (the case that used to cost half the corpus)', () => {
  const result = stripSameLineCommentsAndStrings("if (enabled) { log('clicked'); }");
  assert.notEqual(result, null);
  assert.equal((result!.match(/[{}]/g) ?? []).length, 2);
});

test('an unterminated double-quoted string is unsafe (could continue past this single line in a way this scan cannot judge)', () => {
  assert.equal(stripSameLineCommentsAndStrings('const msg = "unterminated'), null);
});

test('an unterminated block comment is unsafe (spans at least one more line)', () => {
  assert.equal(stripSameLineCommentsAndStrings('/* starts here'), null);
});

test('a plain single-line backtick string with no ${...} interpolation is safe - only interpolation, or a backtick with no closing match on the same line, is treated as unsafe', () => {
  const result = stripSameLineCommentsAndStrings('const x = `plain`;');
  assert.notEqual(result, null);
  assert.ok(!result!.includes('`'), `expected the backtick string's contents to be blanked: ${JSON.stringify(result)}`);
});

test('an unterminated backtick (no closing backtick on this line) is unsafe - template literals routinely span multiple lines', () => {
  assert.equal(stripSameLineCommentsAndStrings('const x = `starts here'), null);
});

test('a backtick template literal with ${...} interpolation is unsafe - the interpolated expression can itself contain arbitrary braces this single-line scan cannot evaluate', () => {
  assert.equal(stripSameLineCommentsAndStrings('const x = `value: ${compute()}`;'), null);
});

test('a // inside an earlier string does not truncate the line early - strings are handled before the comment scan reaches them', () => {
  const result = stripSameLineCommentsAndStrings("const url = 'https://example.com'; doSomething({});");
  assert.notEqual(result, null);
  assert.ok(result!.includes('doSomething'), `expected the code after the string to survive: ${JSON.stringify(result)}`);
});
