// The vocabulary below is the response contract, not an implementation detail. `cli/schemas/response.schema.json`
// ships in the npm tarball, so its enums are already public and cannot be narrowed inside schemaVersion 1.
// These arrays exist at runtime so `cli/src/test/schema.test.ts` can compare them against the schema and fail
// the build when one side gains a value the other does not. A plain TypeScript union would disappear at compile
// time and let the two drift apart unnoticed, which is exactly how the drift this file just fixed appeared.

// The single source of the envelope's schemaVersion. It was two literals in index.ts, which the approved
// schema-version policy lists as a precondition for ever promoting to v2 (task-m1-state-truth-table.md 4.3).
export const SCHEMA_VERSION = 1;

export const PROVIDER_HOSTS = ['lsp', 'vscode'] as const;
export type ProviderHost = (typeof PROVIDER_HOSTS)[number];

export const PROVIDER_SELECTED_BY = ['bundled', 'auto', 'preset', 'project', 'custom', 'vscode'] as const;
export type ProviderSelectedBy = (typeof PROVIDER_SELECTED_BY)[number];

export const PROVIDER_LIFECYCLE_STAGES = [
  'discovery',
  'launch',
  'initialize',
  'indexing',
  'capability',
  'query',
] as const;
export type ProviderLifecycleStage = (typeof PROVIDER_LIFECYCLE_STAGES)[number];

export const PROVIDER_LIFECYCLE_STATUSES = ['working', 'ready', 'failed', 'unknown'] as const;
export type ProviderLifecycleStatus = (typeof PROVIDER_LIFECYCLE_STATUSES)[number];

// `timeout` and `failed` have no producer yet. The approved decision adopts them as v1 projection targets for
// `completion.traversalStatus` instead of deleting them, because deleting a declared value narrows the producer
// contract and that is a v2-only change. See docs/work/task-m1-state-truth-table.md section 4.1.
export const TRAVERSAL_STATUSES = ['complete', 'depth-limited', 'node-limited', 'timeout', 'failed'] as const;
export type TraversalStatus = (typeof TRAVERSAL_STATUSES)[number];

export const SEMANTIC_STATUSES = ['static-only', 'augmented'] as const;
export type SemanticStatus = (typeof SEMANTIC_STATUSES)[number];

export const INDEXING_STATUSES = ['ready', 'working', 'unknown'] as const;
export type IndexingStatus = (typeof INDEXING_STATUSES)[number];

// ---------------------------------------------------------------------------
// data.completion — the single source of result state (schemaVersion 1, additive)
//
// The approved decision (docs/work/task-m1-state-truth-table.md section 4) makes `completion` the value the
// CLI actually decides, and `complete`, `truncated`, `traversalLimits` and `coverage.*` projections of it.
// The unions below are shaped so that the contradictions listed as X5, X6, X8 and X9 in section 3 of that
// document cannot be written down, not merely so that they are documented as forbidden.
//
// `stage` is deliberately absent. A successful envelope already carries the last lifecycle stage in
// `data.provider.lifecycle.stage`, and a failed envelope carries it in `error.details.stage`; storing it a
// second time inside `completion` would create exactly one more pair of fields that can disagree. See
// docs/work/task-m1-completeness-emit.md decision D2.
// ---------------------------------------------------------------------------

export const REQUEST_STATUSES = ['succeeded', 'partial', 'failed'] as const;
export type RequestStatus = (typeof REQUEST_STATUSES)[number];

export const COMPLETION_TRAVERSAL_STATUSES = [
  'exhausted',
  'depth-limited',
  'node-limited',
  'timeout',
  'cancelled',
  'unknown',
  'failed',
  'not-started',
] as const;
export type CompletionTraversalStatus = (typeof COMPLETION_TRAVERSAL_STATUSES)[number];

/** Traversal outcomes that leave a usable but bounded graph behind. */
export type BoundedTraversalStatus = Exclude<CompletionTraversalStatus, 'exhausted' | 'not-started'>;

/** Traversal outcomes that leave no usable graph. */
export type UnusableTraversalStatus = 'not-started' | 'failed' | 'timeout' | 'cancelled';

export const SEMANTIC_SCOPES = [
  'provider-static',
  'static-plus-inference',
  'static-plus-observation',
  'none',
] as const;
export type SemanticScope = (typeof SEMANTIC_SCOPES)[number];

/** `none` says "there is no graph to describe", so it can only appear on a failed envelope (X8). */
export type GraphSemanticScope = Exclude<SemanticScope, 'none'>;

export const TRAVERSAL_LIMITS = ['depth', 'nodes'] as const;
export type TraversalLimit = (typeof TRAVERSAL_LIMITS)[number];

/**
 * Why Impact Lens is allowed to say the provider's index was ready (X3).
 *
 * `ready` without evidence is the single most dangerous value in this contract: it turns "we found nothing"
 * into "nothing exists". Making the evidence a required sibling means an unproven `ready` does not compile.
 *
 * There is deliberately no timestamp here. Wall-clock values in the response would defeat the byte-for-byte
 * response comparison this repository uses to prove that a refactor changed nothing.
 */
export interface IndexingReadinessEvidence {
  readonly signal: string;
  readonly detail?: string;
}

export type IndexingCoverage =
  | { readonly status: 'ready'; readonly evidence: IndexingReadinessEvidence }
  | { readonly status: 'working' | 'unknown' };

/** Indexing states compatible with a finished traversal. `working` means the graph cannot be exhausted. */
export type SettledIndexingCoverage =
  | { readonly status: 'ready'; readonly evidence: IndexingReadinessEvidence }
  | { readonly status: 'unknown' };

export interface SucceededCompletion {
  readonly requestStatus: 'succeeded';
  readonly traversalStatus: 'exhausted';
  readonly semanticScope: GraphSemanticScope;
  readonly indexingStatus: SettledIndexingCoverage['status'];
}

export interface PartialCompletion {
  readonly requestStatus: 'partial';
  readonly traversalStatus: BoundedTraversalStatus;
  readonly semanticScope: GraphSemanticScope;
  readonly indexingStatus: IndexingStatus;
}

export interface FailedCompletion {
  readonly requestStatus: 'failed';
  readonly traversalStatus: UnusableTraversalStatus;
  readonly semanticScope: 'none';
  readonly indexingStatus: IndexingStatus;
}

/** What an `ok: true` envelope can carry. `FailedCompletion` is absent on purpose (X6). */
export type GraphCompletion = SucceededCompletion | PartialCompletion;

export type Completion = GraphCompletion | FailedCompletion;

export const LIMITATION_SEVERITIES = ['info', 'warning', 'error'] as const;
export type LimitationSeverity = (typeof LIMITATION_SEVERITIES)[number];

export const LIMITATION_SCOPES = ['traversal', 'semantic', 'indexing', 'provider', 'request'] as const;
export type LimitationScope = (typeof LIMITATION_SCOPES)[number];

/**
 * The structured form of one `limitations` entry. The v1 string array stays a projection of `code`, so a
 * consumer that only knows v1 keeps working while a new consumer gets the severity it needs to decide
 * whether a conclusion may be stated at all.
 */
export interface LimitationDetail {
  readonly code: string;
  readonly severity: LimitationSeverity;
  readonly scope: LimitationScope;
  readonly message: string;
  readonly action?: string;
}

export interface Position {
  readonly line: number;
  readonly column: number;
}

export interface SourceRange {
  readonly start: Position;
  readonly end: Position;
}

export interface LspPosition {
  readonly line: number;
  readonly character: number;
}

export interface LspRange {
  readonly start: LspPosition;
  readonly end: LspPosition;
}

export interface CallHierarchyItem {
  readonly name: string;
  readonly kind: number;
  readonly detail?: string;
  readonly uri: string;
  readonly range: LspRange;
  readonly selectionRange: LspRange;
  readonly data?: unknown;
}

export interface IncomingCall {
  readonly from: CallHierarchyItem;
  readonly fromRanges: readonly LspRange[];
}

export interface ProviderCapabilities {
  readonly host: ProviderHost;
  readonly name: string;
  readonly version?: string;
  readonly requestedLanguageId: string;
  readonly detectedLanguageId: string;
  readonly selectedBy: ProviderSelectedBy;
  readonly languageMatch: boolean | 'unknown';
  readonly callHierarchy: boolean;
  readonly diagnostics: boolean;
  readonly advertised: {
    readonly callHierarchy: boolean;
    readonly diagnostics: boolean | 'unknown';
  };
  readonly observed: {
    readonly prepareCallHierarchy: boolean;
    readonly incomingCalls: boolean;
    readonly diagnostics: boolean;
  };
  readonly lifecycle: ProviderLifecycle;
}

export interface ProviderLifecycle {
  readonly stage: ProviderLifecycleStage;
  readonly status: ProviderLifecycleStatus;
}

export interface Coverage {
  readonly traversal: {
    readonly status: TraversalStatus;
    readonly requestedDepth: number;
    readonly reachedDepth: number;
    readonly maxNodes: number;
  };
  readonly semantic: {
    readonly status: SemanticStatus;
    readonly evidenceSources: readonly string[];
  };
  readonly indexing: IndexingCoverage;
  readonly reasons: readonly string[];
}

export interface ProviderDiagnostic {
  readonly uri: string;
  readonly range: LspRange;
  readonly severity: 'error' | 'warning';
  readonly message: string;
}

export interface CallHierarchyProvider {
  readonly capabilities: ProviderCapabilities;
  prepare(file: string, position: LspPosition): Promise<readonly CallHierarchyItem[]>;
  incoming(item: CallHierarchyItem): Promise<readonly IncomingCall[]>;
  collectDiagnostics(uris: readonly string[]): Promise<readonly ProviderDiagnostic[]>;
  dispose(): Promise<void>;
  /**
   * What the session observed that the traversal cannot see, such as the state of the index.
   *
   * Optional so that a provider which observes nothing needs no change and keeps today's conservative
   * defaults. An implementation must not answer a state it has no evidence for: omitting the method
   * and returning `{ status: 'unknown' }` mean the same thing, and both are correct for a provider
   * that never asked the question.
   */
  analysisObservations?(): AnalysisObservations;
}

export type ImpactRelation = 'root' | 'direct' | 'transitive' | 'test';
// Request-side vocabularies are runtime arrays for the same reason the response ones above are: only a
// value that exists at runtime can be compared against `cli/schemas/request.schema.json`. Until this
// change nothing read the request schema at all, so the published request contract and the parser could
// drift with no test failing. `cli/src/test/requestSchema.test.ts` closes that.
export const SOURCE_MODES = ['none', 'declaration', 'body'] as const;
export type SourceMode = (typeof SOURCE_MODES)[number];

/** Plain JSON, which is all a provider configuration override may contain (decision D8). */
export type JsonValue = string | number | boolean | null | readonly JsonValue[] | JsonObject;
export interface JsonObject {
  readonly [key: string]: JsonValue;
}

export interface AnalyzeRequest {
  readonly workspace: string;
  readonly file: string;
  readonly line: number;
  readonly column: number;
  readonly depth?: number;
  readonly maxNodes?: number;
  readonly includeSource?: SourceMode;
  readonly timeoutMs?: number;
  readonly expectedSymbol?: ExpectedSymbol;
  readonly provider?: ProviderCommand;
  // ---------------------------------------------------------------------------
  // Request-level provider overrides (schemaVersion 1, additive, all optional).
  //
  // The names are fixed by decision D9 of docs/work/task-m1-preset-manifest-contract.md and the split of
  // this work into its own lane is lead decision L6. Merge order is `preset < project < request`: these
  // values win over both the preset catalog default and the project configuration file. The merge itself
  // is implemented in `cli/src/providers` (lane W1-B), not here - this contract only decides what a
  // request may say and what shape it has to be in when it says it.
  //
  // `initializationOptions` and `settings` are two different transports and neither is derived from the
  // other (D5). A server that reads the same logical setting from both has to be given both.
  // ---------------------------------------------------------------------------
  /** Preset id from the catalog. Validated for shape only; existence is checked by the preset lane (R5). */
  readonly providerPreset?: string;
  /** Merged into the `initialize` request's `initializationOptions`. */
  readonly initializationOptions?: JsonObject;
  /** Merged into the workspace settings tree answered to `workspace/configuration` (D3). */
  readonly settings?: JsonObject;
}

/**
 * Something that stopped the traversal before it ran out of incoming edges.
 *
 * These are observations, not statuses. A caller reports what happened; `cli/src/coverage.ts` decides what
 * that means for `completion.traversalStatus`. Handing the status in directly would let a caller pair
 * `exhausted` with a timeout.
 *
 * Nothing produces these values yet: sending `$/cancelRequest` and giving the whole analysis a budget is
 * `IL-LIM-005` step 1 (lane W1-A). This lane opens the path so those lanes only have to report the event.
 */
export type TraversalInterruption = 'timeout' | 'cancelled' | 'provider-failed';

export interface SemanticObservation {
  readonly scope: GraphSemanticScope;
  readonly evidenceSources: readonly string[];
}

/**
 * Facts about the run that the traversal itself cannot see. Every field is optional and every default is the
 * conservative one, which is what the only production caller passes today.
 */
export interface AnalysisObservations {
  readonly interruption?: TraversalInterruption;
  readonly indexing?: IndexingCoverage;
  readonly semantic?: SemanticObservation;
  /**
   * Whether the session's `callHierarchy/incomingCalls` query returned JSON-RPC `null` at least once,
   * as opposed to `[]`.
   *
   * This is a fact about the wire response, not an interpretation of it: the LSP spec gives this method
   * no single meaning for `null`, so this field never claims the provider meant "cannot answer" versus
   * "answered zero" (docs/work/task-m2-python-investigation.md, docs/work/task-m2-python-preset.md
   * stage 3). It exists so a `0`-caller result whose only evidence was `null` can be told apart from one
   * whose provider affirmatively returned `[]` - the former is not evidence that no caller exists (a
   * FastAPI-style `Depends()` reference is the motivating case), the latter is the strongest static
   * evidence this CLI can produce.
   */
  readonly nullIncomingCallsObserved?: boolean;
}

export interface ProviderCommand {
  readonly command: string;
  readonly args?: readonly string[];
  readonly languageId?: string;
}

export interface ExpectedSymbol {
  readonly name?: string;
  readonly kind?: string | number;
  readonly detail?: string;
}

export interface SymbolTarget {
  readonly file: string;
  readonly position: Position;
  readonly expectedSymbol?: ExpectedSymbol;
}

export const NOTE_SCOPES = ['shared', 'source', 'local'] as const;
export type NoteScope = (typeof NOTE_SCOPES)[number];

export interface NoteGetRequest {
  readonly workspace: string;
  readonly target: SymbolTarget;
  readonly provider?: ProviderCommand;
  readonly timeoutMs?: number;
}

export interface NoteListRequest {
  readonly workspace: string;
  readonly scope?: NoteScope;
}

export interface NoteMutationRequest extends NoteGetRequest {
  readonly scope: NoteScope;
  readonly text?: string;
  readonly apply?: boolean;
  readonly expectedToken?: string;
}

export interface StoredNoteIdentity {
  readonly workspace: string;
  readonly file: string;
  readonly symbol: string;
  readonly kind: number;
  readonly detail: string;
  readonly line: number;
  readonly character: number;
}

export interface StoredNote extends StoredNoteIdentity {
  readonly text: string;
  readonly updatedAt: string;
  readonly [key: string]: unknown;
}

export interface NoteLayers {
  readonly local?: string;
  readonly shared?: string;
  readonly sourceComment?: string;
}

export interface ResolvedNote {
  readonly effective: string | null;
  readonly effectiveSource: NoteScope | null;
  readonly layers: {
    readonly local: string | null;
    readonly shared: string | null;
    readonly sourceComment: string | null;
    readonly personal: {
      readonly available: false;
      readonly reason: 'vscode_workspace_state_unavailable';
    };
  };
}

// `CliError` lives in ./errors together with the code union. It is re-exported here because every existing
// import reaches for './types', including files this change is not allowed to touch.
export { CLI_ERROR_CODES, CliError, isCliErrorCode } from './errors';
export type { CliErrorCode, CliErrorShape } from './errors';
