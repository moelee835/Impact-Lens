import { notify, respond, serve, timeoutFromEnv } from './mockServer';

// Publishes diagnostics later than the fixed 100ms the client used to wait.
//
// Real servers behave this way: tsserver parses and type-checks a freshly opened document before it
// can say anything about it, and on a cold project that takes far longer than a tenth of a second.
// With a fixed sleep the result is not "no diagnostics" but "we stopped listening", and the CLI
// reported the difference as `observed.diagnostics: false` — a claim about the provider derived from
// a stopwatch.
//
// IMPACT_LENS_MOCK_DIAGNOSTICS_DELAY_MS controls the delay.

const delayMs = timeoutFromEnv('IMPACT_LENS_MOCK_DIAGNOSTICS_DELAY_MS', 400);

serve(message => {
  if (message.method === 'initialize' && message.id !== undefined) {
    respond(message.id, {
      capabilities: { callHierarchyProvider: true },
      serverInfo: { name: 'slow-diagnostics-server', version: '1.0.0' },
    });
    return;
  }
  if (message.method === 'textDocument/didOpen') {
    const uri = (message.params as { readonly textDocument?: { readonly uri?: string } } | undefined)?.textDocument?.uri;
    if (typeof uri === 'string') {
      setTimeout(() => {
        notify('textDocument/publishDiagnostics', {
          uri,
          diagnostics: [{
            range: { start: { line: 0, character: 0 }, end: { line: 0, character: 4 } },
            severity: 1,
            message: 'slow-diagnostics-server reporting late',
          }],
        });
      }, delayMs);
    }
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
