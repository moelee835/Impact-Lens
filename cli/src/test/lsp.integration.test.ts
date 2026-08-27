import assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import * as fsSync from 'node:fs';
import test, { type TestContext } from 'node:test';
import { pathToFileURL } from 'node:url';
import { analyzeImpact } from '../impact';
import { LspCallHierarchyProvider } from '../lspProvider';

const SENTINEL = 'IL-SENTINEL-1f3c9a7b2d';

function fixture(name: string): { command: string; args: string[]; languageId: string } {
  return {
    command: process.execPath,
    args: [path.resolve(__dirname, 'fixtures', `${name}.js`)],
    languageId: 'typescript',
  };
}

/** Node turns `process.env[k] = undefined` into the string "undefined", which leaks into the next test. */
function withEnv(t: TestContext, values: Record<string, string>): void {
  for (const [key, value] of Object.entries(values)) {
    const previous = process.env[key];
    process.env[key] = value;
    t.after(() => {
      if (previous === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = previous;
      }
    });
  }
}

/** The fixture writes its record from its own process, so the write follows our notification. */
async function waitForFile(file: string, timeoutMs = 4000): Promise<string> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      return await fs.readFile(file, 'utf8');
    } catch {
      await new Promise(resolve => setTimeout(resolve, 20));
    }
  }
  throw new Error(`${file} never appeared`);
}

async function scratch(t: TestContext, prefix: string): Promise<string> {
  const workspace = await fs.mkdtemp(path.join(os.tmpdir(), prefix));
  t.after(() => fs.rm(workspace, { recursive: true, force: true }));
  await fs.writeFile(path.join(workspace, 'target.ts'), 'export function target(): void {}\n');
  return workspace;
}

test('hands the server the settings it asks for and the options it was configured with', { timeout: 30000 }, async t => {
  const workspace = await scratch(t, 'impact-lens-settings-');
  const settingsLog = path.join(workspace, 'settings.log');
  const settings = {
    typescript: { preferences: { quoteStyle: 'single' }, tsserver: { log: 'off' } },
    unrelated: [1, 2, 3],
  };
  const initializationOptions = { plugins: [], preferences: { includeInlayHints: false } };
  withEnv(t, {
    IMPACT_LENS_MOCK_EXPECT_INIT_OPTIONS: JSON.stringify(initializationOptions),
    IMPACT_LENS_MOCK_CONFIG_ITEMS: JSON.stringify([
      { section: 'typescript.preferences.quoteStyle' },
      { section: 'typescript.missing', scopeUri: 'file:///outside/the/workspace' },
      {},
    ]),
    // Order and length follow the request exactly; an unreachable section answers null; an item with
    // no section answers the whole tree.
    IMPACT_LENS_MOCK_EXPECT_CONFIG: JSON.stringify(['single', null, settings]),
    IMPACT_LENS_MOCK_SETTINGS_LOG: settingsLog,
  });

  const provider = new LspCallHierarchyProvider(workspace, 'target.ts', fixture('settingsRequiredServer'), 8000, {
    initializationOptions,
    settings,
    settingsDelivery: ['on-request', 'did-change-configuration'],
  });
  try {
    // The fixture exits with a description on the first mismatch, so a wrong frame arrives here as
    // that sentence rather than as a bare initialize failure.
    const capabilities = await provider.initializeForDoctor();
    assert.equal(capabilities.name, 'settings-required-server');
    assert.match(await waitForFile(settingsLog), /^didChangeConfiguration:/m);
  } finally {
    await provider.dispose();
  }
});

test('sends no configuration push when the preset did not ask for one', { timeout: 30000 }, async t => {
  const workspace = await scratch(t, 'impact-lens-nopush-');
  const settingsLog = path.join(workspace, 'settings.log');
  withEnv(t, {
    IMPACT_LENS_MOCK_SETTINGS_LOG: settingsLog,
    // The tree is still answered on request; only the unsolicited push is withheld.
    IMPACT_LENS_MOCK_EXPECT_CONFIG: JSON.stringify([{ enabled: true }]),
  });
  // Default delivery, and a tree that is not empty: the push is still withheld, because the preset
  // did not declare it. This is what keeps the bundled TypeScript handshake byte-identical.
  const provider = new LspCallHierarchyProvider(workspace, 'target.ts', fixture('settingsRequiredServer'), 8000, {
    settings: { impactLens: { enabled: true } },
  });
  try {
    await provider.initializeForDoctor();
    // Long enough that a push sent with `initialized` would have been written by now.
    await new Promise(resolve => setTimeout(resolve, 300));
    assert.equal(fsSync.existsSync(settingsLog), false, 'a didChangeConfiguration was pushed');
  } finally {
    await provider.dispose();
  }
});

test('keeps configured secrets out of everything the provider reports', { timeout: 30000 }, async t => {
  const workspace = await scratch(t, 'impact-lens-secret-');
  const provider = new LspCallHierarchyProvider(workspace, 'target.ts', fixture('secretEchoServer'), 8000, {
    // One secret sits under a key no name rule would flag, and one under a key that any rule would.
    // Both have to disappear: the declaration covers the first, the heuristic backstops the second.
    initializationOptions: { licenseServer: { credential: `${SENTINEL}-init` } },
    settings: { vendor: { apiKey: `${SENTINEL}-settings` }, harmless: 'kept' },
    sensitive: { initializationOptions: ['licenseServer.credential'] },
  });
  try {
    await assert.rejects(
      () => provider.initializeForDoctor(),
      (error: any) => {
        // Everything the CLI would put on stderr for this failure: the message and the details.
        const reported = `${error.message}\n${JSON.stringify(error.details ?? {})}`;
        assert.doesNotMatch(reported, new RegExp(SENTINEL), reported);
        // Proof that the echo actually happened, so the assertion above is not passing on silence.
        assert.match(reported, /starting with options .*\[REDACTED\]/);
        assert.match(reported, /applied workspace settings .*\[REDACTED\]/);
        // Non-secret values are untouched; blanket redaction would make diagnostics useless.
        assert.match(reported, /harmless/);
        return true;
      },
    );
  } finally {
    await provider.dispose();
  }
});

test('reports the same diagnostics observation for the same input every time', { timeout: 60000 }, async t => {
  // The fixed 100ms wait made this field a race: under load the publish lost, and the same request
  // reported a different provider state run to run. A report that changes without its subject
  // changing is worse than a missing one, because nothing tells the reader which run to believe.
  const workspace = await scratch(t, 'impact-lens-determinism-');
  const observed: unknown[] = [];
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const provider = new LspCallHierarchyProvider(workspace, 'target.ts', fixture('slowDiagnosticsServer'), 8000);
    try {
      await provider.initializeForDoctor();
      await provider.collectDiagnostics([pathToFileURL(path.join(workspace, 'target.ts')).toString()]);
      observed.push(provider.capabilities.observed.diagnostics);
    } finally {
      await provider.dispose();
    }
  }
  assert.deepEqual(observed, [true, true, true, true]);
});

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
  withEnv(t, { IMPACT_LENS_MOCK_DIAGNOSTICS_DELAY_MS: '0' });
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
