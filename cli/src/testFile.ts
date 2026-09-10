import { classifyTestFile, CompiledTestPatterns, isTestFilePath, TestFileClassification } from './shared/testFileClassifier';
import { ImpactRelation, SuppressedTestRule, TestClassificationRule } from './types';

export { isTestFilePath };

/** Projects a `TestFileClassification` into the response contract's `testRule` field
 * (`cli/src/types.ts`'s `TestClassificationRule`). Non-null iff `classification.isTest` - see that
 * type's own doc comment for why a user-include match reports the pattern text as `id` rather than
 * leaving `ruleId`'s stable-identifier meaning open to a value that can change at any time. */
export function toTestRule(classification: TestFileClassification | null): TestClassificationRule | null {
  if (classification?.source === 'default-convention') {
    return { id: classification.ruleId as string, source: 'default-convention' };
  }
  if (classification?.source === 'user-include') {
    return { id: classification.matchedPattern as string, source: 'user-include' };
  }
  return null;
}

/** Projects a `TestFileClassification` into the response contract's `testRuleSuppressed` field
 * (`cli/src/types.ts`'s `SuppressedTestRule`). Non-null iff a user exclude pattern is the reason this
 * node is not `relation: 'test'` - mutually exclusive with `toTestRule()`'s non-null case by
 * construction (`classifyTestFile()` never reports both `source` values for the same input). */
export function toSuppressedTestRule(classification: TestFileClassification | null): SuppressedTestRule | null {
  if (classification?.source !== 'user-exclude') {
    return null;
  }
  return { ruleId: classification.suppressedRuleId, excludePattern: classification.matchedPattern as string };
}

export interface RelationClassification {
  readonly relation: ImpactRelation;
  /** The full classifier result, or null at depth 0 (the root short-circuit below never calls the
   * classifier at all, so there is no classification to report - not even a `'none'` one). */
  readonly classification: TestFileClassification | null;
}

/**
 * Classifies a caller and returns the full classifier result alongside it (IL-LIM-010 stage 1
 * completion, docs/work/task-m4-il-lim-010-stage1-completion.md) - `cli/src/impact.ts` needs both to
 * populate the response's `relation` field (unchanged) and its new `testRule`/`testRuleSuppressed`
 * fields (new) from a single classification pass, rather than computing it twice.
 *
 * `file` must already be workspace-relative when it is inside the workspace (see
 * `./shared/testFileClassifier`'s contract) - callers are responsible for relativizing before calling
 * this, this function does not do it for them. `userPatterns` is optional and forwarded as-is to
 * `classifyTestFile()` - omit it for the pre-existing patternless behavior.
 */
export function classifyRelationDetailed(
  depth: number,
  file: string,
  userPatterns?: CompiledTestPatterns,
): RelationClassification {
  if (depth === 0) {
    // This also happens to be the only thing standing between the classifier and a real typeshed
    // `.pyi` path: reviewer ran bundled pyright directly and confirmed a C-implemented stdlib symbol
    // (`math.sqrt`) resolves its root to `.../pyright/dist/typeshed-fallback/stdlib/math/__init__.pyi`
    // - but only ever at depth 0, since a `.pyi` stub has no function body and can never be an incoming
    // call's caller, so it can never reach this function at any OTHER depth. That is not why this
    // branch exists - it exists so the root node is always `'root'` regardless of its own path - but it
    // is the only thing currently preventing a `.pyi` root from ever reaching the naming-convention
    // classifier below. Do not remove this short-circuit while assuming it is dead code for that reason.
    return { relation: 'root', classification: null };
  }
  const classification = classifyTestFile(file, userPatterns);
  return {
    relation: classification.isTest ? 'test' : depth === 1 ? 'direct' : 'transitive',
    classification,
  };
}

/**
 * Bare-relation convenience wrapper, kept for existing callers/tests that only ever needed the
 * `ImpactRelation` value and predate `testRule`/`testRuleSuppressed`. Behavior is identical to before
 * this lane - patternless, `classifyRelationDetailed()`'s `relation` field verbatim.
 */
export function classifyRelation(depth: number, file: string): ImpactRelation {
  return classifyRelationDetailed(depth, file).relation;
}
