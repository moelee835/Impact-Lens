import { ImpactDelta, ImpactEdge, ImpactNode, ImpactResult } from './types';

export const EMPTY_IMPACT_DELTA: ImpactDelta = {
  addedNodeIds: [],
  removedNodeIds: [],
  addedEdgeCount: 0,
  removedEdgeCount: 0,
  addedDiagnosticCount: 0,
};

export function computeImpactDelta(
  previous: Pick<ImpactResult, 'nodes' | 'edges'> | undefined,
  current: Pick<ImpactResult, 'nodes' | 'edges'>,
): ImpactDelta {
  if (!previous) {
    return EMPTY_IMPACT_DELTA;
  }

  const previousNodes = new Map(previous.nodes.map(node => [node.id, node]));
  const currentNodes = new Map(current.nodes.map(node => [node.id, node]));
  const addedNodeIds = current.nodes
    .filter(node => !previousNodes.has(node.id))
    .map(node => node.id);
  const removedNodeIds = previous.nodes
    .filter(node => !currentNodes.has(node.id))
    .map(node => node.id);
  const previousEdges = new Set(previous.edges.map(edgeKey));
  const currentEdges = new Set(current.edges.map(edgeKey));

  return {
    addedNodeIds,
    removedNodeIds,
    addedEdgeCount: [...currentEdges].filter(edge => !previousEdges.has(edge)).length,
    removedEdgeCount: [...previousEdges].filter(edge => !currentEdges.has(edge)).length,
    addedDiagnosticCount: countAddedDiagnostics(previousNodes, currentNodes),
  };
}

function edgeKey(edge: Pick<ImpactEdge, 'source' | 'target'>): string {
  return `${edge.source}\u0000${edge.target}`;
}

function countAddedDiagnostics(
  previous: ReadonlyMap<string, ImpactNode>,
  current: ReadonlyMap<string, ImpactNode>,
): number {
  let count = 0;
  for (const [id, node] of current) {
    const before = new Set((previous.get(id)?.diagnostics ?? []).map(diagnosticKey));
    count += node.diagnostics.filter(diagnostic => !before.has(diagnosticKey(diagnostic))).length;
  }
  return count;
}

function diagnosticKey(diagnostic: ImpactNode['diagnostics'][number]): string {
  return `${diagnostic.severity}\u0000${diagnostic.line}\u0000${diagnostic.message}`;
}
