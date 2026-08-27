import { request, respond, serve } from './mockServer';

// Checks the client's side of the bidirectional contract and is itself the oracle.
//
// It sends one request per row of the server -> client response table and compares the answer to the
// expected one. A wrong or missing answer is written to stderr and exits 1, which the CLI surfaces as
// a provider failure carrying that line. Only when every answer matches does it release the pending
// `textDocument/prepareCallHierarchy`, so the analysis cannot finish while a check is still open.
//
// Holding the Call Hierarchy answer matters: without it the CLI would reach `shutdown` and kill this
// process before the slower checks resolve, and the test would pass by not looking.
//
// IMPACT_LENS_MOCK_RESPONSE_TIMEOUT_MS bounds every individual check.

const responseTimeoutMs = Number(process.env.IMPACT_LENS_MOCK_RESPONSE_TIMEOUT_MS ?? 4000);

interface Check {
  readonly method: string;
  readonly params: unknown;
  /** Returns an error description, or undefined when the answer is what the contract requires. */
  readonly verify: (message: { readonly result?: unknown; readonly error?: { readonly code?: number } }) => string | undefined;
}

const checks: readonly Check[] = [
  {
    method: 'workspace/configuration',
    // Two items on purpose: an unknown section must answer null, and an item without a section must
    // answer the whole (here empty) tree. Both come back in request order.
    params: { items: [{ section: 'impactLens' }, {}] },
    verify: message => {
      const value = message.result;
      if (!Array.isArray(value) || value.length !== 2) {
        return `workspace/configuration answer is not a 2-element array: ${JSON.stringify(value)}`;
      }
      if (value[0] !== null) {
        return `unknown section must answer null, got ${JSON.stringify(value[0])}`;
      }
      if (JSON.stringify(value[1]) !== '{}') {
        return `section-less item must answer the root tree, got ${JSON.stringify(value[1])}`;
      }
      return undefined;
    },
  },
  {
    method: 'workspace/workspaceFolders',
    params: null,
    verify: message => {
      const value = message.result as Array<{ uri?: unknown }> | undefined;
      if (!Array.isArray(value) || value.length !== 1 || typeof value[0]?.uri !== 'string') {
        return `workspace/workspaceFolders answer is not a single folder: ${JSON.stringify(value)}`;
      }
      return undefined;
    },
  },
  {
    method: 'client/registerCapability',
    params: { registrations: [{ id: 'answer-check', method: 'textDocument/didChangeWatchedFiles' }] },
    verify: message => (message.result === null ? undefined : `client/registerCapability must answer null, got ${JSON.stringify(message.result)}`),
  },
  {
    method: 'window/workDoneProgress/create',
    params: { token: 'impact-lens-answer-check' },
    verify: message => (message.result === null ? undefined : `window/workDoneProgress/create must answer null, got ${JSON.stringify(message.result)}`),
  },
  {
    method: 'window/showDocument',
    params: { uri: 'file:///nowhere.ts' },
    verify: message => (JSON.stringify(message.result) === '{"success":false}'
      ? undefined
      : `window/showDocument must answer success:false, got ${JSON.stringify(message.result)}`),
  },
  {
    method: 'workspace/applyEdit',
    params: { edit: { changes: {} } },
    verify: message => (JSON.stringify(message.result) === '{"applied":false}'
      ? undefined
      : `workspace/applyEdit must answer applied:false, got ${JSON.stringify(message.result)}`),
  },
  {
    // Not in the table and never will be. Silence here would hang a real server forever, so the only
    // acceptable answer is an explicit MethodNotFound.
    method: '$/impactLens/definitelyUnsupported',
    params: {},
    verify: message => (message.error?.code === -32601
      ? undefined
      : `an unsupported request must answer -32601, got ${JSON.stringify(message)}`),
  },
];

let remaining = checks.length;
let deferredPrepareId: number | undefined;
let failed = false;

serve(message => {
  if (message.method === 'initialize' && message.id !== undefined) {
    respond(message.id, {
      capabilities: { callHierarchyProvider: true },
      serverInfo: { name: 'client-answer-server', version: '1.0.0' },
    });
    return;
  }
  if (message.method === 'initialized') {
    for (const check of checks) {
      runCheck(check);
    }
    return;
  }
  if (message.method === 'textDocument/prepareCallHierarchy' && message.id !== undefined) {
    if (remaining === 0) {
      respond(message.id, []);
    } else {
      deferredPrepareId = message.id;
    }
    return;
  }
  if (message.method === 'shutdown' && message.id !== undefined) {
    respond(message.id, null);
    return;
  }
  if (message.method === 'exit') {
    process.exit(failed ? 1 : 0);
  }
});

function runCheck(check: Check): void {
  request(check.method, check.params, {
    timeoutMs: responseTimeoutMs,
    onResponse: response => {
      const problem = check.verify(response);
      if (problem) {
        die(problem);
        return;
      }
      remaining -= 1;
      if (remaining === 0 && deferredPrepareId !== undefined) {
        respond(deferredPrepareId, []);
        deferredPrepareId = undefined;
      }
    },
    onTimeout: () => die(`no client answer to ${check.method} within ${responseTimeoutMs}ms`),
  });
}

function die(reason: string): void {
  if (failed) {
    return;
  }
  failed = true;
  process.stderr.write(`client-answer-server: ${reason}\n`, () => process.exit(1));
}
