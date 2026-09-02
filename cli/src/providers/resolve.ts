import * as path from 'node:path';
import { bundledModuleEntryPath, bundledProviderLogArgs } from '../runtime';
import { CliError, ProviderCapabilities, ProviderCommand } from '../types';
import {
  bundledLanguageIds,
  findPreset,
  PROVIDER_CATALOG,
  presetIds,
  presetsForLanguage,
} from './catalog';
import { ExecutableLookupOptions, findExecutable } from './discovery';
import {
  MANIFEST_LIMITS,
  ManifestRefContext,
  collectSensitiveStrings,
  mergeJsonObjects,
  providerConfigInvalid,
  resolveManifestObject,
  resolveManifestStrings,
} from './manifest';
import {
  DEFAULT_SETTINGS_DELIVERY,
  JsonObject,
  JsonValue,
  ProviderPreset,
  ProviderReadinessProfile,
  ProviderTier,
  SettingsDelivery,
} from './preset';
import { ProjectProviderChoice, readProjectProviderChoice } from './projectConfig';

/**
 * Everything provider selection decides before a process is spawned.
 *
 * Selection is deliberately separate from the LSP session in `lspProvider.ts`: the session owns the
 * protocol, this module owns which executable answers for which language. Nothing here launches a
 * process. It may read a configuration file, but only when a workspace is supplied.
 */
export interface ResolvedProvider {
  /** The command the session will spawn. */
  readonly command: ProviderCommand;
  readonly selectedBy: ProviderCapabilities['selectedBy'];
  /** The languageId handed to the provider, which is what `textDocument/didOpen` announces. */
  readonly requestedLanguageId: string;
  /** The languageId derived from the file extension alone. */
  readonly detectedLanguageId: string;
  readonly languageMatch: ProviderCapabilities['languageMatch'];
}

/**
 * The selection result plus everything the session needs to talk to the chosen provider.
 *
 * This is the single seam between this lane and the protocol lane. Nothing here contains a `$ref` or
 * a `ProviderPreset`; references are resolved and tiers merged before the value crosses over, so the
 * protocol layer never learns the manifest vocabulary.
 */
export interface ResolvedProviderSession extends ResolvedProvider {
  /** Absent on the raw custom command path, which has no preset. */
  readonly presetId?: string;
  readonly tier: ProviderTier;
  /** Sent on initialize. Empty object when nothing configured it, matching today's frame. */
  readonly initializationOptions: JsonObject;
  /** Answers workspace/configuration and, when asked for, didChangeConfiguration. */
  readonly settings: JsonObject;
  readonly settingsDelivery: readonly SettingsDelivery[];
  /** Absent means this provider claims nothing about indexing state. */
  readonly readiness?: ProviderReadinessProfile;
  /** Literal strings that must be substituted out of provider stderr and logs for this session. */
  readonly redactionValues: readonly string[];
}

export interface ProviderResolutionOptions {
  /**
   * Enables the trusted project tier. Omitted means the project file is not consulted at all.
   *
   * There is deliberately no `process.cwd()` fallback. The analyze path knows its workspace but the
   * call into this module does not carry it yet, and defaulting to the current directory would let a
   * `.impact-lens/provider.json` in an unrelated directory choose the provider for a different
   * project. Quietly answering with the wrong provider is the one failure mode this tool cannot have.
   */
  readonly workspace?: string;
  /** An explicitly named preset. Same value as the request field `providerPreset`. */
  readonly providerPreset?: string;
  /** Request-level value overrides. Plain JSON; `$ref` is refused here. */
  readonly override?: {
    readonly initializationOptions?: JsonObject;
    readonly settings?: JsonObject;
  };
  readonly catalog?: readonly ProviderPreset[];
  readonly env?: NodeJS.ProcessEnv;
  readonly lookup?: ExecutableLookupOptions;
  readonly refs?: ManifestRefContext;
}

/** The advanced surface for naming a preset until the request schema gains `providerPreset`. */
export const PRESET_ENV_VARIABLE = 'IMPACT_LENS_PROVIDER_PRESET';

/**
 * Chooses the provider for `file`.
 *
 * The order is fixed by IL-LIM-004 and is the reason this function exists:
 *
 *   raw custom > explicit preset > trusted project choice > verified auto-discovery > unsupported
 *
 * The last step never falls back to another language's provider. A TypeScript server pointed at
 * Python returns an empty Call Hierarchy that reads exactly like "nothing calls this", which is the
 * one answer this tool must never fabricate. That rule is enforced twice here: auto-discovery only
 * considers presets that claim the detected language, and a preset reached through any other tier is
 * checked against the detected language before its command is built.
 */
export function resolveProvider(
  file: string,
  command: ProviderCommand | undefined,
  options: ProviderResolutionOptions = {},
): ResolvedProviderSession {
  const detectedLanguageId = languageId(file);
  const catalog = options.catalog ?? PROVIDER_CATALOG;
  const env = options.env ?? process.env;
  const projectChoice = options.workspace === undefined
    ? undefined
    : readProjectProviderChoice(options.workspace);

  const choice = chooseProvider(detectedLanguageId, command, projectChoice, catalog, options, env);
  const actual = choice.kind === 'raw'
    ? choice.command
    : presetCommand(choice.preset, detectedLanguageId, choice.languageIdOverride, options, env);
  const preset = choice.kind === 'preset' ? choice.preset : undefined;

  const requestedLanguageIdBeforeWireGuard = actual.languageId ?? detectedLanguageId;
  // AMBIGUOUS_LANGUAGE_ID is an internal-only marker this CLI invented (see `languageId()` below) - no
  // LSP server understands it. `requestedLanguageId` is not just a report field: it becomes
  // `LspCallHierarchyProvider`'s `languageIdOverride` and is sent verbatim as `textDocument/didOpen`'s
  // `languageId` (`cli/src/lspProvider.ts`). A custom provider could pick a parser by that field or
  // reject an unrecognized value outright, so this string must never reach the wire. Substitute the
  // standard 'plaintext' - the same honest "unknown" value this code sent before AMBIGUOUS_LANGUAGE_ID
  // existed - whenever it would otherwise leak.
  //
  // In practice this only fires on the raw custom command path with no explicit `languageId` - the
  // preset path cannot reach it: `assertPresetSpeaksLanguage()` already requires a named preset's
  // `languageIds` to literally include AMBIGUOUS_LANGUAGE_ID before it is chosen at all, and
  // auto-discovery's `presetsForLanguage()` filter does the same, so `presetLanguageId()` never sees an
  // empty `languageIds` array for this value - it always resolves to a real declared language first.
  // The guard still lives here, not only in the raw path, so "never leaks" is one invariant checked in
  // one place rather than distributed across every current and future caller of `resolveProvider()`
  // (found via commander review, M2 clangd lane stage 2 addendum - confirmed by directly capturing a
  // real `didOpen` frame sent to a fake LSP server before this fix, which carried
  // `"languageId":"c-cpp-header"`).
  const requestedLanguageId = requestedLanguageIdBeforeWireGuard === AMBIGUOUS_LANGUAGE_ID
    ? 'plaintext'
    : requestedLanguageIdBeforeWireGuard;
  // An unrecognized extension carries no claim about the language, so a configured provider is not
  // contradicted by it. That is 'unknown', not a mismatch. A recognized-but-ambiguous extension
  // (AMBIGUOUS_LANGUAGE_ID, currently only `.h`) gets the same 'unknown' treatment for the same reason:
  // whichever concrete language the provider ends up using is a guess this CLI made, not a confirmed
  // fact, so it must not be reported as a match either.
  const languageMatch = detectedLanguageId === 'plaintext' || detectedLanguageId === AMBIGUOUS_LANGUAGE_ID
    ? 'unknown'
    : requestedLanguageId === detectedLanguageId;
  if (languageMatch === false) {
    throw new CliError(
      'provider_language_mismatch',
      `Configured provider languageId ${requestedLanguageId} does not match detected language ${detectedLanguageId}.`,
      5,
      false,
      {
        stage: 'discovery',
        requestedLanguageId,
        detectedLanguageId,
        selectedBy: choice.selectedBy,
      },
    );
  }

  const session = resolveSessionValues(preset, projectChoice, options);
  return {
    command: actual,
    selectedBy: choice.selectedBy,
    requestedLanguageId,
    detectedLanguageId,
    languageMatch,
    ...(preset === undefined ? {} : { presetId: preset.id }),
    tier: preset?.tier ?? 'custom',
    ...session,
  };
}

type ProviderChoice =
  | {
      readonly kind: 'raw';
      readonly selectedBy: ProviderCapabilities['selectedBy'];
      readonly command: ProviderCommand;
    }
  | {
      readonly kind: 'preset';
      readonly selectedBy: ProviderCapabilities['selectedBy'];
      readonly preset: ProviderPreset;
      readonly languageIdOverride?: string;
    };

function chooseProvider(
  detectedLanguageId: string,
  command: ProviderCommand | undefined,
  projectChoice: ProjectProviderChoice | undefined,
  catalog: readonly ProviderPreset[],
  options: ProviderResolutionOptions,
  env: NodeJS.ProcessEnv,
): ProviderChoice {
  // 1. A raw custom command wins outright. The caller has taken responsibility for it.
  if (command) {
    return { kind: 'raw', selectedBy: 'custom', command };
  }

  // 2. An explicitly named preset.
  const explicitId = options.providerPreset ?? env[PRESET_ENV_VARIABLE];
  if (explicitId !== undefined && explicitId.length > 0) {
    const preset = requirePreset(catalog, explicitId, 'providerPreset');
    assertPresetSpeaksLanguage(preset, detectedLanguageId, 'preset');
    return { kind: 'preset', selectedBy: 'preset', preset, languageIdOverride: projectChoice?.languageId };
  }

  // 3. The trusted project choice.
  if (projectChoice?.command !== undefined) {
    return {
      kind: 'raw',
      selectedBy: 'project',
      command: {
        command: projectChoice.command,
        args: projectChoice.args,
        languageId: projectChoice.languageId,
      },
    };
  }
  if (projectChoice?.presetId !== undefined) {
    const preset = requirePreset(catalog, projectChoice.presetId, projectChoice.source);
    assertPresetSpeaksLanguage(preset, detectedLanguageId, 'project');
    return { kind: 'preset', selectedBy: 'project', preset, languageIdOverride: projectChoice.languageId };
  }

  // 4. Verified auto-discovery, and 5. unsupported when it finds nothing.
  const preset = autoDiscover(detectedLanguageId, catalog, options);
  return {
    kind: 'preset',
    selectedBy: preset.tier === 'bundled' ? 'bundled' : 'auto',
    preset,
    languageIdOverride: projectChoice?.languageId,
  };
}

/**
 * Picks the one preset that serves this language, or explains why there is none.
 *
 * A bundled preset wins over an external one because it ships inside this tarball and is exercised by
 * the release test on every supported OS. Beyond that, ambiguity is reported rather than broken by
 * catalog order: two verified servers for one language can produce different answers, and silently
 * preferring whichever was listed first would make the result depend on an implementation detail no
 * user can see.
 */
function autoDiscover(
  detectedLanguageId: string,
  catalog: readonly ProviderPreset[],
  options: ProviderResolutionOptions,
): ProviderPreset {
  const matching = presetsForLanguage(catalog, detectedLanguageId);
  if (matching.length === 0) {
    throw new CliError(
      'provider_required_for_language',
      `No bundled provider supports ${detectedLanguageId}; configure a Language Server provider for this language.`,
      5,
      false,
      {
        stage: 'discovery',
        detectedLanguageId,
        bundledLanguageIds: bundledLanguageIds(catalog),
      },
    );
  }
  const bundled = matching.filter(preset => preset.tier === 'bundled');
  if (bundled.length === 1) {
    return bundled[0] as ProviderPreset;
  }
  if (bundled.length > 1) {
    throw ambiguous(detectedLanguageId, bundled);
  }
  const available = matching.filter(preset => discoverExecutable(preset, options) !== undefined);
  if (available.length === 0) {
    throw executableNotFound(matching, detectedLanguageId);
  }
  if (available.length > 1) {
    throw ambiguous(detectedLanguageId, available);
  }
  return available[0] as ProviderPreset;
}

function ambiguous(detectedLanguageId: string, candidates: readonly ProviderPreset[]): CliError {
  return new CliError(
    'provider_selection_ambiguous',
    `More than one verified provider serves ${detectedLanguageId}; name one with providerPreset.`,
    5,
    false,
    {
      stage: 'discovery',
      detectedLanguageId,
      candidatePresetIds: candidates.map(preset => preset.id),
    },
  );
}

function executableNotFound(candidates: readonly ProviderPreset[], detectedLanguageId: string): CliError {
  return new CliError(
    'provider_executable_not_found',
    `No installed Language Server was found for ${detectedLanguageId}.`,
    5,
    false,
    {
      stage: 'discovery',
      detectedLanguageId,
      // Names, never resolved paths: the point is what to install, and a search path is machine
      // layout. Impact Lens never installs any of these itself.
      candidates: candidates.flatMap(preset => preset.command.candidates.filter(isPlainCandidate)),
      install: candidates.flatMap(preset => (preset.docs?.install === undefined ? [] : [preset.docs.install])),
      recovery: 'install_a_language_server_or_configure_a_custom_provider',
    },
  );
}

function isPlainCandidate(candidate: unknown): candidate is string {
  return typeof candidate === 'string';
}

function requirePreset(
  catalog: readonly ProviderPreset[],
  id: string,
  origin: string,
): ProviderPreset {
  const preset = findPreset(catalog, id);
  if (preset !== undefined) {
    return preset;
  }
  // A name that came from a request or a command line is a bad request; a name that came from a
  // configuration file is a bad configuration. Reporting both the same way would send half the users
  // to the wrong file.
  if (origin === 'providerPreset') {
    throw new CliError('invalid_request', `Unknown provider preset: ${id}`, 2, false, {
      stage: 'discovery',
      knownPresetIds: presetIds(catalog),
    });
  }
  throw providerConfigInvalid(`it names the unknown provider preset ${id}.`, {
    origin,
    knownPresetIds: presetIds(catalog),
  });
}

/**
 * Refuses to run a preset against a language it does not claim.
 *
 * Auto-discovery cannot reach this state, but an explicit preset or a project file can: naming the
 * TypeScript preset and handing it a `.py` file would otherwise start tsserver on Python and return
 * an empty graph. The check is skipped for `plaintext` because an unrecognized extension asserts
 * nothing, which is the same rule `languageMatch: 'unknown'` already encodes.
 *
 * Deliberately NOT skipped for AMBIGUOUS_LANGUAGE_ID (`.h`): unlike `plaintext`, it does assert
 * something (a C-family header), so a preset for an unrelated language is still rejected. A preset
 * must list AMBIGUOUS_LANGUAGE_ID in its own `languageIds` to opt into serving ambiguous headers.
 */
function assertPresetSpeaksLanguage(
  preset: ProviderPreset,
  detectedLanguageId: string,
  selectedBy: ProviderCapabilities['selectedBy'],
): void {
  if (detectedLanguageId === 'plaintext' || preset.languageIds.includes(detectedLanguageId)) {
    return;
  }
  throw new CliError(
    'provider_language_mismatch',
    `Preset ${preset.id} does not support ${detectedLanguageId}.`,
    5,
    false,
    {
      stage: 'discovery',
      presetId: preset.id,
      presetLanguageIds: preset.languageIds,
      detectedLanguageId,
      selectedBy,
    },
  );
}

/**
 * The first candidate that exists, or undefined when none does.
 *
 * A reference candidate resolves to a path this CLI computed itself, so there is nothing to search
 * for and nothing to fall through to. When that resolution fails it throws rather than returning
 * undefined, because "the bundled server is missing from this installation" is a different problem
 * from "you have not installed a language server" and gets a different, actionable error.
 */
export function discoverExecutable(
  preset: ProviderPreset,
  options: ProviderResolutionOptions = {},
): string | undefined {
  for (const candidate of preset.command.candidates) {
    if (typeof candidate !== 'string') {
      const [resolved] = resolveManifestStrings([candidate], {
        origin: `preset ${preset.id} command candidate`,
        allowRefs: true,
        refs: refs(options),
      });
      return resolved;
    }
    const found = findExecutable(candidate, options.lookup);
    if (found !== undefined) {
      return found;
    }
  }
  return undefined;
}

function refs(options: ProviderResolutionOptions): ManifestRefContext {
  return options.refs ?? DEFAULT_REFS;
}

/**
 * The only two dynamic values a manifest can name.
 *
 * Both are catalog-only and both resolve inside this package. `bundledModuleEntry` goes through the
 * bundled artifact inspection so that a missing or unreadable server still produces the same
 * reinstall error it produces today.
 */
const DEFAULT_REFS: ManifestRefContext = {
  nodeExecutable: () => process.execPath,
  bundledModuleEntry: module => bundledModuleEntryPath(module),
};

function presetCommand(
  preset: ProviderPreset,
  detectedLanguageId: string,
  languageIdOverride: string | undefined,
  options: ProviderResolutionOptions,
  env: NodeJS.ProcessEnv,
): ProviderCommand {
  const executable = discoverExecutable(preset, options);
  if (executable === undefined) {
    throw executableNotFound([preset], detectedLanguageId);
  }
  const args = resolveManifestStrings(preset.command.args, {
    origin: `preset ${preset.id} command args`,
    allowRefs: true,
    refs: refs(options),
  });
  // The bundled server's opt-in log level is the one thing the manifest vocabulary cannot express,
  // because expressing it needs a conditional and a conditional makes the manifest a program. The
  // condition stays here instead, and it is the documented expressiveness limit of M1 manifests.
  const debugArgs = preset.tier === 'bundled' ? bundledProviderLogArgs(env) : [];
  return {
    command: executable,
    args: [...args, ...debugArgs],
    languageId: languageIdOverride ?? presetLanguageId(preset, detectedLanguageId),
  };
}

function presetLanguageId(preset: ProviderPreset, detectedLanguageId: string): string {
  if (preset.command.languageIdFrom !== 'detected') {
    return preset.command.languageIdFrom;
  }
  // An unrecognized extension tells us nothing, but naming a preset does. An ambiguous-but-recognized
  // extension (AMBIGUOUS_LANGUAGE_ID) tells us "C or C++" but not which - the preset's own language
  // order breaks the tie the same way. Either way, falling back to the preset's primary language is
  // the explicit claim the caller made; `languageMatch` still reports `unknown` so nothing downstream
  // reads it as confirmation.
  return detectedLanguageId === 'plaintext' || detectedLanguageId === AMBIGUOUS_LANGUAGE_ID
    ? (preset.languageIds[0] ?? detectedLanguageId)
    : detectedLanguageId;
}

export interface SessionValues {
  readonly initializationOptions: JsonObject;
  readonly settings: JsonObject;
  readonly settingsDelivery: readonly SettingsDelivery[];
  readonly readiness?: ProviderReadinessProfile;
  readonly redactionValues: readonly string[];
}

interface JsonTreeMetrics {
  readonly keys: number;
  readonly serializedBytes: number;
}

interface SessionValueSources {
  readonly preset: JsonObject | undefined;
  readonly project: JsonObject | undefined;
  readonly request: JsonObject | undefined;
}

function jsonTreeMetrics(tree: JsonObject | undefined): JsonTreeMetrics {
  if (tree === undefined) {
    return { keys: 0, serializedBytes: 0 };
  }
  const countKeys = (value: JsonValue): number => {
    if (Array.isArray(value)) {
      return value.reduce((total, entry) => total + countKeys(entry), 0);
    }
    if (typeof value === 'object' && value !== null) {
      return Object.entries(value).reduce(
        (total, [, entry]) => total + 1 + countKeys(entry),
        0,
      );
    }
    return 0;
  };
  return {
    keys: countKeys(tree),
    serializedBytes: Buffer.byteLength(JSON.stringify(tree), 'utf8'),
  };
}

/**
 * Applies D8 to the tree that is actually sent on the wire.
 *
 * Each source has already passed its own shape, depth, key and byte checks. A deep merge cannot make
 * a branch deeper, but it can combine disjoint keys and bytes from otherwise valid sources. The
 * diagnosis therefore reports numeric source contributions and never the values themselves.
 */
function assertMergedSessionBudget(
  field: 'initializationOptions' | 'settings',
  merged: JsonObject,
  sources: SessionValueSources,
): void {
  const observed = jsonTreeMetrics(merged);
  const violation = observed.keys > MANIFEST_LIMITS.maxKeys
    ? { rule: 'keys', limit: MANIFEST_LIMITS.maxKeys, observed: observed.keys }
    : observed.serializedBytes > MANIFEST_LIMITS.maxSerializedBytes
      ? {
          rule: 'bytes',
          limit: MANIFEST_LIMITS.maxSerializedBytes,
          observed: observed.serializedBytes,
        }
      : undefined;
  if (violation === undefined) {
    return;
  }
  throw providerConfigInvalid(
    `the merged ${field} has ${violation.observed} ${violation.rule}, past the limit of ${violation.limit}. Reduce the preset, project or request values before retrying.`,
    {
      origin: `merged provider ${field}`,
      field,
      ...violation,
      sourceContributions: {
        preset: jsonTreeMetrics(sources.preset),
        project: jsonTreeMetrics(sources.project),
        request: jsonTreeMetrics(sources.request),
      },
    },
  );
}

/**
 * Merges the value tiers and builds the session redaction table.
 *
 * `initializationOptions` and `settings` are merged independently and never derive from each other.
 * They travel different wires with different schemas, and copying one into the other would change a
 * frame the manifest author never touched.
 *
 * Exported because doctor needs the merged trees even when the command cannot be resolved. Folding
 * this into the command path once made a missing executable blank out the settings check, which is
 * the class of bug the whole "keep going after a failure" design exists to avoid.
 */
export function resolveSessionValues(
  preset: ProviderPreset | undefined,
  projectChoice: ProjectProviderChoice | undefined,
  options: ProviderResolutionOptions = {},
): SessionValues {
  const catalogOptions = (field: string) => ({
    origin: `preset ${preset?.id ?? 'custom'} ${field}`,
    allowRefs: true,
    refs: refs(options),
  });
  const presetInitializationOptions = resolveManifestObject(
    preset?.initializationOptions,
    catalogOptions('initializationOptions'),
  );
  const presetSettings = resolveManifestObject(preset?.settings, catalogOptions('settings'));
  const initializationOptions = mergeJsonObjects(
    presetInitializationOptions,
    projectChoice?.initializationOptions,
    options.override?.initializationOptions,
  );
  const settings = mergeJsonObjects(
    presetSettings,
    projectChoice?.settings,
    options.override?.settings,
  );
  assertMergedSessionBudget('initializationOptions', initializationOptions, {
    preset: preset?.initializationOptions === undefined ? undefined : presetInitializationOptions,
    project: projectChoice?.initializationOptions,
    request: options.override?.initializationOptions,
  });
  assertMergedSessionBudget('settings', settings, {
    preset: preset?.settings === undefined ? undefined : presetSettings,
    project: projectChoice?.settings,
    request: options.override?.settings,
  });
  const redactionValues = [
    ...collectSensitiveStrings(initializationOptions, preset?.sensitive?.initializationOptions),
    ...collectSensitiveStrings(settings, preset?.sensitive?.settings),
  ];
  return {
    initializationOptions,
    settings,
    settingsDelivery: preset?.settingsDelivery ?? DEFAULT_SETTINGS_DELIVERY,
    ...(preset?.readiness === undefined ? {} : { readiness: preset.readiness }),
    redactionValues: [...new Set(redactionValues)],
  };
}

/**
 * A language id that intentionally makes no language claim beyond "C or C++" - the extension is real
 * and recognized, but which of the two it is cannot be told from the extension alone. `.h` is the only
 * case today: it is a valid header for both C and C++, and this repository's own compile-database
 * probe (M2 clangd lane stage 2, `docs/work/task-m2-clangd-preset.md`) found clangd itself resolves
 * that ambiguity per translation unit, silently, with no signal to the client about which one it
 * picked - so this CLI cannot resolve it either by guessing.
 *
 * Treated the same as `plaintext` wherever the code already asks "did we actually confirm a language,
 * or just guess" - `languageMatch` below and `presetLanguageId()`'s wire-value fallback - because a
 * guessed `'c'` or `'cpp'` would let `languageMatch` report a confirmed match it never earned, the same
 * failure mode `languageMatch: 'unknown'` already exists to prevent for unrecognized extensions.
 *
 * Deliberately NOT treated like `plaintext` in `assertPresetSpeaksLanguage()`: `plaintext` asserts
 * nothing, so any explicitly-named preset is allowed to claim it, but `.h` does assert something (a
 * C-family header) - a preset for an unrelated language must still be rejected. A preset that wants to
 * serve `.h` files must list this value in its own `languageIds`, the same way it lists `'c'`/`'cpp'`.
 */
export const AMBIGUOUS_LANGUAGE_ID = 'c-cpp-header';

/**
 * `detectedLanguageId` values a compile-database-driven provider (clangd, today the only one) can
 * apply to. Used to gate `impact.ts`'s read-only `compile_commands.json` discovery (M2 clangd lane
 * stage 3, `docs/work/task-m2-clangd-preset.md`) so every other language's response stays untouched -
 * the discovery only runs, and `AnalysisObservations.compileDatabase` only gets set, for a request
 * that resolved to one of these three.
 */
export const C_FAMILY_LANGUAGE_IDS: ReadonlySet<string> = new Set(['c', 'cpp', AMBIGUOUS_LANGUAGE_ID]);

export function languageId(file: string): string {
  switch (path.extname(file).toLowerCase()) {
    case '.ts': return 'typescript';
    case '.mts': return 'typescript';
    case '.cts': return 'typescript';
    case '.tsx': return 'typescriptreact';
    case '.js': return 'javascript';
    case '.jsx': return 'javascriptreact';
    case '.mjs': return 'javascript';
    case '.cjs': return 'javascript';
    case '.py': return 'python';
    case '.go': return 'go';
    case '.c': return 'c';
    case '.cc': return 'cpp';
    case '.cpp': return 'cpp';
    case '.cxx': return 'cpp';
    case '.hh': return 'cpp';
    case '.hpp': return 'cpp';
    case '.hxx': return 'cpp';
    case '.h': return AMBIGUOUS_LANGUAGE_ID;
    case '.swift': return 'swift';
    case '.kt': return 'kotlin';
    case '.kts': return 'kotlin';
    default: return 'plaintext';
  }
}
