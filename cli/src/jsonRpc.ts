import { ChildProcessWithoutNullStreams, spawn } from 'node:child_process';
import * as os from 'node:os';
import * as path from 'node:path';
import {
  classifyIncoming,
  JSON_RPC_INTERNAL_ERROR,
  JsonRpcId,
  JsonRpcIncoming,
} from './lsp/protocol';
import { methodNotFound, ServerRequestHandler } from './lsp/serverRequests';
import { CliError, ProviderLifecycleStage } from './types';

interface PendingRequest {
  readonly resolve: (value: unknown) => void;
  readonly reject: (error: Error) => void;
  readonly timer: ReturnType<typeof setTimeout>;
  /** Already settled with a timeout. Kept only so a late answer is recognised rather than counted. */
  readonly cancelled?: boolean;
}

// How long a cancelled request stays recognisable. Long enough for an answer already on the wire,
// short enough that a session never accumulates entries it will not use.
const CANCEL_GRACE_MS = 2000;

interface UnhandledServerRequest {
  readonly method: string;
  readonly stage: ProviderLifecycleStage;
}

export class JsonRpcClient {
  private readonly child: ChildProcessWithoutNullStreams;
  // Two tables, never consulted for each other. Ids are only meaningful to the side that issued them,
  // so the server is free to start at 1 while our own `initialize` is still in flight as 1.
  private readonly pendingOutbound = new Map<number, PendingRequest>();
  private readonly inflightInbound = new Set<string>();
  private readonly notificationHandlers = new Map<string, Array<(params: unknown) => void>>();
  private requestHandlers: ReadonlyMap<string, ServerRequestHandler> = new Map();
  private readonly unhandledServerRequests: UnhandledServerRequest[] = [];
  private serverRequestsAnswered = 0;
  private cancelled = 0;
  private readonly cancelSweeps = new Set<ReturnType<typeof setTimeout>>();
  private unmatchedResponses = 0;
  private protocolViolations = 0;
  private buffer = Buffer.alloc(0);
  private nextId = 1;
  private stderr = '';
  private closed = false;
  private terminalError: Error | undefined;
  private spawned = false;
  private lifecycleStage: ProviderLifecycleStage = 'launch';
  private processError: Error | undefined;
  private exitCode: number | null = null;
  private exitSignal: NodeJS.Signals | null = null;
  private closeTimer: ReturnType<typeof setTimeout> | undefined;
  private readonly executable: string;
  private readonly spawnedAt = Date.now();
  private serverBytes = 0;
  private serverLog = '';

  constructor(command: string, args: readonly string[], private readonly timeoutMs: number) {
    this.executable = path.basename(command);
    this.child = spawn(command, [...args], { stdio: ['pipe', 'pipe', 'pipe'] });
    this.child.once('spawn', () => {
      this.spawned = true;
    });
    this.child.stdout.on('data', chunk => {
      const buffer = Buffer.from(chunk);
      this.serverBytes += buffer.length;
      this.consume(buffer);
    });
    this.child.stderr.on('data', chunk => {
      this.stderr = `${this.stderr}${String(chunk)}`.slice(-8000);
    });
    this.child.stdin.on('error', error => {
      if (!this.closed && !this.processError) {
        this.processError = error;
        this.scheduleCloseFallback();
      }
    });
    this.child.on('error', error => {
      this.processError = error;
      this.scheduleCloseFallback();
    });
    this.child.on('exit', (code, signal) => {
      if (!this.closed) {
        this.exitCode = code;
        this.exitSignal = signal;
        this.scheduleCloseFallback();
      }
    });
    this.child.on('close', (code, signal) => {
      this.exitCode = code;
      this.exitSignal = signal;
      this.finalizeProcessFailure();
    });
  }

  setLifecycleStage(stage: ProviderLifecycleStage): void {
    this.lifecycleStage = stage;
  }

  onNotification(method: string, handler: (params: unknown) => void): void {
    const handlers = this.notificationHandlers.get(method) ?? [];
    handlers.push(handler);
    this.notificationHandlers.set(method, handlers);
  }

  /**
   * Installs the answers for server -> client requests.
   *
   * Must be set before `initialize` is written: a server may ask for configuration *before* it
   * answers `initialize`, which is exactly what `configurationRequestServer` reproduces.
   */
  setRequestHandlers(handlers: ReadonlyMap<string, ServerRequestHandler>): void {
    this.requestHandlers = handlers;
  }

  /**
   * The first client request we refused during `stage`, if any.
   *
   * A refusal is not a failure on its own — optional server requests can go unanswered and the
   * analysis still completes. It only becomes the explanation when the same stage then fails, which
   * is when the caller promotes its error code instead of reporting a bare timeout.
   */
  unhandledServerRequest(stage: ProviderLifecycleStage): string | undefined {
    return this.unhandledServerRequests.find(entry => entry.stage === stage)?.method;
  }

  /** Everything the bidirectional layer observed. Read by the opt-in debug transcript. */
  protocolCounters(): Record<string, unknown> {
    return {
      requestsSent: this.nextId - 1,
      serverRequestsAnswered: this.serverRequestsAnswered,
      unhandledServerRequests: this.unhandledServerRequests.map(entry => `${entry.stage}:${entry.method}`),
      cancelledRequests: this.cancelled,
      unmatchedResponses: this.unmatchedResponses,
      protocolViolations: this.protocolViolations,
      bytesFromServer: this.serverBytes,
    };
  }

  async request<T>(method: string, params: unknown): Promise<T> {
    const id = this.nextId++;
    const promise = new Promise<unknown>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.cancel(id);
        reject(this.stageFailure(
          new CliError(
            'timeout',
            `Language Server request timed out: ${method}`,
            6,
            true,
            { stage: this.lifecycleStage, method },
          ),
          this.lifecycleStage,
        ));
      }, this.timeoutMs);
      this.pendingOutbound.set(id, { resolve, reject, timer });
    });
    try {
      this.send({ jsonrpc: '2.0', id, method, params });
    } catch (error) {
      const request = this.pendingOutbound.get(id);
      if (request) {
        clearTimeout(request.timer);
        this.pendingOutbound.delete(id);
      }
      throw error;
    }
    return promise as Promise<T>;
  }

  /**
   * Rewrites a stage failure as a protocol incompatibility when this client refused a server request
   * during that same stage.
   *
   * Without this the deadlock in `configurationRequestServer` reports `timeout`, which names the
   * symptom and hides the cause: the server was waiting on us, not the other way round.
   */
  stageFailure(error: CliError, stage: ProviderLifecycleStage): CliError {
    const method = this.unhandledServerRequest(stage);
    if (method === undefined) {
      return error;
    }
    const details = (error.details ?? {}) as Record<string, unknown>;
    // `details.method` names the incompatible method, which is what the contract table means by it.
    // The request that actually failed keeps its own key so neither fact is lost.
    const { method: failed, ...rest } = details;
    return new CliError(
      'provider_protocol_incompatible',
      `The Language Server requires the client request ${method}, which Impact Lens does not implement, and then failed during ${stage}. ${error.message}`,
      5,
      false,
      {
        ...rest,
        stage,
        method,
        ...(typeof failed === 'string' ? { duringRequest: failed } : {}),
      },
    );
  }

  notify(method: string, params: unknown): void {
    this.send({ jsonrpc: '2.0', method, params });
  }

  /**
   * Tells the server to stop working on a request we have given up on.
   *
   * Abandoning a request without `$/cancelRequest` leaves the server computing an answer nobody will
   * read, which on a large workspace competes with whatever we ask next. The pending entry is *not*
   * deleted right away: the spec still lets the server answer a cancelled request, and dropping the
   * entry immediately would file that late answer under "unmatched response" — evidence pointing at a
   * protocol problem that does not exist. It is retired after a short grace instead.
   */
  private cancel(id: number): void {
    const pending = this.pendingOutbound.get(id);
    if (!pending) {
      return;
    }
    clearTimeout(pending.timer);
    this.pendingOutbound.set(id, { ...pending, cancelled: true });
    this.cancelled += 1;
    try {
      this.notify('$/cancelRequest', { id });
    } catch {
      // A closed session cancels itself by killing the child; the caller already has its error.
    }
    const sweep = setTimeout(() => {
      this.pendingOutbound.delete(id);
      this.cancelSweeps.delete(sweep);
    }, CANCEL_GRACE_MS);
    sweep.unref?.();
    this.cancelSweeps.add(sweep);
  }

  async dispose(graceful = true): Promise<void> {
    if (this.closed) {
      return;
    }
    if (graceful) {
      try {
        await this.request('shutdown', null);
        this.notify('exit', null);
      } catch {
        // The child is terminated below even when graceful shutdown fails.
      }
    }
    this.closed = true;
    if (this.closeTimer) {
      clearTimeout(this.closeTimer);
      this.closeTimer = undefined;
    }
    for (const sweep of this.cancelSweeps) {
      clearTimeout(sweep);
    }
    this.cancelSweeps.clear();
    this.child.kill();
    this.failAll(new Error('Language Server client disposed'));
  }

  private send(message: unknown): void {
    if (this.closed) {
      throw this.terminalError ?? new Error('Language Server client is closed');
    }
    const body = Buffer.from(JSON.stringify(message));
    this.child.stdin.write(`Content-Length: ${body.length}\r\n\r\n`);
    this.child.stdin.write(body);
  }

  private consume(chunk: Buffer): void {
    this.buffer = Buffer.concat([this.buffer, chunk]);
    while (true) {
      const headerEnd = this.buffer.indexOf('\r\n\r\n');
      if (headerEnd < 0) {
        return;
      }
      const header = this.buffer.subarray(0, headerEnd).toString('ascii');
      const match = /(?:^|\r\n)Content-Length:\s*(\d+)/i.exec(header);
      if (!match) {
        this.failAll(new Error('Language Server sent a response without Content-Length'));
        return;
      }
      const length = Number(match[1]);
      const bodyStart = headerEnd + 4;
      if (this.buffer.length < bodyStart + length) {
        return;
      }
      const body = this.buffer.subarray(bodyStart, bodyStart + length).toString('utf8');
      this.buffer = this.buffer.subarray(bodyStart + length);
      try {
        this.handle(JSON.parse(body) as JsonRpcIncoming);
      } catch (error) {
        this.failAll(error instanceof Error ? error : new Error(String(error)));
      }
    }
  }

  private handle(message: JsonRpcIncoming): void {
    switch (classifyIncoming(message)) {
      case 'request':
        this.handleServerRequest(message.method as string, message.id as JsonRpcId, message.params);
        return;
      case 'notification':
        this.handleNotification(message.method as string, message.params);
        return;
      case 'response':
        this.handleResponse(message);
        return;
      default:
        // Neither an id nor a method. Nothing can be answered and nothing can be resolved; keep the
        // count so a later failure can say the stream was malformed.
        this.protocolViolations += 1;
    }
  }

  private handleNotification(method: string, params: unknown): void {
    this.recordServerLog(method, params);
    for (const handler of this.notificationHandlers.get(method) ?? []) {
      handler(params);
    }
  }

  private handleResponse(message: JsonRpcIncoming): void {
    const id = message.id;
    const pending = typeof id === 'number' ? this.pendingOutbound.get(id) : undefined;
    if (!pending) {
      // A response we cannot match. A late answer to a request we cancelled lands here legitimately,
      // so this is evidence rather than a failure condition.
      this.unmatchedResponses += 1;
      return;
    }
    clearTimeout(pending.timer);
    this.pendingOutbound.delete(id as number);
    if (pending.cancelled) {
      // The server answered a request we already gave up on. That is allowed and is not evidence of
      // anything, so it is neither resolved nor counted.
      return;
    }
    if (message.error) {
      pending.reject(new Error(`Language Server error ${message.error.code}: ${message.error.message}`));
    } else {
      pending.resolve(message.result);
    }
  }

  private handleServerRequest(method: string, id: JsonRpcId, params: unknown): void {
    const key = `${typeof id}:${String(id)}`;
    if (this.inflightInbound.has(key)) {
      // The same id twice without an answer in between is the server's bug, not ours. Answering the
      // first one is still correct, so only the duplicate is recorded.
      this.protocolViolations += 1;
      return;
    }
    this.inflightInbound.add(key);
    const handler = this.requestHandlers.get(method);
    let outcome;
    if (!handler) {
      this.unhandledServerRequests.push({ method, stage: this.lifecycleStage });
      outcome = methodNotFound(method);
    } else {
      try {
        outcome = handler(params);
      } catch (error) {
        outcome = {
          kind: 'error' as const,
          code: JSON_RPC_INTERNAL_ERROR,
          message: `Impact Lens failed to answer ${method}: ${error instanceof Error ? error.message : String(error)}`,
        };
      }
    }
    this.inflightInbound.delete(key);
    this.serverRequestsAnswered += 1;
    this.sendResponse(id, outcome);
  }

  private sendResponse(id: JsonRpcId, outcome: ReturnType<ServerRequestHandler>): void {
    // The id goes back with its original type. Coercing a string id to a number loses the answer for
    // any server that numbers its requests with strings, which JSON-RPC allows.
    const message = outcome.kind === 'result'
      ? { jsonrpc: '2.0', id, result: outcome.value }
      : { jsonrpc: '2.0', id, error: { code: outcome.code, message: outcome.message } };
    try {
      this.send(message);
    } catch {
      // The session is already terminating; the pending failure carries the real diagnosis.
    }
  }

  // A Language Server reports its own diagnostics over window/logMessage rather than stderr, so a
  // server that dies mid-handshake leaves nothing behind unless these notifications are kept.
  private recordServerLog(method: string, params: unknown): void {
    if (method !== 'window/logMessage' && method !== 'window/showMessage') {
      return;
    }
    const value = params as { readonly type?: unknown; readonly message?: unknown } | undefined;
    if (typeof value?.message !== 'string' || value.message.length === 0) {
      return;
    }
    const severity = LOG_MESSAGE_SEVERITY[Number(value.type)] ?? 'log';
    this.serverLog = `${this.serverLog}${severity}: ${value.message}\n`.slice(-8000);
  }

  private failAll(error: Error): void {
    for (const request of this.pendingOutbound.values()) {
      clearTimeout(request.timer);
      request.reject(error);
    }
    this.pendingOutbound.clear();
  }

  private closeWithError(error: Error): void {
    this.closed = true;
    this.terminalError = error;
    this.failAll(error);
  }

  private scheduleCloseFallback(): void {
    if (this.closed || this.closeTimer) {
      return;
    }
    this.closeTimer = setTimeout(() => this.finalizeProcessFailure(), 100);
  }

  private finalizeProcessFailure(): void {
    if (this.closed) {
      return;
    }
    if (this.closeTimer) {
      clearTimeout(this.closeTimer);
      this.closeTimer = undefined;
    }
    const stage: ProviderLifecycleStage = this.spawned ? this.lifecycleStage : 'launch';
    const code = stage === 'launch'
      ? 'provider_launch_failed'
      : stage === 'initialize'
        ? 'provider_initialize_failed'
        : 'provider_query_failed';
    const reason = this.exitCode !== null
      ? `exit code ${this.exitCode}`
      : this.exitSignal
        ? `signal ${this.exitSignal}`
        : 'process error';
    const stderr = redactProviderText(this.stderr.trim());
    const providerLog = redactProviderText(this.serverLog.trim());
    const cause = this.processError
      ? ((this.processError as NodeJS.ErrnoException).code ?? this.processError.name)
      : undefined;
    this.closeWithError(this.stageFailure(
      new CliError(
        code,
        `Language Server ${this.executable} failed during ${stage} (${reason}).`,
        5,
        true,
        {
          stage,
          executable: this.executable,
          exitCode: this.exitCode,
          signal: this.exitSignal,
          // A server that dies without stderr still tells us whether it ever spoke the protocol and how
          // long it survived. Silence plus zero bytes points at the launch environment, while a reply
          // followed by a sudden exit points at what the server did after answering.
          msSinceSpawn: Date.now() - this.spawnedAt,
          bytesFromServer: this.serverBytes,
          requestsSent: this.nextId - 1,
          // Bidirectional counters are only spelled out when they are not zero, so a session that never
          // saw a server request keeps exactly the diagnostics shape it had before this existed.
          ...(this.serverRequestsAnswered ? { serverRequestsAnswered: this.serverRequestsAnswered } : {}),
          ...(this.unhandledServerRequests.length
            ? { unhandledServerRequestMethods: [...new Set(this.unhandledServerRequests.map(entry => entry.method))] }
            : {}),
          ...(this.cancelled ? { cancelledRequests: this.cancelled } : {}),
          ...(this.unmatchedResponses ? { unmatchedResponses: this.unmatchedResponses } : {}),
          ...(this.protocolViolations ? { protocolViolations: this.protocolViolations } : {}),
          ...(stderr ? { stderr } : {}),
          ...(providerLog ? { providerLog } : {}),
          ...(cause ? { cause } : {}),
        },
      ),
      stage,
    ));
  }
}

const LOG_MESSAGE_SEVERITY: Record<number, string> = { 1: 'error', 2: 'warning', 3: 'info', 4: 'log', 5: 'debug' };

export function redactProviderText(value: string): string {
  const home = os.homedir();
  return value
    .replace(/\b(Bearer)\s+[^\s]+/gi, '$1 [REDACTED]')
    .replace(/\b(token|password|secret|api[-_]?key)\s*[:=]\s*[^\s]+/gi, '$1=[REDACTED]')
    .split(home).join('~')
    .slice(-4000);
}
