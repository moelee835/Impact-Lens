import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import test from 'node:test';
import { CLASSIFIED_OBSERVATION_FIELDS } from './stateReachabilityClassification';

// Pins the five completion states the reachability work document declares NOT YET reachable, and the
// production-producer status of every `AnalysisObservations` field, the same way
// `CONTRACT_ONLY_ERROR_CODES` pins error codes nothing throws yet (see the comment at the top of
// `cli/src/errors.ts`). That mechanism is not decorative: it stopped the build in W2-A the moment
// `provider_not_ready` gained its first `new CliError(...)` call and had to move out of the contract-only
// list. This file is the same technique applied to `AnalysisObservations.interruption` and `.semantic`.
//
// The check here is textual - it proves no non-test file under cli/src ASSIGNS these fields as an
// object-literal key (`interruption: ...`, `semantic: ...`), not that no code path could ever produce one
// by some other means. A shorthand producer (`return { indexing, interruption };`) would slip past this
// scan. `stateReachability.integration.test.ts` closes that specific residual gap with a runtime check
// against what `LspCallHierarchyProvider.analysisObservations()` actually returns, which is shape-
// independent; the two together cover "any file" (this scan) and "any syntax inside that one method" (the
// runtime check). What remains uncovered after both is narrower still: a shorthand producer written
// somewhere other than `analysisObservations()` that never reaches it - equivalent to `index.ts` handing
// `analyzeImpact` an observations argument directly, which the reachability tests would only miss if none
// of their scenarios exercised it.

function nonTestSources(): readonly string[] {
  const root = path.resolve(__dirname, '..', '..', 'src');
  const files: string[] = [];
  const walk = (directory: string): void => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const full = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        if (entry.name !== 'test') {
          walk(full);
        }
        continue;
      }
      // types.ts declares the `AnalysisObservations` interface itself; counting its own field declarations
      // as "producers" would make both this check and the field-inventory check below tautological, the
      // same reason errors.test.ts excludes errors.ts.
      if (entry.isFile() && entry.name.endsWith('.ts') && entry.name !== 'types.ts') {
        files.push(full);
      }
    }
  };
  walk(root);
  return files;
}

function readSources(files: readonly string[]): string {
  return files.map(file => fs.readFileSync(file, 'utf8')).join('\n');
}

/** True when `field: ` appears as an object-literal key anywhere in `sources`. */
function hasColonKeyProducer(field: string, sources: string): boolean {
  return new RegExp(`\\b${field}\\s*:`).test(sources);
}

const UNREACHABLE_TRAVERSAL_STATES = [
  {
    traversalStatus: 'timeout',
    reason: 'projectCompletion can produce partial/timeout, but nothing calls analyzeImpact with observations.interruption: "timeout"; a request timeout propagates as a thrown exception today instead of a preserved partial result.',
    story: 'IL-LIM-008, accepted for M5 (large-workspace partial-result preservation)',
  },
  {
    traversalStatus: 'cancelled',
    reason: 'same gap as timeout: nothing sends observations.interruption: "cancelled" in production, because bounded cancellation with partial-result preservation is not implemented yet.',
    story: 'IL-LIM-008, accepted for M5',
  },
  {
    traversalStatus: 'failed',
    reason: 'a provider failure mid-traversal propagates as a thrown CliError today; nothing catches it and reports observations.interruption: "provider-failed" with the partial graph collected so far.',
    story: 'IL-LIM-008, accepted for M5',
  },
] as const;

const UNREACHABLE_SEMANTIC_SCOPES = [
  {
    semanticScope: 'static-plus-inference',
    reason: 'no code path infers edges (dependency injection, decorators, etc.) and reports them as observations.semantic; the only semantic evidence a real run produces is the static call hierarchy itself.',
    story: 'IL-LIM-001, accepted for M4 (augmented evidence from static inference)',
  },
  {
    semanticScope: 'static-plus-observation',
    reason: 'no code path records a runtime trace and reports it as observations.semantic; runtime observation evidence does not exist in the product yet.',
    story: 'IL-LIM-002, accepted for M4 (augmented evidence from runtime observation)',
  },
] as const;

test('the source scan actually reads the real CLI sources (not a vacuous pass)', () => {
  const sources = readSources(nonTestSources());
  assert.ok(sources.includes('AnalysisObservations'), 'expected to have read the real CLI sources');
});

test('nothing outside tests and types.ts assigns AnalysisObservations.interruption', () => {
  const sources = readSources(nonTestSources());
  assert.equal(
    hasColonKeyProducer('interruption', sources),
    false,
    'a production producer of `interruption` appeared. That means one or more of the timeout/cancelled/' +
    'failed traversal states declared unreachable in this file are now reachable - move the newly-reached ' +
    'state(s) from UNREACHABLE_TRAVERSAL_STATES here into SHIPPED_CATALOG_REACHABLE or ' +
    'USER_CONFIGURED_ADDITIONAL_REACHABLE in stateReachability.integration.test.ts in the same change, per ' +
    'IL-LIM-008.',
  );
  // Every declared-unreachable traversal state's reason rests on this same fact; if it were false the
  // reasons above would be wrong, not just untested.
  assert.equal(UNREACHABLE_TRAVERSAL_STATES.length, 3);
});

test('nothing outside tests and types.ts assigns AnalysisObservations.semantic', () => {
  const sources = readSources(nonTestSources());
  assert.equal(
    hasColonKeyProducer('semantic', sources),
    false,
    'a production producer of `semantic` appeared. That means static-plus-inference or ' +
    'static-plus-observation is now reachable - move it out of UNREACHABLE_SEMANTIC_SCOPES here into a ' +
    'reachable list in stateReachability.integration.test.ts in the same change, per IL-LIM-001/002.',
  );
  assert.equal(UNREACHABLE_SEMANTIC_SCOPES.length, 2);
});

// ---------------------------------------------------------------------------
// Field-level producer inventory (R5): every field AnalysisObservations declares must be classified, so an
// added field that nobody classifies fails loudly instead of silently reading as "fine".
// ---------------------------------------------------------------------------

function analysisObservationsFields(): readonly string[] {
  const typesSource = fs.readFileSync(path.resolve(__dirname, '..', '..', 'src', 'types.ts'), 'utf8');
  const match = /interface AnalysisObservations\s*\{([\s\S]*?)\n\}/.exec(typesSource);
  assert.ok(match, 'expected to find the AnalysisObservations interface in types.ts');
  const body = match![1]!;
  const fields = [...body.matchAll(/readonly\s+(\w+)\s*\??:/g)].map(m => m[1]!);
  assert.ok(fields.length > 0, 'expected to find at least one field in AnalysisObservations');
  return fields;
}

test('every AnalysisObservations field is classified as having a production producer or not', () => {
  const declaredFields = analysisObservationsFields();
  assert.deepEqual(
    [...declaredFields].sort(),
    Object.keys(CLASSIFIED_OBSERVATION_FIELDS).sort(),
    'AnalysisObservations gained or lost a field that this test has not classified. Add it to ' +
    'CLASSIFIED_OBSERVATION_FIELDS (stateReachabilityClassification.ts) as "has-producer" or ' +
    '"no-producer" and back that classification with the source scan below and the runtime check in ' +
    'stateReachability.integration.test.ts (or with a new reachable-state row there if it now has a ' +
    'producer).',
  );
});

test('the has-producer/no-producer classification matches what the sources actually show', () => {
  const sources = readSources(nonTestSources());
  for (const [field, classification] of Object.entries(CLASSIFIED_OBSERVATION_FIELDS)) {
    assert.equal(
      hasColonKeyProducer(field, sources),
      classification === 'has-producer',
      `AnalysisObservations.${field} is classified "${classification}" but the source scan ` +
      `${classification === 'has-producer' ? 'found no producer for it' : 'found a producer for it'}.`,
    );
  }
});
