import assert from 'node:assert/strict';
import test from 'node:test';
import { classifyImpactRelation, isTestFilePath } from '../testFile';

test('recognizes common test directories', () => {
  for (const path of [
    '/workspace/tests/order_service.py',
    '/workspace/test/order_service.rb',
    '/workspace/__tests__/checkout.ts',
    '/workspace/spec/payment.rb',
    'C:\\workspace\\specs\\cart.ts',
  ]) {
    assert.equal(isTestFilePath(path), true, path);
  }
});

test('recognizes common test file naming conventions', () => {
  for (const path of [
    '/workspace/order.test.ts',
    '/workspace/order.spec.tsx',
    '/workspace/test_order.py',
    '/workspace/spec_order.rb',
    '/workspace/order_test.go',
    '/workspace/order_spec.rb',
    '/workspace/OrderServiceTest.java',
    '/workspace/OrderServiceTests.cs',
  ]) {
    assert.equal(isTestFilePath(path), true, path);
  }
});

test('does not classify ordinary source files as tests', () => {
  for (const path of [
    '/workspace/src/order.ts',
    '/workspace/src/contest.java',
    '/workspace/src/tester.ts',
    '/workspace/src/specification.ts',
  ]) {
    assert.equal(isTestFilePath(path), false, path);
  }
});

test('classifies direct, transitive, and test callers while keeping the root', () => {
  assert.equal(classifyImpactRelation(0, '/workspace/order.test.ts'), 'root');
  assert.equal(classifyImpactRelation(1, '/workspace/src/order.ts'), 'direct');
  assert.equal(classifyImpactRelation(2, '/workspace/src/checkout.ts'), 'transitive');
  assert.equal(classifyImpactRelation(1, '/workspace/test_order.py'), 'test');
  assert.equal(classifyImpactRelation(3, '/workspace/order_test.go'), 'test');
});
