/**
 * Pure shape validation for `.impact-lens/test-patterns.json`/`.local.json` (IL-LIM-010 stage 1
 * completion, docs/work/task-m4-il-lim-010-stage1-completion.md). Shared by both hosts' file-reading
 * code (`cli/src/testPatternsConfig.ts`, `src/testPatternsStore.ts`) so "is this document shape valid"
 * has exactly one answer, computed in exactly one place.
 *
 * reviewer's finding: before this module existed, each host had its own hand-copied
 * `validateShape()`/`optionalStringArray()`, and nothing proved the two agreed - the same "same
 * classifier, different validation" gap PR #91 measured and fixed for path classification itself
 * (`testFileClassifier.ts`), reopened one file over for the settings that feed it. Extracting the
 * validation into a shared, dependency-free function (matching this repository's own precedent -
 * `compileTestPatterns()`/`classifyTestFile()` are shared for the identical reason) removes the class
 * of bug outright instead of merely testing that two independent copies happen to still agree.
 *
 * File I/O and the origin string used in error messages stay host-specific (Node `fs` vs
 * `vscode.workspace.fs`, `CliError` vs a plain `Error`) - only the JSON-shape question moves here. No
 * npm runtime dependency, matching every other module under `cli/src/shared/**` (VSIX require-boundary).
 */

export const TEST_PATTERNS_DOCUMENT_ALLOWED_FIELDS = ['include', 'exclude'] as const;

export interface RawTestPatternsDocument {
  readonly include: readonly string[];
  readonly exclude: readonly string[];
}

/** Thrown by `validateTestPatternsDocumentShape()` for a document that is not a valid
 * `{include?, exclude?}` shape. `field` is set only for a field-specific problem. Callers turn this
 * into a host-appropriate visible failure - never catch and silently substitute an empty document. */
export class InvalidTestPatternsDocumentError extends Error {
  constructor(
    message: string,
    readonly field?: string,
  ) {
    super(message);
    this.name = 'InvalidTestPatternsDocumentError';
  }
}

function validateStringArray(value: unknown, field: string): readonly string[] {
  if (value === undefined) {
    return [];
  }
  if (!Array.isArray(value) || !value.every(entry => typeof entry === 'string')) {
    throw new InvalidTestPatternsDocumentError(`field "${field}" must be an array of strings.`, field);
  }
  return value;
}

/**
 * Validates an already-JSON-parsed value against the `{include?: string[], exclude?: string[]}` shape.
 * Does not touch pattern SYNTAX (that is `compileTestPatterns()`'s job, in `testFileClassifier.ts`) -
 * only the document's own shape: it must be a plain object, use only `include`/`exclude`, and each
 * present field must be an array of strings. A missing field defaults to an empty array, not an error.
 */
export function validateTestPatternsDocumentShape(parsed: unknown): RawTestPatternsDocument {
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new InvalidTestPatternsDocumentError('it must contain a JSON object.');
  }
  const value = parsed as Record<string, unknown>;
  const unknownFields = Object.keys(value).filter(
    key => !(TEST_PATTERNS_DOCUMENT_ALLOWED_FIELDS as readonly string[]).includes(key),
  );
  if (unknownFields.length > 0) {
    throw new InvalidTestPatternsDocumentError(
      `it has unknown fields: ${unknownFields.sort().join(', ')}. Allowed fields: `
      + `${TEST_PATTERNS_DOCUMENT_ALLOWED_FIELDS.join(', ')}.`,
    );
  }
  return {
    include: validateStringArray(value.include, 'include'),
    exclude: validateStringArray(value.exclude, 'exclude'),
  };
}
