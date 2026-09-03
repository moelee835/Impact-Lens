// The provider preset manifest.
//
// This is the type side of the field contract agreed between the protocol lane (W1-A) and this lane
// in docs/work/task-m1-preset-manifest-contract.md. That document is the rationale; this file is the
// decision. Where the two differ, docs/work/task-m1-preset-catalog.md section 4 lists the difference
// and why it was made.
//
// Two properties of this vocabulary are load-bearing and should survive future edits:
//
// 1. A manifest is data, not a program. There is no expression language, no conditional, no string
//    template. The only dynamic values are the two `$ref` nodes below, both of which resolve to a
//    single path this CLI already computes. Anything that cannot be said with those is said in code
//    and written down as a known limitation.
// 2. A preset never claims more than it can prove. `verified-external` requires `lastVerified`, and
//    `readiness` is what lets a preset say anything at all about indexing state. Without it the
//    reported indexing status stays `unknown`, because a guess here reads to the user exactly like
//    evidence.

// ---------- plain JSON ----------

export type JsonScalar = string | number | boolean | null;
export type JsonValue = JsonScalar | readonly JsonValue[] | { readonly [key: string]: JsonValue };
export type JsonObject = { readonly [key: string]: JsonValue };

// ---------- manifest values, before `$ref` resolution ----------

export type ManifestValue =
  | JsonScalar
  | ManifestRef
  | readonly ManifestValue[]
  | { readonly [key: string]: ManifestValue };

export type ManifestObject = { readonly [key: string]: ManifestValue };

/**
 * The complete set of references a manifest may resolve. It is deliberately two entries long.
 *
 * `workspaceRoot`, `detectedLanguageId`, `discoveredExecutablePath` and a path-`join` node were all
 * considered and left out: no preset in this catalog consumes them, and a declared value nothing
 * produces is the same drift `cli/src/errors.ts` exists to prevent. They get added by the change that
 * first needs them.
 */
export const MANIFEST_REF_SOURCES = ['nodeExecutable', 'bundledModuleEntry'] as const;
export type ManifestRefSource = (typeof MANIFEST_REF_SOURCES)[number];

export interface ManifestRef {
  readonly $ref: ManifestRefSource;
  /** Required by `bundledModuleEntry` and rejected on the other source. */
  readonly module?: string;
}

/**
 * Both refs are catalog-only. `bundledModuleEntry` resolves a specifier inside the CLI package's own
 * dependency tree, so honouring it in user-supplied input would turn an override into an install-path
 * disclosure. The catalog ships inside the tarball and is trusted; overrides are not.
 */
export const CATALOG_ONLY_REF_SOURCES: readonly ManifestRefSource[] = MANIFEST_REF_SOURCES;

export function isManifestRef(value: unknown): value is ManifestRef {
  return typeof value === 'object'
    && value !== null
    && !Array.isArray(value)
    && typeof (value as { $ref?: unknown }).$ref === 'string';
}

// ---------- settings delivery ----------

export const SETTINGS_DELIVERIES = ['on-request', 'did-change-configuration'] as const;
export type SettingsDelivery = (typeof SETTINGS_DELIVERIES)[number];

export const DEFAULT_SETTINGS_DELIVERY: readonly SettingsDelivery[] = ['on-request'];

// ---------- readiness ----------

export const READINESS_SIGNAL_KINDS = ['work-done-progress', 'notification', 'capability-registered'] as const;
export type ReadinessSignalKind = (typeof READINESS_SIGNAL_KINDS)[number];

/** Only a `ready` signal can produce evidence; `working` never promotes to ready on its own. */
export type ReadinessMeaning = 'ready' | 'working';

export interface ReadinessMatch {
  readonly path: readonly string[];
  readonly equals: JsonScalar;
}

export type ReadinessSignal =
  | {
      readonly kind: 'work-done-progress';
      readonly means: ReadinessMeaning;
      /** Substring match on WorkDoneProgressBegin.title. Absent means every token qualifies. */
      readonly titlePattern?: string;
    }
  | {
      readonly kind: 'notification';
      readonly means: ReadinessMeaning;
      readonly method: string;
      readonly match?: ReadinessMatch;
    }
  | {
      readonly kind: 'capability-registered';
      readonly means: ReadinessMeaning;
      readonly method: string;
    };

export interface ProviderReadinessProfile {
  /** Existence is read, nothing else. No generate, build, configure or sync. Workspace-relative. */
  readonly requiredProjectFiles?: readonly string[];
  readonly signals: readonly ReadinessSignal[];
  /** A ceiling, never the criterion. Time passing is not evidence of readiness. */
  readonly budgetMs: number;
  readonly onBudgetExceeded: 'proceed-partial' | 'fail';
}

// ---------- version probe ----------

/**
 * Dotted numeric bounds rather than a range expression.
 *
 * A range string (`">=1.2 <2"`) is a grammar, and the manifest contract already rejected embedding an
 * expression language for initializationOptions. Admitting one here would reopen the same door from
 * the side. Comparing dotted numbers needs no parser and has one obvious meaning.
 */
export interface ProviderVersionRange {
  /** Inclusive. */
  readonly minimum: string;
  /** Inclusive. Absent means no upper bound. */
  readonly maximum?: string;
}

export interface ProviderVersionProbe {
  readonly args: readonly string[];
  readonly timeoutMs: number;
  readonly maxOutputBytes: number;
  readonly supported: ProviderVersionRange;
}

// ---------- executable ----------

export interface ProviderCommandTemplate {
  /**
   * Tried in order. A string is looked up on PATH without a shell; a ref resolves to an absolute path.
   */
  readonly candidates: readonly (string | ManifestRef)[];
  readonly args: readonly ManifestValue[];
  /** `detected` uses the languageId derived from the file extension; any other string pins it. */
  readonly languageIdFrom: 'detected' | (string & {});
}

// ---------- doctor fixture ----------

/**
 * A preset carries its own Call Hierarchy fixture.
 *
 * The Wave 1 exit gate requires doctor to distinguish a fixture failure from a missing capability, and
 * promoting a preset to `verified-external` is defined as passing a real fixture. Keeping the fixture
 * next to the preset means adding a language is a catalog change rather than a new branch in doctor
 * keyed on preset id.
 */
export interface ProviderFixtureFile {
  /** Workspace-relative, forward slashes, no `..` segment. */
  readonly path: string;
  readonly content: string;
}

export interface ProviderFixture {
  readonly files: readonly ProviderFixtureFile[];
  /** 1-based, matching the CLI request vocabulary. */
  readonly target: { readonly file: string; readonly line: number; readonly column: number };
  /** The caller name the fixture must report. Its absence is what `provider_fixture_failed` means. */
  readonly expectedCaller: string;
}

// ---------- preset ----------

export const PROVIDER_TIERS = ['bundled', 'verified-external', 'custom', 'unsupported'] as const;
export type ProviderTier = (typeof PROVIDER_TIERS)[number];

/**
 * A language id that intentionally makes no language claim beyond "C or C++" - the extension is real
 * and recognized, but which of the two it is cannot be told from the extension alone. `.h` is the only
 * case today: it is a valid header for both C and C++, and this repository's own compile-database
 * probe (M2 clangd lane stage 2, `docs/work/task-m2-clangd-preset.md`) found clangd itself resolves
 * that ambiguity per translation unit, silently, with no signal to the client about which one it
 * picked - so this CLI cannot resolve it either by guessing.
 *
 * Treated the same as `plaintext` wherever `resolve.ts` already asks "did we actually confirm a
 * language, or just guess" - `languageMatch` and `presetLanguageId()`'s wire-value fallback - because a
 * guessed `'c'` or `'cpp'` would let `languageMatch` report a confirmed match it never earned, the same
 * failure mode `languageMatch: 'unknown'` already exists to prevent for unrecognized extensions.
 *
 * Deliberately NOT treated like `plaintext` in `resolve.ts`'s `assertPresetSpeaksLanguage()`:
 * `plaintext` asserts nothing, so any explicitly-named preset is allowed to claim it, but `.h` does
 * assert something (a C-family header) - a preset for an unrelated language must still be rejected. A
 * preset that wants to serve `.h` files must list this value in its own `languageIds`, the same way it
 * lists `'c'`/`'cpp'` - see the clangd preset in `catalog.ts`.
 *
 * Lives here, not in `resolve.ts` where the rest of this logic runs: `catalog.ts` needs this value in
 * the clangd preset's own `languageIds`, and `resolve.ts` already imports `PROVIDER_CATALOG` from
 * `catalog.ts`, so `catalog.ts` importing this from `resolve.ts` would be a circular edge.
 * `preset.ts` has no imports of its own and both `resolve.ts` and `catalog.ts` already depend on it.
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

export interface ProviderPreset {
  /** Stable identifier. A request's `providerPreset` and `doctor <preset>` name this. */
  readonly id: string;
  readonly displayName: string;
  readonly tier: ProviderTier;

  readonly languageIds: readonly string[];
  readonly extensions: readonly string[];

  readonly command: ProviderCommandTemplate;
  readonly version?: ProviderVersionProbe;

  /** Sent on initialize. Absent means `{}`, which is what the bundled path sends today. */
  readonly initializationOptions?: ManifestObject;

  /** Answers workspace/configuration and feeds didChangeConfiguration. Absent means an empty tree. */
  readonly settings?: ManifestObject;

  /** Defaults to `['on-request']`. An empty effective tree pushes nothing regardless. */
  readonly settingsDelivery?: readonly SettingsDelivery[];

  /**
   * Dot paths, relative to each tree's root, whose string values enter the session redaction table.
   * The key-name heuristic runs alongside this and is not replaced by it.
   */
  readonly sensitive?: {
    readonly initializationOptions?: readonly string[];
    readonly settings?: readonly string[];
  };

  /** Absent means this preset claims nothing about indexing and the reported status stays `unknown`. */
  readonly readiness?: ProviderReadinessProfile;

  readonly fixture?: ProviderFixture;

  /** Shown to the user when the executable is missing. Nothing here is ever executed. */
  readonly docs?: {
    readonly install: string;
    readonly limitations?: readonly string[];
  };

  /** Evidence for a `verified-external` tier. Required when the tier is `verified-external`. */
  readonly lastVerified?: {
    readonly date: string;
    readonly versions: readonly string[];
  };
}

// ---------- overrides ----------

/**
 * What a project configuration file or a request may say. Plain JSON only: no `$ref`.
 *
 * The field names match the request vocabulary fixed by lead decision L6 (`providerPreset` becomes
 * `presetId` here because the object is already about the provider).
 */
export interface ProviderOverride {
  readonly presetId?: string;
  readonly command?: string;
  readonly args?: readonly string[];
  readonly languageId?: string;
  readonly initializationOptions?: JsonObject;
  readonly settings?: JsonObject;
}
