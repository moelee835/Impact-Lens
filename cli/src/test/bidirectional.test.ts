import assert from 'node:assert/strict';
import { spawnSync, type SpawnSyncReturns } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
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

function analyze(
  fixture: string,
  env: NodeJS.ProcessEnv = {},
  extraRequest: Record<string, unknown> = {},
): SpawnSyncReturns<string> {
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
      ...extraRequest,
    }),
  });
}

/** Reads the opt-in session transcript out of stderr. It is always the line before the envelope. */
function transcript(result: SpawnSyncReturns<string>): Record<string, any> {
  const lines = result.stderr.trim().split('\n');
  const found = lines.map(line => {
    try {
      return JSON.parse(line);
    } catch {
      return undefined;
    }
  }).find(value => value?.impactLensLspTranscript);
  assert.ok(found, `no transcript in stderr:\n${result.stderr}`);
  return found.impactLensLspTranscript;
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

test('tells the server to stop working on a request it has given up on', { timeout: 30000 }, t => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'impact-lens-cancel-'));
  const log = path.join(directory, 'cancel.log');
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const result = analyze(
    'cancelObservingServer',
    { IMPACT_LENS_MOCK_CANCEL_LOG: log, IMPACT_LENS_LSP_TRANSCRIPT: '1' },
    { timeoutMs: 400 },
  );
  assert.equal(result.status, 6, result.stderr);
  const lines = result.stderr.trim().split('\n');
  assert.equal(JSON.parse(lines[lines.length - 1] as string).error.code, 'timeout');
  // The proof is on the server's side of the wire, not in our own counter.
  assert.match(fs.readFileSync(log, 'utf8'), /^cancelled:\d+$/m);

  const counters = transcript(result);
  assert.equal(counters.cancelledRequests, 1);
  // The fixture answers the abandoned request with RequestCancelled straight after the cancellation.
  // A client that forgets the entry the moment it times out files that answer as unmatched, and the
  // report then hints at a protocol problem that never happened.
  assert.equal(counters.unmatchedResponses, 0);
  assert.equal(counters.protocolViolations, 0);
});

test('records a work-done progress cycle without treating its end as readiness', { timeout: 30000 }, () => {
  const result = analyze('progressServer', { IMPACT_LENS_LSP_TRANSCRIPT: '1' });
  assert.equal(result.status, 3, result.stderr);
  const lines = result.stderr.trim().split('\n');
  assert.equal(JSON.parse(lines[lines.length - 1] as string).error.code, 'target_not_found');

  const counters = transcript(result);
  assert.deepEqual(counters.workDoneProgressTokens, ['impact-lens-mock-index']);
  assert.deepEqual(counters.progress, [{
    token: 'impact-lens-mock-index',
    kind: 'end',
    title: 'Indexing project',
    serverCreated: true,
  }]);
  // The whole cycle ran and the run still ends exactly where it would have without it. An `end` says
  // the server finished the work behind that token; only the server knows what that work was.
  assert.equal(counters.serverRequestsAnswered, 1);
});

test('keeps stdout empty and the transcript on stderr when the transcript is enabled', { timeout: 30000 }, () => {
  const result = analyze('progressServer', { IMPACT_LENS_LSP_TRANSCRIPT: '1' });
  assert.equal(result.stdout, '');
  // Two stderr lines here, both JSON: the opt-in transcript and the error envelope. Debug output
  // never moves to stdout, which stays reserved for exactly one JSON line.
  for (const line of result.stderr.trim().split('\n')) {
    JSON.parse(line);
  }
});
