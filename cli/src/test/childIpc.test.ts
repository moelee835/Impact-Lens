import assert from 'node:assert/strict';
import test from 'node:test';
import { childIpcStatus, childIpcUnavailableError, looksLikeSilentProviderFailure } from '../childIpc';
import { CliError, CliErrorCode } from '../types';

function providerError(
  details: Record<string, unknown>,
  code: CliErrorCode = 'provider_initialize_failed',
): CliError {
  return new CliError(code, 'Language Server node failed during initialize (exit code 1).', 5, true, details);
}

test('detects a working child process stdio channel', async () => {
  assert.equal(await childIpcStatus(), 'ok');
});

test('child ipc probe reports unavailable instead of hanging when it cannot finish', async () => {
  assert.equal(await childIpcStatus(1), 'unavailable');
});

test('only a provider that produced nothing can be blamed on child stdio', () => {
  assert.equal(looksLikeSilentProviderFailure(providerError({ stage: 'initialize', bytesFromServer: 0 })), true);
  assert.equal(looksLikeSilentProviderFailure(providerError({ stage: 'launch', bytesFromServer: 0 }, 'provider_launch_failed')), true);

  // A server that spoke, logged, or wrote to stderr was reachable, so its own error must survive.
  assert.equal(looksLikeSilentProviderFailure(providerError({ bytesFromServer: 12 })), false);
  assert.equal(looksLikeSilentProviderFailure(providerError({ bytesFromServer: 0, stderr: 'boom' })), false);
  assert.equal(looksLikeSilentProviderFailure(providerError({ bytesFromServer: 0, providerLog: 'error: boom' })), false);
  assert.equal(looksLikeSilentProviderFailure(providerError({ bytesFromServer: 0 }, 'provider_capability_missing')), false);
  assert.equal(
    looksLikeSilentProviderFailure(providerError({ stage: 'query', bytesFromServer: 0 }, 'provider_query_failed')),
    false,
  );
  assert.equal(looksLikeSilentProviderFailure(providerError({})), false);
});

test('the child stdio error keeps the original diagnostics and stays non-retryable', () => {
  const replaced = childIpcUnavailableError(providerError({ stage: 'initialize', exitCode: 1, bytesFromServer: 0, msSinceSpawn: 140 }));
  assert.equal(replaced.code, 'provider_ipc_unavailable');
  assert.equal(replaced.exitCode, 5);
  assert.equal(replaced.retryable, false);
  const details = replaced.details as Record<string, unknown>;
  assert.equal(details.childIpc, 'unavailable');
  assert.equal(details.recovery, 'run_outside_sandbox_or_allow_child_process_io');
  assert.equal(details.exitCode, 1);
  assert.equal(details.msSinceSpawn, 140);
  assert.match(replaced.message, /does not deliver their stdio/);
});
