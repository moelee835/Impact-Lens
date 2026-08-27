import * as fs from 'node:fs';
import { respond, respondWithError, serve } from './mockServer';

// Never answers `textDocument/prepareCallHierarchy` and writes down whether the client bothers to
// tell it to stop.
//
// A client that only forgets its own pending entry leaves the server computing an answer nobody will
// read, which on a real workspace competes with the next request. The record goes to a file named by
// IMPACT_LENS_MOCK_CANCEL_LOG because the CLI's timeout envelope carries no provider stderr: routing
// the observation through the envelope would make the assertion depend on which side loses the race.
//
// After noting the cancellation it answers the abandoned request with RequestCancelled, which the
// spec allows and which real servers do. That late answer is the second thing under test: it must not
// be filed as an unmatched response.

const logPath = process.env.IMPACT_LENS_MOCK_CANCEL_LOG;

serve(message => {
  if (message.method === 'initialize' && message.id !== undefined) {
    respond(message.id, {
      capabilities: { callHierarchyProvider: true },
      serverInfo: { name: 'cancel-observing-server', version: '1.0.0' },
    });
    return;
  }
  if (message.method === '$/cancelRequest') {
    const id = (message.params as { readonly id?: number } | undefined)?.id;
    record(`cancelled:${id}`);
    if (typeof id === 'number') {
      // -32800 is RequestCancelled.
      respondWithError(id, -32800, 'Request cancelled by the client.');
    }
    return;
  }
  if (message.method === 'textDocument/prepareCallHierarchy') {
    record('stalled');
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

function record(line: string): void {
  if (logPath) {
    fs.appendFileSync(logPath, `${line}\n`);
  }
}
