// M4 stage 2 - the whole "registry" is this one array. See `./types.ts` for why this is deliberately
// not a bigger plugin-loading abstraction.

import { AugmentationAdapterFailure, AugmentedEdge, CallHierarchyItem, CallHierarchyProvider } from '../../types';
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
 * `maxFiles: 200` was re-reviewed in stage 3 (latency measured, kept unchanged) on the strength of an
 * open question stage 3 explicitly left unanswered: "whether real FastAPI workspaces commonly exceed
 * 200 `.py` files in the first place" (see `isRouterMounted`'s doc comment in
 * `./fastapiDependencyAdapter.ts`). Gate 7's real-code measurement
 * (`docs/work/task-m4-gate7-budget-and-real-code-measurement.md`) answered it: querying
 * `Netflix/dispatch` (real production code, 717 `.py` files after `IGNORED_DIRECTORIES` pruning)
 * unmodified hit `augmentation_budget_exceeded` on 7 of 8 real cross-file queries - the 200 cap was
 * already too small for an ordinary production-scale project, at 39% of the way through its file
 * count, not at some pathological edge. `maxFiles: 1500` is derived, not guessed, from that gate's own
 * latency budget: `budget(400ms, itself provisional pending an extension-host measurement) ÷ measured
 * per-file cost (~0.253ms/file, the worst-case query at 717 files) ≈ 1581`, rounded down for safety
 * margin against measurement noise and the observed non-linearity (per-file cost was lower - ~0.115ms -
 * at the 200-file mark, so extrapolating the 717-file rate outward is itself an unverified assumption
 * past the measured range). If the 400ms figure moves once extension-host latency is actually measured,
 * this value should be recomputed with it, not left stale. */
const DEFAULT_BUDGET: AdapterBudget = { maxFiles: 1500, maxMatchesPerFile: 20 };

export interface AugmentationResult {
  readonly edges: readonly AugmentedEdge[];
  readonly budgetExceededAdapterIds: readonly string[];
  readonly mountUnresolvedAdapterIds: readonly string[];
  /** M4 augmentation-failure-isolation lane (docs/work/task-m4-augmentation-failure-isolation.md,
   * closing the M4 closure audit's Gate 1): adapters whose `run()` threw instead of returning an
   * `AdapterResult`, recorded separately from `budgetExceededAdapterIds`/`mountUnresolvedAdapterIds`
   * (both of which are the adapter reporting its OWN degraded state through its normal return value) -
   * this is the adapter failing to return at all. Every other adapter's result is unaffected - this
   * array existing at all is what proves a throw degraded only itself, never anything else in this loop.
   * `AugmentationAdapterFailure` (`../../types.ts`) is a named type, not inlined here, for the same
   * reason `types.ts`'s own doc comment on it gives: an inline object type nested inside
   * `AnalysisObservations` broke `stateReachability.sources.test.ts`'s field-inventory scan. */
  readonly failedAdapters: readonly AugmentationAdapterFailure[];
}

function errorKindOf(error: unknown): string {
  return error instanceof Error ? error.name : 'unknown';
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
 *
 * `adapters` defaults to the real registry and exists purely for injection in tests (M4 augmentation-
 * failure-isolation lane) - neither production call site (`cli/src/impact.ts`, `src/impactAnalyzer.ts`)
 * passes it, so both keep using the real `ADAPTERS` array unchanged.
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
  adapters: readonly RegisteredAdapter[] = ADAPTERS,
): Promise<AugmentationResult> {
  if (!enabled) {
    return { edges: [], budgetExceededAdapterIds: [], mountUnresolvedAdapterIds: [], failedAdapters: [] };
  }
  const edges: AugmentedEdge[] = [];
  const budgetExceededAdapterIds: string[] = [];
  const mountUnresolvedAdapterIds: string[] = [];
  const failedAdapters: AugmentationAdapterFailure[] = [];
  for (const adapter of adapters) {
    if (!adapter.languageIds.includes(languageId)) {
      continue;
    }
    // Blanket catch, deliberately symmetric with `fastapiDependencyAdapter.ts`'s `resolveEndpoint()`
    // (which folds every `prepare()` exception to a no-match rather than distinguishing error types) and
    // with gate 4's completeness argument ("a failed re-verification, a thrown exception included,
    // always folds toward no-edge, never toward a promotion") - an adapter's whole job is "produce
    // nothing when it cannot confirm something", and a thrown exception is one more way of not
    // confirming. This one adapter's failure must not affect any OTHER adapter still to run in this same
    // loop, which is why the catch sits here and not around the loop or around this function's caller -
    // both of those would let one adapter's throw erase every other adapter's already-computed edges.
    try {
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
    } catch (error) {
      failedAdapters.push({ adapterId: adapter.id, errorKind: errorKindOf(error) });
    }
  }
  return { edges, budgetExceededAdapterIds, mountUnresolvedAdapterIds, failedAdapters };
}
