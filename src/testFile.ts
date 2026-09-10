import {
  classifyTestFile,
  CompiledTestPatterns,
  isTestFilePath,
  TestFileClassification,
} from '../cli/dist/shared/testFileClassifier';
import { SuppressedTestRule, TestClassificationRule } from './types';

export { isTestFilePath };

/** Projects a `TestFileClassification` into `ImpactNode.testRule` (`./types`'s `TestClassificationRule`).
 * Mirrors `cli/src/testFile.ts`'s `toTestRule()` exactly - see that function's doc comment for why a
 * user-include match reports the pattern text as `id` rather than `ruleId`. */
export function toTestRule(classification: TestFileClassification | null): TestClassificationRule | null {
  if (classification?.source === 'default-convention') {
    return { id: classification.ruleId as string, source: 'default-convention' };
  }
  if (classification?.source === 'user-include') {
    return { id: classification.matchedPattern as string, source: 'user-include' };
  }
  return null;
}

/** Projects a `TestFileClassification` into `ImpactNode.testRuleSuppressed` (`./types`'s
 * `SuppressedTestRule`). Mirrors `cli/src/testFile.ts`'s `toSuppressedTestRule()` exactly. */
export function toSuppressedTestRule(classification: TestFileClassification | null): SuppressedTestRule | null {
  if (classification?.source !== 'user-exclude') {
    return null;
  }
  return { ruleId: classification.suppressedRuleId, excludePattern: classification.matchedPattern as string };
}

export interface RelationClassification {
  readonly relation: 'root' | 'direct' | 'transitive' | 'test';
  /** The full classifier result, or null at depth 0 (see `classifyRelationDetailed()`'s comment). */
  readonly classification: TestFileClassification | null;
}

/**
 * Classifies a caller and returns the full classifier result alongside it (IL-LIM-010 stage 1
 * completion, docs/work/task-m4-il-lim-010-stage1-completion.md) - `src/impactAnalyzer.ts` needs both
 * to populate `ImpactNode.relation` (unchanged) and its new `testRule`/`testRuleSuppressed` fields
 * (new) from a single classification pass, mirroring `cli/src/testFile.ts`'s identical function.
 *
 * `path` must already be workspace-relative when the file is inside the workspace (see
 * `../cli/dist/shared/testFileClassifier`'s contract) - callers are responsible for relativizing
 * before calling this, this function does not do it for them. `userPatterns` is optional and forwarded
 * as-is to `classifyTestFile()` - omit it for the pre-existing patternless behavior.
 */
export function classifyRelationDetailed(
  depth: number,
  path: string,
  userPatterns?: CompiledTestPatterns,
): RelationClassification {
  if (depth === 0) {
    // See `cli/src/testFile.ts`'s identical branch for why this incidentally (not by design) also
    // shields the classifier from a real typeshed `.pyi` root path - the same reasoning applies here.
    return { relation: 'root', classification: null };
  }
  const classification = classifyTestFile(path, userPatterns);
  return {
    relation: classification.isTest ? 'test' : depth === 1 ? 'direct' : 'transitive',
    classification,
  };
}

/**
 * Bare-relation convenience wrapper, kept for existing callers/tests that only ever needed the
 * relation value and predate `testRule`/`testRuleSuppressed`. Behavior is identical to before this
 * lane - patternless, `classifyRelationDetailed()`'s `relation` field verbatim.
 */
export function classifyImpactRelation(
  depth: number,
  path: string,
): 'root' | 'direct' | 'transitive' | 'test' {
  return classifyRelationDetailed(depth, path).relation;
}
