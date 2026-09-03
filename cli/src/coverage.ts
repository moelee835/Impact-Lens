import { CliError } from './errors';
import {
  AnalysisObservations,
  BoundedTraversalStatus,
  Coverage,
  GraphCompletion,
  GraphSemanticScope,
  IndexingCoverage,
  LimitationDetail,
  PartialCompletion,
  SemanticStatus,
  TraversalLimit,
  TraversalStatus,
} from './types';

/**
 * What Impact Lens can claim about semantic evidence when the only source is a Call Hierarchy.
 *
 * `static-only` is a statement about the evidence, not about the code: a static call graph cannot see
 * dynamic dispatch, reflection, or runtime wiring, so a result derived from it is never a claim that
 * nothing else calls the symbol.
 */
export const STATIC_ONLY_SEMANTIC_COVERAGE: Coverage['semantic'] = {
  status: 'static-only',
  evidenceSources: ['lsp-call-hierarchy'],
};

/**
 * What Impact Lens can claim about the provider's index when it has not measured it.
 *
 * A Language Server that is still indexing answers Call Hierarchy queries with fewer callers than
 * exist, and it does not say so. Until readiness is actually probed the honest value is `unknown`,
 * never `ready`.
 */
export const UNKNOWN_INDEXING_COVERAGE: IndexingCoverage = { status: 'unknown' };

/**
 * The reason codes the v1 `limitations` / `coverage.reasons` arrays do not carry yet.
 *
 * Every code here describes a state that already happens today (a symbol with no incoming callers, in
 * one of several ways), and today the response says nothing about it. Adding them changes the value of
 * two fields that are already deployed, which the additive decision for schemaVersion 1 does not cover
 * on its own. They are therefore emitted in `limitationDetails` only, and this constant is the single
 * place that has to change when the release that updates `cli-contract.md`, the plugin summary template
 * and the plugin eval lands together.
 *
 * See docs/work/task-m1-completeness-emit.md decision D6 for the first two codes, and
 * docs/work/task-m2-python-preset.md stage 3 for `provider_null_incoming_calls`, and
 * docs/work/task-m2-clangd-preset.md stage 3 for the three `compile_database_*` codes. Emptying this
 * set is the whole change.
 */
export const V1_WITHHELD_REASON_CODES: ReadonlySet<string> = new Set([
  'no_incoming_callers',
  'index_state_unknown',
  'provider_null_incoming_calls',
  'compile_database_missing',
  'compile_database_stale',
  'compile_database_ambiguous',
]);

/** How `completion.traversalStatus` is written in the v1 `coverage.traversal.status` field. */
const V1_TRAVERSAL_STATUS: Readonly<Record<GraphCompletion['traversalStatus'], TraversalStatus>> = {
  exhausted: 'complete',
  'depth-limited': 'depth-limited',
  'node-limited': 'node-limited',
  timeout: 'timeout',
  // `cancelled` and `unknown` have no v1 spelling. Both are written as `failed`, which is a deliberate loss
  // in the safe direction: an old consumer reads "not complete" and never reads "complete" for a graph that
  // was cut short. The distinction survives in `completion.traversalStatus`.
  cancelled: 'failed',
  unknown: 'failed',
  failed: 'failed',
};

/** How `completion.semanticScope` is written in the v1 `coverage.semantic.status` field. */
const V1_SEMANTIC_STATUS: Readonly<Record<GraphSemanticScope, SemanticStatus>> = {
  'provider-static': 'static-only',
  'static-plus-inference': 'augmented',
  'static-plus-observation': 'augmented',
};

/** Evidence source prefix each augmented scope has to be able to point at. */
const REQUIRED_EVIDENCE_PREFIX: Readonly<Record<GraphSemanticScope, string | null>> = {
  'provider-static': null,
  'static-plus-inference': 'inferred-',
  'static-plus-observation': 'observed-',
};

/** Facts the traversal measured. Everything else about the result state is derived from these. */
export interface TraversalFacts {
  readonly limits: ReadonlySet<TraversalLimit>;
  readonly requestedDepth: number;
  readonly reachedDepth: number;
  readonly maxNodes: number;
  /** Nodes reached besides the root. The root is always present, so 0 means "no caller was returned". */
  readonly incomingCallerCount: number;
  readonly diagnosticsSupported: boolean;
}

export interface CompletionProjection {
  readonly completion: GraphCompletion;
  readonly complete: boolean;
  readonly truncated: boolean;
  readonly traversalLimits: readonly TraversalLimit[];
  readonly coverage: Coverage;
  readonly limitations: readonly string[];
  readonly limitationDetails: readonly LimitationDetail[];
}

/**
 * Decides the three-axis result state from what was observed.
 *
 * The return type has no `failed` variant, so a result state that says "there is no usable graph" cannot be
 * attached to a successful envelope (X6). Which of the remaining two variants comes out is decided here and
 * nowhere else, which is what makes `requestStatus: succeeded` with a bounded traversal unreachable (X5).
 */
export function graphCompletion(
  limits: ReadonlySet<TraversalLimit>,
  observations: AnalysisObservations = {},
): GraphCompletion {
  const indexing = observations.indexing ?? UNKNOWN_INDEXING_COVERAGE;
  const semanticScope = observations.semantic?.scope ?? 'provider-static';
  const partial = (traversalStatus: BoundedTraversalStatus): PartialCompletion =>
    ({ requestStatus: 'partial', traversalStatus, semanticScope, indexingStatus: indexing.status });

  // An interruption outranks a limit because it is the direct reason the traversal stopped: whether the node
  // budget also happened to run out says nothing about why there are no more results.
  if (observations.interruption === 'timeout') {
    return partial('timeout');
  }
  if (observations.interruption === 'cancelled') {
    return partial('cancelled');
  }
  if (observations.interruption === 'provider-failed') {
    return partial('failed');
  }
  // An index that is still being built makes "there is nothing left to expand" unknowable, so the traversal
  // cannot be called exhausted however it ended. This is also what makes X9 (`working` together with
  // `succeeded`) unreachable: `working` returns here, before the only place `succeeded` is constructed.
  if (indexing.status === 'working') {
    return partial('unknown');
  }
  if (limits.has('nodes')) {
    return partial('node-limited');
  }
  if (limits.has('depth')) {
    return partial('depth-limited');
  }
  return { requestStatus: 'succeeded', traversalStatus: 'exhausted', semanticScope, indexingStatus: indexing.status };
}

/**
 * Builds every state field of a successful `impact.analyze` response from one completion value.
 *
 * `complete`, `truncated`, `traversalLimits`, `coverage` and `limitations` are produced here together and
 * nowhere else. That is the whole point: the contradictions X1, X7 and X10 all come from the same shape,
 * a value computed in one place and stored in another, and a single writer removes the shape.
 */
export function projectCompletion(
  facts: TraversalFacts,
  observations: AnalysisObservations = {},
): CompletionProjection {
  const completion = graphCompletion(facts.limits, observations);
  const indexing = observations.indexing ?? UNKNOWN_INDEXING_COVERAGE;
  const semantic = semanticCoverage(completion.semanticScope, observations);
  const complete = completion.traversalStatus === 'exhausted';
  const limitationDetails = limitationDetailsFor(completion, facts, observations);
  const reasons = limitationDetails
    .map(detail => detail.code)
    .filter(code => !V1_WITHHELD_REASON_CODES.has(code));
  return {
    completion,
    complete,
    truncated: !complete,
    // X10: a graph that was not truncated cannot list a limit it hit.
    traversalLimits: complete ? [] : [...facts.limits].sort(),
    coverage: {
      traversal: {
        status: V1_TRAVERSAL_STATUS[completion.traversalStatus],
        requestedDepth: facts.requestedDepth,
        reachedDepth: facts.reachedDepth,
        maxNodes: facts.maxNodes,
      },
      semantic,
      indexing,
      reasons,
    },
    // `limitations` and `coverage.reasons` are the same array, not two arrays that happen to agree.
    limitations: reasons,
    limitationDetails,
  };
}

function semanticCoverage(scope: GraphSemanticScope, observations: AnalysisObservations): Coverage['semantic'] {
  if (!observations.semantic) {
    return STATIC_ONLY_SEMANTIC_COVERAGE;
  }
  const prefix = REQUIRED_EVIDENCE_PREFIX[scope];
  if (prefix !== null && !observations.semantic.evidenceSources.some(source => source.startsWith(prefix))) {
    // The contract requires an augmented scope to name the evidence that augmented it. Claiming the scope
    // without the source would be the same unproven assertion as `indexing: ready` without evidence.
    throw new CliError(
      'internal_error',
      `semanticScope "${scope}" requires an evidence source starting with "${prefix}".`,
      10,
    );
  }
  return { status: V1_SEMANTIC_STATUS[scope], evidenceSources: observations.semantic.evidenceSources };
}

/**
 * The one place reason codes are created.
 *
 * Order matters: the v1 `limitations` array is this list with the withheld codes filtered out, and that array
 * is part of the response contract. The first five entries reproduce the order the CLI produced before
 * `limitationDetails` existed.
 *
 * No message here may state a conclusion. The forbidden phrases (`no impact`, `safe to change`, `unused`,
 * `fully analyzed`, `complete analysis`, `all callers`) are enforced by cli/src/test/forbidden.test.ts.
 */
function limitationDetailsFor(
  completion: GraphCompletion,
  facts: TraversalFacts,
  observations: AnalysisObservations,
): readonly LimitationDetail[] {
  const details: LimitationDetail[] = [
    {
      code: 'dynamic_calls_not_inferred',
      severity: 'info',
      scope: 'semantic',
      message: 'Dynamic dispatch, reflection and runtime wiring are not inferred from a static call hierarchy.',
    },
    {
      code: 'unsaved_buffers_unavailable',
      severity: 'info',
      scope: 'request',
      message: 'Unsaved editor buffers are not visible to the CLI, so the analysis used the files on disk.',
    },
  ];
  details.push(...compileDatabaseDetails(observations.compileDatabase));
  if (!facts.diagnosticsSupported) {
    details.push({
      code: 'provider_diagnostics_unsupported',
      severity: 'info',
      scope: 'provider',
      message: 'The provider did not report diagnostics, so symbol health is not shown.',
    });
  }
  if (facts.limits.has('depth')) {
    details.push({
      code: 'depth_limit_reached',
      severity: 'warning',
      scope: 'traversal',
      message: `Depth limit ${facts.requestedDepth} was reached. Callers beyond that depth were not expanded.`,
      action: 'Re-run with a higher depth.',
    });
  }
  if (facts.limits.has('nodes')) {
    details.push({
      code: 'node_limit_reached',
      severity: 'warning',
      scope: 'traversal',
      message: `The node budget of ${facts.maxNodes} ran out. Some callers were not expanded.`,
      action: 'Re-run with a higher maxNodes, or narrow the target.',
    });
  }
  details.push(...interruptionDetails(completion));
  if (completion.requestStatus === 'succeeded' && facts.incomingCallerCount === 0) {
    // X11: this code is created in the `succeeded` branch only, so it can never sit next to
    // `provider_not_ready`, which only exists while the traversal status is `unknown`.
    details.push({
      code: 'no_incoming_callers',
      severity: 'warning',
      scope: 'semantic',
      message: 'No incoming callers were returned for this symbol.',
      action: 'Confirm dynamic entry points manually before removing this symbol.',
    });
    if (completion.indexingStatus === 'unknown') {
      details.push({
        code: 'index_state_unknown',
        severity: 'warning',
        scope: 'indexing',
        message: 'The provider did not report an index state, so an empty result is not evidence that no caller exists.',
        action: 'Re-run after the provider finishes indexing, or verify with a workspace search.',
      });
    }
    if (observations.nullIncomingCallsObserved) {
      // LSP gives `callHierarchy/incomingCalls` no method-specific meaning for `null`, so this does not
      // claim to know what the provider meant - only that it did not send `[]`, the one value that would
      // let this be read as a proven zero. A framework-mediated call (FastAPI `Depends()` and similar
      // dependency-injection patterns) is the case this exists for: the function is genuinely invoked,
      // but not through a call expression a static Call Hierarchy can see.
      //
      // This is a session-level flag (`LspCallHierarchyProvider.nullIncomingCallsObserved`), not one
      // scoped to this particular query - it is only safe to attach here because `facts.incomingCallerCount
      // === 0` already proves exactly one `incoming()` call happened this session (see the comment at
      // `impact.ts`'s `incomingCallerCount` field). If that invariant ever breaks, this could attach a
      // `null` observed on an unrelated query to a result it says nothing about.
      details.push({
        code: 'provider_null_incoming_calls',
        severity: 'warning',
        scope: 'provider',
        message: 'The provider returned no definitive answer for incoming calls rather than an explicit empty list, so this is not evidence that no caller exists.',
        action: 'Check for invocation through a mechanism the provider cannot see statically, such as dependency injection or a framework decorator, before concluding this symbol is uncalled.',
      });
    }
  }
  details.push(...semanticScopeDetails(completion.semanticScope));
  details.push(...augmentationBudgetDetails(observations.augmentationBudgetExceeded));
  return details;
}

/**
 * Reports an adapter's own budget running out, entirely separate from `facts.limits` (M4 stage 1's
 * "budget/limits leak" decision) - an adapter that ran out of its own exploration budget only
 * degrades the augmented findings it produces, never the static `completion`/`complete`/`truncated`/
 * `traversalLimits` fields this function's caller (`projectCompletion`) also builds from the same
 * `facts`. Named per-adapter so a reader can tell which adapter degraded, not just that "augmentation"
 * did in general.
 */
function augmentationBudgetDetails(exceededAdapterIds: AnalysisObservations['augmentationBudgetExceeded']): readonly LimitationDetail[] {
  if (exceededAdapterIds === undefined || exceededAdapterIds.length === 0) {
    return [];
  }
  return [{
    code: 'augmentation_budget_exceeded',
    severity: 'warning',
    scope: 'semantic',
    message: `The following adapter(s) exhausted their own exploration budget before finishing: ${exceededAdapterIds.join(', ')}. Augmented edges from them may be incomplete; the static call graph above is unaffected.`,
    action: 'Re-run if a more complete augmented result is needed; the static result already returned is not affected.',
  }];
}

function interruptionDetails(completion: GraphCompletion): readonly LimitationDetail[] {
  switch (completion.traversalStatus) {
    case 'timeout':
      return [{
        code: 'traversal_timeout',
        severity: 'warning',
        scope: 'traversal',
        message: 'The traversal stopped when the request timeout was reached.',
        action: 'Re-run with a higher timeout or a smaller depth.',
      }];
    case 'cancelled':
      return [{
        code: 'traversal_cancelled',
        severity: 'warning',
        scope: 'traversal',
        message: 'The traversal was cancelled before it finished.',
        action: 'Re-run to get the full result.',
      }];
    case 'failed':
      return [{
        code: 'provider_query_failed',
        severity: 'error',
        scope: 'provider',
        message: 'The Language Server failed during the traversal after returning some callers.',
        action: 'Check the provider diagnostics and re-run.',
      }];
    case 'unknown':
      return [{
        code: 'provider_not_ready',
        severity: 'error',
        scope: 'indexing',
        message: 'The provider is still indexing, so the returned set of callers is incomplete.',
        action: 'Wait for indexing to finish and re-run.',
      }];
    default:
      return [];
  }
}

function semanticScopeDetails(scope: GraphSemanticScope): readonly LimitationDetail[] {
  if (scope === 'static-plus-inference') {
    return [{
      code: 'inferred_edges_included',
      severity: 'warning',
      scope: 'semantic',
      message: 'The graph includes inferred edges. Inferred edges are heuristic and carry their source.',
      action: 'Review the inferred edges before acting on them.',
    }];
  }
  if (scope === 'static-plus-observation') {
    return [{
      code: 'observed_edges_included',
      severity: 'warning',
      scope: 'semantic',
      message: 'The graph includes edges recorded from a runtime observation.',
      action: 'Runtime evidence covers only the paths the recorded run executed.',
    }];
  }
  return [];
}

/**
 * Surfaces compile database state as a limitation rather than a hard gate.
 *
 * M2 clangd lane stage 3 (docs/work/task-m2-clangd-preset.md) weighed a hard gate (refuse to analyze
 * without a fresh, unambiguous database, mirroring gopls's `requiredProjectFiles` for `go.mod`) against
 * surfacing this instead, and chose surfacing: stage 2's own fixture proved clangd gives a fully
 * correct, cross-file-accurate answer for a project with no compile database at all, as long as the
 * query does not need project-specific flags a generic fallback command cannot supply. A hard gate
 * would turn every one of those already-working queries into `unsupported`, which the story's own
 * language ("구분한다", "안내한다" - distinguish, guide - never "차단한다", block) does not ask for.
 * `missing`/`stale` reuse `provider_null_incoming_calls`'s pattern (`scope: 'provider'`,
 * `V1_WITHHELD_REASON_CODES`) precisely because the risk is the same shape: an incomplete answer that
 * looks complete, not a wrong claim reaching a reader through the two v1 fields these codes are held
 * back from.
 *
 * Deliberately unconditional on caller count, unlike `provider_null_incoming_calls`: a missing or stale
 * database can produce an incomplete-but-nonzero caller list just as easily as an empty one (stage 2's
 * fallback-mode observation found zero cross-file index at all, not merely fewer results), so gating
 * this on `incomingCallerCount === 0` would under-warn on every other outcome the same root cause can
 * produce.
 */
function compileDatabaseDetails(observation: AnalysisObservations['compileDatabase']): readonly LimitationDetail[] {
  if (observation === undefined || (observation.status === 'present' && !observation.stale)) {
    return [];
  }
  if (observation.status === 'missing') {
    return [{
      code: 'compile_database_missing',
      severity: 'warning',
      scope: 'provider',
      message: 'No compile_commands.json was found for this C/C++ workspace. The provider is analyzing with a generic fallback command that has no cross-file knowledge, so a result reporting no callers is not evidence that none exist.',
      action: 'Generate a compile database (for CMake: configure with -DCMAKE_EXPORT_COMPILE_COMMANDS=ON) and re-run.',
    }];
  }
  if (observation.status === 'ambiguous') {
    return [{
      code: 'compile_database_ambiguous',
      severity: 'warning',
      scope: 'provider',
      message: `${observation.relativePaths.length} compile_commands.json candidates were found. The provider silently picks one internally, so this result may reflect a different build target than intended.`,
      action: 'Keep only the compile_commands.json that matches this file, or point the provider at the correct one directly.',
    }];
  }
  return [{
    code: 'compile_database_stale',
    severity: 'warning',
    scope: 'provider',
    message: `${observation.relativePath} is older than CMakeLists.txt, so it may not reflect the current build configuration.`,
    action: 'Regenerate the compile database after your last build configuration change.',
  }];
}
