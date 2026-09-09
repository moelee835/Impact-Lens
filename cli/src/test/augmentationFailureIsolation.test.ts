import assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import test from 'node:test';
import { pathToFileURL } from 'node:url';
import { analyzeImpact } from '../impact';
import * as adaptersModule from '../shared/adapters';
import { AdapterInput, AdapterResult, RegisteredAdapter } from '../shared/adapters/types';
import {
  AugmentedEdge,
  CallHierarchyItem,
  CallHierarchyProvider,
  IncomingCall,
  ProviderCapabilities,
  ProviderDiagnostic,
} from '../types';

// M4 augmentation-failure-isolation lane (docs/work/task-m4-augmentation-failure-isolation.md, closing
// the M4 closure audit's Gate 1: "보조 분석 실패가 기존 정적 그래프를 실패시키지 않는다"). Before this
// lane, an adapter throwing propagated all the way out of `analyzeImpact()`, destroying the already-
// computed static graph along with it - and, with a second registered adapter (`dynamic-callback-
// static-v1`, PR #95), a throw in one adapter would also have erased every OTHER adapter's already-found
// edges in the same run, since nothing isolated one adapter's loop iteration from the next.
//
// Two failure layers are tested separately because they are semantically different (commander's finding,
// recorded in the design doc): `augmentation_adapter_failed` is an ADAPTER reaching one of its own
// documented failure modes ("if it cannot confirm, produce nothing" - throwing is one more way of not
// confirming); `augmentation_internal_error` is this codebase's OWN orchestration code breaking outside
// any adapter's control. Conflating them would let a real bug in `runAugmentation()` hide forever behind
// wording that reads as "an adapter had trouble".

const range = (line: number) => ({
  start: { line, character: 0 },
  end: { line, character: 10 },
});

function item(workspace: string, file: string, name: string, line: number): CallHierarchyItem {
  return {
    name,
    kind: 12,
    uri: pathToFileURL(`${workspace}/${file}`).toString(),
    range: range(line),
    selectionRange: range(line),
  };
}

class FakeProvider implements CallHierarchyProvider {
  readonly capabilities: ProviderCapabilities = {
    host: 'lsp',
    name: 'fake-provider',
    version: '1.0.0',
    requestedLanguageId: 'typescript',
    detectedLanguageId: 'typescript',
    selectedBy: 'custom',
    languageMatch: true,
    callHierarchy: true,
    diagnostics: true,
    advertised: { callHierarchy: true, diagnostics: true },
    observed: { prepareCallHierarchy: true, incomingCalls: true, diagnostics: true },
    lifecycle: { stage: 'query', status: 'ready' },
  };

  constructor(
    private readonly root: CallHierarchyItem,
    private readonly calls: ReadonlyMap<string, readonly IncomingCall[]> = new Map(),
    private readonly diagnostics: readonly ProviderDiagnostic[] = [],
  ) {}

  async prepare(): Promise<readonly CallHierarchyItem[]> {
    return [this.root];
  }

  async incoming(value: CallHierarchyItem): Promise<readonly IncomingCall[]> {
    return this.calls.get(value.name) ?? [];
  }

  async collectDiagnostics(): Promise<readonly ProviderDiagnostic[]> {
    return this.diagnostics;
  }

  async dispose(): Promise<void> {}
}

async function workspaceFixture(t: { after(callback: () => Promise<void>): void }, rootFile: string): Promise<string> {
  const workspace = await fs.mkdtemp(path.join(os.tmpdir(), 'impact-lens-augmentation-isolation-'));
  t.after(() => fs.rm(workspace, { recursive: true, force: true }));
  await fs.mkdir(path.dirname(path.join(workspace, rootFile)), { recursive: true });
  await fs.writeFile(path.join(workspace, rootFile), 'export function root(): void {}\n');
  return workspace;
}

function stubEdge(adapterId: string, targetId: string): AugmentedEdge {
  return {
    source: { kind: 'existing', id: 'root-id' },
    target: { kind: 'existing', id: targetId },
    adapterId,
    evidenceSource: 'static-inference',
    resolution: 'single',
    reasonCode: 'callback-registration',
    evidenceRanges: [],
  };
}

function succeedingAdapter(id: string, edge: AugmentedEdge): RegisteredAdapter {
  return {
    id,
    languageIds: ['typescript'],
    run: async (_input: AdapterInput): Promise<AdapterResult> => ({
      edges: [edge],
      budgetExceeded: false,
      mountUnresolved: false,
    }),
  };
}

function throwingAdapter(id: string, error: () => Error): RegisteredAdapter {
  return {
    id,
    languageIds: ['typescript'],
    run: async (_input: AdapterInput): Promise<AdapterResult> => {
      throw error();
    },
  };
}

// ---------------------------------------------------------------------------
// Layer 1: runAugmentation() itself - per-adapter isolation inside its own loop.
// ---------------------------------------------------------------------------

test('one adapter throwing does not affect another adapter\'s edges in the same run', async () => {
  const goodEdge = stubEdge('good-adapter-v1', 'survivor');
  const adapters: readonly RegisteredAdapter[] = [
    throwingAdapter('bad-adapter-v1', () => new TypeError('synthetic failure')),
    succeedingAdapter('good-adapter-v1', goodEdge),
  ];
  const root = item('/workspace', 'root.ts', 'root', 0);
  const result = await adaptersModule.runAugmentation(
    true,
    'typescript',
    '/workspace',
    root,
    'root-id',
    { prepare: async () => [root] },
    new Set(['root-id']),
    () => 'root-id',
    adapters,
  );
  assert.deepEqual(result.edges, [goodEdge], 'the throwing adapter must not remove the other adapter\'s edge');
  assert.deepEqual(result.failedAdapters, [{ adapterId: 'bad-adapter-v1', errorKind: 'TypeError' }]);
  assert.deepEqual(result.budgetExceededAdapterIds, []);
  assert.deepEqual(result.mountUnresolvedAdapterIds, []);
});

test('both adapters throwing is reported as two failures, not a thrown exception', async () => {
  const adapters: readonly RegisteredAdapter[] = [
    throwingAdapter('first-v1', () => new RangeError('one')),
    throwingAdapter('second-v1', () => new TypeError('two')),
  ];
  const root = item('/workspace', 'root.ts', 'root', 0);
  const result = await adaptersModule.runAugmentation(
    true,
    'typescript',
    '/workspace',
    root,
    'root-id',
    { prepare: async () => [root] },
    new Set(['root-id']),
    () => 'root-id',
    adapters,
  );
  assert.deepEqual(result.edges, []);
  assert.deepEqual(result.failedAdapters, [
    { adapterId: 'first-v1', errorKind: 'RangeError' },
    { adapterId: 'second-v1', errorKind: 'TypeError' },
  ]);
});

test('a thrown non-Error value is reported with errorKind "unknown", never with its content', async () => {
  const adapters: readonly RegisteredAdapter[] = [
    {
      id: 'throws-a-string-v1',
      languageIds: ['typescript'],
      run: async () => {
        // eslint-disable-next-line @typescript-eslint/no-throw-literal
        throw '/Users/someone/secret-project/src/handler.ts: credentialToken leaked here';
      },
    },
  ];
  const root = item('/workspace', 'root.ts', 'root', 0);
  const result = await adaptersModule.runAugmentation(
    true,
    'typescript',
    '/workspace',
    root,
    'root-id',
    { prepare: async () => [root] },
    new Set(['root-id']),
    () => 'root-id',
    adapters,
  );
  assert.deepEqual(result.failedAdapters, [{ adapterId: 'throws-a-string-v1', errorKind: 'unknown' }]);
});

test('an adapter not registered for this languageId is skipped, not counted as a failure', async () => {
  const adapters: readonly RegisteredAdapter[] = [
    throwingAdapter('python-only-v1', () => new Error('should never run')),
  ];
  const pythonOnly: RegisteredAdapter = { ...adapters[0]!, languageIds: ['python'] };
  const root = item('/workspace', 'root.ts', 'root', 0);
  const result = await adaptersModule.runAugmentation(
    true,
    'typescript',
    '/workspace',
    root,
    'root-id',
    { prepare: async () => [root] },
    new Set(['root-id']),
    () => 'root-id',
    [pythonOnly],
  );
  assert.deepEqual(result.failedAdapters, []);
});

// ---------------------------------------------------------------------------
// Layer 2: analyzeImpact()'s own outer catch - runAugmentation() itself throwing, i.e. a bug in this
// codebase's orchestration code rather than in any adapter (`augmentation_internal_error`, not
// `augmentation_adapter_failed`). Reached by mocking the `runAugmentation` export directly: `impact.ts`
// compiles its call as a property lookup on the required module object (`(0,
// adapters_1.runAugmentation)(...)`), so replacing that property redirects the real call without any
// production code change.
// ---------------------------------------------------------------------------

test(
  'analyzeImpact() survives runAugmentation() itself throwing, reports augmentation_internal_error, static graph untouched',
  async t => {
    const workspace = await workspaceFixture(t, 'src/root.ts');
    const root = item(workspace, 'src/root.ts', 'root', 0);
    const direct = item(workspace, 'src/direct.ts', 'direct', 2);
    const provider = new FakeProvider(root, new Map([
      ['root', [{ from: direct, fromRanges: [range(3)] }]],
    ]));
    const request = {
      workspace,
      file: 'src/root.ts',
      line: 1,
      column: 1,
      depth: 5,
      maxNodes: 50,
    };

    const baseline = await analyzeImpact({ ...request, augmentationEnabled: false }, provider);

    t.mock.method(adaptersModule, 'runAugmentation', async () => {
      throw new TypeError('synthetic orchestration failure');
    });
    const result = await analyzeImpact({ ...request, augmentationEnabled: true }, provider);

    // The static graph must be byte-for-byte what it would have been with augmentation off - the outer
    // catch in impact.ts must not be able to touch anything computed before it runs.
    assert.deepEqual(result.nodes, baseline.nodes);
    assert.deepEqual(result.edges, baseline.edges);
    assert.equal(result.truncated, baseline.truncated);
    assert.deepEqual(result.traversalLimits, baseline.traversalLimits);
    assert.equal(result.complete, baseline.complete);
    assert.deepEqual(result.provider, baseline.provider);
    assert.deepEqual((result.coverage as { traversal: unknown }).traversal, (baseline.coverage as { traversal: unknown }).traversal);
    assert.deepEqual((result.coverage as { indexing: unknown }).indexing, (baseline.coverage as { indexing: unknown }).indexing);

    // Augmentation-specific fields are the only ones allowed to differ.
    assert.deepEqual(result.augmentedEdges, []);
    const details = result.limitationDetails as Array<{ code: string; severity: string; message: string }>;
    const internalErrorDetail = details.find(detail => detail.code === 'augmentation_internal_error');
    assert.ok(internalErrorDetail, 'expected an augmentation_internal_error limitation detail');
    assert.equal(internalErrorDetail!.severity, 'warning');
    assert.ok(internalErrorDetail!.message.includes('TypeError'), 'the error kind should be named in the message');
    assert.ok(!details.some(detail => detail.code === 'augmentation_adapter_failed'), 'an orchestration-level throw must not be reported as an adapter failure');
    assert.ok((result.limitations as string[]).includes('augmentation_internal_error'));
  },
);
