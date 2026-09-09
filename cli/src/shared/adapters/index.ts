// M4 stage 2 - the whole "registry" is this one array. See `./types.ts` for why this is deliberately
// not a bigger plugin-loading abstraction.

import { AugmentedEdge, CallHierarchyItem, CallHierarchyProvider } from '../../types';
import { dynamicCallbackAdapter } from './dynamicCallbackAdapter';
import { fastapiDependencyAdapter } from './fastapiDependencyAdapter';
import { AdapterBudget, RegisteredAdapter } from './types';

export const ADAPTERS: readonly RegisteredAdapter[] = [
  { id: 'fastapi-static-v1', languageIds: ['python'], run: fastapiDependencyAdapter },
  {
    id: 'dynamic-callback-static-v1',
    languageIds: ['typescript', 'typescriptreact', 'javascript', 'javascriptreact'],
    run: dynamicCallbackAdapter,
  },
];

/** Default budget, used unless a `RegisteredAdapter` declares its own (`./types.ts`'s `budget` field -
 * IL-LIM-001 stage 3, second adapter). The {maxFiles, maxMatchesPerFile} SHAPE stays shared across every
 * adapter - the decision that shape didn't need to change once a second adapter existed, see that
 * field's doc comment - only the NUMBERS are now per-adapter.
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
 *
 * `provider` is narrowed to `Pick<CallHierarchyProvider, 'prepare'>` (M4 gate 2 shared-adapter lane,
 * matching `AdapterInput.provider`'s own narrowing - see that field's doc comment in `./types.ts`):
 * this function only ever forwards `provider` straight into `AdapterInput`, it never calls any method on
 * it itself, so requiring the full six-member interface here would have been a second, needless place a
 * second host's provider shim had to implement `incoming`/`collectDiagnostics`/`dispose`/`capabilities`
 * just to satisfy a type nothing actually uses. The CLI's own call site (`impact.ts`) needed no change -
 * a full `CallHierarchyProvider` still structurally satisfies this narrower parameter type.
 */
export async function runAugmentation(
  enabled: boolean,
  languageId: string,
  workspace: string,
  root: CallHierarchyItem,
  rootId: string,
  provider: Pick<CallHierarchyProvider, 'prepare'>,
  existingNodeIds: ReadonlySet<string>,
  // The host's own symbol-id scheme (M4 gate 2 shared-adapter lane, docs/work/task-m4-gate2-shared-
  // adapter.md, see AdapterInput.idOf's own doc comment for why an adapter cannot compute this itself).
  // The CLI passes its own `symbolId` here; a second host (the VS Code extension) passes its own.
  idOf: (item: CallHierarchyItem) => string,
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
      idOf,
      budget: adapter.budget ?? DEFAULT_BUDGET,
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
