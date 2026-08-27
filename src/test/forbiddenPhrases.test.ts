import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import test from 'node:test';
import {
  analysisStateLabel,
  CompletenessInput,
  headerSegments,
  indexingLabel,
  noProviderSummary,
  resultCountLabel,
  semanticScopeLabel,
  STATIC_SCOPE_NOTICE,
  stateBadge,
  summarizeCompleteness,
  traversalLabel,
} from '../completeness';

// docs/work/task-m1-state-truth-table.md 2.3 forbids these in every state, and the Wave 0 handover repeats
// the list as a hard rule. A rule that only lives in a document is a rule that a future edit breaks
// silently, so it is checked twice here: once against every sentence the state machine can produce, and
// once against the source text of every file that can reach a user surface.
//
// Each entry is a regular expression rather than a substring so that word boundaries are respected: a
// future "unusedLocals" or "no impactful change" should not fail the check, but "unused" as a verdict must.
const FORBIDDEN: ReadonlyArray<readonly [string, RegExp]> = [
  ['no impact', /\bno impact\b/i],
  ['safe to change', /\bsafe to change\b/i],
  ['unused', /\bunused\b/i],
  ['fully analyzed', /\bfully analy[sz]ed\b/i],
  ['complete analysis', /\bcomplete analysis\b/i],
  ['all callers', /\ball callers\b/i],
  // Korean equivalents. The product surface is English today, but the rule is about the claim, not the
  // language, and the plugin/doc surfaces around this code are Korean.
  ['영향 없음', /영향\s*없(음|다|습니다)/],
  ['안전하게 변경', /안전하게\s*변경/],
  ['모든 호출자', /모든\s*호출자/],
  ['사용되지 않음', /사용되지\s*않(음|는다|습니다)/],
];

function assertClean(label: string, value: string): void {
  for (const [name, pattern] of FORBIDDEN) {
    assert.ok(!pattern.test(value), `${label} contains the forbidden phrase "${name}": ${value}`);
  }
}

function input(overrides: Partial<CompletenessInput> = {}): CompletenessInput {
  return {
    callerCount: 3,
    truncated: false,
    traversalLimits: [],
    requestedDepth: 5,
    reachedDepth: 2,
    maxNodes: 120,
    analysisState: 'current',
    traversalStatus: 'complete',
    semanticStatus: 'static-only',
    indexingStatus: 'unknown',
    reasons: [],
    ...overrides,
  };
}

test('no reachable analysis state produces a forbidden phrase', () => {
  const cases: CompletenessInput[] = [];
  for (const analysisState of ['current', 'stale', 'analyzing', 'partial', 'failed'] as const) {
    for (const traversalStatus of ['complete', 'depth-limited', 'node-limited', 'timeout', 'failed'] as const) {
      for (const indexingStatus of ['ready', 'working', 'unknown'] as const) {
        for (const semanticStatus of ['static-only', 'augmented'] as const) {
          for (const traversalLimits of [[], ['depth'], ['nodes'], ['depth', 'nodes']] as const) {
            for (const callerCount of [0, 1, 42]) {
              cases.push(input({
                analysisState,
                traversalStatus,
                indexingStatus,
                semanticStatus,
                traversalLimits: [...traversalLimits] as CompletenessInput['traversalLimits'],
                truncated: traversalLimits.length > 0,
                callerCount,
              }));
            }
          }
        }
      }
    }
  }
  assert.ok(cases.length > 500, 'the matrix should cover every reachable combination');

  for (const value of cases) {
    const summary = summarizeCompleteness(value);
    assertClean(`${summary.outcome} headline`, summary.headline);
    assertClean(`${summary.outcome} action`, summary.action ?? '');
    assertClean(`${summary.outcome} badge`, stateBadge(value).label);
    assertClean(`${summary.outcome} traversal`, traversalLabel(value));
    assertClean(`${summary.outcome} count`, resultCountLabel(value.callerCount));
    for (const segment of headerSegments(value, summary)) {
      assertClean(`${summary.outcome} segment`, segment);
    }
  }

  assertClean('no-provider headline', noProviderSummary('typescript').headline);
  assertClean('no-provider action', noProviderSummary().action ?? '');
  assertClean('static scope notice', STATIC_SCOPE_NOTICE);
  for (const state of ['current', 'stale', 'analyzing', 'partial', 'failed', undefined] as const) {
    assertClean('state label', analysisStateLabel(state));
  }
  for (const status of ['ready', 'working', 'unknown'] as const) {
    assertClean('indexing label', indexingLabel(status));
  }
  for (const status of ['static-only', 'augmented'] as const) {
    assertClean('semantic label', semanticScopeLabel(status));
  }
});

// The generated-string check above only covers strings this module owns. Anything typed directly into a
// tree item, a status bar tooltip or the graph webview would slip past it, so the shipped source text is
// scanned as well. `src/test` is excluded because this file has to contain the list it forbids.
test('no shipped source file contains a forbidden phrase', () => {
  const root = path.resolve(__dirname, '..', '..');
  const sourceRoot = path.join(root, 'src');
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
      if (entry.name.endsWith('.ts')) {
        files.push(full);
      }
    }
  };
  walk(sourceRoot);
  files.push(path.join(root, 'package.json'));
  assert.ok(files.length > 10, 'the scan should find the Extension sources');

  for (const file of files) {
    assertClean(path.relative(root, file), fs.readFileSync(file, 'utf8'));
  }
});
