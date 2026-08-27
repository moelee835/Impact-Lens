import { notify, pendingRequestCount, request, respond, serve, timeoutFromEnv } from './mockServer';

// Finishes the handshake normally and then registers a capability dynamically with a
// `client/registerCapability` request. The client owes an empty result even though it has nothing to
// do with the registration; a client that stays silent leaves the server waiting.
//
// Unlike configurationRequestServer this one lets analysis proceed either way, so a test can assert
// on the acknowledgement itself rather than on a deadlock. Set
// IMPACT_LENS_MOCK_REQUIRE_REGISTRATION=1 to make an unanswered registration fatal instead.
const responseTimeoutMs = timeoutFromEnv('IMPACT_LENS_MOCK_RESPONSE_TIMEOUT_MS', 2000);
const requireRegistration = process.env.IMPACT_LENS_MOCK_REQUIRE_REGISTRATION === '1';

serve(message => {
  if (message.method === 'initialize' && message.id !== undefined) {
    respond(message.id, {
      capabilities: { callHierarchyProvider: true },
      serverInfo: { name: 'register-capability-server', version: '1.0.0' },
    });
    return;
  }
  if (message.method === 'initialized') {
    request('client/registerCapability', {
      registrations: [
        {
          id: 'impact-lens-call-hierarchy',
          method: 'textDocument/didChangeWatchedFiles',
          registerOptions: { watchers: [{ globPattern: '**/*.ts' }] },
        },
      ],
    }, {
      timeoutMs: responseTimeoutMs,
      onResponse: () => {
        notify('window/logMessage', { type: 3, message: 'client/registerCapability acknowledged' });
      },
      onTimeout: () => {
        if (requireRegistration) {
          process.stderr.write(
            `register-capability-server: no client answer to client/registerCapability within ${responseTimeoutMs}ms\n`,
            () => process.exit(1),
          );
          return;
        }
        notify('window/logMessage', {
          type: 1,
          message: `client/registerCapability unanswered after ${responseTimeoutMs}ms, pending=${pendingRequestCount()}`,
        });
      },
    });
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
