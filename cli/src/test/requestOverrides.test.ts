import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import test from 'node:test';
import {
  ConfigTreeViolation,
  CONFIG_TREE_LIMITS,
  FORBIDDEN_CONFIG_KEYS,
  findConfigTreeViolation,
  PRESET_ID_MAX_LENGTH,
  requestConfigTree,
  requestPresetId,
} from '../configTree';
import { CliError } from '../errors';

const EXECUTABLE = path.resolve(__dirname, '..', 'index.js');

function nest(levels: number): Record<string, unknown> {
  let value: Record<string, unknown> = { leaf: 1 };
  for (let index = 1; index < levels; index += 1) {
    value = { child: value };
  }
  return value;
}

function wideTree(keys: number): Record<string, unknown> {
  const value: Record<string, unknown> = {};
  for (let index = 0; index < keys; index += 1) {
    value[`k${index}`] = index;
  }
  return value;
}

function violationOf(value: unknown): ConfigTreeViolation {
  const violation = findConfigTreeViolation(value, 'settings');
  assert.ok(violation, 'expected a violation');
  return violation;
}

function runCli(body: unknown): { status: number | null; stdout: string; stderr: string } {
  const result = spawnSync(process.execPath, [EXECUTABLE, 'analyze', '--stdin'], {
    encoding: 'utf8',
    input: JSON.stringify(body),
    timeout: 40000,
  });
  return { status: result.status, stdout: result.stdout, stderr: result.stderr };
}

function rejection(body: Record<string, unknown>): Record<string, unknown> {
  const result = runCli({ workspace: '/impact-lens/does-not-exist', file: 'a.ts', line: 1, column: 1, ...body });
  assert.equal(result.status, 2, result.stderr);
  // The one-JSON-line-on-stdout invariant is not weakened by a new rejection path.
  assert.equal(result.stdout, '');
  assert.equal(result.stderr.trim().split('\n').length, 1);
  const envelope = JSON.parse(result.stderr) as Record<string, unknown>;
  const error = envelope.error as Record<string, unknown>;
  assert.equal(envelope.ok, false);
  assert.equal(error.code, 'invalid_request');
  return error;
}

// ---------------------------------------------------------------------------
// D8 - allowed shapes
// ---------------------------------------------------------------------------

test('a normal provider settings tree is accepted', () => {
  const tree = {
    typescript: { preferences: { includePackageJsonAutoImports: 'auto' }, tsdk: null },
    plugins: [{ name: 'plugin', enable: true }, 'literal'],
    'files.exclude': { '**/*.log': true },
  };
  assert.equal(findConfigTreeViolation(tree, 'settings'), undefined);
  assert.deepEqual(requestConfigTree(tree, 'settings'), tree);
  assert.equal(requestConfigTree(undefined, 'settings'), undefined);
});

test('a tree at exactly the depth limit is accepted and one level deeper is not', () => {
  assert.equal(findConfigTreeViolation(nest(CONFIG_TREE_LIMITS.maxDepth), 'settings'), undefined);
  const violation = violationOf(nest(CONFIG_TREE_LIMITS.maxDepth + 1));
  assert.equal(violation.rule, 'depth');
  assert.equal(violation.limit, CONFIG_TREE_LIMITS.maxDepth);
  // The message has to name the value to fix, not merely say "invalid".
  assert.match(violation.message, /settings\.child\.child/);
  assert.match(violation.message, new RegExp(String(CONFIG_TREE_LIMITS.maxDepth)));
});

test('the depth limit counts arrays as containers', () => {
  let value: unknown = 1;
  for (let index = 0; index < CONFIG_TREE_LIMITS.maxDepth; index += 1) {
    value = [value];
  }
  const violation = violationOf({ deep: value });
  assert.equal(violation.rule, 'depth');
});

test('a tree at exactly the key limit is accepted and one key more is not', () => {
  assert.equal(findConfigTreeViolation(wideTree(CONFIG_TREE_LIMITS.maxKeys), 'settings'), undefined);
  const violation = violationOf(wideTree(CONFIG_TREE_LIMITS.maxKeys + 1));
  assert.equal(violation.rule, 'keys');
  assert.equal(violation.limit, CONFIG_TREE_LIMITS.maxKeys);
});

test('a tree past the serialized byte budget is rejected', () => {
  const violation = violationOf({ tsdk: 'x'.repeat(CONFIG_TREE_LIMITS.maxSerializedBytes) });
  assert.equal(violation.rule, 'bytes');
  assert.equal(violation.limit, CONFIG_TREE_LIMITS.maxSerializedBytes);
});

test('values JSON cannot carry are rejected', () => {
  assert.equal(violationOf([]).rule, 'type');
  assert.equal(violationOf('a string').rule, 'type');
  assert.equal(violationOf(null).rule, 'type');
  assert.equal(violationOf({ when: new Date(0) }).rule, 'type');
  assert.equal(violationOf({ callback: () => undefined }).rule, 'type');
  assert.equal(violationOf({ ratio: Number.NaN }).rule, 'type');
  assert.equal(violationOf({ ratio: Number.POSITIVE_INFINITY }).rule, 'type');
  assert.match(violationOf({ ratio: Number.NaN }).message, /finite/);
});

// ---------------------------------------------------------------------------
// D8 - prototype pollution
// ---------------------------------------------------------------------------

test('forbidden keys are rejected at the top level', () => {
  for (const key of FORBIDDEN_CONFIG_KEYS) {
    const violation = violationOf(JSON.parse(`{"${key}": {"polluted": true}}`));
    assert.equal(violation.rule, 'forbidden-key', key);
    assert.equal(violation.path, `settings.${key}`);
  }
});

test('forbidden keys are rejected at every nesting depth, including inside arrays', () => {
  for (const key of FORBIDDEN_CONFIG_KEYS) {
    const nested = JSON.parse(`{"a":{"b":{"c":{"${key}":{"polluted":true}}}}}`);
    const violation = violationOf(nested);
    assert.equal(violation.rule, 'forbidden-key', key);
    assert.equal(violation.path, `settings.a.b.c.${key}`);

    const inArray = JSON.parse(`{"plugins":[{"name":"p"},{"${key}":{"polluted":true}}]}`);
    const arrayViolation = violationOf(inArray);
    assert.equal(arrayViolation.rule, 'forbidden-key', key);
    assert.equal(arrayViolation.path, `settings.plugins[1].${key}`);
  }
});

test('a forbidden key is rejected rather than stripped, and nothing is polluted on the way', () => {
  const payload = JSON.parse('{"__proto__":{"polluted":"yes"},"constructor":{"prototype":{"polluted":"yes"}}}');
  assert.throws(
    () => requestConfigTree(payload, 'settings'),
    (error: unknown) => error instanceof CliError && error.code === 'invalid_request',
  );
  const probe: Record<string, unknown> = {};
  assert.equal(probe.polluted, undefined);
  assert.equal(({} as Record<string, unknown>).polluted, undefined);
  assert.equal((Object.prototype as unknown as Record<string, unknown>).polluted, undefined);
});

// ---------------------------------------------------------------------------
// providerPreset shape
// ---------------------------------------------------------------------------

test('preset ids are validated for shape only', () => {
  assert.equal(requestPresetId('go-gopls', 'providerPreset'), 'go-gopls');
  assert.equal(requestPresetId('bundled-typescript', 'providerPreset'), 'bundled-typescript');
  assert.equal(requestPresetId('rust-analyzer', 'providerPreset'), 'rust-analyzer');
  assert.equal(requestPresetId('ts2', 'providerPreset'), 'ts2');
  assert.equal(requestPresetId(undefined, 'providerPreset'), undefined);
  // No catalog exists yet, so an unknown-but-well-shaped id must pass here and be answered later.
  assert.equal(requestPresetId('not-in-any-catalog', 'providerPreset'), 'not-in-any-catalog');
});

test('preset ids that could escape a catalog lookup are rejected', () => {
  const rejected = [
    '',
    ' ',
    'Go-Gopls',
    '../../etc/passwd',
    '/absolute/path',
    'go gopls',
    'go--gopls',
    '-gopls',
    'gopls-',
    'go.gopls',
    'go_gopls',
    'x'.repeat(PRESET_ID_MAX_LENGTH + 1),
    42,
    { id: 'go-gopls' },
    ['go-gopls'],
    null,
  ];
  for (const value of rejected) {
    assert.throws(
      () => requestPresetId(value, 'providerPreset'),
      (error: unknown) => error instanceof CliError && error.code === 'invalid_request',
      `expected rejection: ${JSON.stringify(value)}`,
    );
  }
});

// ---------------------------------------------------------------------------
// The real CLI
// ---------------------------------------------------------------------------

test('the CLI rejects each D8 violation with an actionable invalid_request', () => {
  const cases: ReadonlyArray<readonly [string, Record<string, unknown>, string]> = [
    ['type', { settings: ['not', 'an', 'object'] }, 'type'],
    ['depth', { settings: nest(CONFIG_TREE_LIMITS.maxDepth + 1) }, 'depth'],
    ['bytes', { settings: { tsdk: 'x'.repeat(CONFIG_TREE_LIMITS.maxSerializedBytes) } }, 'bytes'],
    ['keys', { initializationOptions: wideTree(CONFIG_TREE_LIMITS.maxKeys + 1) }, 'keys'],
    ['forbidden-key', { settings: JSON.parse('{"a":{"__proto__":{"polluted":true}}}') }, 'forbidden-key'],
  ];
  for (const [name, body, rule] of cases) {
    const error = rejection(body);
    const details = error.details as Record<string, unknown>;
    assert.equal(details.rule, rule, name);
    assert.equal(details.field, Object.keys(body)[0], name);
    assert.ok(typeof details.path === 'string' && details.path.length > 0, name);
    // "invalid" alone is not a diagnosis: the message has to carry the limit or the offending key.
    assert.ok((error.message as string).length > 40, name);
  }
});

test('the CLI rejects a malformed preset id and a preset paired with a raw command', () => {
  assert.match(rejection({ providerPreset: '../escape' }).message as string, /lower-case/);
  assert.match(
    rejection({ providerPreset: 'go-gopls', provider: { command: process.execPath } }).message as string,
    /cannot both be set/,
  );
});

test('an analyze request carrying all three overrides is accepted', { timeout: 60000 }, () => {
  const workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'impact-lens-overrides-'));
  try {
    fs.writeFileSync(path.join(workspace, 'tsconfig.json'), JSON.stringify({
      compilerOptions: { target: 'ES2022', module: 'commonjs', strict: true },
      include: ['*.ts'],
    }));
    fs.writeFileSync(path.join(workspace, 'target.ts'), 'export function target(value: number): number { return value + 1; }\n');
    fs.writeFileSync(path.join(workspace, 'caller.ts'), "import { target } from './target';\nexport function caller(): number { return target(1); }\n");
    const result = runCli({
      workspace,
      file: 'target.ts',
      line: 1,
      column: 17,
      providerPreset: 'bundled-typescript',
      initializationOptions: { preferences: { includePackageJsonAutoImports: 'off' } },
      settings: { typescript: { tsserver: { log: 'off' } }, 'files.exclude': { '**/*.log': true } },
    });
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stdout.trimEnd().split('\n').length, 1);
    const envelope = JSON.parse(result.stdout) as Record<string, unknown>;
    assert.equal(envelope.ok, true);
    const provider = (envelope.data as Record<string, unknown>).provider as Record<string, unknown>;
    // The envelope always reports the provider that actually ran, so an override that no lane consumes
    // yet is observable rather than silent. Lane W1-B turns `selectedBy` into `preset` here.
    assert.ok(typeof provider.selectedBy === 'string');
  } finally {
    fs.rmSync(workspace, { recursive: true, force: true });
  }
});
