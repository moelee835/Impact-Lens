import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import test from 'node:test';
import { CLI_ERROR_CODES, CONTRACT_ONLY_ERROR_CODES, CliError, isCliErrorCode } from '../errors';

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

// The other half of the same invariant. The first test stops a code being declared before anything throws
// it; this one stops a code being thrown while it is still declared as unthrown. Without it, the day W1-B
// throws `provider_config_invalid` the union would silently be missing an exit status for it.
test('a contract-only error code is declared exactly once and thrown nowhere', () => {
  const declaredTwice = CONTRACT_ONLY_ERROR_CODES.filter(code => (CLI_ERROR_CODES as readonly string[]).includes(code));
  assert.deepEqual(declaredTwice, [], `a code cannot be both thrown and unthrown: ${declaredTwice.join(', ')}`);
  assert.equal(new Set(CONTRACT_ONLY_ERROR_CODES).size, CONTRACT_ONLY_ERROR_CODES.length);

  const sources = sourceFiles().map(file => fs.readFileSync(file, 'utf8')).join('\n');
  // Matching the construction, not the bare string: reason codes share names with error codes on purpose,
  // and cli/src/coverage.ts writes 'provider_not_ready' as a reason today.
  const thrown = CONTRACT_ONLY_ERROR_CODES.filter(code => new RegExp(`new CliError\\(\\s*'${code}'`).test(sources));
  assert.deepEqual(thrown, [], `move these into CLI_ERROR_CODES with an exit status: ${thrown.join(', ')}`);

  for (const code of CONTRACT_ONLY_ERROR_CODES) {
    assert.equal(isCliErrorCode(code), false, code);
  }
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
