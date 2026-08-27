import { notify, request, respond, serve } from './mockServer';

// Runs a complete work-done progress cycle: it asks the client to create a token, then reports
// begin, report and end against it, then serves Call Hierarchy.
//
// The `end` here means "this fixture finished its make-believe indexing". Nothing about it says the
// provider can now answer completely, and a client that treats it as readiness would report a
// confident empty result for a workspace it never indexed. The test therefore checks that the cycle
// is *recorded* and that it changes nothing else about the run.

const token = 'impact-lens-mock-index';

serve(message => {
  if (message.method === 'initialize' && message.id !== undefined) {
    respond(message.id, {
      capabilities: { callHierarchyProvider: true },
      serverInfo: { name: 'progress-server', version: '1.0.0' },
    });
    return;
  }
  if (message.method === 'initialized') {
    request('window/workDoneProgress/create', { token }, {
      timeoutMs: 4000,
      onResponse: () => {
        notify('$/progress', { token, value: { kind: 'begin', title: 'Indexing project', percentage: 0 } });
        notify('$/progress', { token, value: { kind: 'report', percentage: 50 } });
        notify('$/progress', { token, value: { kind: 'end', message: 'done' } });
      },
      onTimeout: () => {
        process.stderr.write('progress-server: no client answer to window/workDoneProgress/create\n', () => process.exit(1));
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
