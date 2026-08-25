import assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import test from 'node:test';
import { pathToFileURL } from 'node:url';
import { analyzeImpact } from '../impact';
import {
  CallHierarchyItem,
  CallHierarchyProvider,
  IncomingCall,
  ProviderCapabilities,
  ProviderDiagnostic,
} from '../types';

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
    name: 'fake-provider',
    version: '1.0.0',
    callHierarchy: true,
    diagnostics: true,
  };

  constructor(
    private readonly root: CallHierarchyItem,
    private readonly calls: ReadonlyMap<string, readonly IncomingCall[]>,
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
  const workspace = await fs.mkdtemp(path.join(os.tmpdir(), 'impact-lens-impact-'));
  t.after(() => fs.rm(workspace, { recursive: true, force: true }));
  await fs.mkdir(path.dirname(path.join(workspace, rootFile)), { recursive: true });
  await fs.writeFile(path.join(workspace, rootFile), 'export function root(): void {}\n');
  return workspace;
}

test('returns deterministic direct, transitive, and test relationships', async t => {
  const workspace = await workspaceFixture(t, 'src/root.ts');
  const root = item(workspace, 'src/root.ts', 'root', 0);
  const direct = item(workspace, 'src/direct.ts', 'direct', 2);
  const transitive = item(workspace, 'src/transitive.ts', 'transitive', 4);
  const testCaller = item(workspace, 'tests/root.test.ts', 'root test', 6);
  const provider = new FakeProvider(root, new Map([
    ['root', [
      { from: direct, fromRanges: [range(3)] },
      { from: testCaller, fromRanges: [range(7)] },
    ]],
    ['direct', [{ from: transitive, fromRanges: [range(5)] }]],
  ]));
  const result = await analyzeImpact({
    workspace,
    file: 'src/root.ts',
    line: 1,
    column: 1,
    depth: 2,
    maxNodes: 10,
  }, provider);
  const nodes = result.nodes as Array<{ name: string; relation: string; depth: number; testDistance: number | null }>;
  assert.deepEqual(nodes.map(node => [node.name, node.relation, node.depth, node.testDistance]), [
    ['root', 'root', 0, null],
    ['direct', 'direct', 1, null],
    ['root test', 'test', 1, 1],
    ['transitive', 'transitive', 2, null],
  ]);
  assert.equal((result.edges as unknown[]).length, 3);
  assert.equal(result.truncated, false);
  assert.deepEqual(result.limitations, ['dynamic_calls_not_inferred', 'unsaved_buffers_unavailable']);
});

test('reports depth truncation and retains cycle edges', async t => {
  const workspace = await workspaceFixture(t, 'root.ts');
  const root = item(workspace, 'root.ts', 'root', 0);
  const direct = item(workspace, 'direct.ts', 'direct', 0);
  const hidden = item(workspace, 'hidden.ts', 'hidden', 0);
  const provider = new FakeProvider(root, new Map([
    ['root', [{ from: direct, fromRanges: [range(1)] }]],
    ['direct', [
      { from: root, fromRanges: [range(1)] },
      { from: hidden, fromRanges: [range(1)] },
    ]],
  ]));
  const result = await analyzeImpact({
    workspace,
    file: 'root.ts',
    line: 1,
    column: 1,
    depth: 1,
    maxNodes: 10,
  }, provider);
  assert.equal(result.truncated, true);
  assert.deepEqual(result.traversalLimits, ['depth']);
  assert.equal((result.edges as unknown[]).length, 1);
});

test('does not return dangling edges when the node limit is reached', async t => {
  const workspace = await workspaceFixture(t, 'root.ts');
  const root = item(workspace, 'root.ts', 'root', 0);
  const omitted = item(workspace, 'omitted.ts', 'omitted', 0);
  const provider = new FakeProvider(root, new Map([
    ['root', [{ from: omitted, fromRanges: [range(1)] }]],
  ]));
  const result = await analyzeImpact({
    workspace,
    file: 'root.ts',
    line: 1,
    column: 1,
    depth: 1,
    maxNodes: 1,
  }, provider);
  assert.equal((result.nodes as unknown[]).length, 1);
  assert.equal((result.edges as unknown[]).length, 0);
  assert.deepEqual(result.traversalLimits, ['nodes']);
});

test('rejects ambiguous provider roots instead of selecting one', async t => {
  const workspace = await workspaceFixture(t, 'root.ts');
  const root = item(workspace, 'root.ts', 'root', 0);
  const provider = new FakeProvider(root, new Map());
  provider.prepare = async () => [root, { ...root, name: 'other' }];
  await assert.rejects(
    analyzeImpact({ workspace, file: 'root.ts', line: 1, column: 1 }, provider),
    (error: unknown) => Boolean(error && typeof error === 'object' && 'code' in error && error.code === 'target_ambiguous'),
  );
});
