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
  let truncated = false;

  while (queue.length > 0) {
    const current = queue.shift();
    if (!current || current.depth >= maxDepth) {
      continue;
    }

    const targetKey = adapter.key(current.value);
    const callers = await adapter.incoming(current.value);
    for (const caller of callers) {
      const sourceKey = adapter.key(caller);
      edges.push({ source: sourceKey, target: targetKey });

      if (seen.has(sourceKey)) {
        continue;
      }
      if (entries.length >= maxNodes) {
        truncated = true;
        continue;
      }

      const depth = current.depth + 1;
      seen.add(sourceKey);
      entries.push({ value: caller, depth, parentKey: targetKey });
      queue.push({ value: caller, depth });
    }
  }

  return { entries, edges, truncated };
}
