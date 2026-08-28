// Until this file existed nothing in the repository read `cli/schemas/request.schema.json`. The schema
// ships inside the npm tarball, so it is a published contract, and the parser in `cli/src/index.ts` could
// drift from it with no test failing. W0-3 proved the response-side version of this point: validating
// real responses against the schema does not catch enum drift, because every value the CLI produces is
// already inside the schema's (wider) enum. Comparing the two *vocabularies* is what catches it.
//
// Three checks live here.
//
// 1. The schema uses only keywords the contract checker implements.
// 2. The declared vocabularies and limits match the TypeScript constants the CLI actually runs on.
// 3. The schema and the real CLI agree on a corpus of requests, in both directions, with the one
//    deliberate asymmetry spelled out as data: JSON Schema cannot express the D8 depth, byte and key
//    budgets, so for those the schema is knowingly weaker than the parser.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import test from 'node:test';
import {
  CONFIG_TREE_LIMITS,
  FORBIDDEN_CONFIG_KEYS,
  PRESET_ID_MAX_LENGTH,
  PRESET_ID_PATTERN,
} from '../configTree';
import { NOTE_SCOPES, SOURCE_MODES } from '../types';
import { assertSupportedKeywords, JsonSchema, validate } from './jsonSchema';

const SCHEMA_PATH = path.resolve(__dirname, '..', '..', 'schemas', 'request.schema.json');
const EXECUTABLE = path.resolve(__dirname, '..', 'index.js');

function schema(): JsonSchema {
  return JSON.parse(fs.readFileSync(SCHEMA_PATH, 'utf8')) as JsonSchema;
}

function at(pointer: string): unknown {
  let current: unknown = schema();
  for (const segment of pointer.split('/')) {
    assert.ok(current !== undefined && current !== null, `request schema pointer ${pointer} does not resolve`);
    current = (current as Record<string, unknown>)[segment];
  }
  assert.ok(current !== undefined, `request schema pointer ${pointer} does not resolve`);
  return current;
}

const ANALYZE = 'oneOf/0';
const NOTE = 'oneOf/1';

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

test('the request schema uses only keywords the contract checker implements', () => {
  assertSupportedKeywords(schema());
});

test('request vocabularies match the schema exactly', () => {
  const pairs: ReadonlyArray<readonly [string, readonly string[], string]> = [
    ['analyze.includeSource', SOURCE_MODES, `${ANALYZE}/properties/includeSource/enum`],
    ['note.scope', NOTE_SCOPES, `${NOTE}/properties/scope/enum`],
    ['note.list scope', NOTE_SCOPES, 'oneOf/2/properties/scope/enum'],
    ['forbidden configuration keys', FORBIDDEN_CONFIG_KEYS, '$defs/configObject/propertyNames/not/enum'],
  ];
  const drifted = pairs
    .map(([field, declared, pointer]) => {
      const inSchema = [...(at(pointer) as readonly string[])].sort();
      const inTypes = [...declared].sort();
      return {
        field,
        missingFromTypes: inSchema.filter(value => !inTypes.includes(value)),
        missingFromSchema: inTypes.filter(value => !inSchema.includes(value)),
      };
    })
    .filter(entry => entry.missingFromTypes.length > 0 || entry.missingFromSchema.length > 0);
  assert.deepEqual(drifted, []);
});

// The depth, byte and key budgets cannot be written as JSON Schema keywords, so they are declared in an
// unreferenced `$defs` block instead of vanishing into the parser. That only helps if the two sides are
// held together, which is this test.
test('the declared D8 limits match the limits the CLI enforces', () => {
  assert.equal(at('$defs/configTreeLimits/properties/maxDepth/const'), CONFIG_TREE_LIMITS.maxDepth);
  assert.equal(
    at('$defs/configTreeLimits/properties/maxSerializedBytes/const'),
    CONFIG_TREE_LIMITS.maxSerializedBytes,
  );
  assert.equal(at('$defs/configTreeLimits/properties/maxKeys/const'), CONFIG_TREE_LIMITS.maxKeys);
  assert.equal(at('$defs/providerPreset/maxLength'), PRESET_ID_MAX_LENGTH);
  assert.equal(at('$defs/providerPreset/pattern'), PRESET_ID_PATTERN);
});

test('the three override fields are optional, so every schemaVersion 1 request keeps validating', () => {
  const required = at(`${ANALYZE}/required`) as readonly string[];
  for (const field of ['providerPreset', 'initializationOptions', 'settings']) {
    assert.ok(!required.includes(field), `${field} must not be required`);
    assert.ok(at(`${ANALYZE}/properties/${field}`) !== undefined, `${field} must be declared`);
  }
  assert.deepEqual(validate(schema(), {
    workspace: '/w', file: 'a.ts', line: 1, column: 1,
  }), []);
});

interface Case {
  readonly name: string;
  readonly body: Record<string, unknown>;
  readonly args: readonly string[];
  readonly schemaAccepts: boolean;
  readonly parserAccepts: boolean;
  /** Set when the schema is deliberately weaker than the parser, with the reason. */
  readonly asymmetry?: string;
}

function analyzeCase(
  name: string,
  body: Record<string, unknown>,
  expected: { schemaAccepts: boolean; parserAccepts: boolean; asymmetry?: string },
): Case {
  return { name, body, args: ['analyze', '--stdin'], ...expected };
}

function corpus(workspace: string): readonly Case[] {
  const both = (schemaAccepts: boolean) => ({ schemaAccepts, parserAccepts: schemaAccepts });
  const target = { workspace, file: 'target.ts', line: 1, column: 17 };
  return [
    analyzeCase('minimal analyze', { ...target }, both(true)),
    analyzeCase('analyze with every override', {
      ...target,
      providerPreset: 'bundled-typescript',
      initializationOptions: { preferences: { includePackageJsonAutoImports: 'off' } },
      settings: { typescript: { tsserver: { log: 'off' } } },
    }, both(true)),
    analyzeCase('analyze with only settings', { ...target, settings: {} }, both(true)),
    // Accepted by both: the command does not speak LSP, but that is a provider-stage failure, not a
    // request-contract failure, and the two must not be confused.
    analyzeCase('analyze with a raw provider command', {
      ...target, provider: { command: process.execPath, args: ['--version'], languageId: 'typescript' },
    }, both(true)),
    analyzeCase('provider together with providerPreset', {
      ...target, providerPreset: 'go-gopls', provider: { command: process.execPath },
    }, both(false)),
    analyzeCase('preset id with a path separator', { ...target, providerPreset: '../escape' }, both(false)),
    analyzeCase('preset id in upper case', { ...target, providerPreset: 'Go-Gopls' }, both(false)),
    analyzeCase('preset id past the length limit', {
      ...target, providerPreset: 'x'.repeat(PRESET_ID_MAX_LENGTH + 1),
    }, both(false)),
    analyzeCase('empty preset id', { ...target, providerPreset: '' }, both(false)),
    analyzeCase('settings as an array', { ...target, settings: [] }, both(false)),
    analyzeCase('settings as a string', { ...target, settings: 'typescript.tsdk=lib' }, both(false)),
    analyzeCase('forbidden key at the top level', {
      ...target, settings: JSON.parse('{"__proto__":{"polluted":true}}'),
    }, both(false)),
    analyzeCase('forbidden key three levels down', {
      ...target, initializationOptions: JSON.parse('{"a":{"b":{"constructor":{"polluted":true}}}}'),
    }, both(false)),
    analyzeCase('forbidden key inside an array element', {
      ...target, settings: JSON.parse('{"plugins":[{"prototype":{"polluted":true}}]}'),
    }, both(false)),
    analyzeCase('unknown top-level field', { ...target, nonsense: true }, both(false)),
    analyzeCase('includeSource outside the enum', { ...target, includeSource: 'all' }, both(false)),
    analyzeCase('depth below the minimum', { ...target, depth: 0 }, both(false)),
    analyzeCase('depth above the maximum', { ...target, depth: 21 }, both(false)),
    analyzeCase('missing file', { workspace, line: 1, column: 17 }, both(false)),
    analyzeCase('settings past the depth budget', {
      ...target, settings: nest(CONFIG_TREE_LIMITS.maxDepth + 1),
    }, {
      schemaAccepts: true,
      parserAccepts: false,
      asymmetry: 'JSON Schema cannot express a nesting depth budget (D8); cli/src/configTree.ts enforces it',
    }),
    analyzeCase('settings past the byte budget', {
      ...target, settings: { tsdk: 'x'.repeat(CONFIG_TREE_LIMITS.maxSerializedBytes) },
    }, {
      schemaAccepts: true,
      parserAccepts: false,
      asymmetry: 'JSON Schema cannot express a serialized byte budget (D8)',
    }),
    analyzeCase('settings past the key budget', {
      ...target, initializationOptions: wideTree(CONFIG_TREE_LIMITS.maxKeys + 1),
    }, {
      schemaAccepts: true,
      parserAccepts: false,
      asymmetry: 'maxProperties counts one object, not a whole tree (D8)',
    }),
    {
      name: 'note.list',
      body: { workspace, scope: 'shared' },
      args: ['note', 'list', '--stdin'],
      ...both(true),
    },
    {
      name: 'note.list with an override field',
      body: { workspace, scope: 'shared', providerPreset: 'go-gopls' },
      args: ['note', 'list', '--stdin'],
      ...both(false),
    },
    {
      name: 'note.get with an override field',
      body: {
        workspace,
        target: { file: 'target.ts', position: { line: 1, column: 17 } },
        settings: { typescript: {} },
      },
      args: ['note', 'get', '--stdin'],
      ...both(false),
    },
  ];
}

function parserAccepts(entry: Case): boolean {
  const result = spawnSync(process.execPath, [EXECUTABLE, ...entry.args], {
    encoding: 'utf8',
    input: JSON.stringify(entry.body),
    timeout: 60000,
  });
  if (result.status === 0) {
    return true;
  }
  const envelope = JSON.parse(result.stderr) as { error?: { code?: string } };
  // Anything other than `invalid_request` means the request itself was accepted and something later
  // failed, which is exactly what "the parser accepted it" has to mean here.
  return envelope.error?.code !== 'invalid_request';
}

test('the request schema and the real CLI agree', { timeout: 120000 }, () => {
  const workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'impact-lens-request-'));
  try {
    fs.writeFileSync(path.join(workspace, 'tsconfig.json'), JSON.stringify({
      compilerOptions: { target: 'ES2022', module: 'commonjs', strict: true },
      include: ['*.ts'],
    }));
    fs.writeFileSync(path.join(workspace, 'target.ts'), 'export function target(value: number): number { return value + 1; }\n');
    fs.writeFileSync(path.join(workspace, 'caller.ts'), "import { target } from './target';\nexport function caller(): number { return target(1); }\n");

    const disagreements = corpus(workspace)
      .map(entry => ({
        name: entry.name,
        expected: { schema: entry.schemaAccepts, parser: entry.parserAccepts },
        actual: { schema: validate(schema(), entry.body).length === 0, parser: parserAccepts(entry) },
      }))
      .filter(entry => entry.expected.schema !== entry.actual.schema || entry.expected.parser !== entry.actual.parser);
    assert.deepEqual(disagreements, []);

    // The relation that must hold for every request, not only the ones listed above: anything the CLI
    // accepts has to satisfy the published schema. The reverse may fail only where the asymmetry is
    // declared, which keeps "the schema is weaker here" an explicit list rather than an accident.
    const undeclared = corpus(workspace)
      .filter(entry => entry.parserAccepts && !entry.schemaAccepts)
      .map(entry => entry.name);
    assert.deepEqual(undeclared, []);
    const declared = corpus(workspace).filter(entry => entry.asymmetry !== undefined);
    for (const entry of declared) {
      assert.ok(entry.schemaAccepts !== entry.parserAccepts, `${entry.name} declares an asymmetry it does not have`);
    }
  } finally {
    fs.rmSync(workspace, { recursive: true, force: true });
  }
});
