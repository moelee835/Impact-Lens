import { request, respond, serve, timeoutFromEnv } from './mockServer';

// Advertises no `callHierarchyProvider` in `initialize` and registers it after `initialized` instead.
//
// This is legal LSP and real servers do it: a server that has to look at the workspace before it knows
// what it can offer cannot answer in the initialize result. A client that decides support from the
// static capability alone rejects this server as `provider_capability_missing` even though it answers
// Call Hierarchy perfectly well, which is the defect this fixture exists to catch.
//
// IMPACT_LENS_MOCK_REGISTER_DELAY_MS delays the registration. IMPACT_LENS_MOCK_UNREGISTER=1 withdraws
// it again immediately afterwards, which must take the capability back down with it.

const registerDelayMs = timeoutFromEnv('IMPACT_LENS_MOCK_REGISTER_DELAY_MS', 0);
const unregister = process.env.IMPACT_LENS_MOCK_UNREGISTER === '1';
const targetUri = process.env.IMPACT_LENS_MOCK_TARGET_URI;
const registrationId = 'impact-lens-dynamic-call-hierarchy';

function registerCallHierarchy(): void {
  request('client/registerCapability', {
    registrations: [{ id: registrationId, method: 'textDocument/callHierarchy', registerOptions: {} }],
  }, {
    timeoutMs: 4000,
    onResponse: () => {
      if (!unregister) {
        return;
      }
      request('client/unregisterCapability', {
        unregisterations: [{ id: registrationId, method: 'textDocument/callHierarchy' }],
      }, { timeoutMs: 4000 });
    },
    onTimeout: () => {
      process.stderr.write('dynamic-call-hierarchy-server: no client answer to client/registerCapability\n', () => process.exit(1));
    },
  });
}

serve(message => {
  if (message.method === 'initialize' && message.id !== undefined) {
    respond(message.id, {
      capabilities: {},
      serverInfo: { name: 'dynamic-call-hierarchy-server', version: '1.0.0' },
    });
    return;
  }
  if (message.method === 'initialized') {
    if (registerDelayMs === 0) {
      registerCallHierarchy();
    } else {
      setTimeout(registerCallHierarchy, registerDelayMs);
    }
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
