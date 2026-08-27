// Wire-level JSON-RPC vocabulary for the Language Server session.
//
// This lives in `cli/src/lsp/` rather than `cli/src/types.ts` on purpose: `types.ts` is the response
// contract that ships in `cli/schemas/**`, while nothing here ever reaches an envelope. Keeping the
// two apart also keeps this lane out of a file another lane owns.

/** JSON-RPC allows both integers and strings. A server that numbers its requests with strings is not broken. */
export type JsonRpcId = number | string;

export interface JsonRpcErrorBody {
  readonly code: number;
  readonly message: string;
  readonly data?: unknown;
}

/** Anything the server can put on the wire. Which of the four shapes it is comes from `classifyIncoming`. */
export interface JsonRpcIncoming {
  readonly jsonrpc?: string;
  readonly id?: JsonRpcId | null;
  readonly method?: string;
  readonly params?: unknown;
  readonly result?: unknown;
  readonly error?: JsonRpcErrorBody;
}

export const JSON_RPC_METHOD_NOT_FOUND = -32601;
export const JSON_RPC_INVALID_PARAMS = -32602;
export const JSON_RPC_INTERNAL_ERROR = -32603;

export type IncomingKind = 'request' | 'notification' | 'response' | 'invalid';

/**
 * Decides which direction a message belongs to.
 *
 * The order of the two checks is the whole point. A server -> client request carries an `id` *and* a
 * `method`; a response to us carries an `id` and no `method`. Testing `id` first — which is what this
 * client used to do — routes every server request into the outbound pending table, finds nothing, and
 * drops it. The server then waits forever and the failure surfaces as a timeout that blames the
 * server for a rule the client broke.
 *
 * Because the shape decides the direction, the two id spaces never have to be kept apart. A server is
 * free to number its first request `1` while our own `initialize` is still in flight as `1`.
 */
export function classifyIncoming(message: JsonRpcIncoming): IncomingKind {
  const hasMethod = typeof message.method === 'string' && message.method.length > 0;
  const hasId = message.id !== undefined && message.id !== null;
  if (hasMethod) {
    return hasId ? 'request' : 'notification';
  }
  return hasId ? 'response' : 'invalid';
}
