import { notify, request, respond, serve, timeoutFromEnv } from './mockServer';

// A server that reports its index state the way a preset can declare, so the readiness path can be
// exercised end to end.
//
// IMPACT_LENS_MOCK_READY_MODE selects what it announces after `initialized`:
//   progress      - a work-done progress cycle titled by IMPACT_LENS_MOCK_PROGRESS_TITLE
//   notification  - one `custom/indexStatus` notification with `{ index: { state: 'ready' } }`
//   working       - a progress `begin` that never ends, which is a server that is still indexing
//   never         - complete silence, which is the case the budget exists for
//
// IMPACT_LENS_MOCK_READY_DELAY_MS delays the announcement. IMPACT_LENS_MOCK_TARGET_URI, when set, is
// the uri of the single Call Hierarchy item; `callHierarchy/incomingCalls` always answers empty, which
// is the shape that makes "still indexing" and "genuinely uncalled" indistinguishable without the
// index state — the exact confusion this lane removes.

const mode = process.env.IMPACT_LENS_MOCK_READY_MODE ?? 'never';
const delayMs = timeoutFromEnv('IMPACT_LENS_MOCK_READY_DELAY_MS', 0);
const title = process.env.IMPACT_LENS_MOCK_PROGRESS_TITLE ?? 'Indexing project';
const targetUri = process.env.IMPACT_LENS_MOCK_TARGET_URI;
const token = 'impact-lens-mock-index';

function announce(): void {
  if (mode === 'notification') {
    notify('custom/indexStatus', { index: { state: 'ready' } });
    return;
  }
  if (mode !== 'progress' && mode !== 'working') {
    return;
  }
  request('window/workDoneProgress/create', { token }, {
    timeoutMs: 4000,
    onResponse: () => {
      notify('$/progress', { token, value: { kind: 'begin', title, percentage: 0 } });
      if (mode === 'progress') {
        notify('$/progress', { token, value: { kind: 'end', message: 'done' } });
      }
    },
    onTimeout: () => {
      process.stderr.write('readiness-server: no client answer to window/workDoneProgress/create\n', () => process.exit(1));
    },
  });
}

serve(message => {
  if (message.method === 'initialize' && message.id !== undefined) {
    respond(message.id, {
      capabilities: { callHierarchyProvider: true },
      serverInfo: { name: 'readiness-server', version: '1.0.0' },
    });
    return;
  }
  if (message.method === 'initialized') {
    if (delayMs === 0) {
      announce();
    } else {
      setTimeout(announce, delayMs);
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
