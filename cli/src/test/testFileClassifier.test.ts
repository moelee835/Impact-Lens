import assert from 'node:assert/strict';
import test from 'node:test';
import { classifyTestFile, isTestFilePath } from '../shared/testFileClassifier';
import { classifyRelation } from '../testFile';

// IL-LIM-010 stage 1 (docs/work/task-m4-il-lim-010-test-classifier.md). The CLI never had a test
// pinning this classification logic before this lane - `cli/src/impact.ts` was the only caller, and
// nothing in `cli/src/test/` exercised `isTestFilePath()`/`classifyRelation()` directly.

test('recognizes the test-directory convention regardless of language', () => {
  for (const path of [
    'workspace/tests/order_service.py',
    'workspace/test/order_service.go',
    'workspace/__tests__/checkout.ts',
    'workspace/spec/payment.rb',
    'workspace\\specs\\cart.ts',
  ]) {
    assert.equal(isTestFilePath(path), true, path);
  }
});

test('a file literally named test/spec (no extension) is not "inside a directory named test"', () => {
  // Regression for the CLI's own pre-lane bug: the old implementation checked ALL path segments
  // (including the file's own basename) against the test-directory set, so a script literally named
  // `test`/`spec` was misclassified as living inside a test directory.
  for (const path of ['scripts/test', 'scripts/spec']) {
    assert.equal(isTestFilePath(path), false, path);
  }
});

test('recognizes each rule only on the extensions its source framework actually targets', () => {
  const positive: Array<[string, string]> = [
    ['workspace/order.test.ts', 'dot-suffix'],
    ['workspace/order.spec.tsx', 'dot-suffix'],
    ['workspace/test_order.py', 'underscore-prefix'],
    ['workspace/order_test.go', 'underscore-suffix'],
    ['workspace/order_test.py', 'underscore-suffix'],
    ['workspace/order_spec.rb', 'underscore-suffix'],
    ['workspace/OrderServiceTest.java', 'pascal-suffix'],
  ];
  for (const [path, ruleId] of positive) {
    assert.deepEqual(classifyTestFile(path), { isTest: true, ruleId }, path);
  }

  const negative = [
    // Rules leaking onto a DIFFERENT language than the framework they came from - measured true on
    // both hosts before this lane scoped rules by extension.
    'workspace/FooTest.ts',
    'workspace/FooTest.go',
    'workspace/FooTest.py',
    'workspace/order_test.js',
    'workspace/test_order.ts',
    'workspace/order_test.cpp',
    // No verified filename-based default convention exists for these languages at all.
    'workspace/OrderServiceTests.cs',
    'workspace/FooTest.kt',
    // RSpec's default is suffix-only - it has no `spec_*.rb` prefix convention.
    'workspace/spec_order.rb',
    // TypeScript declaration files can never contain executable test code.
    'workspace/a.test.d.ts',
    'workspace/a.spec.d.ts',
    'workspace/test_order.d.ts',
  ];
  for (const path of negative) {
    assert.equal(isTestFilePath(path), false, path);
  }
});

test('requires a real extension for underscore/hyphen naming rules - an extensionless name is never a real test in any supported framework', () => {
  assert.equal(isTestFilePath('src/foo_test'), false);
  assert.equal(isTestFilePath('src/test_foo'), false);
});

test('does not classify ordinary source files as tests', () => {
  for (const path of [
    'workspace/src/order.ts',
    'workspace/src/contest.java',
    'workspace/src/tester.ts',
    'workspace/src/specification.ts',
  ]) {
    assert.equal(isTestFilePath(path), false, path);
  }
});

test('the shared classifier stays a pure function of the path string - no workspace, no filesystem', () => {
  // Callers must relativize before calling (see the module's own contract comment). An absolute path's
  // OWN ancestor directories (a home directory literally named `test`) must not be mistaken for the
  // project's test directories - passing a raw absolute in-workspace path here would defeat that.
  assert.equal(isTestFilePath('/Users/test/project/src/realFeature.ts'), true, 'the classifier cannot know this - relativizing is the caller\'s job');
  assert.equal(isTestFilePath('src/realFeature.ts'), false, 'once relativized, the ancestor "test" segment is gone');
});

test('real fileURLToPath/Uri.path shapes classify the same as their normalized POSIX equivalent', () => {
  // Both original implementations normalized backslashes as their very first step - reviewer found this
  // is why raw URI shapes never actually diverged today, but warned that unifying the two normalization
  // lines is exactly the kind of "obvious duplicate" a future edit could delete assuming the shared
  // module only ever receives pre-normalized POSIX paths. These pin the literal, un-normalized shapes.
  assert.equal(isTestFilePath('C:\\proj\\src\\order.test.ts'), true, 'fileURLToPath Windows native form');
  assert.equal(isTestFilePath('/c:/proj/tests/order.ts'), true, 'Uri.path drive-letter form, directory rule');
  assert.equal(isTestFilePath('/c:/proj/src/order.test.ts'), true, 'Uri.path drive-letter form, dot-suffix rule');
  assert.equal(isTestFilePath('/proj/src/\u03b1_test.py'), true, 'unicode filename segment, underscore-suffix');
  assert.equal(isTestFilePath('/proj/spec%20dir/order.ts'), false, 'a literal "%20" is part of the segment name, not a decoded space - "spec%20dir" is not "spec"');
  assert.equal(isTestFilePath('/My Test Project/src/order.ts'), false, 'a space-containing ancestor segment is still not an exact "test"/"spec" match');
});

test('classifyRelation (CLI thin adapter) keeps root/direct/transitive/test semantics unchanged', () => {
  assert.equal(classifyRelation(0, 'src/order.test.ts'), 'root');
  assert.equal(classifyRelation(1, 'src/order.ts'), 'direct');
  assert.equal(classifyRelation(2, 'src/checkout.ts'), 'transitive');
  assert.equal(classifyRelation(1, 'test_order.py'), 'test');
  assert.equal(classifyRelation(3, 'order_test.go'), 'test');
});
