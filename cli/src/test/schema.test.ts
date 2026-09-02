import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import test from 'node:test';
import { pathToFileURL } from 'node:url';
import {
  COMPLETION_TRAVERSAL_STATUSES,
  INDEXING_STATUSES,
  LIMITATION_SCOPES,
  LIMITATION_SEVERITIES,
  PROVIDER_HOSTS,
  PROVIDER_LIFECYCLE_STAGES,
  PROVIDER_LIFECYCLE_STATUSES,
  PROVIDER_SELECTED_BY,
  REQUEST_STATUSES,
  SCHEMA_VERSION,
  SEMANTIC_SCOPES,
  SEMANTIC_STATUSES,
  TRAVERSAL_LIMITS,
  TRAVERSAL_STATUSES,
} from '../types';
import { assertSupportedKeywords, JsonSchema, validate } from './jsonSchema';

const SCHEMA_PATH = path.resolve(__dirname, '..', '..', 'schemas', 'response.schema.json');
const EXECUTABLE = path.resolve(__dirname, '..', 'index.js');

function schema(): JsonSchema {
  return JSON.parse(fs.readFileSync(SCHEMA_PATH, 'utf8')) as JsonSchema;
}

function enumAt(pointer: string): readonly string[] {
  let current: unknown = schema();
  for (const segment of pointer.split('/')) {
    current = (current as Record<string, unknown>)[segment];
    assert.ok(current !== undefined, `schema pointer ${pointer} does not resolve`);
  }
  assert.ok(Array.isArray(current), `${pointer} is not an enum`);
  return current as readonly string[];
}

function analyzeInFixtureWorkspace(): Record<string, unknown> {
  const workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'impact-lens-schema-'));
  try {
    fs.writeFileSync(path.join(workspace, 'tsconfig.json'), JSON.stringify({
      compilerOptions: { target: 'ES2022', module: 'commonjs', strict: true },
      include: ['*.ts'],
    }));
    fs.writeFileSync(path.join(workspace, 'target.ts'), 'export function target(value: number): number { return value + 1; }\n');
    fs.writeFileSync(path.join(workspace, 'caller.ts'), "import { target } from './target';\nexport function caller(): number { return target(1); }\n");
    const result = spawnSync(process.execPath, [EXECUTABLE, 'analyze', '--stdin'], {
      encoding: 'utf8',
      timeout: 25000,
      input: JSON.stringify({ workspace, file: 'target.ts', line: 1, column: 17, depth: 2, maxNodes: 20 }),
    });
    assert.equal(result.status, 0, result.stderr);
    return JSON.parse(result.stdout) as Record<string, unknown>;
  } finally {
    fs.rmSync(workspace, { recursive: true, force: true });
  }
}

// The checker is only worth trusting if it cannot quietly skip part of the schema.
test('the schema uses only keywords the contract checker implements', () => {
  assertSupportedKeywords(schema());
});

// This is the check that would have caught the three drifts this branch fixes. Validating responses
// cannot: every value the CLI produces was already inside the schema's (wider) enums, so every real
// response passed while the TypeScript unions stayed narrower than the published contract.
test('type vocabulary matches the schema enums exactly', () => {
  const pairs: ReadonlyArray<readonly [string, readonly string[], string]> = [
    ['provider.host', PROVIDER_HOSTS, '$defs/provider/properties/host/enum'],
    ['provider.selectedBy', PROVIDER_SELECTED_BY, '$defs/provider/properties/selectedBy/enum'],
    ['provider.lifecycle.stage', PROVIDER_LIFECYCLE_STAGES, '$defs/provider/properties/lifecycle/properties/stage/enum'],
    ['provider.lifecycle.status', PROVIDER_LIFECYCLE_STATUSES, '$defs/provider/properties/lifecycle/properties/status/enum'],
    ['coverage.traversal.status', TRAVERSAL_STATUSES, '$defs/coverage/properties/traversal/properties/status/enum'],
    ['coverage.semantic.status', SEMANTIC_STATUSES, '$defs/coverage/properties/semantic/properties/status/enum'],
    ['coverage.indexing.status', INDEXING_STATUSES, '$defs/coverage/properties/indexing/properties/status/enum'],
    ['completion.requestStatus', REQUEST_STATUSES, '$defs/completion/properties/requestStatus/enum'],
    ['completion.traversalStatus', COMPLETION_TRAVERSAL_STATUSES, '$defs/completion/properties/traversalStatus/enum'],
    ['completion.semanticScope', SEMANTIC_SCOPES, '$defs/completion/properties/semanticScope/enum'],
    ['completion.indexingStatus', INDEXING_STATUSES, '$defs/completion/properties/indexingStatus/enum'],
    ['limitationDetail.severity', LIMITATION_SEVERITIES, '$defs/limitationDetail/properties/severity/enum'],
    ['limitationDetail.scope', LIMITATION_SCOPES, '$defs/limitationDetail/properties/scope/enum'],
    [
      'data.traversalLimits[]',
      TRAVERSAL_LIMITS,
      'allOf/1/then/properties/data/properties/traversalLimits/items/enum',
    ],
  ];
  // Report every mismatch at once. Failing on the first one hides how far the two sides have moved apart,
  // which is how this contract accumulated three separate drifts before anyone noticed.
  const drifted = pairs
    .map(([field, declared, pointer]) => {
      const inSchema = [...enumAt(pointer)].sort();
      const inTypes = [...declared].sort();
      const missingFromTypes = inSchema.filter(value => !inTypes.includes(value));
      const missingFromSchema = inTypes.filter(value => !inSchema.includes(value));
      return { field, missingFromTypes, missingFromSchema };
    })
    .filter(entry => entry.missingFromTypes.length > 0 || entry.missingFromSchema.length > 0);
  assert.deepEqual(drifted, []);
});

test('the schemaVersion constant matches the schema', () => {
  const declared = (schema() as Record<string, Record<string, Record<string, unknown>>>)
    .properties.schemaVersion.const;
  assert.equal(SCHEMA_VERSION, declared);
});

test('a real impact.analyze response satisfies the response schema', { timeout: 40000 }, () => {
  const response = analyzeInFixtureWorkspace();
  assert.deepEqual(validate(schema(), response), []);
  // Guard the branch itself: the analyze rule only fires when both ok and operation match.
  const data = response.data as Record<string, unknown>;
  assert.ok(data.provider && data.coverage);
});

test('a real provider.doctor response satisfies the response schema', () => {
  const result = spawnSync(process.execPath, [EXECUTABLE, 'doctor', 'bundled-typescript'], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(validate(schema(), JSON.parse(result.stdout)), []);
});

test('a real failure envelope satisfies the response schema', () => {
  const result = spawnSync(process.execPath, [EXECUTABLE], { encoding: 'utf8' });
  assert.equal(result.status, 2);
  const response = JSON.parse(result.stderr) as Record<string, unknown>;
  assert.equal(response.ok, false);
  assert.deepEqual(validate(schema(), response), []);
});

test('the contract checker rejects envelopes the schema forbids', { timeout: 40000 }, () => {
  const valid = analyzeInFixtureWorkspace();
  const clone = (): Record<string, unknown> => JSON.parse(JSON.stringify(valid)) as Record<string, unknown>;
  const provider = (envelope: Record<string, unknown>): Record<string, unknown> =>
    (envelope.data as Record<string, unknown>).provider as Record<string, unknown>;
  const coverage = (envelope: Record<string, unknown>): Record<string, unknown> =>
    (envelope.data as Record<string, unknown>).coverage as Record<string, unknown>;

  const broken: ReadonlyArray<readonly [string, Record<string, unknown>]> = [
    ['wrong schemaVersion', { ...clone(), schemaVersion: 2 }],
    ['unknown operation', { ...clone(), operation: 'impact.guess' }],
    ['unknown top-level field', { ...clone(), extra: true }],
    ['ok true without timings', (() => {
      const envelope = clone();
      delete envelope.timings;
      return envelope;
    })()],
    ['ok false without error', { ...clone(), ok: false }],
    ['selectedBy outside the enum', (() => {
      const envelope = clone();
      provider(envelope).selectedBy = 'guessed';
      return envelope;
    })()],
    ['traversal status outside the enum', (() => {
      const envelope = clone();
      (coverage(envelope).traversal as Record<string, unknown>).status = 'exhausted';
      return envelope;
    })()],
    ['unknown provider field', (() => {
      const envelope = clone();
      provider(envelope).indexing = 'ready';
      return envelope;
    })()],
    ['missing coverage', (() => {
      const envelope = clone();
      delete (envelope.data as Record<string, unknown>).coverage;
      return envelope;
    })()],
    ['languageMatch as a number', (() => {
      const envelope = clone();
      provider(envelope).languageMatch = 1;
      return envelope;
    })()],
    ['reachedDepth below the schema minimum', (() => {
      const envelope = clone();
      (coverage(envelope).traversal as Record<string, unknown>).reachedDepth = -1;
      return envelope;
    })()],
    ['runner source outside the allowlist', (() => {
      const envelope = clone();
      ((envelope.runtime as Record<string, unknown>).runner as Record<string, unknown>).source = 'somewhere';
      return envelope;
    })()],
  ];

  assert.deepEqual(validate(schema(), valid), [], 'the unmodified envelope must stay valid');
  for (const [name, envelope] of broken) {
    assert.notDeepEqual(validate(schema(), envelope), [], `expected the checker to reject: ${name}`);
  }
});

// ---------------------------------------------------------------------------
// serverInfo.version bound (task-fix-provider-version-bound.md)
//
// Neither of `contract.test.ts`'s two tests for this bound runs the response through this file's real
// `validate()` against the live `response.schema.json` - they check `Buffer.byteLength(...) <= 256`
// directly. That is a real gap: nothing before this exercised the checker's own `maxLength` handling
// against a *populated* `version` field at all (a real typescript-language-server analysis never
// produces one to check). These two close that gap for the real thing this preset produces, and the
// third proves the checker's `maxLength` on this field actually rejects an out-of-bounds value in the
// first place - a positive-only check could pass vacuously if `maxLength` on this field were silently
// dropped from the schema.
// ---------------------------------------------------------------------------

function analyzeWithHugeServerVersion(versionChar: string): Record<string, unknown> {
  const server = path.resolve(__dirname, 'fixtures', 'hugeServerVersionServer.js');
  const targetUri = pathToFileURL(path.resolve(__dirname, '..', '..', 'src', 'testFile.ts')).toString();
  const result = spawnSync(process.execPath, [EXECUTABLE, 'analyze', '--stdin'], {
    encoding: 'utf8',
    env: { ...process.env, IMPACT_LENS_MOCK_TARGET_URI: targetUri, IMPACT_LENS_MOCK_HUGE_VERSION_CHAR: versionChar },
    input: JSON.stringify({
      workspace: path.resolve(__dirname, '..', '..'),
      file: 'src/testFile.ts',
      line: 4,
      column: 17,
      provider: { command: process.execPath, args: [server], languageId: 'typescript' },
    }),
  });
  assert.equal(result.status, 0, result.stderr);
  return JSON.parse(result.stdout) as Record<string, unknown>;
}

test('a real oversized ASCII serverInfo.version, once bounded, satisfies response.schema.json', () => {
  assert.deepEqual(validate(schema(), analyzeWithHugeServerVersion('x')), []);
});

test('a real oversized multi-byte serverInfo.version, once bounded, satisfies response.schema.json', () => {
  // The case that actually exercises the byte-vs-codepoint distinction: a cut that lands mid-character
  // widens under naive truncation (see providers/discovery.ts's truncate()), so this is the version of
  // the fixture that would have caught a regression there.
  assert.deepEqual(validate(schema(), analyzeWithHugeServerVersion('가')), []);
});

test('the schema checker actually rejects a version string over maxLength - the positive checks above are not vacuous', { timeout: 40000 }, () => {
  const envelope = analyzeInFixtureWorkspace();
  const overLength = 'v'.repeat(257);
  ((envelope.data as Record<string, unknown>).provider as Record<string, unknown>).version = overLength;
  (envelope.capabilities as Record<string, unknown>).version = overLength;
  assert.notDeepEqual(validate(schema(), envelope), []);
});
