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

// ---------------------------------------------------------------------------
// Node-level test classification evidence (IL-LIM-010 stage 1 completion, schemaVersion 1, additive - see
// docs/work/task-m4-il-lim-010-stage1-completion.md).
//
// `relation`'s own meaning does not change: it is still computed the same way and still means the same
// thing (M4 stage 1 / X3's precedent for adding a sibling field instead of overloading an existing one -
// `data.augmentedEdges` next to `data.edges`, `limitationDetails` next to `limitations`). These two types
// are the sibling for "why was this node classified the way it was", carried per node as `testRule` and
// `testRuleSuppressed` (added at the two node-construction call sites, `cli/src/impact.ts` and
// `src/impactAnalyzer.ts` - not here, since this file declares shapes, not node literals).
//
// Deliberately not named `testEvidence`: the story's own "recommended response" section already reserves
// that name for a larger stage-2/3 union (`call-hierarchy` | `path-convention` | `framework-adapter` |
// `coverage-observation`). `TestClassificationRule` is scoped to the `path-convention` case only, so it
// can be absorbed as `TestEvidence.pathConvention` later without a rename of a field consumers already
// read.
// ---------------------------------------------------------------------------

/**
 * Why a node was classified `relation: 'test'`.
 *
 * `id` is either a default-convention rule's stable id (`test-directory` | `dot-suffix` |
 * `underscore-prefix` | `underscore-suffix` | `pascal-suffix`, from `cli/src/shared/testFileClassifier.ts`'s
 * `RULES`) or, when a user include pattern is what matched, the literal pattern string itself - a user's
 * own glob has no other stable identifier, and the pattern text is the most useful thing to show back to
 * them.
 */
export interface TestClassificationRule {
  readonly id: string;
  readonly source: 'default-convention' | 'user-include';
}

/**
 * Why a node that a default rule (or a user include pattern) would otherwise have classified as a test is
 * NOT `relation: 'test'` - a user exclude pattern overrode that match. Mutually exclusive with
 * `TestClassificationRule` on the same node: an exclude match always wins, so a node can carry one or the
 * other but never both (see `testRule`/`testRuleSuppressed` at the node-construction call sites).
 */
export interface SuppressedTestRule {
  /** The default-convention rule id that would have matched, or null if none would have (a pure
   * "extra safety exclude" with nothing to suppress). */
  readonly ruleId: string | null;
  /** The user exclude pattern string that suppressed the match. */
  readonly excludePattern: string;
}

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
  /**
   * Kill switch for M4 framework adapters (`docs/work/task-m4-stage2-fastapi-adapter.md`). Defaults
   * to `false`/absent - IL-LIM-001 and IL-LIM-002's own rollout sections both call for adapters to
   * ship disabled by default ("추론 adapter는 기본 비활성화한다" / "최초에는 설정 opt-in으로
   * 제공한다"), and this milestone's own top risk is false positives damaging trust, so a caller must
   * opt in explicitly rather than discover augmentation by surprise. When `false` or absent, the
   * response is guaranteed identical to a build with no adapters at all (`data.augmentedEdges` is an
   * empty array, `data.coverage.semantic`/`data.completion.semanticScope` stay at their static
   * default).
   */
  readonly augmentationEnabled?: boolean;
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
  /**
   * `compile_commands.json` state for a C/C++ request, read-only-discovered by
   * `providers/compileDatabase.ts` before the provider session runs. Absent for any non-C-family
   * request; a C-family request always carries one of the three states.
   *
   * M2 clangd lane stage 1/2 (docs/work/task-m2-clangd-preset.md) found by direct observation that a
   * missing compile database degrades silently: clangd logs the problem only to its own stderr, never
   * as an LSP-protocol-visible diagnostic, and a header query in that state returned `[]` (not `null`)
   * for a symbol whose real caller was never even indexed. `nullIncomingCallsObserved` above cannot
   * catch this - it fires only on a literal `null` - so this is a separate signal grounded in database
   * state itself, not in any provider response value.
   */
  readonly compileDatabase?: CompileDatabaseObservation;
  /**
   * JVM project-model state for a `java` request, read-only-discovered by
   * `providers/jvmProjectModel.ts` before the provider session runs. Absent for any non-JVM request.
   *
   * Lane J (docs/work/task-m3-java-project-import-readiness.md) found by direct observation against
   * the real jdtls binary that a build-system-free, multi-file workspace can report `ready` (jdtls's
   * own indexing genuinely finished) while still returning an empty `incomingCalls` for a caller that
   * exists in a different file - readiness answers "is the index done", not "is there a project model
   * that could see across files at all". This is that second, separate signal.
   */
  readonly jvmProjectModel?: JvmProjectModelObservation;
  /**
   * M4 stage 2: adapter ids whose own exploration budget was exceeded while looking for augmented
   * edges. Never derived from `TraversalFacts`/`facts.limits` (M4 stage 1's "budget/limits leak"
   * decision, docs/work/task-m4-stage1-evidence-contract.md) - an adapter's budget is entirely its
   * own, so exhausting it degrades only the augmented findings and is reported through this
   * separate channel, never through `completion`/`complete`/`truncated`/`traversalLimits`.
   */
  readonly augmentationBudgetExceeded?: readonly string[];
  /**
   * M4 stage 2 (corpus case 3, docs/work/task-m4-stage1-evidence-contract.md): adapter ids that found a
   * route decorator but could not confirm, within the searched workspace, that its router is actually
   * mounted (`include_router(...)`). No augmented edge is produced for that route while this is set -
   * this is what keeps an unmounted (or mounted-outside-scan-scope) handler from being reported as a
   * confirmed reachable entrypoint.
   */
  readonly augmentationMountUnresolved?: readonly string[];
  /**
   * M4 augmentation-failure-isolation lane (docs/work/task-m4-augmentation-failure-isolation.md,
   * closing the M4 closure audit's Gate 1): adapter ids whose `run()` threw instead of returning an
   * `AdapterResult`, paired with the thrown value's `error.name` (`errorKind`) - never its `message`,
   * which can contain a file path or symbol name (IL-LIM-001's rollout item forbids that). Distinct from
   * `augmentationInternalError` below: this is the ADAPTER failing, one of the failure modes its own
   * contract already allows for (`FrameworkAdapter`'s doc comment - "if it cannot confirm, produce
   * nothing"), not a bug in this codebase's own orchestration code.
   */
  readonly augmentationAdapterFailed?: readonly AugmentationAdapterFailure[];
  /**
   * M4 augmentation-failure-isolation lane: set when the call to `runAugmentation()` itself threw,
   * outside any single adapter's own try/catch (`./shared/adapters/index.ts`'s per-adapter blanket
   * catch already isolates adapter failures into `augmentationAdapterFailed` above - reaching this path
   * means the orchestration code surrounding that loop broke, which is a bug in this codebase, not in an
   * adapter). Kept as a distinct code so this class of failure is never misread as "an adapter had
   * trouble" (commander's finding: conflating the two lets a real orchestration bug hide forever behind
   * the more benign-sounding adapter-failure wording).
   */
  readonly augmentationInternalError?: AugmentationInternalError;
  /**
   * M4 IL-LIM-001/002 inference-unresolved lane (docs/work/task-m4-il-lim001-002-inference-limitations.md,
   * closing IL-LIM-001 acceptance criterion 4 and IL-LIM-002 criteria 4-5's non-gate-C half): adapter ids
   * paired with a tally of relationships that adapter RECOGNIZED as a candidate inference but could not
   * resolve into a specific caller - gate 7 measured that roughly 40% of real references were silently
   * dropped this way before this lane. Never produced as an augmented edge, and never one entry per
   * occurrence - a single registration point can produce many occurrences (reviewer's vue-core
   * measurement: one `onUpdated(() => {...})` call produced three), and stacking one entry per occurrence
   * would be noise, not disclosure. Aggregated per adapter, per `reasonCode`, as a count.
   *
   * `RejectedInferenceCategory` intentionally ships only three values today
   * (`backlog`/`capability-blocked`/`technique-blocked`) - a fourth, `runtime-only` (the target is
   * determined only at runtime, which static analysis cannot resolve in principle - "gate C" in this
   * milestone's own vocabulary), was deliberately NOT added: no adapter has a code path that produces it
   * yet (measured directly against three candidate FastAPI shapes, all rejected - see the work document),
   * and `AUGMENTED_EDGE_SOURCES`'s `runtime-observation` precedent for keeping a producer-less value cuts
   * the OTHER way here - removing an already-shipped enum value is the expensive direction, so a value
   * with zero producers should never ship in the first place. It gets added when gate C's own lane gives
   * it a real producer, not before.
   */
  readonly augmentationInferenceUnresolved?: readonly AugmentationInferenceUnresolved[];
}

/**
 * M4 augmentation-failure-isolation lane (docs/work/task-m4-augmentation-failure-isolation.md). Named
 * types, not inline object literals, on purpose: `stateReachability.sources.test.ts`'s field-inventory
 * check regex-scans everything between `interface AnalysisObservations {` and its closing `}` for
 * `readonly <name>:` and treats every match as a top-level field to classify - an inline
 * `{ readonly adapterId: string; readonly errorKind: string }` nested inside that interface body would
 * have made `adapterId`/`errorKind` spuriously fail that scan as unclassified top-level fields (found by
 * running the test, not by inspection - see this lane's design doc "구현 지점" for the exact failure).
 * Declaring these shapes here, outside that interface's body, keeps the scan's textual boundary correct.
 */
export interface AugmentationAdapterFailure {
  readonly adapterId: string;
  readonly errorKind: string;
}

export interface AugmentationInternalError {
  readonly errorKind: string;
}

/**
 * M4 IL-LIM-001/002 inference-unresolved lane (docs/work/task-m4-il-lim001-002-inference-limitations.md).
 * Ships three values only - see `AnalysisObservations.augmentationInferenceUnresolved`'s own doc comment
 * for why a fourth, `runtime-only`, is deliberately absent rather than reserved.
 */
export const REJECTED_INFERENCE_CATEGORIES = ['backlog', 'capability-blocked', 'technique-blocked'] as const;
export type RejectedInferenceCategory = (typeof REJECTED_INFERENCE_CATEGORIES)[number];

/**
 * One adapter's count of relationships it recognized but could not resolve into a specific caller, for
 * one `reasonCode` - never one entry per occurrence (see the field's own doc comment on why). `reasonCode`
 * is a kebab-case, adapter-internal string, reusing `AugmentedEdge.reasonCode`'s existing free-form-string
 * convention rather than inventing a second vocabulary (e.g. `module-level-alias`,
 * `unclassified-enclosing-call`, `unrecognized-scope-opener`).
 */
export interface RejectedInferenceTally {
  readonly reasonCode: string;
  readonly category: RejectedInferenceCategory;
  readonly count: number;
}

export interface AugmentationInferenceUnresolved {
  readonly adapterId: string;
  readonly tallies: readonly RejectedInferenceTally[];
}

/**
 * Read-only discovery result for `compile_commands.json`. See `providers/compileDatabase.ts` for how
 * this is produced; defined here (not there) because `types.ts` is this codebase's dependency-free
 * base layer that other modules import from, never the reverse.
 */
export type CompileDatabaseObservation =
  | { readonly status: 'missing' }
  | { readonly status: 'present'; readonly relativePath: string; readonly stale: boolean }
  | { readonly status: 'ambiguous'; readonly relativePaths: readonly string[] };

/**
 * Read-only discovery result for JVM project-model markers (Gradle/Maven). See
 * `providers/jvmProjectModel.ts` for how this is produced.
 *
 * `missing` carries `multipleSourceFiles` rather than being split into two statuses because the policy
 * decision (does this warrant a limitation) needs both facts together, and `coverage.ts` is where that
 * policy lives, not here - this type only reports what was observed.
 */
export type JvmProjectModelObservation =
  | { readonly status: 'present'; readonly marker: 'gradle' | 'maven' }
  | { readonly status: 'missing'; readonly multipleSourceFiles: boolean };

// ---------------------------------------------------------------------------
// data.augmentedEdges (schemaVersion 1, additive - M4 stage 1 decision, see
// docs/work/task-m4-stage1-evidence-contract.md)
//
// `data.edges`/`data.nodes` are never touched by this feature - every augmented edge lives only
// here. An endpoint either names an id already present in THIS execution's `data.nodes` (`existing`)
// or is fully self-contained (`synthetic`); a producer may use `existing` only after confirming the
// id is actually in this run's `nodes` (traversal's depth/node budget can make an otherwise-expected
// node absent - stage 1's dangling-id decision), never as a structural assumption (e.g. "the root is
// always there"). This is what keeps `nodes` byte-identical whether or not augmentation ran.
// ---------------------------------------------------------------------------

export const AUGMENTED_EDGE_SOURCES = ['static-inference', 'runtime-observation'] as const;
/** How an augmented edge was produced. `language-server` is deliberately absent - that provenance
 * stays in `data.edges`, which this feature never writes to. */
export type AugmentedEdgeSource = (typeof AUGMENTED_EDGE_SOURCES)[number];

export const AUGMENTED_EDGE_RESOLUTIONS = ['single', 'multiple'] as const;
/**
 * How many concrete targets the adapter could statically name for this relationship - never a claim
 * about whether the call is confirmed. `single`: exactly one candidate (e.g. `Depends(get_db)` naming
 * one real symbol). `multiple`: more than one real candidate, all reported side by side, never
 * collapsed into one (M4 stage 1 Q2 decision: `confirmed` is not a value here on purpose, since this
 * array is by definition what the provider did not confirm). The third scenario stage 1 considered -
 * a detected mechanism with no nameable candidate at all (profile-gated, programmatic registration,
 * proxy/AOP) - produces no edge and no `resolution` value; it is reported only as a limitation.
 */
export type AugmentedEdgeResolution = (typeof AUGMENTED_EDGE_RESOLUTIONS)[number];

export type AugmentedEndpoint =
  | { readonly kind: 'existing'; readonly id: string }
  | {
      readonly kind: 'synthetic';
      readonly name: string;
      readonly kindLabel: string;
      readonly file: string;
      readonly range: SourceRange;
    };

export interface AugmentedEdge {
  readonly source: AugmentedEndpoint;
  readonly target: AugmentedEndpoint;
  readonly adapterId: string;
  readonly evidenceSource: AugmentedEdgeSource;
  readonly resolution: AugmentedEdgeResolution;
  readonly reasonCode: string;
  readonly evidenceRanges: readonly SourceRange[];
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
