import { ImpactCoverage, ImpactProviderMetadata, TraversalLimit } from './types';

export function vscodeProviderMetadata(languageId: string): ImpactProviderMetadata {
  return {
    host: 'vscode',
    name: 'unknown',
    requestedLanguageId: languageId,
    detectedLanguageId: languageId,
    selectedBy: 'vscode',
    languageMatch: 'unknown',
    callHierarchy: true,
    diagnostics: true,
    advertised: { callHierarchy: 'unknown', diagnostics: 'unknown' },
    observed: { prepareCallHierarchy: true, incomingCalls: true, diagnostics: true },
    lifecycle: { stage: 'query', status: 'ready' },
  };
}

export function vscodeCoverage(
  limits: readonly TraversalLimit[],
  requestedDepth: number,
  reachedDepth: number,
  maxNodes: number,
): ImpactCoverage {
  const reasons = [
    'identity_unavailable_through_vscode_api',
    'dynamic_calls_not_inferred',
    ...(limits.includes('depth') ? ['depth_limit_reached'] : []),
    ...(limits.includes('nodes') ? ['node_limit_reached'] : []),
  ];
  return {
    traversal: {
      status: limits.includes('nodes')
        ? 'node-limited'
        : limits.includes('depth')
          ? 'depth-limited'
          : 'complete',
      requestedDepth,
      reachedDepth,
      maxNodes,
    },
    semantic: { status: 'static-only', evidenceSources: ['vscode-call-hierarchy'] },
    indexing: { status: 'unknown' },
    reasons,
  };
}
