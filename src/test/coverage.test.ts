import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import test from 'node:test';
import { vscodeCoverage, vscodeProviderMetadata } from '../coverage';
import {
  INDEXING_STATUSES,
  PROVIDER_HOSTS,
  PROVIDER_LIFECYCLE_STAGES,
  PROVIDER_LIFECYCLE_STATUSES,
  PROVIDER_SELECTED_BY,
  SEMANTIC_STATUSES,
  TRAVERSAL_STATUSES,
} from '../types';

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

// The Extension and the Agent CLI are separate TypeScript projects, so the response vocabulary exists twice.
// Until they share a module (a v2 promotion condition in docs/work/task-m1-state-truth-table.md 4.3), this
// check is what keeps the second copy honest: both are compared against the one schema that ships.
test('extension state vocabulary matches the published response schema', () => {
  const schemaPath = path.resolve(__dirname, '..', '..', 'cli', 'schemas', 'response.schema.json');
  const schema = JSON.parse(fs.readFileSync(schemaPath, 'utf8')) as Record<string, unknown>;
  const enumAt = (pointer: string): readonly string[] => {
    let current: unknown = schema;
    for (const segment of pointer.split('/')) {
      current = (current as Record<string, unknown>)[segment];
    }
    assert.ok(Array.isArray(current), `${pointer} is not an enum`);
    return current as readonly string[];
  };

  const pairs: ReadonlyArray<readonly [string, readonly string[], string]> = [
    ['provider.host', PROVIDER_HOSTS, '$defs/provider/properties/host/enum'],
    ['provider.selectedBy', PROVIDER_SELECTED_BY, '$defs/provider/properties/selectedBy/enum'],
    ['provider.lifecycle.stage', PROVIDER_LIFECYCLE_STAGES, '$defs/provider/properties/lifecycle/properties/stage/enum'],
    ['provider.lifecycle.status', PROVIDER_LIFECYCLE_STATUSES, '$defs/provider/properties/lifecycle/properties/status/enum'],
    ['coverage.traversal.status', TRAVERSAL_STATUSES, '$defs/coverage/properties/traversal/properties/status/enum'],
    ['coverage.semantic.status', SEMANTIC_STATUSES, '$defs/coverage/properties/semantic/properties/status/enum'],
    ['coverage.indexing.status', INDEXING_STATUSES, '$defs/coverage/properties/indexing/properties/status/enum'],
  ];
  const drifted = pairs
    .map(([field, declared, pointer]) => {
      const inSchema = [...enumAt(pointer)].sort();
      const inTypes = [...declared].sort();
      return {
        field,
        missingFromTypes: inSchema.filter(value => !inTypes.includes(value)),
        missingFromSchema: inTypes.filter(value => !inSchema.includes(value)),
      };
    })
    .filter(entry => entry.missingFromTypes.length > 0 || entry.missingFromSchema.length > 0);
  assert.deepEqual(drifted, []);
});
