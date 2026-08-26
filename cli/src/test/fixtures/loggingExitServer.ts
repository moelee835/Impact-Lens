export {};

// Reports its own diagnostics over window/logMessage and then dies without touching stderr, which is
// exactly how the bundled TypeScript Language Server behaves: it never writes to stderr at all.
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
    if (message.method === 'initialize') {
      notify('window/logMessage', { type: 3, message: `Using Typescript version (bundled) 5.9.3 from ${process.env.HOME}/lib` });
      notify('window/logMessage', { type: 1, message: 'tsserver exited unexpectedly. token=super-secret' });
      process.exit(1);
    }
  }
});

function notify(method: string, params: unknown): void {
  const body = Buffer.from(JSON.stringify({ jsonrpc: '2.0', method, params }));
  process.stdout.write(`Content-Length: ${body.length}\r\n\r\n`);
  process.stdout.write(body);
}
