import { respond, serve } from './mockServer';

// Reports a `serverInfo.version` far larger than any real Language Server has ever needed - the exact
// shape gopls hit in production (its `-json`-flavoured self-description, thousands of bytes) once it
// shipped as a catalog preset. Exists to prove `lspProvider.ts` bounds this field at its one ingestion
// point rather than trusting whatever a server chooses to report.
//
// IMPACT_LENS_MOCK_HUGE_VERSION_CHAR swaps the repeated character - a multi-byte one exercises the case
// where the byte-boundary cut lands mid-character, which is the exact scenario
// task-fix-provider-version-bound.md's truncate() fix guards.
const hugeVersionChar = process.env.IMPACT_LENS_MOCK_HUGE_VERSION_CHAR ?? 'x';
const hugeVersion = 'v1.0.0-' + hugeVersionChar.repeat(4000);

// A real file, supplied by the test (`dynamicCallHierarchyServer.ts` uses the same pattern) - the CLI
// reads this URI's contents for diagnostics regardless of which mock answered the LSP round trip, so it
// must resolve to something that actually exists on disk.
const targetUri = process.env.IMPACT_LENS_MOCK_TARGET_URI;

serve(message => {
  if (message.method === 'initialize' && message.id !== undefined) {
    respond(message.id, {
      capabilities: { callHierarchyProvider: true },
      serverInfo: { name: 'huge-server-version', version: hugeVersion },
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
