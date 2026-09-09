import assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import test from 'node:test';
import { pathToFileURL } from 'node:url';
import { analyzeImpact } from '../impact';
import * as adaptersModule from '../shared/adapters';
import { fastapiDependencyAdapter } from '../shared/adapters/fastapiDependencyAdapter';
import { RegisteredAdapter } from '../shared/adapters/types';
import { CallHierarchyItem, ProviderCapabilities } from '../types';

// M4 gate 7 (docs/work/task-m4-gate7-apply-maxfiles.md, raising DEFAULT_BUDGET.maxFiles 200 -> 1500).
// commander's finding: every committed test that touches `budgetExceeded`/`budgetExceededAdapterIds`
// either stubs an adapter to return `budgetExceeded: false` (augmentationFailureIsolation.test.ts) or
// hand-writes a response JSON asserting the LIMITATION WORDING (scripts/fixtures/response-policy/
// 25-augmentation-budget-exceeded-correctly-reported.json) - neither one ever runs the REAL adapter's
// real file-walk-truncation code path end to end. Raising maxFiles 7.5x makes that path fire far less
// often in real use, which makes an already-untested path worse, not better, to leave untested - this
// closes that gap by injecting the real `fastapiDependencyAdapter` (not a stub) with an artificially
// tiny budget, through the same `runAugmentation` adapters-injection point the failure-isolation lane
// already uses, and following the result all the way through `analyzeImpact()` to the actual
// `augmentation_budget_exceeded` limitation detail a user would see.

function range(line: number) {
  return { start: { line, character: 0 }, end: { line, character: 4 } };
}

function pythonRootItem(workspace: string, file: string): CallHierarchyItem {
  return {
    name: 'target',
    kind: 12,
    uri: pathToFileURL(path.join(workspace, file)).toString(),
    range: range(0),
    selectionRange: range(0),
  };
}

const capabilities: ProviderCapabilities = {
  host: 'lsp',
  name: 'fake-python-provider',
  version: '1.0.0',
  requestedLanguageId: 'python',
  detectedLanguageId: 'python',
  selectedBy: 'custom',
  languageMatch: true,
  callHierarchy: true,
  diagnostics: true,
  advertised: { callHierarchy: true, diagnostics: true },
  observed: { prepareCallHierarchy: true, incomingCalls: true, diagnostics: true },
  lifecycle: { stage: 'query', status: 'ready' },
};

async function twoFilePythonWorkspace(t: { after(callback: () => Promise<void>): void }): Promise<string> {
  const workspace = await fs.mkdtemp(path.join(os.tmpdir(), 'impact-lens-gate7-budget-e2e-'));
  t.after(() => fs.rm(workspace, { recursive: true, force: true }));
  // Two plain .py files (content is irrelevant to `budgetExceeded`, only the file COUNT matters -
  // `walkPythonFiles()` sets `truncated` purely from `filesVisited >= maxFiles`, never from content) -
  // enough for `maxFiles: 1` to truncate on the second one regardless of directory read order.
  await fs.writeFile(path.join(workspace, 'a.py'), 'def target():\n    pass\n');
  await fs.writeFile(path.join(workspace, 'b.py'), 'def other():\n    pass\n');
  return workspace;
}

function tinyBudgetFastapiAdapter(): RegisteredAdapter {
  return {
    id: 'fastapi-static-v1',
    languageIds: ['python'],
    run: fastapiDependencyAdapter, // the REAL production adapter, not a stub
    budget: { maxFiles: 1, maxMatchesPerFile: 20 },
  };
}

function generousBudgetFastapiAdapter(): RegisteredAdapter {
  return {
    id: 'fastapi-static-v1',
    languageIds: ['python'],
    run: fastapiDependencyAdapter,
    budget: { maxFiles: 1500, maxMatchesPerFile: 20 },
  };
}

async function analyzeWithInjectedAdapter(
  t: { mock: { method: typeof import('node:test').mock.method }; after(callback: () => Promise<void>): void },
  workspace: string,
  adapter: RegisteredAdapter,
) {
  const root = pythonRootItem(workspace, 'a.py');
  const request = { workspace, file: 'a.py', line: 1, column: 5, depth: 5, maxNodes: 50, augmentationEnabled: true };
  // `prepare()` here answers the STATIC traversal's own root-resolution call (`analyzeImpact()`'s first
  // thing it does), always returning `root` - it plays no other role in this scenario. The adapter's own
  // internal `resolveEndpoint()` calls (also routed through this same `prepare`) are never reached: with
  // `maxFiles: 1`, `walkPythonFiles()` processes exactly one plain, `Depends()`-free file, so nothing in
  // `fastapiDependencyAdapter`'s own control flow needs a second `prepare()` call to reach
  // `budgetExceeded: true`.
  const provider = {
    capabilities,
    prepare: async (): Promise<readonly CallHierarchyItem[]> => [root],
    incoming: async () => [],
    collectDiagnostics: async () => [],
    dispose: async () => {},
  };

  const realRunAugmentation = adaptersModule.runAugmentation;
  t.mock.method(adaptersModule, 'runAugmentation', (
    enabled: boolean,
    languageId: string,
    ws: string,
    r: CallHierarchyItem,
    rootId: string,
    p: Parameters<typeof realRunAugmentation>[5],
    existingNodeIds: ReadonlySet<string>,
    idOf: (item: CallHierarchyItem) => string,
  ) => realRunAugmentation(enabled, languageId, ws, r, rootId, p, existingNodeIds, idOf, [adapter]));

  return analyzeImpact(request, provider) as unknown as Promise<{
    limitationDetails: ReadonlyArray<{ code: string; severity: string; message: string }>;
    limitations: readonly string[];
  }>;
}

test(
  'a maxFiles:1 budget on the REAL fastapiDependencyAdapter truncates the walk and surfaces augmentation_budget_exceeded end to end',
  async t => {
    const workspace = await twoFilePythonWorkspace(t);
    const result = await analyzeWithInjectedAdapter(t, workspace, tinyBudgetFastapiAdapter());

    const detail = result.limitationDetails.find(d => d.code === 'augmentation_budget_exceeded');
    assert.ok(detail, `expected augmentation_budget_exceeded in ${JSON.stringify(result.limitationDetails)}`);
    assert.equal(detail!.severity, 'warning');
    assert.ok(result.limitations.includes('augmentation_budget_exceeded'));
  },
);

test(
  'non-vacuity: the SAME two-file workspace with a generous budget (1500, the real production default) never truncates',
  async t => {
    const workspace = await twoFilePythonWorkspace(t);
    const result = await analyzeWithInjectedAdapter(t, workspace, generousBudgetFastapiAdapter());

    const detail = result.limitationDetails.find(d => d.code === 'augmentation_budget_exceeded');
    assert.equal(detail, undefined, `did not expect augmentation_budget_exceeded in ${JSON.stringify(result.limitationDetails)}`);
    assert.ok(!result.limitations.includes('augmentation_budget_exceeded'));
  },
);
