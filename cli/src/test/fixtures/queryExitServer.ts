import { respond, serve } from './mockServer';

// Survives the handshake and then dies on the first document, so the failure lands in the query
// stage rather than in initialize.
serve(message => {
  if (message.method === 'initialize' && message.id !== undefined) {
    respond(message.id, {
      capabilities: { callHierarchyProvider: true },
      serverInfo: { name: 'query-exit-server', version: '1.0.0' },
    });
  } else if (message.method === 'textDocument/didOpen') {
    process.stderr.write('query failed after didOpen\n', () => process.exit(1));
  }
});
