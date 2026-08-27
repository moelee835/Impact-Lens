import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import test from 'node:test';
import { projectCompletion, TraversalFacts } from '../coverage';
import { AnalysisObservations, TraversalLimit } from '../types';
import { JsonSchema, validate } from './jsonSchema';

const SCHEMA_PATH = path.resolve(__dirname, '..', '..', 'schemas', 'response.schema.json');
const TYPES_PATH = path.resolve(__dirname, '..', '..', 'src', 'types.ts');

function schema(): JsonSchema {
  return JSON.parse(fs.readFileSync(SCHEMA_PATH, 'utf8')) as JsonSchema;
}

function facts(overrides: Partial<TraversalFacts> = {}): TraversalFacts {
  return {
    limits: new Set<TraversalLimit>(),
    requestedDepth: 5,
    reachedDepth: 2,
    maxNodes: 120,
    incomingCallerCount: 3,
    diagnosticsSupported: true,
    ...overrides,
  };
}

const PROVIDER = {
  host: 'lsp',
  name: 'fake-provider',
  requestedLanguageId: 'typescript',
  detectedLanguageId: 'typescript',
  selectedBy: 'bundled',
  languageMatch: true,
  callHierarchy: true,
  diagnostics: true,
  advertised: { callHierarchy: true, diagnostics: true },
  observed: { prepareCallHierarchy: true, incomingCalls: true, diagnostics: true },
  lifecycle: { stage: 'query', status: 'ready' },
};

/** A schema-valid analyze envelope built from the real projection, so the fixtures start from truth. */
function envelope(
  overrides: Partial<TraversalFacts> = {},
  observations: AnalysisObservations = {},
): Record<string, unknown> {
  const projection = projectCompletion(facts(overrides), observations);
  const data = {
    rootId: 'a'.repeat(24),
    nodes: [{ id: 'a'.repeat(24), name: 'root' }],
    edges: [],
    requestedDepth: projection.coverage.traversal.requestedDepth,
    reachedDepth: projection.coverage.traversal.reachedDepth,
    maxNodes: projection.coverage.traversal.maxNodes,
    truncated: projection.truncated,
    traversalLimits: projection.traversalLimits,
    complete: projection.complete,
    provider: PROVIDER,
    coverage: projection.coverage,
    completion: projection.completion,
    coordinateBase: 1,
    positionEncoding: 'utf-16',
    limitations: projection.limitations,
    limitationDetails: projection.limitationDetails,
    analyzedAt: '2026-08-27T00:00:00.000Z',
    timings: { totalMs: 1 },
  };
  return {
    schemaVersion: 1,
    operation: 'impact.analyze',
    ok: true,
    runtime: {
      cli: { name: '@impact-lens/cli', version: '0.0.0' },
      node: { version: 'v22.0.0', major: 22, executable: 'node' },
      runner: { source: 'direct' },
    },
    data,
    capabilities: PROVIDER,
    limitations: projection.limitations,
    timings: { totalMs: 1 },
  };
}

function corrupt(mutate: (data: Record<string, unknown>) => void): Record<string, unknown> {
  const value = JSON.parse(JSON.stringify(envelope())) as Record<string, unknown>;
  mutate(value.data as Record<string, unknown>);
  return value;
}

// ---------------------------------------------------------------------------
// X1..X11 as schema rules. Each fixture is a hand-written contradiction; the schema has to reject it.
// See docs/work/task-m1-state-truth-table.md section 3 for what each identifier means.
// ---------------------------------------------------------------------------

test('the schema rejects every forbidden state combination', () => {
  const base = envelope();
  assert.deepEqual(validate(schema(), base), [], 'the unmodified envelope must stay valid');

  const forbidden: ReadonlyArray<readonly [string, Record<string, unknown>]> = [
    ['X1 complete true with a limited traversal', corrupt(data => {
      ((data.coverage as Record<string, unknown>).traversal as Record<string, unknown>).status = 'depth-limited';
    })],
    ['X1 complete false with an exhausted traversal', corrupt(data => {
      data.complete = false;
    })],
    ['X1 completion exhausted with complete false', corrupt(data => {
      data.complete = false;
      data.truncated = true;
    })],
    ['X2 successful analysis with an empty graph', corrupt(data => {
      data.nodes = [];
    })],
    ['X2 failed envelope carrying result data', {
      ...base,
      ok: false,
      error: { code: 'provider_query_failed', message: 'x', retryable: false },
    }],
    ['X3 indexing ready without evidence', corrupt(data => {
      (data.coverage as Record<string, unknown>).indexing = { status: 'ready' };
    })],
    ['X4 a bundled provider claiming a language mismatch', corrupt(data => {
      (data.provider as Record<string, unknown>).languageMatch = false;
    })],
    ['X5 succeeded with a bounded traversal', corrupt(data => {
      (data.completion as Record<string, unknown>).traversalStatus = 'depth-limited';
    })],
    ['X6 a failed request status on an ok true envelope', corrupt(data => {
      (data.completion as Record<string, unknown>).requestStatus = 'failed';
    })],
    ['X7 an exhausted traversal carrying a limit reason', corrupt(data => {
      (data.coverage as Record<string, unknown>).reasons = ['depth_limit_reached'];
    })],
    ['X7 an exhausted traversal carrying a limit detail', corrupt(data => {
      data.limitationDetails = [{
        code: 'node_limit_reached', severity: 'warning', scope: 'traversal', message: 'x', action: 'y',
      }];
    })],
    ['X8 semantic scope none with a graph', corrupt(data => {
      (data.completion as Record<string, unknown>).semanticScope = 'none';
    })],
    ['X9 a working index on a succeeded request', corrupt(data => {
      (data.completion as Record<string, unknown>).indexingStatus = 'working';
    })],
    ['X10 truncated false with a listed limit', corrupt(data => {
      data.traversalLimits = ['depth'];
    })],
    ['X11 provider_not_ready together with no_incoming_callers', corrupt(data => {
      data.limitationDetails = [
        { code: 'provider_not_ready', severity: 'error', scope: 'indexing', message: 'x', action: 'y' },
        { code: 'no_incoming_callers', severity: 'warning', scope: 'semantic', message: 'x', action: 'y' },
      ];
      data.complete = false;
      data.truncated = true;
      ((data.coverage as Record<string, unknown>).traversal as Record<string, unknown>).status = 'failed';
      (data.completion as Record<string, unknown>).traversalStatus = 'unknown';
      (data.completion as Record<string, unknown>).requestStatus = 'partial';
    })],
    ['a stage smuggled into the completion', corrupt(data => {
      (data.completion as Record<string, unknown>).stage = 'query';
    })],
  ];

  const accepted = forbidden
    .filter(([, value]) => validate(schema(), value).length === 0)
    .map(([name]) => name);
  assert.deepEqual(accepted, [], `the schema accepted a forbidden combination: ${accepted.join(', ')}`);
});

// Every partial state the projection can produce still has to satisfy the schema. Rules written to reject
// contradictions are worthless if they also reject the real thing.
test('every reachable state the projection produces satisfies the schema', () => {
  const rows: ReadonlyArray<readonly [Partial<TraversalFacts>, AnalysisObservations]> = [
    [{}, {}],
    [{ incomingCallerCount: 0 }, {}],
    [{ incomingCallerCount: 0 }, { indexing: { status: 'ready', evidence: { signal: 'test-fixture' } } }],
    [{ limits: new Set<TraversalLimit>(['depth']) }, {}],
    [{ limits: new Set<TraversalLimit>(['nodes']) }, {}],
    [{ limits: new Set<TraversalLimit>(['depth', 'nodes']) }, {}],
    [{}, { indexing: { status: 'working' } }],
    [{ incomingCallerCount: 0 }, { indexing: { status: 'working' } }],
    [{}, { interruption: 'timeout' }],
    [{}, { interruption: 'cancelled' }],
    [{}, { interruption: 'provider-failed' }],
    [{}, { semantic: { scope: 'static-plus-inference', evidenceSources: ['inferred-di'] } }],
    [{}, { semantic: { scope: 'static-plus-observation', evidenceSources: ['observed-trace'] } }],
    [{ diagnosticsSupported: false }, {}],
  ];
  for (const [overrides, observations] of rows) {
    assert.deepEqual(
      validate(schema(), envelope(overrides, observations)),
      [],
      JSON.stringify({ overrides: { ...overrides, limits: [...(overrides.limits ?? [])] }, observations }),
    );
  }
});

// ---------------------------------------------------------------------------
// X3, X5, X6, X8 and X9 are also unrepresentable in TypeScript. Compiling each contradiction and requiring
// the compiler to reject it records which combination is blocked and why; `@ts-expect-error` would only
// record that something was rejected.
//
// X1, X7 and X10 are not in this list on purpose: they are not shapes but a rule about who may write a
// field, and the projection enforces that by being the only writer. X2 and X4 are not either: the analyze
// result is still a `Record<string, unknown>`, and provider selection types belong to lane W1-B.
// ---------------------------------------------------------------------------

const TYPE_FIXTURES: ReadonlyArray<readonly [string, string, boolean]> = [
  ['a valid completion (control)', `
    const value: T.SucceededCompletion = {
      requestStatus: 'succeeded', traversalStatus: 'exhausted',
      semanticScope: 'provider-static', indexingStatus: 'unknown',
    };
    export const used = value;
  `, true],
  ['X3 indexing ready without evidence', `
    const value: T.IndexingCoverage = { status: 'ready' };
    export const used = value;
  `, false],
  ['X5 succeeded with a bounded traversal', `
    const value: T.Completion = {
      requestStatus: 'succeeded', traversalStatus: 'depth-limited',
      semanticScope: 'provider-static', indexingStatus: 'unknown',
    };
    export const used = value;
  `, false],
  ['X6 a failed completion on a graph result', `
    const value: T.GraphCompletion = {
      requestStatus: 'failed', traversalStatus: 'not-started',
      semanticScope: 'none', indexingStatus: 'unknown',
    };
    export const used = value;
  `, false],
  ['X8 semantic scope none with a graph', `
    const value: T.SucceededCompletion = {
      requestStatus: 'succeeded', traversalStatus: 'exhausted',
      semanticScope: 'none', indexingStatus: 'unknown',
    };
    export const used = value;
  `, false],
  ['X9 a working index on a succeeded request', `
    const value: T.SucceededCompletion = {
      requestStatus: 'succeeded', traversalStatus: 'exhausted',
      semanticScope: 'provider-static', indexingStatus: 'working',
    };
    export const used = value;
  `, false],
];

test('the type layer rejects the combinations it is responsible for', { timeout: 120000 }, () => {
  const compiler = require.resolve('typescript/lib/tsc.js');
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'impact-lens-types-'));
  try {
    const results = TYPE_FIXTURES.map(([name, body, shouldCompile]) => {
      const slug = name.replace(/[^a-z0-9]+/gi, '-');
      const project = path.join(directory, slug);
      fs.mkdirSync(project, { recursive: true });
      const file = path.join(project, 'fixture.ts');
      fs.writeFileSync(file, `import * as T from ${JSON.stringify(TYPES_PATH.replace(/\.ts$/, ''))};\n${body}\n`);
      // `types: []` keeps the ambient @types/node declarations out of the program. Without it every fixture
      // fails on unrelated library errors and the check would report "rejected" for the wrong reason.
      fs.writeFileSync(path.join(project, 'tsconfig.json'), JSON.stringify({
        compilerOptions: {
          noEmit: true,
          strict: true,
          target: 'ES2022',
          module: 'commonjs',
          moduleResolution: 'node',
          types: [],
        },
        files: [file],
      }));
      const result = spawnSync(process.execPath, [compiler, '-p', project], { encoding: 'utf8' });
      return { name, compiled: result.status === 0, shouldCompile, output: result.stdout };
    });
    const wrong = results.filter(entry => entry.compiled !== entry.shouldCompile);
    assert.deepEqual(
      wrong.map(entry => `${entry.name}: expected ${entry.shouldCompile ? 'accept' : 'reject'}\n${entry.output}`),
      [],
    );
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// Forbidden phrasing. The whole point of this contract is that a bounded result never reads as a verdict.
// ---------------------------------------------------------------------------

const FORBIDDEN_PHRASES = [
  'no impact',
  'safe to change',
  'unused',
  'fully analyzed',
  'complete analysis',
  'all callers',
] as const;

function forbiddenPhrasesIn(text: string): readonly string[] {
  const lowered = text.toLowerCase();
  return FORBIDDEN_PHRASES.filter(phrase => lowered.includes(phrase));
}

test('no reachable state produces a forbidden phrase anywhere in the response', () => {
  const rows: ReadonlyArray<readonly [Partial<TraversalFacts>, AnalysisObservations]> = [
    [{}, {}],
    [{ incomingCallerCount: 0 }, {}],
    [{ incomingCallerCount: 0 }, { indexing: { status: 'ready', evidence: { signal: 'test-fixture' } } }],
    [{ limits: new Set<TraversalLimit>(['depth']) }, {}],
    [{ limits: new Set<TraversalLimit>(['nodes']) }, {}],
    [{ limits: new Set<TraversalLimit>(['depth', 'nodes']), diagnosticsSupported: false }, {}],
    [{}, { indexing: { status: 'working' } }],
    [{ incomingCallerCount: 0 }, { indexing: { status: 'working' } }],
    [{}, { interruption: 'timeout' }],
    [{}, { interruption: 'cancelled' }],
    [{}, { interruption: 'provider-failed' }],
    [{}, { semantic: { scope: 'static-plus-inference', evidenceSources: ['inferred-di'] } }],
    [{}, { semantic: { scope: 'static-plus-observation', evidenceSources: ['observed-trace'] } }],
  ];
  // The scan covers the serialized envelope, not just the code list: a phrase smuggled into a `message` or
  // an `action` is exactly as damaging as one used as a code, and a code-only check would not see it.
  const offenders = rows
    .map(([overrides, observations]) => ({
      row: JSON.stringify({ limits: [...(overrides.limits ?? [])], ...observations }),
      phrases: forbiddenPhrasesIn(JSON.stringify(envelope(overrides, observations))),
    }))
    .filter(entry => entry.phrases.length > 0);
  assert.deepEqual(offenders, []);
});

// The guard is only worth anything if it can see a violation, so prove it fails on a planted one.
test('the forbidden phrase scan actually detects a violation', () => {
  assert.deepEqual(forbiddenPhrasesIn('This symbol is Unused and safe to change.'), ['safe to change', 'unused']);
  assert.deepEqual(forbiddenPhrasesIn('No incoming callers were returned for this symbol.'), []);
});
