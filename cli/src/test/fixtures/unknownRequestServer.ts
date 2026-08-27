import { request, respond, serve } from './mockServer';

// A server that cannot make progress without a client request Impact Lens does not implement.
//
// It asks during `initialize` and withholds the initialize result until it gets a *result*. Since the
// client answers MethodNotFound instead, the wait runs out and the process exits 1 mid-handshake.
//
// The point of the fixture is what the CLI then reports. The exit itself would read as an ordinary
// `provider_initialize_failed`, which names the symptom; the failure has to name the cause, because
// nothing in the exit code or stderr tells an agent that the missing piece is on our side.
//
// IMPACT_LENS_MOCK_RESPONSE_TIMEOUT_MS bounds the wait.

const responseTimeoutMs = Number(process.env.IMPACT_LENS_MOCK_RESPONSE_TIMEOUT_MS ?? 1500);
const method = '$/impactLens/requiredButUnsupported';

serve(message => {
  if (message.method === 'initialize' && message.id !== undefined) {
    const initializeId = message.id;
    request(method, {}, {
      timeoutMs: responseTimeoutMs,
      onResponse: response => {
        if (response.error) {
          process.stderr.write(
            `unknown-request-server: client refused ${method} with ${response.error.code}\n`,
            () => process.exit(1),
          );
          return;
        }
        respond(initializeId, {
          capabilities: { callHierarchyProvider: true },
          serverInfo: { name: 'unknown-request-server', version: '1.0.0' },
        });
      },
      onTimeout: () => {
        process.stderr.write(
          `unknown-request-server: no client answer to ${method} within ${responseTimeoutMs}ms\n`,
          () => process.exit(1),
        );
      },
    });
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
