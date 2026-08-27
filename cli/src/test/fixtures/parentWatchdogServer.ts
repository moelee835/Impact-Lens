import { respond, serve } from './mockServer';

// Mimics the vscode-languageserver parent-process watchdog: when a client hands over a processId,
// the server polls it and exits 1 with no stderr as soon as the probe fails. Sandboxed and
// containerised hosts make that probe fail even though the client is alive, so Impact Lens must not
// hand over a processId at all.
serve(message => {
  if (message.method === 'initialize' && message.id !== undefined) {
    if (typeof (message.params as { processId?: unknown } | undefined)?.processId === 'number') {
      process.exit(1);
    }
    respond(message.id, {
      capabilities: { callHierarchyProvider: true },
      serverInfo: { name: 'parent-watchdog', version: '1.0.0' },
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
