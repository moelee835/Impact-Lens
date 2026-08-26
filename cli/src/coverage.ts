import { Coverage } from './types';

export function coverageForTraversal(
  limits: ReadonlySet<'depth' | 'nodes'>,
  requestedDepth: number,
  reachedDepth: number,
  maxNodes: number,
  reasons: readonly string[],
): Coverage {
  const status = limits.has('nodes')
    ? 'node-limited'
    : limits.has('depth')
      ? 'depth-limited'
      : 'complete';
  return {
    traversal: { status, requestedDepth, reachedDepth, maxNodes },
    semantic: { status: 'static-only', evidenceSources: ['lsp-call-hierarchy'] },
    indexing: { status: 'unknown' },
    reasons,
  };
}
