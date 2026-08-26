import assert from 'node:assert/strict';
import test from 'node:test';
import { vscodeCoverage, vscodeProviderMetadata } from '../coverage';

test('describes VS Code provider identity without guessing an extension', () => {
  assert.deepEqual(vscodeProviderMetadata('python'), {
    host: 'vscode',
    name: 'unknown',
    requestedLanguageId: 'python',
    detectedLanguageId: 'python',
    selectedBy: 'vscode',
    languageMatch: 'unknown',
    callHierarchy: true,
    diagnostics: true,
    advertised: { callHierarchy: 'unknown', diagnostics: 'unknown' },
    observed: { prepareCallHierarchy: true, incomingCalls: true, diagnostics: true },
    lifecycle: { stage: 'query', status: 'ready' },
  });
});

test('projects traversal limits and static semantic coverage consistently', () => {
  const coverage = vscodeCoverage(['depth'], 5, 5, 120);
  assert.equal(coverage.traversal.status, 'depth-limited');
  assert.equal(coverage.indexing.status, 'unknown');
  assert.deepEqual(coverage.semantic.evidenceSources, ['vscode-call-hierarchy']);
  assert.deepEqual(coverage.reasons, [
    'identity_unavailable_through_vscode_api',
    'dynamic_calls_not_inferred',
    'depth_limit_reached',
  ]);
});
