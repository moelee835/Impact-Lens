import assert from 'node:assert/strict';
import { spawnSync, type SpawnSyncReturns } from 'node:child_process';
import * as path from 'node:path';
import test from 'node:test';

// LSP is bidirectional. Every fixture here sends a real server -> client request and refuses to make
// progress until it is answered, so each test fails as a deadlock — not as a soft assertion — if the
// client goes back to dropping server requests.
//
// `target_not_found` (exit 3) is the success signal in most of these. The fixtures answer
// `textDocument/prepareCallHierarchy` with an empty array, so reaching that error proves the
// handshake completed; a client that never answers dies during `initialize` instead.

const executable = path.resolve(__dirname, '..', 'index.js');
const workspace = path.resolve(__dirname, '..', '..');

function analyze(fixture: string, env: NodeJS.ProcessEnv = {}): SpawnSyncReturns<string> {
  return spawnSync(process.execPath, [executable, 'analyze', '--stdin'], {
    encoding: 'utf8',
    timeout: 30000,
    env: { ...process.env, ...env },
    input: JSON.stringify({
      workspace,
      file: 'src/testFile.ts',
      line: 4,
      column: 17,
      provider: {
        command: process.execPath,
        args: [path.resolve(__dirname, 'fixtures', `${fixture}.js`)],
        languageId: 'typescript',
      },
    }),
  });
}

function envelope(result: SpawnSyncReturns<string>): { readonly error: Record<string, any> } {
  // The single-line stdout/stderr invariant is part of the contract, so it is asserted on every path
  // that touches the new bidirectional code rather than in one dedicated test.
  assert.equal(result.stdout, '', `expected no stdout, got: ${result.stdout}`);
  assert.equal(result.stderr.trim().split('\n').length, 1, result.stderr);
  return JSON.parse(result.stderr);
}

test('answers workspace/configuration asked before the initialize result', { timeout: 30000 }, () => {
  const result = analyze('configurationRequestServer', {
    IMPACT_LENS_MOCK_CONFIG_PHASE: 'before-initialize-response',
    IMPACT_LENS_MOCK_RESPONSE_TIMEOUT_MS: '1500',
  });
  // Both sides are blocked on each other here: the client waits for `initialize` while the server
  // waits for the configuration answer. This is the exact regression W0-2 captured, where the client
  // dropped the request and the failure was reported as the server's timeout.
  assert.equal(result.status, 3, result.stderr);
  assert.equal(envelope(result).error.code, 'target_not_found');
});

test('answers workspace/configuration asked after the initialize result', { timeout: 30000 }, () => {
  const result = analyze('configurationRequestServer', {
    IMPACT_LENS_MOCK_CONFIG_PHASE: 'after-initialize-response',
    IMPACT_LENS_MOCK_RESPONSE_TIMEOUT_MS: '1500',
  });
  assert.equal(result.status, 3, result.stderr);
  assert.equal(envelope(result).error.code, 'target_not_found');
});

test('keeps its own pending requests when the server numbers from 1', { timeout: 30000 }, () => {
  // The client's `initialize` is id 1 and is still in flight when the server sends its own id 1. A
  // client that routes by id resolves `initialize` with the server's *request* message, so
  // `result.capabilities` is undefined and the run dies as `provider_capability_missing`. Routing by
  // message shape is what makes the two id spaces independent, which is what JSON-RPC already assumes.
  const result = analyze('configurationRequestServer', {
    IMPACT_LENS_MOCK_SERVER_ID_BASE: '1',
    IMPACT_LENS_MOCK_CONFIG_PHASE: 'before-initialize-response',
    IMPACT_LENS_MOCK_RESPONSE_TIMEOUT_MS: '1500',
  });
  assert.equal(result.status, 3, result.stderr);
  assert.equal(envelope(result).error.code, 'target_not_found');
});

// This fixture keeps serving Call Hierarchy whether or not the registration is acknowledged, so the
// analysis can finish before its unanswered-registration timer fires. That makes this a smoke test:
// it proves the registration path does not break the run. The strict proof that the acknowledgement
// is sent, and that it is exactly `null`, is the `clientAnswerServer` case below, which withholds the
// Call Hierarchy answer until every response has been checked.
test('acknowledges client/registerCapability when the server demands it', { timeout: 30000 }, () => {
  const result = analyze('registerCapabilityServer', {
    IMPACT_LENS_MOCK_REQUIRE_REGISTRATION: '1',
    IMPACT_LENS_MOCK_RESPONSE_TIMEOUT_MS: '1500',
  });
  assert.equal(result.status, 3, result.stderr);
  assert.equal(envelope(result).error.code, 'target_not_found');
});

test('gives every server request in the response table the answer the contract requires', { timeout: 30000 }, () => {
  // The fixture verifies each answer itself and exits 1 with a description on the first mismatch, so a
  // wrong payload arrives here as that sentence rather than as a generic failure.
  const result = analyze('clientAnswerServer', { IMPACT_LENS_MOCK_RESPONSE_TIMEOUT_MS: '5000' });
  assert.equal(result.status, 3, result.stderr);
  assert.equal(envelope(result).error.code, 'target_not_found');
});

test('names the unimplemented client request instead of blaming the server for the stall', { timeout: 30000 }, () => {
  const result = analyze('unknownRequestServer', { IMPACT_LENS_MOCK_RESPONSE_TIMEOUT_MS: '1000' });
  assert.equal(result.status, 5, result.stderr);
  const error = envelope(result).error;
  // Without the promotion this is `provider_initialize_failed`, which is true but useless: it points
  // at the server for dying when the reason it died is a request this client refused.
  assert.equal(error.code, 'provider_protocol_incompatible');
  assert.equal(error.details.stage, 'initialize');
  assert.equal(error.details.method, '$/impactLens/requiredButUnsupported');
  assert.equal(error.retryable, false);
  assert.deepEqual(error.details.unhandledServerRequestMethods, ['$/impactLens/requiredButUnsupported']);
  assert.equal(error.details.serverRequestsAnswered, 1);
  assert.match(error.details.stderr, /client refused \$\/impactLens\/requiredButUnsupported with -32601/);
});
