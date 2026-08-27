// What the protocol layer needs to know about a provider's configuration, and nothing more.
//
// Every value here is already-resolved plain JSON. Reference resolution (`{"$ref": ...}`) and the
// merge of catalog defaults with project and request overrides happen in `cli/src/providers/`, which
// owns which executable answers for which language. This module never imports a preset type, so the
// session can be built in a test from a literal object.

import { EMPTY_SETTINGS, JsonObject } from './configuration';

/**
 * How a preset wants its settings delivered.
 *
 * `on-request` is the default and means: answer `workspace/configuration` when asked, and otherwise
 * say nothing. Pushing `workspace/didChangeConfiguration` unconditionally would change the frames the
 * bundled TypeScript session sends today, for no benefit to a server that does not read them.
 */
// Declared here rather than imported from `cli/src/providers/preset.ts` on purpose: this module must
// stay free of the manifest vocabulary so a session can be built from a literal object. The two
// declarations are kept in step by a parity test in `cli/src/test/lspProtocol.test.ts`, which is the
// same technique the schema/union parity tests use — duplication that is checked, rather than an
// import that would breach the seam.
export const SETTINGS_DELIVERIES = ['on-request', 'did-change-configuration'] as const;
export type SettingsDelivery = (typeof SETTINGS_DELIVERIES)[number];

/** Paths, relative to each tree's root, whose string values are secrets. */
export interface SensitivePaths {
  readonly initializationOptions?: readonly string[];
  readonly settings?: readonly string[];
}

export interface ProviderSessionConfig {
  /** Sent verbatim as `initialize.initializationOptions`. */
  readonly initializationOptions?: JsonObject;
  /** Answers `workspace/configuration` and, when requested, `workspace/didChangeConfiguration`. */
  readonly settings?: JsonObject;
  readonly settingsDelivery?: readonly SettingsDelivery[];
  readonly sensitive?: SensitivePaths;
}

export interface ResolvedSession {
  readonly initializationOptions: JsonObject;
  readonly settings: JsonObject;
  readonly settingsDelivery: readonly SettingsDelivery[];
  /** Literal strings to replace anywhere provider-authored text is reported. */
  readonly redactionValues: readonly string[];
}

/**
 * Combines what provider selection resolved with what a direct caller passed in.
 *
 * Selection is the real source: the catalog preset, the trusted project file and the request
 * overrides are merged in `cli/src/providers/` and arrive here already flattened. The second argument
 * exists for callers that construct the session themselves — tests, and the doctor smoke path — and
 * it wins field by field, following the same "later tier wins" rule the merge order already uses.
 *
 * Presence is read off the raw config, not off `resolveSession` of it, because `settingsDelivery` has
 * a non-empty default: resolving first would make an unset field look set and silently outrank the
 * preset's own choice.
 *
 * Redaction is the exception and is a union. A secret is a secret regardless of which tier named it,
 * and dropping one side's values because the other side was more specific would leak exactly the
 * value the more specific tier replaced.
 */
export function mergeSessionValues(
  resolved: ResolvedSession,
  config: ProviderSessionConfig = {},
): ResolvedSession {
  const direct = resolveSession(config);
  const redactionValues = [...new Set([...resolved.redactionValues, ...direct.redactionValues])]
    .sort((a, b) => b.length - a.length);
  return {
    initializationOptions: config.initializationOptions ?? resolved.initializationOptions,
    settings: config.settings ?? resolved.settings,
    settingsDelivery: config.settingsDelivery ?? resolved.settingsDelivery,
    redactionValues,
  };
}

export function resolveSession(config: ProviderSessionConfig = {}): ResolvedSession {
  const initializationOptions = config.initializationOptions ?? EMPTY_SETTINGS;
  const settings = config.settings ?? EMPTY_SETTINGS;
  return {
    initializationOptions,
    settings,
    settingsDelivery: config.settingsDelivery ?? ['on-request'],
    redactionValues: collectSecrets(
      [
        { tree: initializationOptions, declared: config.sensitive?.initializationOptions },
        { tree: settings, declared: config.sensitive?.settings },
      ],
    ),
  };
}

/** Shorter strings have no identifying power, and replacing them would shred unrelated log text. */
const MIN_SECRET_LENGTH = 4;

// The backstop for a preset author who forgot to declare a slot. It is deliberately not the only
// mechanism: a key such as `licenseServer.credential` escapes any name rule, and only the preset
// knows that the slot holds a secret. Declaration and heuristic run together, never one instead of
// the other.
//
// Matching is by substring on the key with separators removed, which is what makes `authToken`,
// `api_key` and `API-KEY` all land. Word-boundary matching misses camel case, and camel case is how
// most of these keys are actually written. The cost is the occasional false positive — a
// `tokenizer` setting would be redacted — and that trade is deliberate: a redacted log line is
// inconvenient, a leaked credential is not recoverable.
const SECRET_KEY_PARTS = [
  'token', 'secret', 'password', 'passwd', 'apikey', 'credential', 'passphrase', 'authorization',
  'privatekey', 'cookie',
];

function keyLooksSensitive(key: string): boolean {
  const normalized = key.toLowerCase().replace(/[^a-z0-9]/g, '');
  return SECRET_KEY_PARTS.some(part => normalized.includes(part));
}

interface SecretSource {
  readonly tree: JsonObject;
  readonly declared: readonly string[] | undefined;
}

/**
 * Gathers the literal strings that must never appear in reported text.
 *
 * Pattern-based redaction cannot catch a value a server echoes back in its own words: the CLI never
 * wrote that sentence, so `token=...` and friends do not necessarily appear in it. Substituting the
 * value itself is the only thing that survives an arbitrary reformatting by the server.
 */
export function collectSecrets(sources: readonly SecretSource[]): readonly string[] {
  const found = new Set<string>();
  for (const source of sources) {
    for (const path of source.declared ?? []) {
      collectStrings(readPath(source.tree, path), found);
    }
    walkForSecretKeys(source.tree, found);
  }
  // Longest first: replacing a substring before its container would leave the remainder exposed.
  return [...found].sort((a, b) => b.length - a.length);
}

function readPath(tree: JsonObject, path: string): unknown {
  let current: unknown = tree;
  for (const key of path.split('.')) {
    if (typeof current !== 'object' || current === null || Array.isArray(current)
      || !Object.prototype.hasOwnProperty.call(current, key)) {
      return undefined;
    }
    current = (current as Record<string, unknown>)[key];
  }
  return current;
}

/** A declared path may point at a subtree; every string inside it is the secret. */
function collectStrings(value: unknown, found: Set<string>): void {
  if (typeof value === 'string') {
    if (value.length >= MIN_SECRET_LENGTH) {
      found.add(value);
    }
    return;
  }
  if (Array.isArray(value)) {
    for (const entry of value) {
      collectStrings(entry, found);
    }
    return;
  }
  if (typeof value === 'object' && value !== null) {
    for (const entry of Object.values(value)) {
      collectStrings(entry, found);
    }
  }
}

function walkForSecretKeys(value: unknown, found: Set<string>): void {
  if (Array.isArray(value)) {
    for (const entry of value) {
      walkForSecretKeys(entry, found);
    }
    return;
  }
  if (typeof value !== 'object' || value === null) {
    return;
  }
  for (const [key, entry] of Object.entries(value)) {
    if (keyLooksSensitive(key)) {
      collectStrings(entry, found);
      continue;
    }
    walkForSecretKeys(entry, found);
  }
}
