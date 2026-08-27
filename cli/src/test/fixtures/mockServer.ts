// Shared plumbing for the mock Language Servers in this directory.
//
// Every fixture is spawned directly as `node dist/test/fixtures/<name>.js`, so it may only depend on
// Node built-ins and on this file through a relative require. Keep it dependency-free.
//
// Besides removing the Content-Length frame parser that used to be copied into every fixture, this
// helper lets a fixture send *requests* to the client, not just responses and notifications. LSP is
// bidirectional: a real server asks the client for `workspace/configuration` and registers
// capabilities with `client/registerCapability`, and it stalls or dies when those go unanswered.

export interface MockMessage {
  readonly jsonrpc?: string;
  readonly id?: number;
  readonly method?: string;
  readonly params?: unknown;
  readonly result?: unknown;
  readonly error?: { readonly code?: number; readonly message?: string; readonly data?: unknown };
}

export interface ServerRequestOptions {
  /** Called with the client's response message once it arrives. */
  readonly onResponse?: (message: MockMessage) => void;
  /** Give up after this many milliseconds. Without it the fixture waits forever. */
  readonly timeoutMs?: number;
  /** Called instead of `onResponse` when `timeoutMs` elapses first. */
  readonly onTimeout?: () => void;
}

interface PendingServerRequest {
  readonly onResponse: ((message: MockMessage) => void) | undefined;
  readonly timer: ReturnType<typeof setTimeout> | undefined;
}

// The client numbers its own requests from 1 upwards (`JsonRpcClient.nextId`). Server request ids
// live in a disjoint range so a client that mistakes one for the other fails loudly instead of
// resolving its own pending `initialize` against our request.
const SERVER_REQUEST_ID_BASE = 1000;

let nextServerRequestId = SERVER_REQUEST_ID_BASE;
const pendingServerRequests = new Map<number, PendingServerRequest>();

/**
 * Reads Content-Length framed messages from stdin and hands each one to `handle`.
 *
 * Responses to requests this server sent are routed to their own callbacks and never reach
 * `handle`. Exits with code 2 on a frame without a Content-Length header, which is what the
 * hand-rolled parsers in these fixtures have always done.
 */
export function serve(handle: (message: MockMessage) => void): void {
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
      const message = JSON.parse(buffer.subarray(bodyStart, bodyStart + length).toString('utf8')) as MockMessage;
      buffer = buffer.subarray(bodyStart + length);
      if (settleServerRequest(message)) {
        continue;
      }
      handle(message);
    }
  });
}

/** Answers a client request. */
export function respond(id: number, result: unknown): void {
  write({ jsonrpc: '2.0', id, result });
}

/** Fails a client request with a JSON-RPC error object. */
export function respondWithError(id: number, code: number, message: string): void {
  write({ jsonrpc: '2.0', id, error: { code, message } });
}

/** Sends a server notification, which the client never answers. */
export function notify(method: string, params: unknown): void {
  write({ jsonrpc: '2.0', method, params });
}

/**
 * Sends a server -> client request and returns its id.
 *
 * A client that never answers leaves the request pending until `timeoutMs` fires, so a fixture can
 * either die on the timeout or report the stall through `pendingRequestCount()`.
 */
export function request(method: string, params: unknown, options: ServerRequestOptions = {}): number {
  const id = nextServerRequestId++;
  const timer = options.timeoutMs === undefined
    ? undefined
    : setTimeout(() => {
        pendingServerRequests.delete(id);
        options.onTimeout?.();
      }, options.timeoutMs);
  pendingServerRequests.set(id, { onResponse: options.onResponse, timer });
  write({ jsonrpc: '2.0', id, method, params });
  return id;
}

/** How many server -> client requests are still waiting for an answer. */
export function pendingRequestCount(): number {
  return pendingServerRequests.size;
}

/** Reads a millisecond budget from the environment so a test can tighten or loosen a fixture. */
export function timeoutFromEnv(name: string, fallbackMs: number): number {
  const raw = process.env[name];
  if (raw === undefined) {
    return fallbackMs;
  }
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallbackMs;
}

function settleServerRequest(message: MockMessage): boolean {
  // A client request carries both an id and a method; a response to us carries an id and no method.
  if (message.id === undefined || message.method !== undefined) {
    return false;
  }
  const pending = pendingServerRequests.get(message.id);
  if (!pending) {
    return false;
  }
  pendingServerRequests.delete(message.id);
  if (pending.timer !== undefined) {
    clearTimeout(pending.timer);
  }
  pending.onResponse?.(message);
  return true;
}

function write(payload: unknown): void {
  const body = Buffer.from(JSON.stringify(payload));
  process.stdout.write(`Content-Length: ${body.length}\r\n\r\n`);
  process.stdout.write(body);
}
