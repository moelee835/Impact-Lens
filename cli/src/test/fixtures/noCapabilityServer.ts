import { respond, serve } from './mockServer';

// Completes the handshake but advertises no callHierarchyProvider.
serve(message => {
  if (message.method === 'initialize' && message.id !== undefined) {
    respond(message.id, { capabilities: {}, serverInfo: { name: 'no-call-hierarchy', version: '1.0.0' } });
  }
});
