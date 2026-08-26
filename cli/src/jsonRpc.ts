import { ChildProcessWithoutNullStreams, spawn } from 'node:child_process';
import * as os from 'node:os';
import * as path from 'node:path';
import { CliError, ProviderLifecycleStage } from './types';

interface JsonRpcResponse {
  readonly jsonrpc: '2.0';
  readonly id?: number;
  readonly result?: unknown;
  readonly error?: { readonly code: number; readonly message: string; readonly data?: unknown };
  readonly method?: string;
  readonly params?: unknown;
}

interface PendingRequest {
  readonly resolve: (value: unknown) => void;
  readonly reject: (error: Error) => void;
  readonly timer: ReturnType<typeof setTimeout>;
}

export class JsonRpcClient {
  private readonly child: ChildProcessWithoutNullStreams;
  private readonly pending = new Map<number, PendingRequest>();
  private readonly notificationHandlers = new Map<string, Array<(params: unknown) => void>>();
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

  constructor(command: string, args: readonly string[], private readonly timeoutMs: number) {
    this.executable = path.basename(command);
    this.child = spawn(command, [...args], { stdio: ['pipe', 'pipe', 'pipe'] });
    this.child.once('spawn', () => {
      this.spawned = true;
    });
    this.child.stdout.on('data', chunk => this.consume(Buffer.from(chunk)));
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

  async request<T>(method: string, params: unknown): Promise<T> {
    const id = this.nextId++;
    const promise = new Promise<unknown>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new CliError(
          'timeout',
          `Language Server request timed out: ${method}`,
          6,
          true,
          { stage: this.lifecycleStage, method },
        ));
      }, this.timeoutMs);
      this.pending.set(id, { resolve, reject, timer });
    });
    try {
      this.send({ jsonrpc: '2.0', id, method, params });
    } catch (error) {
      const request = this.pending.get(id);
      if (request) {
        clearTimeout(request.timer);
        this.pending.delete(id);
      }
      throw error;
    }
    return promise as Promise<T>;
  }

  notify(method: string, params: unknown): void {
    this.send({ jsonrpc: '2.0', method, params });
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
        this.handle(JSON.parse(body) as JsonRpcResponse);
      } catch (error) {
        this.failAll(error instanceof Error ? error : new Error(String(error)));
      }
    }
  }

  private handle(message: JsonRpcResponse): void {
    if (message.id !== undefined) {
      const pending = this.pending.get(message.id);
      if (!pending) {
        return;
      }
      clearTimeout(pending.timer);
      this.pending.delete(message.id);
      if (message.error) {
        pending.reject(new Error(`Language Server error ${message.error.code}: ${message.error.message}`));
      } else {
        pending.resolve(message.result);
      }
      return;
    }
    if (message.method) {
      for (const handler of this.notificationHandlers.get(message.method) ?? []) {
        handler(message.params);
      }
    }
  }

  private failAll(error: Error): void {
    for (const request of this.pending.values()) {
      clearTimeout(request.timer);
      request.reject(error);
    }
    this.pending.clear();
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
    const cause = this.processError
      ? ((this.processError as NodeJS.ErrnoException).code ?? this.processError.name)
      : undefined;
    this.closeWithError(new CliError(
      code,
      `Language Server ${this.executable} failed during ${stage} (${reason}).`,
      5,
      true,
      {
        stage,
        executable: this.executable,
        exitCode: this.exitCode,
        signal: this.exitSignal,
        ...(stderr ? { stderr } : {}),
        ...(cause ? { cause } : {}),
      },
    ));
  }
}

export function redactProviderText(value: string): string {
  const home = os.homedir();
  return value
    .replace(/\b(Bearer)\s+[^\s]+/gi, '$1 [REDACTED]')
    .replace(/\b(token|password|secret|api[-_]?key)\s*[:=]\s*[^\s]+/gi, '$1=[REDACTED]')
    .split(home).join('~')
    .slice(-4000);
}
