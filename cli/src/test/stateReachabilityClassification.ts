// The single declaration of which `AnalysisObservations` fields have a production producer today.
//
// Shared by two files so they cannot drift apart:
//   - stateReachability.sources.test.ts checks it against a text scan of cli/src (catches any file, any
//     colon-key producer).
//   - stateReachability.integration.test.ts checks it against what a real provider's
//     analysisObservations() actually returns at runtime (catches any producer syntax, but only inside
//     that one method - a shorthand `{ indexing, interruption }` there is exactly what the text scan in
//     the other file cannot see).
// Neither check alone closes the whole gap; together they do; a single shared table is what keeps them
// from silently disagreeing about what "classified" means.

export type ObservationFieldClassification = 'has-producer' | 'no-producer';

export const CLASSIFIED_OBSERVATION_FIELDS: Readonly<Record<string, ObservationFieldClassification>> = {
  indexing: 'has-producer', // LspCallHierarchyProvider.analysisObservations() returns { indexing: this.indexing() }.
  interruption: 'no-producer', // see UNREACHABLE_TRAVERSAL_STATES in stateReachability.sources.test.ts.
  // 2026-09-03 (M4 stage 2, docs/work/task-m4-stage2-fastapi-adapter.md): was 'no-producer' - the source
  // scan's own comment predicted this exact change ("a production producer of `semantic` appeared...
  // move it out of UNREACHABLE_SEMANTIC_SCOPES"). impact.ts's analyzeImpact() now sets
  // `semantic: { scope: 'static-plus-inference', ... }` whenever the `fastapi-static-v1` adapter (or any
  // future adapter) produces at least one augmented edge. `static-plus-observation` remains unreached -
  // no adapter records a runtime trace yet.
  semantic: 'has-producer',
  // LspCallHierarchyProvider.analysisObservations() always returns nullIncomingCallsObserved (defaulting
  // to false), set true the first time incoming() sees a raw `null` (docs/work/task-m2-python-preset.md
  // stage 3).
  nullIncomingCallsObserved: 'has-producer',
  // impact.ts's analyzeImpact() sets this directly (compileDatabase: await inspectCompileDatabase(workspace)),
  // gated on providers/resolve.ts's C_FAMILY_LANGUAGE_IDS - see OBSERVATION_FIELD_PRODUCER below for why
  // this is NOT one of the fields stateReachability.integration.test.ts's per-provider runtime check can
  // see (docs/work/task-m2-clangd-preset.md stage 3).
  compileDatabase: 'has-producer',
  // impact.ts's analyzeImpact() sets this directly when any adapter's own budget (never the static
  // traversal's) runs out (M4 stage 1's "budget/limits leak" decision). Same producer layer as
  // `compileDatabase` and `semantic` above - never inside LspCallHierarchyProvider.analysisObservations().
  augmentationBudgetExceeded: 'has-producer',
  // impact.ts's analyzeImpact() sets this directly when the fastapi-static-v1 adapter finds a route
  // decorator it cannot confirm is mounted (corpus case 3, docs/work/task-m4-stage1-evidence-contract.md).
  // Same producer layer as augmentationBudgetExceeded above.
  augmentationMountUnresolved: 'has-producer',
};

/**
 * Where each `'has-producer'` field's producer actually lives.
 *
 * `stateReachability.integration.test.ts`'s runtime check can only observe
 * `LspCallHierarchyProvider.analysisObservations()` - the ONE method it constructs a real provider and
 * calls. `indexing` and `nullIncomingCallsObserved` both live there, which is why the binary
 * has-producer/no-producer split alone used to be enough: every `'has-producer'` field happened to be
 * one that method returns.
 *
 * `compileDatabase` breaks that coincidence on purpose. It is a workspace-level filesystem fact (does
 * `compile_commands.json` exist, is it stale), not something the LSP wire protocol ever reveals (M2
 * clangd lane stage 1/2 found clangd's own "Failed to find compilation database" message never crosses
 * the protocol - stderr only). A generic `LspCallHierarchyProvider`, which has to work for every LSP
 * server this CLI talks to, has no business knowing about a C/C++-specific concept like a compile
 * database - that would be exactly the wrong layer for this knowledge. So it is produced one layer up,
 * in `impact.ts`'s `analyzeImpact()`, and is real and load-bearing (`fieldsClassified('has-producer')`
 * still includes it, and the source scan below still finds it) without ever appearing in
 * `provider.analysisObservations()`'s return value. `fieldsProducedBy('lsp-provider')` is what the
 * integration test should compare against instead of the raw has-producer list.
 */
export const OBSERVATION_FIELD_PRODUCER: Readonly<Record<string, 'lsp-provider' | 'analyze-caller'>> = {
  indexing: 'lsp-provider',
  nullIncomingCallsObserved: 'lsp-provider',
  compileDatabase: 'analyze-caller',
  // Same reasoning as compileDatabase: a framework adapter is a language/framework-specific concept a
  // generic LspCallHierarchyProvider has no business knowing about, so both are produced one layer up in
  // impact.ts's analyzeImpact(), never inside analysisObservations().
  semantic: 'analyze-caller',
  augmentationBudgetExceeded: 'analyze-caller',
  augmentationMountUnresolved: 'analyze-caller',
};

export function fieldsClassified(classification: ObservationFieldClassification): readonly string[] {
  return Object.entries(CLASSIFIED_OBSERVATION_FIELDS)
    .filter(([, value]) => value === classification)
    .map(([field]) => field)
    .sort();
}

export function fieldsProducedBy(producer: 'lsp-provider' | 'analyze-caller'): readonly string[] {
  return Object.entries(OBSERVATION_FIELD_PRODUCER)
    .filter(([, value]) => value === producer)
    .map(([field]) => field)
    .sort();
}
