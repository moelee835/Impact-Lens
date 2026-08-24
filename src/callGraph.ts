import { TraversalResult } from './types';

export interface IncomingGraphAdapter<T> {
  key(value: T): string;
  incoming(value: T): Promise<readonly T[]>;
}

/**
 * Breadth-first reverse traversal. Incoming nodes are callers of the current
 * node, so every edge points from caller to callee.
 */
export async function traverseIncoming<T>(
  root: T,
  adapter: IncomingGraphAdapter<T>,
  maxDepth: number,
  maxNodes: number,
): Promise<TraversalResult<T>> {
  const rootKey = adapter.key(root);
  const seen = new Set<string>([rootKey]);
  const entries: Array<{ value: T; depth: number; parentKey?: string }> = [
    { value: root, depth: 0 },
  ];
  const edges: Array<{ source: string; target: string }> = [];
  const queue: Array<{ value: T; depth: number }> = [{ value: root, depth: 0 }];
  const limits = new Set<'depth' | 'nodes'>();

  while (queue.length > 0) {
    const current = queue.shift();
    if (!current) {
      continue;
    }

    const targetKey = adapter.key(current.value);
    const callers = await adapter.incoming(current.value);
    if (current.depth >= maxDepth) {
      if (callers.some(caller => !seen.has(adapter.key(caller)))) {
        limits.add('depth');
      }
      continue;
    }
    for (const caller of callers) {
      const sourceKey = adapter.key(caller);

      if (seen.has(sourceKey)) {
        edges.push({ source: sourceKey, target: targetKey });
        continue;
      }
      if (entries.length >= maxNodes) {
        limits.add('nodes');
        continue;
      }

      const depth = current.depth + 1;
      seen.add(sourceKey);
      edges.push({ source: sourceKey, target: targetKey });
      entries.push({ value: caller, depth, parentKey: targetKey });
      queue.push({ value: caller, depth });
    }
  }

  return {
    entries,
    edges,
    truncated: limits.size > 0,
    limits: [...limits],
    reachedDepth: Math.max(0, ...entries.map(entry => entry.depth)),
  };
}
