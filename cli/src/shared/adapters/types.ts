// M4 stage 2 - minimal framework adapter SPI.
//
// Deliberately a single function type plus a plain array of registrations, not a plugin-loading
// system: there is exactly one adapter today (FastAPI), and IL-LIM-001's own "대안 검토" rejected
// designing an abstraction around one implementation - "언어별 추론 edge를 확정 edge로 병합"
// (over-fitting to one case) is exactly the failure mode a heavier SPI would risk here too. A second
// adapter can be added by appending to the `ADAPTERS` array in `./index.ts`; nothing about this shape
// needs to change for that.

import { AugmentedEdge, CallHierarchyItem, CallHierarchyProvider } from '../../types';

/**
 * An adapter's own exploration limits, entirely separate from the static traversal's depth/node
 * budget (M4 stage 1's "budget/limits leak" decision - docs/work/task-m4-stage1-evidence-contract.md).
 * Exhausting this degrades only what the adapter itself finds; it never touches
 * `completion`/`complete`/`truncated`/`traversalLimits`.
 */
export interface AdapterBudget {
  readonly maxFiles: number;
  readonly maxMatchesPerFile: number;
}

export interface AdapterInput {
  readonly workspace: string;
  /** The symbol whose incoming callers were just traversed - what the adapter looks for additional
   * callers of. Always present in `data.nodes` for this execution (the root is seeded unconditionally
   * by `traverse()`), so an edge naming it as `target` may always use `{ kind: 'existing' }`. */
  readonly root: CallHierarchyItem;
  readonly rootId: string;
  /** Shared with the static traversal only for querying (`prepare`) - never for writing. An adapter
   * must not call anything that would add entries to the traversal's own `nodes`/`edges`. Narrowed to
   * `prepare` alone (M4 gate 2 shared-adapter lane, docs/work/task-m4-gate2-shared-adapter.md): every
   * adapter call into the provider goes through `resolveEndpoint()`, which only ever calls `prepare()`
   * (confirmed directly against all three call sites in `fastapiDependencyAdapter.ts` before narrowing
   * this type) - the full `CallHierarchyProvider` interface has five other members
   * (`incoming`/`collectDiagnostics`/`dispose`/`capabilities`/`analysisObservations?`) an adapter has no
   * business touching. Narrowing the type turns "adapter는 순회를 건드리지 않는다" from a comment into
   * something the compiler enforces, and shrinks what a second host (a VS Code extension shim wrapping
   * `vscode.prepareCallHierarchy`, for example) needs to implement to satisfy this contract - a plain
   * `CallHierarchyProvider` still satisfies `Pick<CallHierarchyProvider, 'prepare'>` structurally, so the
   * CLI's own call site needed no change. */
  readonly provider: Pick<CallHierarchyProvider, 'prepare'>;
  /** Ids already present in `data.nodes` for this specific execution. An adapter may only emit an
   * `{ kind: 'existing', id }` endpoint for an id confirmed to be in this set - traversal's depth/node
   * budget can leave an otherwise-expected node absent, so "usually in the graph" is never a
   * substitute for checking this set (M4 stage 1's dangling-id decision). */
  readonly existingNodeIds: ReadonlySet<string>;
  /**
   * Computes the same id scheme the host used to build `rootId`/`existingNodeIds`/`data.nodes` -
   * required because the CLI's own `symbolId()` (sha256 of six fields) and the VS Code extension's own
   * `createSymbolKey()` (the same six fields, `#`-joined) agree on WHICH fields identify a symbol but
   * produce different literal strings (M4 gate 2 shared-adapter lane, confirmed by reading both
   * functions side by side) - an adapter that computed its own id internally, as this one used to,
   * would silently mismatch every host except the one it was written against. Every adapter MUST use
   * this function for every id it emits or compares against `rootId`/`existingNodeIds`; never invent or
   * import a host-specific id function directly, even the CLI's own.
   */
  readonly idOf: (item: CallHierarchyItem) => string;
  readonly budget: AdapterBudget;
}

export interface AdapterResult {
  readonly edges: readonly AugmentedEdge[];
  /** True if the adapter stopped early because it hit its own budget, not because it ran out of real
   * work. Surfaced as `augmentation_budget_exceeded`, never as a static traversal limit. */
  readonly budgetExceeded: boolean;
  /**
   * True when a route decorator was found but no `include_router(...)` call referencing its router could
   * be confirmed within the searched workspace (corpus case 3,
   * docs/work/task-m4-stage1-evidence-contract.md). No edge is emitted for that route in this case -
   * surfaced instead as `framework_route_mount_unresolved`, never silently dropped and never asserted as
   * proof the router is unmounted (a static scan cannot tell "genuinely unmounted" from "mounted outside
   * this scan's reach" apart).
   */
  readonly mountUnresolved: boolean;
}

/**
 * CONTRACT NOTE for a second adapter's author (M4 gate 4 module-resolution follow-up, round 3,
 * docs/work/task-m4-gate4-module-resolution.md - not enforced at runtime, deliberately: one adapter
 * exists today, and inventing an enforced rule for a shape this SPI has not seen yet risks the same
 * over-fitting IL-LIM-001's own "대안 검토" already rejected for this SPI's shape in general, see the
 * top-of-file comment):
 *
 * A text match your adapter makes (a regex over file contents) can mistake scope or alias direction -
 * this is not hypothetical, it is what M4 gate 4 reopened over TWICE in the shipped FastAPI adapter
 * (`fastapiDependencyAdapter.ts`). Whether that mistake ever reaches a real user's summary depends
 * entirely on what happens AFTER the match: if you re-verify it through `input.provider.prepare()`
 * before turning it into an `AugmentedEdge`, the provider's own real symbol resolution catches the
 * mistake, because a wrong or shadowed symbol will not resolve to your intended target.
 *
 * The protection this gives you is NOT "`prepare()` always succeeds" - it is that a failed
 * re-verification, a thrown exception included, always folds toward no-edge, never toward a promotion.
 * `resolveEndpoint()` (this adapter's own wrapper around `prepare()`) catches any exception `prepare()`
 * raises and returns an empty item list from it; every call site around it treats zero or
 * non-matching items as skip/continue, identically to a real empty answer. reviewer verified this
 * directly, not just by reading the code (M4 gate 4 module-resolution follow-up round 4,
 * docs/work/task-m4-gate4-module-resolution.md): three stub-provider mutations - always throw, throw
 * only after a name match resolves and the enclosing-def lookup runs, throw only at the alias-
 * verification lookup - each produced `edges: []`, and the matching non-throwing control produced
 * `edges.length === 1`, so the fold-to-abandonment behavior was exercised under a real failure, not
 * merely assumed from the try/catch shape. Design a second adapter's own re-verification wrapper the
 * same way: a caught exception must join the "could not confirm" branch, not silently skip the check.
 *
 * If you do not re-verify - because, like a route's mount point, the thing you matched is not a
 * callable symbol `CallHierarchyProvider` can resolve at all - your regex's scope/alias mistakes go
 * straight into the response with no downstream check to catch them, thrown exception or not. The
 * FastAPI adapter's `Depends()`/alias/enclosing-function paths all re-verify through `prepare()` and
 * have not needed a fix for a scope/alias mistake of THIS kind reaching a user. That is a narrower claim
 * than "that path has had no bugs": reviewer separately checked git history for it and found three real
 * ones (`4a783fb`, `cb8d1de`, `1147f19` - an alias search that missed a cross-file case, a resolution
 * count hardcoded to `'single'` instead of actually counted, an enclosing-def lookup that arbitrarily
 * adopted `items[0]` among several candidates). In all three, `prepare()` had already resolved the
 * right symbol; the bug was in what the surrounding code did with a correct result, not a wrong or
 * shadowed one slipping through unchecked - so none of them is a counterexample to the pattern this
 * note warns about, but a reader who takes "have not needed a fix" to mean "had no bugs at all" would
 * be wrong, which is why this paragraph exists. Its router-mount path (`isRouterMounted()`,
 * `isDirectFastapiApp()`) cannot re-verify at all and is exactly where gate 4's post-hoc defects were
 * found. If your adapter has an unverifiable text-match path
 * like that one, read `fastapiDependencyAdapter.ts`'s own top-of-file comment and `isRouterMounted()`'s
 * doc comment before writing it - the accumulated narrowing that path settled on (module-level-line-only
 * matches, exact unaliased import entries, comment/string stripping before every text test) is the
 * result of that path being found wrong three times, not a template to copy blindly, but a record of
 * which shortcuts were tried and did not hold.
 */
export type FrameworkAdapter = (input: AdapterInput) => Promise<AdapterResult>;

export interface RegisteredAdapter {
  readonly id: string;
  /** `languageId` values (as `resolve.ts`'s `languageId()` would produce) this adapter applies to. */
  readonly languageIds: readonly string[];
  readonly run: FrameworkAdapter;
}
