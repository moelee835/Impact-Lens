import assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import test from 'node:test';
import { analyzeImpact } from '../impact';
import { LspCallHierarchyProvider } from '../lspProvider';

test('analyzes a real cross-file TypeScript incoming call', { timeout: 30000 }, async t => {
  const workspace = await fs.mkdtemp(path.join(os.tmpdir(), 'impact-lens-lsp-'));
  t.after(() => fs.rm(workspace, { recursive: true, force: true }));
  await fs.writeFile(path.join(workspace, 'tsconfig.json'), JSON.stringify({
    compilerOptions: { target: 'ES2022', module: 'commonjs', strict: true },
    include: ['*.ts'],
  }));
  await fs.writeFile(path.join(workspace, 'target.ts'), 'export function target(value: number): number { return value + 1; }\n');
  await fs.writeFile(path.join(workspace, 'caller.ts'), "import { target } from './target';\nexport function caller(): number { return target(1); }\n");
  const provider = new LspCallHierarchyProvider(workspace, undefined, 15000);
  try {
    const result = await analyzeImpact({
      workspace,
      file: 'target.ts',
      line: 1,
      column: 17,
      depth: 1,
      maxNodes: 10,
    }, provider);
    const nodes = result.nodes as Array<{ name: string; relation: string; file: string }>;
    assert.ok(nodes.some(node => node.name === 'target' && node.relation === 'root'));
    assert.ok(
      nodes.some(node => node.relation === 'direct' && node.file === 'caller.ts'),
      JSON.stringify(nodes),
    );
    assert.equal((result.edges as unknown[]).length, 1);
  } finally {
    await provider.dispose();
  }
});
