import { spawn } from 'node:child_process';
import { CliError } from './types';

const PROBE_TOKEN = 'impact-lens-ipc-ok';

export type ChildIpcStatus = 'ok' | 'unavailable';

// Some restricted sandboxes and containers run child processes normally but never carry their piped
// stdio, so a Language Server looks like it died for no reason: it receives nothing, its own output
// never arrives, and it exits when its stdin ends. This spawns a trivial child that only echoes a
// token, which separates that environment from a genuine provider fault.
export function childIpcStatus(timeoutMs = 2000): Promise<ChildIpcStatus> {
  return new Promise(resolve => {
    let settled = false;
    const finish = (status: ChildIpcStatus): void => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timer);
      try {
        child.kill();
      } catch {
        // The probe result is already known; a failed kill must not change it.
      }
      resolve(status);
    };

    let child: ReturnType<typeof spawn>;
    try {
      child = spawn(process.execPath, ['-e', `process.stdout.write(${JSON.stringify(PROBE_TOKEN)})`], {
        stdio: ['ignore', 'pipe', 'ignore'],
      });
    } catch {
      resolve('unavailable');
      return;
    }

    const timer = setTimeout(() => finish('unavailable'), timeoutMs);
    let received = '';
    child.stdout?.on('data', chunk => {
      received = `${received}${String(chunk)}`;
      if (received.includes(PROBE_TOKEN)) {
        finish('ok');
      }
    });
    child.on('error', () => finish('unavailable'));
    child.on('close', () => finish(received.includes(PROBE_TOKEN) ? 'ok' : 'unavailable'));
  });
}

const SILENT_PROVIDER_CODES = new Set([
  'provider_launch_failed',
  'provider_initialize_failed',
  'provider_query_failed',
]);

// Only a provider that produced nothing at all can be explained by broken child stdio. A server that
// answered before failing was reachable, so its own error stays untouched.
export function looksLikeSilentProviderFailure(error: CliError): boolean {
  if (!SILENT_PROVIDER_CODES.has(error.code)) {
    return false;
  }
  const details = error.details as Record<string, unknown> | undefined;
  return details?.bytesFromServer === 0 && details.stderr === undefined && details.providerLog === undefined;
}

export function childIpcUnavailableError(error: CliError): CliError {
  const details = (error.details ?? {}) as Record<string, unknown>;
  return new CliError(
    'provider_ipc_unavailable',
    'Impact Lens could not exchange any data with the Language Server process. This environment starts child processes but does not deliver their stdio, which restricted agent sandboxes and containers do. Run Impact Lens outside the sandbox, allow child process I/O, or use the Extension instead.',
    5,
    false,
    {
      ...details,
      childIpc: 'unavailable',
      recovery: 'run_outside_sandbox_or_allow_child_process_io',
    },
  );
}
