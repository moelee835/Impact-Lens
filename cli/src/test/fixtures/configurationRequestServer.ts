import { notify, request, respond, serve, timeoutFromEnv } from './mockServer';

// Asks the client for its settings with a server -> client `workspace/configuration` request, the
// way tsserver, pyright and rust-analyzer all do, and refuses to make progress until the client
// answers. A client that drops server requests deadlocks here instead of failing visibly, which is
// the whole point of the fixture.
//
// IMPACT_LENS_MOCK_CONFIG_PHASE
//   'before-initialize-response' (default) withholds the initialize result until the configuration
//     answer arrives, so the client is blocked waiting on initialize while the server is blocked
//     waiting on the client.
//   'after-initialize-response' answers initialize first and then asks, so the request lands while
//     the client believes the handshake is done.
// IMPACT_LENS_MOCK_RESPONSE_TIMEOUT_MS
//   How long to wait for the answer before writing a diagnosis to stderr and exiting 1.
const phase = process.env.IMPACT_LENS_MOCK_CONFIG_PHASE ?? 'before-initialize-response';
const responseTimeoutMs = timeoutFromEnv('IMPACT_LENS_MOCK_RESPONSE_TIMEOUT_MS', 2000);

const initializeResult = {
  capabilities: { callHierarchyProvider: true },
  serverInfo: { name: 'configuration-request-server', version: '1.0.0' },
};

serve(message => {
  if (message.method === 'initialize' && message.id !== undefined) {
    const initializeId = message.id;
    if (phase === 'after-initialize-response') {
      respond(initializeId, initializeResult);
      askForConfiguration(undefined);
      return;
    }
    askForConfiguration(initializeId);
    return;
  }
  if (message.method === 'textDocument/prepareCallHierarchy' && message.id !== undefined) {
    respond(message.id, []);
    return;
  }
  if (message.method === 'shutdown' && message.id !== undefined) {
    respond(message.id, null);
    return;
  }
  if (message.method === 'exit') {
    process.exit(0);
  }
});

function askForConfiguration(deferredInitializeId: number | undefined): void {
  request('workspace/configuration', { items: [{ section: 'impactLens' }] }, {
    timeoutMs: responseTimeoutMs,
    onResponse: response => {
      // Observable proof that the client answered: the CLI keeps window/logMessage in providerLog.
      notify('window/logMessage', {
        type: 3,
        message: `workspace/configuration answered with ${JSON.stringify(response.result ?? null)}`,
      });
      if (deferredInitializeId !== undefined) {
        respond(deferredInitializeId, initializeResult);
      }
    },
    onTimeout: () => {
      process.stderr.write(
        `configuration-request-server: no client answer to workspace/configuration within ${responseTimeoutMs}ms\n`,
        () => process.exit(1),
      );
    },
  });
}
