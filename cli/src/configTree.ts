// Shape and budget rules for the plain-JSON provider configuration trees a request may carry
// (`initializationOptions`, `settings`) and for the preset id it may name (`providerPreset`).
//
// The numbers come from decision D8 of docs/work/task-m1-preset-manifest-contract.md and were approved
// unchanged by lead decision L5. They are deliberately narrow: relaxing a limit later is a compatible
// change inside schemaVersion 1, tightening one is not.
//
// Why this lives in its own module rather than inside the request parser:
//
// 1. `cli/schemas/request.schema.json` can express the value types and the forbidden prototype keys but
//    cannot express a depth, byte or total-key budget. Those three exist only here, so the schema
//    declares them in an unreferenced `$defs/configTreeLimits` block and
//    `cli/src/test/requestSchema.test.ts` compares the two sides. Keeping the constants in one exported
//    object is what makes that comparison possible.
// 2. The same trees arrive from two different sources with two different error codes. A request that
//    violates a limit is an `invalid_request` (the caller must fix the request); a project configuration
//    file that violates one is a `provider_config_invalid` (the caller must fix the file) - lead decision
//    L1. `findConfigTreeViolation` therefore reports the violation as data and lets each caller choose
//    the code. Only the request side is implemented here; lane W1-B owns the file side.
// 3. `__proto__`, `constructor` and `prototype` are rejected because these trees are deep-merged
//    (`preset < project < request`, D9) and a deep merge is exactly the code prototype pollution
//    attacks. The rejection has to happen before the merge sees the value, which means at parse time.
import { CliError } from './errors';
import { JsonObject } from './types';

export const CONFIG_TREE_LIMITS = {
  /** Maximum number of nested containers. The tree itself is level 1. */
  maxDepth: 16,
  /** Maximum size of one tree as serialized JSON, in bytes (64 KiB). */
  maxSerializedBytes: 65536,
  /** Maximum number of object keys anywhere in one tree. Depth and bytes alone miss a wide, flat tree. */
  maxKeys: 1000,
} as const;

/**
 * Keys rejected at every depth, in every tree, from every source.
 *
 * This is not a style rule. `cli/src/providers` will deep-merge these trees, and a deep merge that walks
 * attacker-supplied keys is the textbook prototype pollution sink. Rejecting the key is preferred over
 * stripping it: stripping would send a configuration the author never wrote and report nothing.
 */
export const FORBIDDEN_CONFIG_KEYS = ['__proto__', 'constructor', 'prototype'] as const;

/**
 * Shape rules for `providerPreset`. Existence is deliberately **not** checked here: the preset catalog
 * lands with lane W1-B, and a check written against a catalog that does not exist yet would either always
 * pass or always fail. See decision R5 in docs/work/task-m1-request-overrides.md.
 *
 * The character rule is a security rule, not a cosmetic one. A preset id is a catalog lookup key that may
 * end up in a file name, so `../`, absolute paths, NUL bytes and whitespace must not survive the request
 * boundary. Every known candidate id (`bundled-typescript`, `go-gopls`, `rust-analyzer`) already matches.
 */
export const PRESET_ID_MAX_LENGTH = 64;
export const PRESET_ID_PATTERN = '^[a-z0-9]+(?:-[a-z0-9]+)*$';

export const CONFIG_TREE_RULES = ['type', 'forbidden-key', 'depth', 'keys', 'bytes'] as const;
export type ConfigTreeRule = (typeof CONFIG_TREE_RULES)[number];

/**
 * One reason a tree is not acceptable, as data.
 *
 * `message` has to say what to fix. "invalid" is not a diagnosis, and this repository exists to stop
 * reporting states the user cannot act on.
 */
export interface ConfigTreeViolation {
  readonly rule: ConfigTreeRule;
  /** Dotted path to the offending value, rooted at the field name (`settings.typescript.tsdk`). */
  readonly path: string;
  readonly limit?: number;
  readonly observed?: number | string;
  readonly message: string;
}

const FORBIDDEN: ReadonlySet<string> = new Set(FORBIDDEN_CONFIG_KEYS);

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return false;
  }
  const prototype = Object.getPrototypeOf(value) as unknown;
  // A Date, Map or class instance serializes to something other than itself, so accepting it here would
  // silently change the value the language server receives.
  return prototype === Object.prototype || prototype === null;
}

function describe(value: unknown): string {
  if (value === null) {
    return 'null';
  }
  if (Array.isArray(value)) {
    return 'array';
  }
  return typeof value;
}

function inspect(
  value: unknown,
  path: string,
  depth: number,
  counter: { keys: number },
): ConfigTreeViolation | undefined {
  if (Array.isArray(value) || isPlainObject(value)) {
    if (depth > CONFIG_TREE_LIMITS.maxDepth) {
      return {
        rule: 'depth',
        path,
        limit: CONFIG_TREE_LIMITS.maxDepth,
        observed: depth,
        message: `${path} is nested ${depth} levels deep, past the limit of ${CONFIG_TREE_LIMITS.maxDepth}. Flatten the tree or move the value into a preset.`,
      };
    }
  }
  if (Array.isArray(value)) {
    for (let index = 0; index < value.length; index += 1) {
      const violation = inspect(value[index], `${path}[${index}]`, depth + 1, counter);
      if (violation !== undefined) {
        return violation;
      }
    }
    return undefined;
  }
  if (isPlainObject(value)) {
    for (const key of Object.keys(value)) {
      const childPath = `${path}.${key}`;
      if (FORBIDDEN.has(key)) {
        return {
          rule: 'forbidden-key',
          path: childPath,
          observed: key,
          message: `${childPath} uses the forbidden key "${key}". ${FORBIDDEN_CONFIG_KEYS.join(', ')} are rejected at every depth because provider configuration is merged into other objects.`,
        };
      }
      counter.keys += 1;
      if (counter.keys > CONFIG_TREE_LIMITS.maxKeys) {
        return {
          rule: 'keys',
          path: childPath,
          limit: CONFIG_TREE_LIMITS.maxKeys,
          observed: counter.keys,
          message: `${path.split('.')[0]} has more than ${CONFIG_TREE_LIMITS.maxKeys} keys. Keep only the settings the language server actually reads.`,
        };
      }
      const violation = inspect(value[key], childPath, depth + 1, counter);
      if (violation !== undefined) {
        return violation;
      }
    }
    return undefined;
  }
  if (value === null || typeof value === 'boolean' || typeof value === 'string') {
    return undefined;
  }
  if (typeof value === 'number') {
    if (Number.isFinite(value)) {
      return undefined;
    }
    return {
      rule: 'type',
      path,
      observed: String(value),
      message: `${path} must be a finite number. NaN and Infinity do not survive a JSON round trip.`,
    };
  }
  return {
    rule: 'type',
    path,
    observed: describe(value),
    message: `${path} must be a string, number, boolean, null, array or plain object, but is ${describe(value)}. Provider configuration is plain JSON.`,
  };
}

/**
 * Returns the first reason `value` may not be used as a provider configuration tree, or `undefined`.
 *
 * Checks run in the order the user can act on them: shape and forbidden keys first (they name one value),
 * then the whole-tree budgets. The walk stops at the first violation, and the key counter bounds it, so a
 * hostile tree cannot make this function run longer than the limits allow.
 */
export function findConfigTreeViolation(value: unknown, field: string): ConfigTreeViolation | undefined {
  if (!isPlainObject(value)) {
    return {
      rule: 'type',
      path: field,
      observed: describe(value),
      message: `${field} must be a JSON object, but is ${describe(value)}.`,
    };
  }
  const structural = inspect(value, field, 1, { keys: 0 });
  if (structural !== undefined) {
    return structural;
  }
  let bytes: number;
  try {
    bytes = Buffer.byteLength(JSON.stringify(value) ?? '', 'utf8');
  } catch (error) {
    return {
      rule: 'type',
      path: field,
      observed: describe(value),
      message: `${field} could not be serialized as JSON: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
  if (bytes > CONFIG_TREE_LIMITS.maxSerializedBytes) {
    return {
      rule: 'bytes',
      path: field,
      limit: CONFIG_TREE_LIMITS.maxSerializedBytes,
      observed: bytes,
      message: `${field} serializes to ${bytes} bytes, past the limit of ${CONFIG_TREE_LIMITS.maxSerializedBytes}. The whole tree is sent to the language server, so keep it small.`,
    };
  }
  return undefined;
}

/**
 * Validates one configuration tree that arrived **in the request**.
 *
 * The code is `invalid_request` on purpose. Lead decision L1 rejected reusing `invalid_request` for a bad
 * project configuration file because it would point the user at the wrong artifact; the same reasoning
 * applied to a bad request points here. `provider_config_invalid` belongs to the file source and is
 * thrown by lane W1-B.
 */
export function requestConfigTree(value: unknown, field: string): JsonObject | undefined {
  if (value === undefined) {
    return undefined;
  }
  const violation = findConfigTreeViolation(value, field);
  if (violation !== undefined) {
    throw new CliError('invalid_request', violation.message, 2, false, {
      field,
      rule: violation.rule,
      path: violation.path,
      ...(violation.limit === undefined ? {} : { limit: violation.limit }),
      ...(violation.observed === undefined ? {} : { observed: violation.observed }),
    });
  }
  return value as JsonObject;
}

/** Validates the **shape** of `providerPreset`. Whether the id exists is lane W1-B's question (R5). */
export function requestPresetId(value: unknown, field: string): string | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (typeof value !== 'string' || value.length === 0) {
    throw new CliError('invalid_request', `${field} must be a non-empty string naming a provider preset id.`, 2, false, {
      field,
      rule: 'type',
      observed: describe(value),
    });
  }
  if (value.length > PRESET_ID_MAX_LENGTH) {
    throw new CliError('invalid_request', `${field} must be at most ${PRESET_ID_MAX_LENGTH} characters.`, 2, false, {
      field,
      rule: 'length',
      limit: PRESET_ID_MAX_LENGTH,
      observed: value.length,
    });
  }
  if (!new RegExp(PRESET_ID_PATTERN).test(value)) {
    throw new CliError(
      'invalid_request',
      `${field} must be lower-case letters and digits separated by single hyphens, for example "go-gopls".`,
      2,
      false,
      { field, rule: 'pattern', observed: value },
    );
  }
  return value;
}
