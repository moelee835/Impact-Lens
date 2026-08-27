import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const repository = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const npmInvocation = process.platform === 'win32'
  ? {
      command: process.execPath,
      prefixArgs: [requiredNpmExecPath()],
    }
  : { command: 'npm', prefixArgs: [] };
const shell = process.platform === 'win32' ? findExecutable('bash.exe', 'bash') : '/bin/sh';
const temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'impact-lens-plugin-artifact-'));

try {
  const npmCache = path.join(temporary, 'npm-cache');
  const artifacts = path.join(temporary, 'artifacts');
  const cleanPrefix = path.join(temporary, 'clean-prefix');
  await fs.mkdir(artifacts, { recursive: true });

  const packed = runNpm(['pack', '--json', '--pack-destination', artifacts], {
    cwd: path.join(repository, 'cli'),
    env: { npm_config_cache: npmCache, npm_config_loglevel: 'silent' },
  });
  const packResult = JSON.parse(packed.stdout.trim());
  assert.ok(Array.isArray(packResult) && typeof packResult[0]?.filename === 'string', packed.stdout);
  const tarball = path.join(artifacts, packResult[0].filename);

  runNpm([
    'install', '--prefix', cleanPrefix, '--no-package-lock', '--ignore-scripts', '--no-audit', '--no-fund', tarball,
  ], {
    env: { npm_config_cache: npmCache, npm_config_loglevel: 'error' },
    timeout: 300000,
  });

  const installedDoctor = runNpm([
    'exec', '--prefix', cleanPrefix, '--offline', '--', 'impact-lens', 'doctor', 'bundled-typescript', '--smoke',
  ], {
    env: { npm_config_cache: npmCache, npm_config_loglevel: 'error' },
  });
  const installedDoctorResponse = parseEnvelope(installedDoctor.stdout);
  assert.equal(installedDoctorResponse.ok, true);
  assert.equal(installedDoctorResponse.runtime.runner.source, 'direct');
  assert.equal(installedDoctorResponse.data.mode, 'smoke');

  const layouts = [
    path.join(temporary, 'codex', 'plugins', 'cache', 'personal', 'impact-lens', '0.1.0'),
    path.join(temporary, 'claude', 'plugins', 'cache', 'impact-lens', '0.1.0'),
  ];
  for (const pluginRoot of layouts) {
    await fs.mkdir(path.dirname(pluginRoot), { recursive: true });
    await fs.cp(path.join(repository, 'plugins', 'impact-lens'), pluginRoot, { recursive: true });
    const runner = path.join(pluginRoot, 'scripts', 'run-impact-lens');
    if (process.platform !== 'win32') {
      await fs.chmod(runner, 0o755);
    }
    await verifyPluginLayout(runner, tarball, npmCache, pluginRoot.includes(`${path.sep}codex${path.sep}`) ? 'codex' : 'claude');
  }

  process.stdout.write('Plugin artifact E2E passed: clean install and Codex/Claude TS/TSX/JS/JSX release fallback.\n');
} finally {
  await fs.rm(temporary, { recursive: true, force: true });
}

async function verifyPluginLayout(runner, tarball, npmCache, layout) {
  const commonEnvironment = {
    IMPACT_LENS_CLI_PACKAGE: tarball,
    npm_config_cache: npmCache,
    npm_config_loglevel: 'error',
    npm_config_offline: 'true',
  };
  const doctor = run(shell, [runner, 'doctor', 'bundled-typescript', '--smoke'], { env: commonEnvironment });
  const doctorResponse = parseEnvelope(doctor.stdout);
  assert.equal(doctorResponse.ok, true, `${layout}: ${doctor.stdout}`);
  assert.equal(doctorResponse.runtime.runner.source, 'release-fallback');
  assert.equal(doctorResponse.data.mode, 'smoke');
  // Doctor can now report a partial failure, so a packaged artifact that is missing something says so
  // instead of looking healthy. Reading only `mode` would let every check fail unnoticed.
  assert.equal(doctorResponse.data.preset.id, 'bundled-typescript');
  assert.equal(
    doctorResponse.data.status,
    'ready',
    `${layout}: ${JSON.stringify(doctorResponse.data.checks)}`,
  );
  assert.ok(
    doctorResponse.data.checks.every(check => check.status === 'pass'),
    `${layout}: ${JSON.stringify(doctorResponse.data.checks)}`,
  );

  for (const fixture of [
    { extension: 'ts', suffix: 'Ts', languageId: 'typescript' },
    { extension: 'tsx', suffix: 'Tsx', languageId: 'typescriptreact' },
    { extension: 'js', suffix: 'Js', languageId: 'javascript' },
    { extension: 'jsx', suffix: 'Jsx', languageId: 'javascriptreact' },
  ]) {
    const workspace = path.join(path.dirname(runner), '..', 'e2e-workspaces', fixture.extension);
    await fs.mkdir(workspace, { recursive: true });
    await fs.writeFile(path.join(workspace, 'tsconfig.json'), JSON.stringify({
      compilerOptions: {
        allowJs: true,
        checkJs: false,
        jsx: 'preserve',
        module: 'commonjs',
        target: 'ES2022',
      },
      include: [`*.${fixture.extension}`],
    }));
    const targetName = `target${fixture.suffix}`;
    const callerName = `caller${fixture.suffix}`;
    const targetFile = `target.${fixture.extension}`;
    const callerFile = `caller.${fixture.extension}`;
    await fs.writeFile(path.join(workspace, targetFile), `export function ${targetName}(value) { return value + 1; }\n`);
    await fs.writeFile(
      path.join(workspace, callerFile),
      `import { ${targetName} } from './target';\nexport function ${callerName}() { return ${targetName}(1); }\n`,
    );
    const request = {
      workspace,
      file: targetFile,
      line: 1,
      column: 17,
      depth: 1,
      maxNodes: 10,
      expectedSymbol: { name: targetName, kind: 'function' },
    };
    const analysis = run(shell, [runner, 'analyze', '--stdin'], {
      env: commonEnvironment,
      input: JSON.stringify(request),
      timeout: 30000,
    });
    const response = parseEnvelope(analysis.stdout);
    assert.equal(response.ok, true, `${layout}/${fixture.extension}: ${analysis.stderr}`);
    assert.equal(response.runtime.runner.source, 'release-fallback');
    // `bundled` survived the introduction of the preset catalog by design, not by accident: the
    // catalog's TypeScript preset ships inside this tarball rather than being found on PATH, and
    // selectedBy reports how a provider was chosen. `auto` here would mean the release started
    // depending on something installed on the machine, which is exactly what this test exists to
    // catch, so the assertion stays exact.
    assert.equal(response.data.provider.selectedBy, 'bundled');
    // The rule the selection layer exists to protect: the server is told the language of the file it
    // was given, and never another one. A provider answering for the wrong language returns an empty
    // Call Hierarchy that is indistinguishable from "nothing calls this".
    assert.equal(response.data.provider.detectedLanguageId, fixture.languageId);
    assert.equal(response.data.provider.requestedLanguageId, fixture.languageId);
    assert.equal(response.data.provider.languageMatch, true);
    assert.equal(response.data.complete, true);
    assert.ok(
      response.data.nodes.some(node => node.name === callerName && node.file === callerFile && node.relation === 'direct'),
      `${layout}/${fixture.extension}: ${JSON.stringify(response.data.nodes)}`,
    );
  }
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd ?? repository,
    encoding: 'utf8',
    env: { ...process.env, ...options.env },
    input: options.input,
    timeout: options.timeout ?? 120000,
  });
  if (result.error) {
    throw result.error;
  }
  assert.equal(
    result.status,
    0,
    `${command} ${args.join(' ')} failed (${result.status})\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`,
  );
  return result;
}

function runNpm(args, options = {}) {
  return run(npmInvocation.command, [...npmInvocation.prefixArgs, ...args], options);
}

function parseEnvelope(stdout) {
  const lines = stdout.trim().split(/\r?\n/).filter(Boolean);
  assert.equal(lines.length, 1, `Expected one JSON line, received:\n${stdout}`);
  return JSON.parse(lines[0]);
}

function findExecutable(...names) {
  for (const directory of (process.env.PATH ?? '').split(path.delimiter)) {
    for (const name of names) {
      const candidate = path.join(directory, name);
      try {
        requireExecutable(candidate);
        return candidate;
      } catch {
        // Keep searching the current PATH.
      }
    }
  }
  throw new Error('Git Bash is required to execute the Plugin runner on Windows.');
}

function requiredNpmExecPath() {
  const value = process.env.npm_execpath;
  if (!value) {
    throw new Error('Run this E2E through npm so Windows can invoke npm-cli.js without shell evaluation.');
  }
  return value;
}

function requireExecutable(candidate) {
  const stat = requireStat(candidate);
  assert.ok(stat.isFile());
}

function requireStat(candidate) {
  try {
    return process.getBuiltinModule('node:fs').statSync(candidate);
  } catch {
    throw new Error(`Missing executable: ${candidate}`);
  }
}
