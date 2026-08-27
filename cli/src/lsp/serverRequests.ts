// What this client answers when the Language Server asks it something.
//
// The table is owned by code, not by a preset manifest: an answer is a promise about what Impact Lens
// can actually do, and a manifest that could widen it would let a server rely on behaviour that does
// not exist. Only the *values* behind `workspace/configuration` come from configuration.
//
// The one rule that outranks the table: a request this client cannot serve is answered with a
// JSON-RPC error, never with silence. A dropped request leaves the server waiting forever, and that
// stall then reads as a provider timeout — a protocol violation wearing a timeout's clothes.

import {
  JSON_RPC_INVALID_PARAMS,
  JSON_RPC_METHOD_NOT_FOUND,
} from './protocol';
import { JsonObject, resolveConfiguration } from './configuration';

export type ServerRequestOutcome =
  | { readonly kind: 'result'; readonly value: unknown }
  | { readonly kind: 'error'; readonly code: number; readonly message: string };

export type ServerRequestHandler = (params: unknown) => ServerRequestOutcome;

export interface WorkspaceFolder {
  readonly uri: string;
  readonly name: string;
}

export interface CapabilityRegistration {
  readonly id: string;
  readonly method: string;
}

export interface ServerRequestContext {
  /** The single folder announced in `initialize`. */
  readonly workspaceFolders: readonly WorkspaceFolder[];
  /** Effective settings tree. Empty until a preset or an override supplies one. */
  readonly settings: JsonObject;
  onRegisterCapability?(registrations: readonly CapabilityRegistration[]): void;
  onUnregisterCapability?(registrations: readonly CapabilityRegistration[]): void;
  /** A created progress token is a token, not a statement that indexing finished. */
  onWorkDoneProgressCreate?(token: string | number): void;
}

const OK_NULL: ServerRequestOutcome = { kind: 'result', value: null };

export function createServerRequestHandlers(
  context: ServerRequestContext,
): ReadonlyMap<string, ServerRequestHandler> {
  const handlers = new Map<string, ServerRequestHandler>();

  handlers.set('workspace/configuration', params => {
    const answer = resolveConfiguration(context.settings, params);
    return answer === undefined
      ? { kind: 'error', code: JSON_RPC_INVALID_PARAMS, message: 'workspace/configuration requires an items array.' }
      : { kind: 'result', value: answer };
  });

  // We already advertise workspace.workspaceFolders in `initialize`, so this has to be answerable.
  handlers.set('workspace/workspaceFolders', () => ({ kind: 'result', value: [...context.workspaceFolders] }));

  handlers.set('client/registerCapability', params => {
    context.onRegisterCapability?.(registrations(params));
    return OK_NULL;
  });
  handlers.set('client/unregisterCapability', params => {
    // The spec names this field `unregisterations`; some servers send `registrations`. Read both.
    context.onUnregisterCapability?.(registrations(params));
    return OK_NULL;
  });

  handlers.set('window/workDoneProgress/create', params => {
    const token = (params as { readonly token?: unknown } | undefined)?.token;
    if (typeof token !== 'string' && typeof token !== 'number') {
      return { kind: 'error', code: JSON_RPC_INVALID_PARAMS, message: 'window/workDoneProgress/create requires a token.' };
    }
    context.onWorkDoneProgressCreate?.(token);
    return OK_NULL;
  });

  // There is no user to ask and no editor to drive, so these answer honestly rather than pretending.
  handlers.set('window/showMessageRequest', () => OK_NULL);
  handlers.set('window/showDocument', () => ({ kind: 'result', value: { success: false } }));
  // Impact Lens is a read-only analysis tool. Reporting `applied: true` would be a lie the server acts on.
  handlers.set('workspace/applyEdit', () => ({ kind: 'result', value: { applied: false } }));

  for (const method of [
    'workspace/semanticTokens/refresh',
    'workspace/codeLens/refresh',
    'workspace/inlayHint/refresh',
    'workspace/inlineValue/refresh',
    'workspace/diagnostic/refresh',
  ]) {
    handlers.set(method, () => OK_NULL);
  }

  return handlers;
}

export function methodNotFound(method: string): ServerRequestOutcome {
  return {
    kind: 'error',
    code: JSON_RPC_METHOD_NOT_FOUND,
    message: `Impact Lens does not implement the client request ${method}.`,
  };
}

function registrations(params: unknown): readonly CapabilityRegistration[] {
  const value = params as {
    readonly registrations?: unknown;
    readonly unregisterations?: unknown;
  } | undefined;
  const list = Array.isArray(value?.registrations)
    ? value?.registrations
    : Array.isArray(value?.unregisterations)
      ? value?.unregisterations
      : [];
  return (list as readonly unknown[]).flatMap(entry => {
    const record = entry as { readonly id?: unknown; readonly method?: unknown } | undefined;
    if (typeof record?.method !== 'string') {
      return [];
    }
    return [{ id: typeof record.id === 'string' ? record.id : '', method: record.method }];
  });
}
