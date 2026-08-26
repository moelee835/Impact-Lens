export {};

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
    };
    buffer = buffer.subarray(bodyStart + length);
    if (message.method === 'initialize' && message.id !== undefined) {
      respond(message.id, {
        capabilities: { callHierarchyProvider: true },
        serverInfo: { name: 'query-exit-server', version: '1.0.0' },
      });
    } else if (message.method === 'textDocument/didOpen') {
      process.stderr.write('query failed after didOpen\n', () => process.exit(1));
    }
  }
});

function respond(id: number, result: unknown): void {
  const body = Buffer.from(JSON.stringify({ jsonrpc: '2.0', id, result }));
  process.stdout.write(`Content-Length: ${body.length}\r\n\r\n`);
  process.stdout.write(body);
}
