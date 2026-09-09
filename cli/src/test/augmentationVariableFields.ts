// M4 stage 1's rollback contract (docs/work/task-m4-stage1-evidence-contract.md's Q5 - kill switch),
// generalized past the two FastAPI-only augmentation limitation codes it originally shipped with.
//
// The contract's shape is deliberately an explicit ALLOW-LIST OF WHAT IS PERMITTED TO DIFFER, deleted
// from a clone before comparing everything else - not a hand-picked list of fields asserted equal.
// commander's finding while reviewing the M4 augmentation-failure-isolation lane
// (docs/work/task-m4-augmentation-failure-isolation.md): a hand-picked equal-fields list silently stops
// proving anything about a field nobody remembered to add to it later, while a delete-then-compare-rest
// clone fails loudly the moment a NEW field starts differing that nobody yet named as legitimately
// augmentation-variable. "the static graph survives" is easy to make pass; "nothing outside a named set
// of augmentation fields changed by even one byte" is the stronger, harder-to-satisfy claim this
// contract is actually for.
//
// Shared by pythonFastapiIntegration.test.ts (the full CLI response envelope shape, `{ data: {...} }`
// plus root-level mirrors of `timings`/`limitations`) and augmentationFailureIsolation.test.ts
// (`analyzeImpact()`'s flat return shape - no envelope, since that nesting is added by a layer above
// `analyzeImpact()` itself) so the two never drift into checking the same contract with different
// allow-lists - a reader who only sees one of them would otherwise learn an incomplete version of what
// "augmentation-variable" actually means.

/** Limitation codes a caller may legitimately see appear ONLY because augmentation ran (successfully,
 * finding nothing, or failing) - never because anything about the static analysis itself changed. Every
 * new augmentation-sourced code belongs here the same day it starts being produced, or the rollback
 * contract test using this set silently stops covering it. */
export const AUGMENTATION_LIMITATION_CODES: ReadonlySet<string> = new Set([
  'inferred_edges_included',
  'observed_edges_included',
  'augmentation_budget_exceeded',
  'framework_route_mount_unresolved',
  // M4 augmentation-failure-isolation lane (docs/work/task-m4-augmentation-failure-isolation.md):
  // an adapter's run() throwing, or runAugmentation() itself throwing outside any adapter's control.
  'augmentation_adapter_failed',
  'augmentation_internal_error',
]);

function stripLimitationCodes(codes: unknown): unknown {
  return Array.isArray(codes) ? codes.filter(code => !AUGMENTATION_LIMITATION_CODES.has(code as string)) : codes;
}

/**
 * Strips every field legitimately allowed to differ from `analyzeImpact()`'s FLAT return shape (no
 * `data` envelope). Everything else must compare byte-for-byte equal between an augmentation-off result
 * and an augmentation-on result, regardless of whether augmentation succeeded, found nothing, or failed.
 *
 * `pythonFastapiIntegration.test.ts`'s own `stripAugmentationVariableFields()` handles the full response
 * envelope (root-level `timings`/`limitations` mirrors on top of this same flat shape nested under
 * `data`) - that envelope-specific handling stays there since `analyzeImpact()` itself never produces an
 * envelope, but both functions strip the same `AUGMENTATION_LIMITATION_CODES` set from limitation
 * arrays, and the same `analyzedAt`/`timings`/`augmentedEdges`/`semanticScope`/`semantic` fields.
 */
export function stripAugmentationVariableFieldsFlat(result: Record<string, unknown>): Record<string, unknown> {
  const clone = JSON.parse(JSON.stringify(result)) as Record<string, unknown>;
  delete clone.augmentedEdges;
  // Always volatile, unrelated to augmentation - excluded for the same reason M4 stage 1 excluded them
  // from the kill-switch definition (never decisive, never worth comparing).
  delete clone.analyzedAt;
  delete clone.timings;
  // Expected to change: the M1-designed signal for exactly this ("provider-static" vs.
  // "static-plus-inference"/"static-plus-observation").
  const completion = clone.completion as Record<string, unknown> | undefined;
  if (completion) {
    delete completion.semanticScope;
  }
  const coverage = clone.coverage as Record<string, unknown> | undefined;
  if (coverage) {
    delete coverage.semantic;
  }
  if (Array.isArray(clone.limitations)) {
    clone.limitations = stripLimitationCodes(clone.limitations);
  }
  if (Array.isArray(clone.limitationDetails)) {
    clone.limitationDetails = (clone.limitationDetails as Array<{ code: string }>).filter(
      detail => !AUGMENTATION_LIMITATION_CODES.has(detail.code),
    );
  }
  // `data.limitations` and `coverage.reasons` are the same array (coverage.ts's own invariant, shared
  // with the envelope-shape helper's identical comment) - strip both rather than asserting exact
  // membership, since this helper's job is every OTHER field, not re-proving which codes augmentation is
  // allowed to add.
  if (coverage && Array.isArray(coverage.reasons)) {
    coverage.reasons = stripLimitationCodes(coverage.reasons);
  }
  return clone;
}
