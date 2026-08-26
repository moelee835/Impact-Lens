import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import test, { type TestContext } from 'node:test';

const posixOnly = process.platform === 'win32' ? test.skip : test;

interface Harness {
  readonly root: string;
  readonly runner: string;
  readonly bin: string;
  readonly capture: string;
  readonly env: NodeJS.ProcessEnv;
}

async function executable(file: string, contents: string): Promise<void> {
  await fs.writeFile(file, contents, { mode: 0o755 });
}

async function createHarness(t: TestContext): Promise<Harness> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'impact-lens-runner-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const runner = path.join(root, 'plugins', 'impact-lens', 'scripts', 'run-impact-lens');
  const bin = path.join(root, 'bin');
  const capture = path.join(root, 'capture.txt');
  await fs.mkdir(path.dirname(runner), { recursive: true });
  await fs.mkdir(bin, { recursive: true });
  await fs.copyFile(path.resolve(__dirname, '..', '..', '..', 'plugins', 'impact-lens', 'scripts', 'run-impact-lens'), runner);
  await fs.chmod(runner, 0o755);
  await executable(path.join(bin, 'dirname'), '#!/bin/sh\nexec /usr/bin/dirname "$@"\n');
  await executable(path.join(bin, 'node'), `#!/bin/sh
if [ "\${1:-}" = "-p" ]; then
  printf '%s\\n' "\${IMPACT_LENS_TEST_NODE_MAJOR:-22}"
  exit 0
fi
printf '%s\\n' "\${IMPACT_LENS_RUNNER_SOURCE:-}" > "\$IMPACT_LENS_TEST_CAPTURE"
printf '%s\\n' "\$@" >> "\$IMPACT_LENS_TEST_CAPTURE"
printf '{}\\n'
`);
  return {
    root,
    runner,
    bin,
    capture,
    env: {
      ...process.env,
      PATH: bin,
      IMPACT_LENS_TEST_CAPTURE: capture,
    },
  };
}

function run(harness: Harness, args: readonly string[], env: NodeJS.ProcessEnv = {}) {
  return spawnSync('/bin/sh', [harness.runner, ...args], {
    encoding: 'utf8',
    env: { ...harness.env, ...env },
  });
}

async function capturedLines(harness: Harness): Promise<string[]> {
  return (await fs.readFile(harness.capture, 'utf8')).trim().split('\n');
}

posixOnly('runner records explicit source and preserves arguments', async t => {
  const harness = await createHarness(t);
  const cli = path.join(harness.root, 'explicit cli');
  await executable(cli, `#!/bin/sh
printf '%s\\n' "\${IMPACT_LENS_RUNNER_SOURCE:-}" > "\$IMPACT_LENS_TEST_CAPTURE"
printf '%s\\n' "\$@" >> "\$IMPACT_LENS_TEST_CAPTURE"
printf '{}\\n'
`);
  const result = run(harness, ['analyze', '--file', 'space name.ts'], { IMPACT_LENS_CLI_PATH: cli });
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(await capturedLines(harness), ['explicit', 'analyze', '--file', 'space name.ts']);
});

posixOnly('runner records checkout source for the repository entry', async t => {
  const harness = await createHarness(t);
  const checkout = path.join(harness.root, 'cli', 'dist', 'index.js');
  await fs.mkdir(path.dirname(checkout), { recursive: true });
  await fs.writeFile(checkout, '// fake checkout entry\n');
  const result = run(harness, ['note', 'list']);
  assert.equal(result.status, 0, result.stderr);
  const lines = await capturedLines(harness);
  assert.equal(lines[0], 'checkout');
  assert.equal(path.resolve(lines[1] ?? ''), checkout);
  assert.deepEqual(lines.slice(2), ['note', 'list']);
});

posixOnly('runner records global source', async t => {
  const harness = await createHarness(t);
  await executable(path.join(harness.bin, 'impact-lens'), `#!/bin/sh
printf '%s\\n' "\${IMPACT_LENS_RUNNER_SOURCE:-}" > "\$IMPACT_LENS_TEST_CAPTURE"
printf '%s\\n' "\$@" >> "\$IMPACT_LENS_TEST_CAPTURE"
printf '{}\\n'
`);
  const result = run(harness, ['note', 'list']);
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(await capturedLines(harness), ['global', 'note', 'list']);
});

posixOnly('runner records release fallback and keeps the package override out of diagnostics', async t => {
  const harness = await createHarness(t);
  await executable(path.join(harness.bin, 'npm'), `#!/bin/sh
printf '%s\\n' "\${IMPACT_LENS_RUNNER_SOURCE:-}" > "\$IMPACT_LENS_TEST_CAPTURE"
printf '%s\\n' "\$@" >> "\$IMPACT_LENS_TEST_CAPTURE"
printf '{}\\n'
`);
  const packageOverride = 'https://user:secret@example.invalid/private.tgz';
  const result = run(harness, ['analyze', '--stdin'], { IMPACT_LENS_CLI_PACKAGE: packageOverride });
  assert.equal(result.status, 0, result.stderr);
  const lines = await capturedLines(harness);
  assert.equal(lines[0], 'release-fallback');
  assert.ok(lines.includes(`--package=${packageOverride}`));
  assert.doesNotMatch(result.stderr, /secret/);
});

posixOnly('runner rejects an unsupported Node before resolving any CLI source', async t => {
  const harness = await createHarness(t);
  const result = run(harness, ['analyze'], { IMPACT_LENS_TEST_NODE_MAJOR: '20' });
  assert.equal(result.status, 127);
  assert.equal(result.stdout, '');
  const response = JSON.parse(result.stderr);
  assert.equal(response.operation, 'impact.analyze');
  assert.equal(response.error.code, 'node_version_unsupported');
  assert.equal(response.error.details.detectedMajor, 20);
  assert.equal(response.runtime.node.major, 20);
  assert.equal(response.runtime.runner.source, 'direct');
});

posixOnly('runner distinguishes missing explicit artifacts and missing npm', async t => {
  const harness = await createHarness(t);
  const missingCli = run(harness, ['note', 'list'], { IMPACT_LENS_CLI_PATH: path.join(harness.root, 'missing') });
  assert.equal(missingCli.status, 127);
  assert.equal(JSON.parse(missingCli.stderr).error.code, 'cli_artifact_missing');
  assert.equal(JSON.parse(missingCli.stderr).error.details.source, 'explicit');
  assert.equal(JSON.parse(missingCli.stderr).runtime.runner.source, 'explicit');

  const missingNpm = run(harness, ['note', 'list']);
  assert.equal(missingNpm.status, 127);
  assert.equal(JSON.parse(missingNpm.stderr).error.code, 'npm_runtime_unavailable');
  assert.equal(JSON.parse(missingNpm.stderr).error.details.source, 'release-fallback');
  assert.equal(JSON.parse(missingNpm.stderr).runtime.runner.source, 'release-fallback');
});
