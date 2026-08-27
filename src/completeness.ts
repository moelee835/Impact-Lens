import {
  ImpactAnalysisState,
  ImpactCoverage,
  ImpactProviderMetadata,
  IndexingStatus,
  SemanticStatus,
  TraversalLimit,
  TraversalStatus,
} from './types';

/**
 * Single source for every user-visible sentence about how far an analysis got.
 *
 * The wording is not invented here. Each branch maps to a row of the state truth table in
 * `docs/work/task-m1-state-truth-table.md` (2.3 "severity와 사용자 노출 문구"), and the row id is named in
 * the comment above the branch. Two rows are adapted rather than copied, and both adaptations are recorded
 * in `docs/work/task-m1-extension-completeness-ux.md`:
 *
 * - S9 drops the `{timeoutMs}` placeholder because the VS Code broker never receives a timeout budget.
 * - F1 and F19 are merged, because the VS Code API offers no way to ask whether a language has a Call
 *   Hierarchy provider registered. Claiming one of the two causes would be a guess.
 *
 * This module must stay free of any runtime `vscode` dependency. `npm test` runs the compiled output under
 * plain node, where `require('vscode')` does not resolve, and these sentences are the part that most needs
 * direct unit tests.
 */

export type CompletenessSeverity = 'info' | 'warning' | 'error';

export type CompletenessOutcome =
  | 'analyzing'
  | 'stale'
  | 'retained-after-failure'
  | 'no-provider'
  | 'callers-found'
  | 'no-callers-indexed'
  | 'no-callers-index-unknown'
  | 'indexing-partial'
  | 'indexing-empty'
  | 'depth-limited'
  | 'node-limited'
  | 'depth-and-node-limited'
  | 'traversal-timeout'
  | 'traversal-failed';

/** Everything the presentation layer needs, with no `vscode` values in it. */
export interface CompletenessInput {
  readonly callerCount: number;
  readonly truncated: boolean;
  readonly traversalLimits: readonly TraversalLimit[];
  readonly requestedDepth: number;
  readonly reachedDepth: number;
  readonly maxNodes: number;
  readonly analysisState: ImpactAnalysisState;
  readonly traversalStatus: TraversalStatus;
  readonly semanticStatus: SemanticStatus;
  readonly indexingStatus: IndexingStatus;
  readonly reasons: readonly string[];
}

export interface CompletenessSummary {
  readonly outcome: CompletenessOutcome;
  readonly severity: CompletenessSeverity;
  /** One sentence stating what was returned and what that does not prove. */
  readonly headline: string;
  /** The next step, when there is one. Every `error` row has one (truth table 1.2, rule 3). */
  readonly action?: string;
  /** True when the result exists but has a known boundary. */
  readonly bounded: boolean;
}

export interface StateBadge {
  readonly label: string;
  /** CSS class name for the graph state pill, and the discriminator behind `.state.partial`. */
  readonly className: ImpactAnalysisState;
}

/**
 * Sentence appended to surfaces that describe the analysis method rather than one result.
 * Always true, never a verdict, severity `info` by truth table 1.2.
 */
export const STATIC_SCOPE_NOTICE =
  'Static call hierarchy only; dynamic, reflective and runtime-wired calls are not inferred.';

const DEPTH_LIMIT: TraversalLimit = 'depth';
const NODE_LIMIT: TraversalLimit = 'nodes';

/**
 * The Explorer tree, the status bar and the graph pill used to spell these five states three different
 * ways. `src/impactTreeProvider.ts` returned an empty string for `current`, and the graph webview inlined a
 * second copy that returned `'Current'`. One function now answers for all of them.
 */
export function analysisStateLabel(state: ImpactAnalysisState | undefined): string {
  if (state === 'stale') {
    return 'Editing · stale';
  }
  if (state === 'analyzing') {
    return 'Analyzing…';
  }
  if (state === 'partial') {
    return 'Partial result';
  }
  if (state === 'failed') {
    return 'Analysis failed';
  }
  if (state === 'current') {
    return 'Current';
  }
  return '';
}

/**
 * `analysisState` alone is not enough to label a result.
 *
 * `src/impactAnalyzer.ts:analyzeItem` always writes `'current'`, even when the traversal hit a limit; only
 * `src/controller.ts:applyLiveMetadata` later downgrades it to `'partial'`. A surface that trusts the field
 * alone can therefore render a bounded result as `Current`. This function reconciles the field with the
 * coverage it was derived from, so a bounded result is never labelled as a settled one.
 */
export function stateBadge(input: CompletenessInput): StateBadge {
  if (input.analysisState === 'current' && isBounded(input)) {
    return { label: analysisStateLabel('partial'), className: 'partial' };
  }
  return { label: analysisStateLabel(input.analysisState), className: input.analysisState };
}

/** The one message used wherever no analysable root came back. */
export function noProviderSummary(languageId?: string): CompletenessSummary {
  const subject = languageId ? `for ${languageId}` : 'for this file';
  return {
    outcome: 'no-provider',
    severity: 'error',
    // Truth table F1 + F19, merged. See the module comment for why they cannot be told apart here.
    headline: `No Call Hierarchy provider answered ${subject}. Impact Lens cannot tell whether this`
      + ' language has no Call Hierarchy provider registered or no callable symbol was found at the'
      + ' requested position.',
    action: 'Run "Impact Lens: Run Provider Doctor", or point at the declaration name, not the body.',
    bounded: false,
  };
}

export function summarizeCompleteness(input: CompletenessInput): CompletenessSummary {
  if (input.analysisState === 'analyzing') {
    return {
      outcome: 'analyzing',
      severity: 'info',
      headline: 'Analyzing…',
      bounded: false,
    };
  }

  if (input.analysisState === 'stale') {
    return {
      outcome: 'stale',
      severity: 'warning',
      headline: 'The graph is stale after unsaved edits and will update after you pause typing.',
      action: 'Pause typing, or run "Impact Lens: Refresh".',
      bounded: true,
    };
  }

  if (input.analysisState === 'failed') {
    return {
      outcome: 'retained-after-failure',
      severity: 'error',
      headline: 'The last analysis attempt failed. The previous graph is retained and is not current.',
      action: 'Check the provider diagnostics and re-run.',
      bounded: true,
    };
  }

  const depthLimited = input.traversalLimits.includes(DEPTH_LIMIT);
  const nodeLimited = input.traversalLimits.includes(NODE_LIMIT);

  // S6 — both budgets reported. Node budget is named first because it is the one that stopped expansion.
  if (depthLimited && nodeLimited) {
    return {
      outcome: 'depth-and-node-limited',
      severity: 'warning',
      headline: `Partial result: node budget ${input.maxNodes} exhausted before the depth limit`
        + ` ${input.requestedDepth} was cleared.`,
      action: 'Re-run with a higher maxNodes first.',
      bounded: true,
    };
  }

  // S5
  if (nodeLimited) {
    return {
      outcome: 'node-limited',
      severity: 'warning',
      headline: `Partial result: node budget ${input.maxNodes} exhausted. Some callers were not expanded.`,
      action: 'Re-run with a higher maxNodes, or narrow the target.',
      bounded: true,
    };
  }

  // S4
  if (depthLimited) {
    return {
      outcome: 'depth-limited',
      severity: 'warning',
      headline: `Partial result: depth limit ${input.requestedDepth} reached. Callers beyond this depth`
        + ' were not expanded.',
      action: 'Re-run with a higher depth.',
      bounded: true,
    };
  }

  // S9, without the timeout budget the broker never sees.
  if (input.traversalStatus === 'timeout') {
    return {
      outcome: 'traversal-timeout',
      severity: 'warning',
      headline: 'Partial result: the analysis timed out before the traversal finished.',
      action: 'Re-run with a higher timeout or a smaller depth.',
      bounded: true,
    };
  }

  // S11
  if (input.traversalStatus === 'failed') {
    return {
      outcome: 'traversal-failed',
      severity: 'error',
      headline: 'Partial result: the language server failed during traversal after returning some callers.',
      action: 'Check the provider diagnostics and re-run.',
      bounded: true,
    };
  }

  if (input.indexingStatus === 'working') {
    // S8 — deliberately never says "no callers exist". X11 forbids pairing an unfinished index with a
    // no-incoming-callers claim.
    if (input.callerCount === 0) {
      return {
        outcome: 'indexing-empty',
        severity: 'error',
        headline: 'The provider is still indexing and returned no callers. This is not evidence that the'
          + ' symbol has no callers.',
        action: 'Wait for indexing to finish and re-run.',
        bounded: true,
      };
    }
    // S7
    return {
      outcome: 'indexing-partial',
      severity: 'error',
      headline: 'Partial result: the provider is still indexing. Callers found so far are shown, but the'
        + ' set is incomplete.',
      action: 'Wait for indexing to finish and re-run.',
      bounded: true,
    };
  }

  if (input.callerCount === 0) {
    // S2 — the only row allowed to scope the statement to an index, because the provider reported one.
    if (input.indexingStatus === 'ready') {
      return {
        outcome: 'no-callers-indexed',
        severity: 'warning',
        headline: 'No incoming callers found within the indexed workspace. Static call hierarchy only;'
          + ' dynamic, reflective and cross-process calls are not inferred.',
        action: 'Confirm dynamic entry points manually before removing this symbol.',
        bounded: false,
      };
    }
    // S3 — today's default path for the Extension: `src/coverage.ts` pins `indexing.status` to `unknown`.
    return {
      outcome: 'no-callers-index-unknown',
      severity: 'warning',
      headline: 'No incoming callers were returned. The provider did not report an index state, so this is'
        + ' not proof that none exist.',
      action: 'Re-run after the provider finishes indexing, or verify with a workspace search.',
      bounded: false,
    };
  }

  // S1
  return {
    outcome: 'callers-found',
    severity: 'info',
    headline: `${input.callerCount} incoming caller${input.callerCount === 1 ? '' : 's'} found. Static call`
      + ' hierarchy only; dynamic and reflective calls are not inferred.',
    bounded: false,
  };
}

/**
 * Header segments in the order fixed by IL-LIM-009 3단계: result count, traversal, semantic scope, action.
 *
 * The count comes first so the reader sees a fact before a judgement, and the semantic scope sits directly
 * after the traversal state so `traversal complete` is never read on its own as runtime completeness.
 */
export function headerSegments(input: CompletenessInput, summary: CompletenessSummary): string[] {
  return [
    resultCountLabel(input.callerCount),
    traversalLabel(input),
    `semantic scope: ${semanticScopeLabel(input.semanticStatus)}`,
    summary.action ?? '',
  ].filter(segment => segment.length > 0);
}

export function resultCountLabel(callerCount: number): string {
  if (callerCount === 0) {
    return 'no callers returned';
  }
  return `${callerCount} caller${callerCount === 1 ? '' : 's'}`;
}

export function traversalLabel(input: CompletenessInput): string {
  return [
    `traversal ${input.traversalStatus}`,
    `depth ${input.reachedDepth}/${input.requestedDepth}`,
    `node budget ${input.maxNodes}`,
  ].join(' · ');
}

/**
 * `src/types.ts:SEMANTIC_STATUSES` is still the v1 pair. The truth table's richer vocabulary
 * (`provider-static`, `static-plus-inference`, `static-plus-observation`) belongs to the contract lane, so
 * this maps only what the shipped schema declares.
 */
export function semanticScopeLabel(status: SemanticStatus): string {
  if (status === 'augmented') {
    return 'static call hierarchy plus augmented edges';
  }
  return 'static call hierarchy only';
}

/** `unknown` is rendered as "not reported" so it reads as a missing signal rather than a shrug. */
export function indexingLabel(status: IndexingStatus): string {
  if (status === 'ready') {
    return 'index state: ready';
  }
  if (status === 'working') {
    return 'index state: still indexing';
  }
  return 'index state: not reported';
}

export function providerLabel(provider: ImpactProviderMetadata): string {
  const version = provider.version ? ` ${provider.version}` : '';
  return `${provider.host}/${provider.name}${version}`;
}

/** Builds the presentation input from a coverage record without touching any `vscode` value. */
export function completenessInput(source: {
  readonly nodeCount: number;
  readonly truncated: boolean;
  readonly traversalLimits: readonly TraversalLimit[];
  readonly requestedDepth: number;
  readonly reachedDepth: number;
  readonly maxNodes: number;
  readonly analysisState: ImpactAnalysisState;
  readonly coverage: ImpactCoverage;
}): CompletenessInput {
  return {
    // `src/callGraph.ts:traverseIncoming` seeds `entries` with the root, so a successful result always has
    // at least one node and a caller count of zero means zero callers, not a missing graph.
    callerCount: Math.max(0, source.nodeCount - 1),
    truncated: source.truncated,
    traversalLimits: source.traversalLimits,
    requestedDepth: source.requestedDepth,
    reachedDepth: source.reachedDepth,
    maxNodes: source.maxNodes,
    analysisState: source.analysisState,
    traversalStatus: source.coverage.traversal.status,
    semanticStatus: source.coverage.semantic.status,
    indexingStatus: source.coverage.indexing.status,
    reasons: source.coverage.reasons,
  };
}

function isBounded(input: CompletenessInput): boolean {
  return input.truncated
    || input.traversalLimits.length > 0
    || input.traversalStatus !== 'complete'
    || input.indexingStatus === 'working';
}
