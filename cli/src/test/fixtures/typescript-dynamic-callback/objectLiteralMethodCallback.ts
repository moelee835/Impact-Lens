import { handler } from './handler';

// M4 gate 7 real-code measurement (docs/work/task-m4-gate7-budget-and-real-code-measurement.md):
// reproduces the real mis-attribution found in adapterProviderShim.ts's createAdapterProvider()/
// prepare() - an object-literal method shorthand (`run(): void { ... }`) is not one of
// ENCLOSING_FUNCTION_PATTERNS, so before the fix the backward scan skipped past it and landed on the
// outer factory `outerFactoryNeverCallsHandlerDirectly`, which never itself calls `handler`. Expected
// after the fix: no candidate at all (fold to abandonment), not that wrong outer name.
export function outerFactoryNeverCallsHandlerDirectly(): { run: () => void } {
  return {
    run(): void {
      setTimeout(handler, 0);
    },
  };
}
