import assert from 'node:assert/strict';
import test from 'node:test';
import { classifyImpactRelation, isTestFilePath as extIsTestFilePath } from '../testFile';
// This relative path depends on `src/`/`out/` and `cli/` sitting where `impactAnalyzer.ts` already
// assumes (see that file's own comment on the same assumption for `../cli/dist/shared/adapters`).
import { classifyRelation as cliClassifyRelation, isTestFilePath as cliIsTestFilePath } from '../../cli/dist/testFile';
import { classifyTestFile } from '../../cli/dist/shared/testFileClassifier';

// IL-LIM-010 stage 1 (docs/work/task-m4-il-lim-010-test-classifier.md). Story's own 1단계 exit
// condition: "Extension과 CLI가 같은 path matrix에 동일 결과·근거를 반환한다". This is the one place
// that imports BOTH hosts' thin adapters and asserts they agree - a regression here means the two
// hosts silently diverged again, which is exactly what this whole lane exists to prevent.

const CORPUS = [
  // Directory convention.
  'workspace/tests/order_service.py', 'workspace/test/order_service.go', 'workspace/__tests__/checkout.ts',
  'workspace/spec/payment.rb', 'workspace/specs/cart.ts', 'scripts/test', 'scripts/spec', 'src/foo-test',
  // Dot-suffix (JS/TS only).
  'src/order.test.ts', 'src/order.spec.tsx', 'src/a.test.d.ts', 'src/a.spec.d.ts', 'src/order.test.py',
  // Underscore prefix/suffix (Python/Go/Ruby, scoped per-rule).
  'src/test_order.py', 'src/order_test.go', 'src/order_test.py', 'src/order_spec.rb', 'src/spec_order.rb',
  'src/foo_test', 'src/foo_test.js',
  // Pascal suffix (Java only).
  'src/OrderServiceTest.java', 'src/OrderServiceTests.cs', 'src/FooTest.ts', 'src/FooTest.go', 'src/FooTest.py',
  // Rejected hyphen forms (both prefix and suffix - no framework default uses hyphen).
  'src/test-utils.ts', 'src/test-helpers.js', 'src/spec-runner.ts', 'src/my-test.js', 'src/e2e-spec.ts',
  // Ordinary source, must stay false everywhere.
  'src/order.ts', 'src/contest.java', 'src/tester.ts', 'src/specification.ts', 'src/foo.d.ts',
  // Real URI-derived shapes (reviewer's concern: pretty POSIX-only fixtures let a normalization
  // regression pass vacuously).
  'C:\\proj\\src\\order.test.ts', '/c:/proj/tests/order.ts',
];

test('Extension and CLI classify every corpus path identically', () => {
  for (const path of CORPUS) {
    const ext = extIsTestFilePath(path);
    const cli = cliIsTestFilePath(path);
    assert.equal(ext, cli, `Extension=${ext} CLI=${cli} for ${path}`);
  }
});

test('Extension and CLI compute the same rule ID for every corpus path', () => {
  // Both thin adapters delegate to the exact same shared function, so this is really pinning that
  // delegation stays true - a host reimplementing its own copy of a rule would not be caught by the
  // boolean-only comparison above if it happened to agree on `isTest` but for a different reason.
  for (const path of CORPUS) {
    const shared = classifyTestFile(path);
    assert.equal(extIsTestFilePath(path), shared.isTest, path);
    assert.equal(cliIsTestFilePath(path), shared.isTest, path);
  }
});

test('classifyImpactRelation (Extension) and classifyRelation (CLI) agree depth-for-depth', () => {
  for (const path of CORPUS) {
    for (const depth of [0, 1, 2, 5]) {
      assert.equal(classifyImpactRelation(depth, path), cliClassifyRelation(depth, path), `${path} @ depth ${depth}`);
    }
  }
});
