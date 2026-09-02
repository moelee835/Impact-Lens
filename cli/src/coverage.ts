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
 * docs/work/task-m2-python-preset.md stage 3 for `provider_null_incoming_calls`. Emptying this set is
 * the whole change.
 */
export const V1_WITHHELD_REASON_CODES: ReadonlySet<string> = new Set([
  'no_incoming_callers',
  'index_state_unknown',
  'provider_null_incoming_calls',
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
  return details;
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
