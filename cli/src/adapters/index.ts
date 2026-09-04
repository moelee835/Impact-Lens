// M4 stage 2 - the whole "registry" is this one array. See `./types.ts` for why this is deliberately
// not a bigger plugin-loading abstraction.

import { AugmentedEdge, CallHierarchyItem, CallHierarchyProvider } from '../types';
import { fastapiDependencyAdapter } from './fastapiDependencyAdapter';
import { AdapterBudget, RegisteredAdapter } from './types';

export const ADAPTERS: readonly RegisteredAdapter[] = [
  { id: 'fastapi-static-v1', languageIds: ['python'], run: fastapiDependencyAdapter },
];

/** Same budget for every adapter today - there is only one. A second adapter with different needs is
 * exactly the kind of case that should decide whether this stays shared or becomes per-adapter, not
 * something to guess at with one data point.
 *
 * `maxFiles: 200` - re-reviewed in stage 3 (latency measured, kept unchanged); see
 * `isRouterMounted`'s doc comment in `./fastapiDependencyAdapter.ts` for the measured cost and why
 * raising it was not taken up. */
const DEFAULT_BUDGET: AdapterBudget = { maxFiles: 200, maxMatchesPerFile: 20 };

export interface AugmentationResult {
  readonly edges: readonly AugmentedEdge[];
  readonly budgetExceededAdapterIds: readonly string[];
  readonly mountUnresolvedAdapterIds: readonly string[];
}

/**
 * Runs every adapter registered for `languageId`, entirely on its own budget
 * (`docs/work/task-m4-stage1-evidence-contract.md`'s "budget/limits leak" decision) - never touching
 * the static traversal's `TraversalFacts`/`facts.limits`. Returns an empty result with no adapter
 * invoked at all when `enabled` is false - the kill switch default (M4 stage 2, IL-LIM-001/002's own
 * rollout sections both call for adapters shipped disabled by default).
 */
export async function runAugmentation(
  enabled: boolean,
  languageId: string,
  workspace: string,
  root: CallHierarchyItem,
  rootId: string,
  provider: CallHierarchyProvider,
  existingNodeIds: ReadonlySet<string>,
): Promise<AugmentationResult> {
  if (!enabled) {
    return { edges: [], budgetExceededAdapterIds: [], mountUnresolvedAdapterIds: [] };
  }
  const edges: AugmentedEdge[] = [];
  const budgetExceededAdapterIds: string[] = [];
  const mountUnresolvedAdapterIds: string[] = [];
  for (const adapter of ADAPTERS) {
    if (!adapter.languageIds.includes(languageId)) {
      continue;
    }
    const result = await adapter.run({
      workspace,
      root,
      rootId,
      provider,
      existingNodeIds,
      budget: DEFAULT_BUDGET,
    });
    edges.push(...result.edges);
    if (result.budgetExceeded) {
      budgetExceededAdapterIds.push(adapter.id);
    }
    if (result.mountUnresolved) {
      mountUnresolvedAdapterIds.push(adapter.id);
    }
  }
  return { edges, budgetExceededAdapterIds, mountUnresolvedAdapterIds };
}
