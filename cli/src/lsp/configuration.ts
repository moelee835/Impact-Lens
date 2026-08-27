// `workspace/configuration` lookup rules.
//
// The shape of the answer is fixed by LSP 3.17 and by the field contract in
// docs/work/task-m1-preset-manifest-contract.md (D3). It is deliberately a pure function of the
// effective settings tree so that the settings *source* (preset manifest, project override, request
// override) can change without touching the protocol layer.

export type JsonScalar = string | number | boolean | null;
export type JsonValue = JsonScalar | readonly JsonValue[] | { readonly [key: string]: JsonValue };
export type JsonObject = { readonly [key: string]: JsonValue };

export interface ConfigurationItem {
  /** Ignored on purpose: this CLI has exactly one workspace folder, so there is nothing to distinguish. */
  readonly scopeUri?: string;
  readonly section?: string;
}

export const EMPTY_SETTINGS: JsonObject = Object.freeze({});

/**
 * Builds the `LSPAny[]` answer for a `workspace/configuration` request.
 *
 * Returns `undefined` when `params` is not a `ConfigurationParams`, which the caller turns into
 * InvalidParams rather than guessing an answer.
 *
 * Three rules, none of them optional:
 *
 * 1. The result has the same length and the same order as `items`. This is the most commonly broken
 *    rule in client implementations and a server has no way to recover from a mismatch.
 * 2. An item without `section` asks for everything we know, so it gets the root tree — `{}` when the
 *    tree is empty, because an empty tree is still all we know.
 * 3. An item with `section` walks the tree by splitting on `.`. A section we cannot reach answers
 *    `null`, which is what the spec names for "the client cannot provide this". `{}` would instead
 *    claim "there is a setting here and it is empty", which can override a server's own defaults.
 */
export function resolveConfiguration(settings: JsonObject, params: unknown): unknown[] | undefined {
  const items = (params as { readonly items?: unknown } | undefined)?.items;
  if (!Array.isArray(items)) {
    return undefined;
  }
  return items.map(entry => {
    const section = (entry as ConfigurationItem | undefined)?.section;
    if (typeof section !== 'string' || section.length === 0) {
      return clone(settings);
    }
    const found = lookupSection(settings, section);
    return found === undefined ? null : clone(found);
  });
}

/**
 * Walks a dotted section path through the tree.
 *
 * A key that itself contains a `.` is unreachable this way and is only ever delivered as part of its
 * parent object. That limitation is intentional: settings *values* legitimately contain dotted keys
 * (`files.exclude` holds globs such as `**\/*.ts`), so forbidding dots outright would reject correct
 * manifests, and a "nested first, flat key second" fallback would need a tie-break rule for trees
 * where both readings exist.
 */
export function lookupSection(settings: JsonObject, section: string): JsonValue | undefined {
  let current: JsonValue = settings;
  for (const key of section.split('.')) {
    if (!isPlainObject(current) || !Object.prototype.hasOwnProperty.call(current, key)) {
      return undefined;
    }
    current = (current as { readonly [k: string]: JsonValue })[key] as JsonValue;
  }
  return current;
}

/** Structural copy so a server-visible answer can never alias the session's own settings tree. */
export function clone<T extends JsonValue>(value: T): T {
  if (Array.isArray(value)) {
    return value.map(entry => clone(entry as JsonValue)) as unknown as T;
  }
  if (isPlainObject(value)) {
    const out: Record<string, JsonValue> = {};
    for (const [key, entry] of Object.entries(value)) {
      out[key] = clone(entry);
    }
    return out as unknown as T;
  }
  return value;
}

export function isPlainObject(value: unknown): value is { readonly [key: string]: JsonValue } {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
