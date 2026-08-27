import assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import test from 'node:test';
import { pathToFileURL } from 'node:url';
import { analyzeImpact } from '../impact';
import { LspCallHierarchyProvider } from '../lspProvider';

test('waits for diagnostics the server publishes instead of for a fixed 100ms', { timeout: 30000 }, async t => {
  // The old wait was a flat 100ms sleep, so everything a slower server published afterwards was
  // dropped. That is not "no diagnostics" — it is a report about the provider produced by a
  // stopwatch, and two runs of the same build disagreed about `observed.diagnostics` because of it.
  const workspace = await fs.mkdtemp(path.join(os.tmpdir(), 'impact-lens-diagnostics-'));
  t.after(() => fs.rm(workspace, { recursive: true, force: true }));
  const file = path.join(workspace, 'late.ts');
  await fs.writeFile(file, 'export function late(): void {}\n');
  const provider = new LspCallHierarchyProvider(workspace, 'late.ts', {
    command: process.execPath,
    args: [path.resolve(__dirname, 'fixtures', 'slowDiagnosticsServer.js')],
    languageId: 'typescript',
  }, 5000);
  try {
    const uri = pathToFileURL(file).toString();
    const started = Date.now();
    const diagnostics = await provider.collectDiagnostics([uri]);
    assert.equal(diagnostics.length, 1, JSON.stringify(diagnostics));
    assert.match(diagnostics[0]!.message, /reporting late/);
    // The fixture publishes at 400ms; passing this in under 100ms would mean the assertion above was
    // satisfied by something other than the wait.
    assert.ok(Date.now() - started >= 300, `returned after ${Date.now() - started}ms`);
    assert.equal(provider.capabilities.observed.diagnostics, true);
  } finally {
    await provider.dispose();
  }
});

test('does not spend the diagnostics budget once every opened document has answered', { timeout: 30000 }, async t => {
  const workspace = await fs.mkdtemp(path.join(os.tmpdir(), 'impact-lens-diagnostics-fast-'));
  t.after(() => fs.rm(workspace, { recursive: true, force: true }));
  const previous = process.env.IMPACT_LENS_MOCK_DIAGNOSTICS_DELAY_MS;
  process.env.IMPACT_LENS_MOCK_DIAGNOSTICS_DELAY_MS = '0';
  t.after(() => {
    process.env.IMPACT_LENS_MOCK_DIAGNOSTICS_DELAY_MS = previous;
  });
  const file = path.join(workspace, 'fast.ts');
  await fs.writeFile(file, 'export function fast(): void {}\n');
  const provider = new LspCallHierarchyProvider(workspace, 'fast.ts', {
    command: process.execPath,
    args: [path.resolve(__dirname, 'fixtures', 'slowDiagnosticsServer.js')],
    languageId: 'typescript',
  }, 5000);
  try {
    const started = Date.now();
    await provider.collectDiagnostics([pathToFileURL(file).toString()]);
    // The budget is 2000ms and this server publishes immediately. Returning on the publish rather
    // than on the clock is what keeps the wait from becoming dead time for a fast server.
    assert.ok(Date.now() - started < 500, `waited ${Date.now() - started}ms`);
  } finally {
    await provider.dispose();
  }
});

test('analyzes a real cross-file TypeScript incoming call', { timeout: 30000 }, async t => {
  const workspace = await fs.mkdtemp(path.join(os.tmpdir(), 'impact-lens-lsp-'));
  t.after(() => fs.rm(workspace, { recursive: true, force: true }));
  await fs.writeFile(path.join(workspace, 'tsconfig.json'), JSON.stringify({
    compilerOptions: { target: 'ES2022', module: 'commonjs', strict: true },
    include: ['*.ts'],
  }));
  await fs.writeFile(path.join(workspace, 'target.ts'), 'export function target(value: number): number { return value + 1; }\n');
  await fs.writeFile(path.join(workspace, 'caller.ts'), "import { target } from './target';\nexport function caller(): number { return target(1); }\n");
  const provider = new LspCallHierarchyProvider(workspace, 'target.ts', undefined, 15000);
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
    const metadata = result.provider as Record<string, unknown>;
    assert.equal(metadata.host, 'lsp');
    assert.equal(metadata.selectedBy, 'bundled');
    assert.equal(metadata.detectedLanguageId, 'typescript');
    assert.equal(metadata.languageMatch, true);
    assert.equal((metadata.observed as Record<string, unknown>).prepareCallHierarchy, true);
    assert.equal((metadata.observed as Record<string, unknown>).incomingCalls, true);
  } finally {
    await provider.dispose();
  }
});
