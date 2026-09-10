import assert from 'node:assert/strict';
import test from 'node:test';
import { compileTestPatterns, validateTestPattern } from '../shared/testFileClassifier';

// IL-LIM-010 stage 1 completion (docs/work/task-m4-il-lim-010-stage1-completion.md). commander's
// condition on this glob compiler: this repository has already shipped a hand-rolled scope-boundary
// matcher once (the dynamic-callback adapter) and watched the SAME defect shape resurface through four
// separate channels, each time passing every fixture that existed at the time. The negative corpus
// below is deliberately at least as large as the positive one - a positive-only suite is exactly what
// let that defect shape through four times in a row.

function matches(pattern: string, path: string): boolean {
  return compileTestPatterns([pattern], []).include[0].regex.test(path);
}

test('a single "*" matches within one path segment and never crosses "/"', () => {
  assert.equal(matches('test/*.ts', 'test/a.ts'), true);
  assert.equal(matches('test/*.ts', 'test/sub/a.ts'), false, '"*" must not cross a path segment boundary');
  assert.equal(matches('test/*.ts', 'test/.ts'), true, '"*" matches zero characters too');
});

test('"**" crosses "/" freely, and "**/ " specifically also matches zero leading directories', () => {
  assert.equal(matches('**/*.spec.ts', 'a.spec.ts'), true, 'Jest\'s own testMatch begins with "**/ " and matches top-level files');
  assert.equal(matches('**/*.spec.ts', 'e2e/sub/a.spec.ts'), true, 'any number of nested directories');
  assert.equal(matches('e2e/**', 'e2e/a.ts'), true);
  assert.equal(matches('e2e/**', 'e2e/sub/deep/a.ts'), true);
});

test('literal regex-special characters in a pattern are matched literally, never as regex syntax', () => {
  // This is the exact mistake this compiler must not make: an un-escaped "." would let "foo.test.ts"
  // accidentally match "fooXtestXts", silently turning a literal filename into a wildcard.
  assert.equal(matches('foo.test.ts', 'foo.test.ts'), true);
  assert.equal(matches('foo.test.ts', 'fooXtestXts'), false, '"." must be a literal dot, not "any character"');
  assert.equal(matches('a+b.ts', 'a+b.ts'), true);
  assert.equal(matches('a+b.ts', 'aab.ts'), false, '"+" must be literal, not "one or more of the previous token"');
  assert.equal(matches('a(b).ts', 'a(b).ts'), true);
  assert.equal(matches('a^b$c.ts', 'a^b$c.ts'), true);
  assert.equal(matches('a|b.ts', 'a|b.ts'), true);
  assert.equal(matches('a|b.ts', 'a.ts'), false, '"|" must be literal, not regex alternation');
});

test('a full-string match never leaks into a partial/substring match', () => {
  assert.equal(matches('test.ts', 'test.ts'), true);
  assert.equal(matches('test.ts', 'not-a-test.ts.bak'), false, 'anchoring must not allow the pattern to match a substring');
  assert.equal(matches('test.ts', 'src/test.ts'), false, 'a pattern with no wildcard must match the WHOLE relative path, not just its tail');
});

test('a pattern with no wildcard at all only matches that exact path', () => {
  assert.equal(matches('src/order.ts', 'src/order.ts'), true);
  assert.equal(matches('src/order.ts', 'src/order2.ts'), false);
});

test('validateTestPattern names what IS supported, not just "invalid" (commander: users cannot guess why "?"/"[]" fail otherwise)', () => {
  for (const pattern of ['a?.ts', 'a[bc].ts', 'a{b,c}.ts', '!a.ts', 'a\\b.ts', '']) {
    const problem = validateTestPattern(pattern);
    assert.ok(problem !== null, `expected ${JSON.stringify(pattern)} to be rejected`);
    assert.match(problem!, /is not supported|must not be empty/);
    assert.match(problem!, /\*/, 'the message must mention "*" as what IS supported, not only what is rejected');
  }
});

test('every unsupported glob metacharacter is rejected on its own, not silently treated as a literal', () => {
  // Each of these looks like it might "just work" as a literal character if the compiler forgot to
  // reject it - the same shape of mistake ("this obviously safe case was never actually checked") that
  // let the callback adapter's four-channel defect through its own fixtures each time.
  for (const pattern of ['a?b.ts', 'a[b].ts', 'a]b.ts', 'a{b}.ts', 'a!b.ts', 'a\\b.ts']) {
    assert.throws(
      () => compileTestPatterns([pattern], []),
      (error: unknown) => {
        assert.ok(error instanceof Error);
        assert.equal(error.name, 'InvalidTestPatternError');
        return true;
      },
      pattern,
    );
  }
});

test('three or more consecutive "*" are rejected rather than silently compiled to something', () => {
  assert.notEqual(validateTestPattern('***'), null);
  assert.notEqual(validateTestPattern('a***.ts'), null);
  // Exactly two is fine and unaffected by this guard.
  assert.equal(validateTestPattern('a**.ts'), null);
});

test('an empty pattern is rejected, not silently treated as "match everything" or "match nothing"', () => {
  assert.notEqual(validateTestPattern(''), null);
});

test('backslash is always rejected, even where it could plausibly be read as a Windows path separator', () => {
  // The classifier normalizes "\\" to "/" before matching (see testFileClassifier.ts's own
  // normalization step) - a user pattern containing "\\" is therefore ambiguous (escape char vs path
  // separator) rather than helpful, so it is rejected rather than guessed at either way.
  assert.notEqual(validateTestPattern('test\\order.ts'), null);
  assert.notEqual(validateTestPattern('test\\*.ts'), null);
});

test('two patterns that look almost identical do not silently match each other\'s inputs', () => {
  // Regression-shaped: a compiler bug that conflates "*" and "**" handling would make these two
  // patterns match the same set of paths. They must not.
  assert.equal(matches('a/*.ts', 'a/b/c.ts'), false);
  assert.equal(matches('a/**.ts', 'a/b/c.ts'), true);
});

test('a leading "/" is rejected rather than silently compiling to a pattern that can never match anything', () => {
  // reviewer's finding: `validateTestPattern('/test/*.ts')` returned null (accepted) before this fix,
  // and the compiled pattern then matched nothing at all against a workspace-relative path (which never
  // itself starts with "/") - no error, no warning, an always-empty result. Jest's own
  // `testPathIgnorePatterns` docs use `"/node_modules/"` as their headline example, so this exact shape
  // is the one a user modeling this feature on Jest is most likely to type.
  const problem = validateTestPattern('/test/*.ts');
  assert.notEqual(problem, null);
  assert.match(problem!, /leading "\/"/);
  // The message must name the fix, not just the defect - it should suggest the exact corrected pattern.
  assert.match(problem!, /"test\/\*\.ts"/);
  assert.throws(() => compileTestPatterns(['/test/*.ts'], []), (error: unknown) => {
    assert.ok(error instanceof Error);
    assert.equal(error.name, 'InvalidTestPatternError');
    return true;
  });
});

test('a trailing "/" is rejected rather than silently compiling to a pattern that can never match a file', () => {
  // reviewer's finding: `validateTestPattern('test/')` returned null (accepted) before this fix, and the
  // compiled pattern matched nothing - a trailing "/" alone requires the matched string to literally end
  // in "/", but every path handed to this classifier is a FILE path (workspace-relative, no directory
  // has its own separate node). "did you mean **" is the actual fix, so the message says it.
  const problem = validateTestPattern('test/');
  assert.notEqual(problem, null);
  assert.match(problem!, /trailing "\/"/);
  assert.match(problem!, /"test\/\*\*"/);
});

test('"*" matching a leading-dot segment (e.g. ".hidden.test.ts") is CURRENT, PINNED behavior - not a design guarantee', () => {
  // reviewer's finding: unlike minimatch's default (dotfiles excluded from "*" unless `dot: true`),
  // this compiler's "*" -> `[^/]*` has no dotfile exclusion, so `*.test.ts` matches `.hidden.test.ts`
  // too. commander's explicit instruction: do NOT change this behavior in this PR - inventing dotfile
  // semantics without measuring real usage would be exactly the kind of un-measured behavior change
  // this repository's own gate 7 lane warned against. This test exists ONLY to pin today's behavior so
  // it cannot drift silently later, not to endorse it as correct.
  assert.equal(matches('*.test.ts', '.hidden.test.ts'), true);
  assert.equal(matches('**/*.test.ts', 'src/.hidden.test.ts'), true);
});
