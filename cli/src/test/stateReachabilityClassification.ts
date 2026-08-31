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
  semantic: 'no-producer', // see UNREACHABLE_SEMANTIC_SCOPES in stateReachability.sources.test.ts.
};

export function fieldsClassified(classification: ObservationFieldClassification): readonly string[] {
  return Object.entries(CLASSIFIED_OBSERVATION_FIELDS)
    .filter(([, value]) => value === classification)
    .map(([field]) => field)
    .sort();
}
