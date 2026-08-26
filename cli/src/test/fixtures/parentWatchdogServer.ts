export {};

// Mimics the vscode-languageserver parent-process watchdog: when a client hands over a processId,
// the server polls it and exits 1 with no stderr as soon as the probe fails. Sandboxed and
// containerised hosts make that probe fail even though the client is alive, so Impact Lens must not
// hand over a processId at all.
let buffer = Buffer.alloc(0);

process.stdin.on('data', chunk => {
  buffer = Buffer.concat([buffer, Buffer.from(chunk)]);
  while (true) {
    const headerEnd = buffer.indexOf('\r\n\r\n');
    if (headerEnd < 0) {
      return;
    }
    const header = buffer.subarray(0, headerEnd).toString('ascii');
    const match = /Content-Length:\s*(\d+)/i.exec(header);
    if (!match) {
      process.exit(2);
    }
    const length = Number(match[1]);
    const bodyStart = headerEnd + 4;
    if (buffer.length < bodyStart + length) {
      return;
    }
    const message = JSON.parse(buffer.subarray(bodyStart, bodyStart + length).toString('utf8')) as {
      id?: number;
      method?: string;
      params?: { processId?: unknown };
    };
    buffer = buffer.subarray(bodyStart + length);
    if (message.method === 'initialize' && message.id !== undefined) {
      if (typeof message.params?.processId === 'number') {
        process.exit(1);
      }
      respond(message.id, {
        capabilities: { callHierarchyProvider: true },
        serverInfo: { name: 'parent-watchdog', version: '1.0.0' },
      });
      continue;
    }
    if (message.method === 'textDocument/prepareCallHierarchy' && message.id !== undefined) {
      respond(message.id, []);
      continue;
    }
    if (message.method === 'shutdown' && message.id !== undefined) {
      respond(message.id, null);
      continue;
    }
    if (message.method === 'exit') {
      process.exit(0);
    }
  }
});

function respond(id: number, result: unknown): void {
  const body = Buffer.from(JSON.stringify({ jsonrpc: '2.0', id, result }));
  process.stdout.write(`Content-Length: ${body.length}\r\n\r\n`);
  process.stdout.write(body);
}
