import { respond, serve } from './mockServer';

// Answers `callHierarchy/incomingCalls` with JSON-RPC `null`, never `[]` - a real, legal LSP response
// this CLI's own `lspProvider.ts` used to collapse into the same value as an explicit empty array. Exists
// to prove the `?? []` path at `lspProvider.ts`'s `incoming()` actually gets exercised end to end, not
// just the `coverage.ts` projection logic in isolation (docs/work/task-m2-python-preset.md stage 3).
//
// `dynamicCallHierarchyServer.ts` is this fixture's negative-case twin: same shape, but answers `[]`.

const targetUri = process.env.IMPACT_LENS_MOCK_TARGET_URI;

serve(message => {
  if (message.method === 'initialize' && message.id !== undefined) {
    respond(message.id, {
      capabilities: { callHierarchyProvider: true },
      serverInfo: { name: 'null-incoming-calls-server', version: '1.0.0' },
    });
    return;
  }
  if (message.method === 'textDocument/prepareCallHierarchy' && message.id !== undefined) {
    respond(message.id, targetUri === undefined ? [] : [{
      name: 'target',
      kind: 12,
      uri: targetUri,
      range: { start: { line: 0, character: 0 }, end: { line: 0, character: 34 } },
      selectionRange: { start: { line: 0, character: 16 }, end: { line: 0, character: 22 } },
    }]);
    return;
  }
  if (message.method === 'callHierarchy/incomingCalls' && message.id !== undefined) {
    respond(message.id, null);
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
