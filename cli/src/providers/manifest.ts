import { CliError } from '../types';
import {
  CATALOG_ONLY_REF_SOURCES,
  JsonObject,
  JsonValue,
  ManifestObject,
  ManifestRef,
  ManifestRefSource,
  ManifestValue,
  MANIFEST_REF_SOURCES,
  isManifestRef,
} from './preset';

/**
 * Validation, `$ref` resolution and tier merging for manifest value trees.
 *
 * Everything a provider is configured with passes through here before a process exists, and nothing
 * that leaves here contains a `$ref`. The protocol layer receives plain JSON and does not know this
 * module exists.
 *
 * Error details carry key *paths* and never values. A configuration tree is exactly where a token or
 * a licence key ends up, and an error message is the one place a value can escape without any server
 * being involved.
 */

/**
 * Approved as proposed (lead decision L5). The limits are narrow on purpose: relaxing a declared limit
 * later is a compatible change and tightening one is a breaking change, so the safe direction is to
 * start small. None of these is small enough to block a known real-world server configuration.
 */
export const MANIFEST_LIMITS = {
  maxDepth: 16,
  maxSerializedBytes: 64 * 1024,
  maxKeys: 1000,
} as const;

/** Prototype pollution. Rejected at every depth, on both catalog manifests and user overrides. */
const FORBIDDEN_KEYS: ReadonlySet<string> = new Set(['__proto__', 'constructor', 'prototype']);

export interface ManifestRefContext {
  readonly nodeExecutable: () => string;
  readonly bundledModuleEntry: (module: string) => string;
}

export interface ManifestResolveOptions {
  /** Where the tree came from, used verbatim in error details. Never a filesystem path. */
  readonly origin: string;
  /** Catalog manifests may use `$ref`; user-supplied trees may not. */
  readonly allowRefs: boolean;
  readonly refs?: ManifestRefContext;
}

export function providerConfigInvalid(
  message: string,
  details: Record<string, unknown>,
): CliError {
  return new CliError('provider_config_invalid', message, 5, false, { stage: 'discovery', ...details });
}

/**
 * Validates a manifest tree and returns it with every `$ref` replaced by its resolved value.
 *
 * The walk does the size, depth, key and prototype checks in the same pass that resolves refs. That
 * single-pass property is why references are tagged objects rather than string templates: templating
 * would need this walk *plus* a separate scan of every string leaf, with escaping rules of its own.
 */
export function resolveManifestObject(
  value: ManifestObject | undefined,
  options: ManifestResolveOptions,
): JsonObject {
  if (value === undefined) {
    return {};
  }
  const state = { keys: 0 };
  const resolved = resolveValue(value, [], options, state);
  if (!isPlainObject(resolved)) {
    throw providerConfigInvalid(`${options.origin} must be a JSON object.`, { origin: options.origin });
  }
  assertSerializedSize(resolved, options.origin);
  return resolved;
}

/**
 * Resolves a manifest array whose entries must end up as strings.
 *
 * Command arguments are the only place this is used. A reference that resolved to a number or an
 * object there would be silently stringified by the process spawn, so it is refused instead.
 */
export function resolveManifestStrings(
  values: readonly ManifestValue[],
  options: ManifestResolveOptions,
): readonly string[] {
  const state = { keys: 0 };
  return values.map((entry, index) => {
    const resolved = resolveValue(entry, [String(index)], options, state);
    if (typeof resolved !== 'string') {
      throw providerConfigInvalid(
        `${options.origin} entry ${index} is not a string.`,
        { origin: options.origin, path: String(index) },
      );
    }
    return resolved;
  });
}

/**
 * Validates a user-supplied plain JSON tree. Identical checks minus reference resolution, which is
 * refused rather than ignored: a silently dropped `$ref` would send a different configuration than
 * the one that was written.
 */
export function assertPlainJsonObject(value: unknown, origin: string): JsonObject {
  return resolveManifestObject(value as ManifestObject, { origin, allowRefs: false });
}

function resolveValue(
  value: ManifestValue,
  path: readonly string[],
  options: ManifestResolveOptions,
  state: { keys: number },
): JsonValue {
  if (path.length > MANIFEST_LIMITS.maxDepth) {
    throw providerConfigInvalid(
      `${options.origin} is nested deeper than ${MANIFEST_LIMITS.maxDepth} levels.`,
      { origin: options.origin, path: path.join('.'), maxDepth: MANIFEST_LIMITS.maxDepth },
    );
  }
  if (value === null || typeof value === 'boolean' || typeof value === 'string') {
    return value;
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      // NaN and Infinity do not survive a JSON round trip, so a tree containing one cannot mean the
      // same thing on both sides of the wire.
      throw providerConfigInvalid(
        `${options.origin} contains a non-finite number.`,
        { origin: options.origin, path: path.join('.') },
      );
    }
    return value;
  }
  if (Array.isArray(value)) {
    return value.map((entry, index) => resolveValue(entry as ManifestValue, [...path, String(index)], options, state));
  }
  if (isManifestRef(value)) {
    return resolveRef(value, path, options);
  }
  if (isPlainObject(value)) {
    const out: Record<string, JsonValue> = {};
    for (const [key, entry] of Object.entries(value)) {
      if (FORBIDDEN_KEYS.has(key)) {
        throw providerConfigInvalid(
          `${options.origin} uses the reserved key ${key}.`,
          { origin: options.origin, path: [...path, key].join('.') },
        );
      }
      state.keys += 1;
      if (state.keys > MANIFEST_LIMITS.maxKeys) {
        throw providerConfigInvalid(
          `${options.origin} declares more than ${MANIFEST_LIMITS.maxKeys} keys.`,
          { origin: options.origin, maxKeys: MANIFEST_LIMITS.maxKeys },
        );
      }
      out[key] = resolveValue(entry as ManifestValue, [...path, key], options, state);
    }
    return out;
  }
  throw providerConfigInvalid(
    `${options.origin} contains a value that is not valid JSON.`,
    { origin: options.origin, path: path.join('.') },
  );
}

function resolveRef(ref: ManifestRef, path: readonly string[], options: ManifestResolveOptions): JsonValue {
  const where = path.join('.');
  if (!options.allowRefs) {
    throw providerConfigInvalid(
      `${options.origin} may not use $ref; only the shipped catalog can.`,
      { origin: options.origin, path: where, ref: ref.$ref },
    );
  }
  if (!isRefSource(ref.$ref)) {
    throw providerConfigInvalid(
      `${options.origin} references unknown source ${ref.$ref}.`,
      { origin: options.origin, path: where, knownRefSources: [...MANIFEST_REF_SOURCES] },
    );
  }
  const refs = options.refs;
  if (!refs) {
    throw providerConfigInvalid(
      `${options.origin} uses $ref but no reference context was provided.`,
      { origin: options.origin, path: where, ref: ref.$ref },
    );
  }
  if (ref.$ref === 'nodeExecutable') {
    if (ref.module !== undefined) {
      throw providerConfigInvalid(
        `${options.origin} passes module to a $ref that does not take one.`,
        { origin: options.origin, path: where, ref: ref.$ref },
      );
    }
    return refs.nodeExecutable();
  }
  if (typeof ref.module !== 'string' || ref.module.length === 0) {
    throw providerConfigInvalid(
      `${options.origin} uses $ref bundledModuleEntry without a module.`,
      { origin: options.origin, path: where, ref: ref.$ref },
    );
  }
  return refs.bundledModuleEntry(ref.module);
}

function isRefSource(value: string): value is ManifestRefSource {
  return (MANIFEST_REF_SOURCES as readonly string[]).includes(value);
}

/** Whether a source may only appear in the shipped catalog. Both current sources may. */
export function isCatalogOnlyRef(source: ManifestRefSource): boolean {
  return CATALOG_ONLY_REF_SOURCES.includes(source);
}

function assertSerializedSize(value: JsonObject, origin: string): void {
  const bytes = Buffer.byteLength(JSON.stringify(value), 'utf8');
  if (bytes > MANIFEST_LIMITS.maxSerializedBytes) {
    throw providerConfigInvalid(
      `${origin} serializes to more than ${MANIFEST_LIMITS.maxSerializedBytes} bytes.`,
      { origin, maxSerializedBytes: MANIFEST_LIMITS.maxSerializedBytes, bytes },
    );
  }
}

/**
 * Merges configuration trees, later arguments winning.
 *
 * Objects merge key by key so that changing one setting in an override does not freeze the rest of a
 * preset at the version it was copied from. Arrays replace wholly, because an LSP settings array is
 * almost always one complete list and element-wise merging has no agreed meaning.
 *
 * There is no way for a later tier to delete a key. A `null` means the value is null. A delete
 * sentinel would add a word to the vocabulary that no preset needs yet.
 */
export function mergeJsonObjects(...trees: readonly (JsonObject | undefined)[]): JsonObject {
  let out: JsonObject = {};
  for (const tree of trees) {
    if (tree !== undefined) {
      out = mergeTwo(out, tree);
    }
  }
  return out;
}

function mergeTwo(base: JsonObject, override: JsonObject): JsonObject {
  const out: Record<string, JsonValue> = { ...base };
  for (const [key, value] of Object.entries(override)) {
    const existing = out[key];
    out[key] = isPlainObject(existing) && isPlainObject(value)
      ? mergeTwo(existing, value)
      : value;
  }
  return out;
}

export function isJsonTreeEmpty(tree: JsonObject): boolean {
  return Object.keys(tree).length === 0;
}

/**
 * String values that must never appear in any output for this session.
 *
 * Two sources feed the table. The preset declares slots by path, because the value itself is not in
 * the manifest — a credential arrives through an override. The key-name heuristic runs alongside and
 * is not replaced by the declaration, because a preset author can forget a slot and
 * `licenseServer.credential` does not match any name rule.
 *
 * Short strings are excluded. A four-character minimum keeps values like `1` or `true` out of a table
 * whose entries are substituted literally into log text.
 */
const SENSITIVE_KEY_PATTERN = /(token|secret|password|passwd|credential|api[-_]?key|auth)/i;
const MINIMUM_REDACTABLE_LENGTH = 4;

export function collectSensitiveStrings(
  tree: JsonObject,
  declaredPaths: readonly string[] = [],
): readonly string[] {
  const found = new Set<string>();
  for (const path of declaredPaths) {
    collectStrings(readPath(tree, path.split('.')), found);
  }
  walkForHeuristic(tree, found);
  return [...found].filter(value => value.length >= MINIMUM_REDACTABLE_LENGTH);
}

function walkForHeuristic(value: JsonValue, found: Set<string>): void {
  if (Array.isArray(value)) {
    for (const entry of value) {
      walkForHeuristic(entry, found);
    }
    return;
  }
  if (isPlainObject(value)) {
    for (const [key, entry] of Object.entries(value)) {
      if (SENSITIVE_KEY_PATTERN.test(key)) {
        collectStrings(entry, found);
      }
      walkForHeuristic(entry, found);
    }
  }
}

function collectStrings(value: JsonValue | undefined, found: Set<string>): void {
  if (typeof value === 'string') {
    found.add(value);
    return;
  }
  if (Array.isArray(value)) {
    for (const entry of value) {
      collectStrings(entry, found);
    }
    return;
  }
  if (isPlainObject(value)) {
    for (const entry of Object.values(value)) {
      collectStrings(entry, found);
    }
  }
}

function readPath(tree: JsonObject, segments: readonly string[]): JsonValue | undefined {
  let current: JsonValue | undefined = tree;
  for (const segment of segments) {
    if (!isPlainObject(current)) {
      return undefined;
    }
    current = current[segment];
  }
  return current;
}

/**
 * Keys containing a dot, at any depth, reported as dot paths.
 *
 * A `workspace/configuration` section is resolved by walking the tree, so a literal key like
 * `"typescript.preferences"` can never be reached by a section request. Most of the time that is an
 * author mistake, but `files.exclude` style settings legitimately hold dotted glob keys inside their
 * *values*, and the two cannot be told apart by syntax. So this reports and doctor warns; it never
 * fails.
 */
export function unreachableDottedKeys(tree: JsonObject, trail: readonly string[] = []): readonly string[] {
  const out: string[] = [];
  for (const [key, value] of Object.entries(tree)) {
    if (key.includes('.')) {
      out.push([...trail, key].join('.'));
    }
    if (isPlainObject(value)) {
      out.push(...unreachableDottedKeys(value, [...trail, key]));
    }
  }
  return out;
}

function isPlainObject(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
