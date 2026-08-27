import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import test from 'node:test';
import { CLI_ERROR_CODES, CliError, isCliErrorCode } from '../errors';

function sourceFiles(): readonly string[] {
  const root = path.resolve(__dirname, '..', '..', 'src');
  const files: string[] = [];
  const walk = (directory: string): void => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const full = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        if (entry.name !== 'test') {
          walk(full);
        }
        continue;
      }
      // errors.ts holds the declaration itself, so counting it would make the check tautological.
      if (entry.isFile() && entry.name.endsWith('.ts') && entry.name !== 'errors.ts') {
        files.push(full);
      }
    }
  };
  walk(root);
  return files;
}

test('every declared CLI error code is referenced by the implementation', () => {
  const sources = sourceFiles().map(file => fs.readFileSync(file, 'utf8')).join('\n');
  assert.ok(sources.includes('new CliError('), 'expected to have read the real CLI sources');

  // Declaring a code that nothing produces is the exact drift this module exists to prevent, so a code
  // may only enter CLI_ERROR_CODES together with the line that throws it. The check is textual, so it
  // proves a code is referenced rather than that it is reachable; that is enough to stop a speculative
  // addition, which is the failure mode seen in this contract so far.
  const unreferenced = CLI_ERROR_CODES.filter(code => !sources.includes(`'${code}'`));
  assert.deepEqual(unreferenced, [], `declared but never produced: ${unreferenced.join(', ')}`);
});

test('CLI error codes are unique and recognised by the guard', () => {
  assert.equal(new Set(CLI_ERROR_CODES).size, CLI_ERROR_CODES.length);
  for (const code of CLI_ERROR_CODES) {
    assert.equal(isCliErrorCode(code), true, code);
  }
  assert.equal(isCliErrorCode('provider_not_ready'), false);
  assert.equal(isCliErrorCode(undefined), false);
});

test('CliError keeps code, exit status, retryability and details verbatim', () => {
  const error = new CliError('timeout', 'Language Server request timed out: x', 6, true, { stage: 'query' });
  assert.equal(error.name, 'CliError');
  assert.equal(error.code, 'timeout');
  assert.equal(error.exitCode, 6);
  assert.equal(error.retryable, true);
  assert.deepEqual(error.details, { stage: 'query' });
  assert.equal(new CliError('invalid_command', 'x', 2).retryable, false);
});
