import { handler } from './handler';

// M4 gate 7 real-code measurement (docs/work/task-m4-gate7-budget-and-real-code-measurement.md):
// commander's finding, after PR #99's method-opener fix - an inline arrow argument (`(i) => { ... }`)
// is not one of ENCLOSING_FUNCTION_PATTERNS and is not caught by the new
// UNRECOGNIZED_FUNCTION_LIKE_LINE_OPENER fold either (it has no leading identifier before its
// parameter list the way a named method does), so the backward scan walks straight through it and
// attributes the call to the outer named function - here, `syncOuterCaller`.
//
// KNOWN, ACCEPTED RESIDUAL - unlike PR #99's object-literal-method fix, this is NOT being changed here.
// This specific shape is judged DEFENSIBLE (not the same kind of wrong answer as
// `objectLiteralMethodCallback.ts`'s `createAdapterProvider`): `forEach`'s callback runs SYNCHRONOUSLY,
// within `syncOuterCaller`'s own call - by the time `syncOuterCaller()` returns, this `setTimeout(handler,
// 0)` call has already happened. Calling `syncOuterCaller` genuinely does lead to this call, even though
// the immediate lexical scope (the arrow) is not what gets reported. Contrast with
// `deferredArrowWrapping.ts`, the same shape wrapping a DEFERRED registration instead of a synchronous
// higher-order traversal.
export function syncOuterCaller(items: readonly number[]): void {
  items.forEach((_item) => {
    setTimeout(handler, 0);
  });
}
