import { handler } from './handler';

// M4 gate 7 real-code measurement (docs/work/task-m4-gate7-budget-and-real-code-measurement.md):
// reproduces the class-method shape found in lspProvider.ts/noteStore.ts - a class method (`run(): void
// { ... }`) is not one of ENCLOSING_FUNCTION_PATTERNS either. Before the fix this was already a false
// negative (the scan exhausted without a match, since nothing ABOVE this method in the same file
// matches a recognized pattern); the fix makes that an explicit fold-to-abandonment instead of an
// incidental one, and this fixture pins that it stays a fold, not a mis-attribution to some other name
// if the file's shape ever changes.
export class NeverCallsHandlerDirectly {
  run(): void {
    setTimeout(handler, 0);
  }
}
