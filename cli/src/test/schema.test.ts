import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import test from 'node:test';

test('response schema requires provider and coverage for successful impact analysis', () => {
  const schemaPath = path.resolve(__dirname, '..', '..', 'schemas', 'response.schema.json');
  const schema = JSON.parse(fs.readFileSync(schemaPath, 'utf8')) as {
    $defs: Record<string, unknown>;
    allOf: Array<Record<string, unknown>>;
  };

  assert.ok(schema.$defs.provider);
  assert.ok(schema.$defs.coverage);
  assert.match(JSON.stringify(schema.allOf), /"required":\["provider","coverage"\]/);
  assert.match(JSON.stringify(schema.$defs.coverage), /static-only/);
  assert.match(JSON.stringify(schema.$defs.coverage), /unknown/);
});
