import { Coverage } from './types';

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
export const UNKNOWN_INDEXING_COVERAGE: Coverage['indexing'] = { status: 'unknown' };

/**
 * Coverage facts the caller has measured. Anything omitted falls back to the conservative default,
 * which is what every caller passes today.
 */
export interface CoverageObservations {
  readonly semantic?: Coverage['semantic'];
  readonly indexing?: Coverage['indexing'];
}

export function coverageForTraversal(
  limits: ReadonlySet<'depth' | 'nodes'>,
  requestedDepth: number,
  reachedDepth: number,
  maxNodes: number,
  reasons: readonly string[],
  observations: CoverageObservations = {},
): Coverage {
  const status = limits.has('nodes')
    ? 'node-limited'
    : limits.has('depth')
      ? 'depth-limited'
      : 'complete';
  return {
    traversal: { status, requestedDepth, reachedDepth, maxNodes },
    semantic: observations.semantic ?? STATIC_ONLY_SEMANTIC_COVERAGE,
    indexing: observations.indexing ?? UNKNOWN_INDEXING_COVERAGE,
    reasons,
  };
}
