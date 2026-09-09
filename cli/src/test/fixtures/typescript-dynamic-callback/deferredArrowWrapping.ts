import { handler } from './handler';

declare function load(): Promise<number>;

// M4 gate 7 real-code measurement (docs/work/task-m4-gate7-budget-and-real-code-measurement.md):
// commander's finding, after PR #99's method-opener fix - same shape as
// `syncTraversalArrowWrapping.ts` (an inline arrow argument the scan cannot recognize), but this time
// wrapping a DEFERRED registration (`.then(...)`) rather than a synchronous higher-order traversal.
//
// KNOWN, ACCEPTED RESIDUAL, and NOT DEFENSIBLE the way the sync-traversal case is - this is the SAME
// kind of wrong answer PR #99 fixed for `createAdapterProvider`/`toAdapterItem`: calling
// `deferredOuterCaller` only REGISTERS the `.then()` callback and returns; `setTimeout(handler, 0)`
// runs later, in a future turn, not during `deferredOuterCaller`'s own execution. `deferredOuterCaller`
// itself never causes this call the way `syncOuterCaller` does. Not fixed in PR #99 - fixing it means
// extending the fold-to-abandonment check to inline arrow openers too, which was measured (commander)
// to also catch the sync-traversal case this fixture pins as defensible, an unmeasured recall cost this
// PR does not pay. Left as a known gap for a future, separately-measured lane.
export function deferredOuterCaller(): void {
  load().then((_result) => {
    setTimeout(handler, 0);
  });
}
