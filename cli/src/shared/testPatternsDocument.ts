import { CompiledTestPatterns } from './testFileClassifier';

/**
 * Pure shape validation (and, below, precedence) for `.impact-lens/test-patterns.json`/`.local.json`
 * (IL-LIM-010 stage 1 completion, docs/work/task-m4-il-lim-010-stage1-completion.md). Shared by both
 * hosts' file-reading code (`cli/src/testPatternsConfig.ts`, `src/testPatternsStore.ts`) so "is this
 * document shape valid" and "how do the shared and local files combine" each have exactly one answer,
 * computed in exactly one place.
 *
 * reviewer's finding (round 1): before this module existed, each host had its own hand-copied
 * `validateShape()`/`optionalStringArray()`, and nothing proved the two agreed - the same "same
 * classifier, different validation" gap PR #91 measured and fixed for path classification itself
 * (`testFileClassifier.ts`), reopened one file over for the settings that feed it.
 *
 * reviewer's finding (round 2): even after that fix, the two hosts' `[...shared.x, ...local.x]` UNION
 * spread was still independently copy-pasted in each host's own `readProjectTestPatterns()`/`load()` -
 * a plain array spread looks too small to bother sharing, but it silently carries a real decision (see
 * `unionTestPatternsDocuments()` below), and this repository's own PR #91 already showed that "two
 * independently-written copies of one rule, unenforced" is exactly the shape that drifts. Moved here
 * for the same reason as the shape validator above - it removes the class of bug outright instead of
 * merely proving today's two copies agree.
 *
 * File I/O and the origin string used in error messages stay host-specific (Node `fs` vs
 * `vscode.workspace.fs`, `CliError` vs a plain `Error`) - only the JSON-shape and precedence questions
 * move here. No npm runtime dependency, matching every other module under `cli/src/shared/**` (VSIX
 * require-boundary) - the only other shared module this one imports, `testFileClassifier.ts`, has none
 * either, so this stays within the same boundary.
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

/**
 * Combines the shared (committed, project-wide) and local (personal override) compiled test-pattern
 * documents into one. This is a UNION, not an override, and that is a decision, not an implementation
 * detail: a personal `test-patterns.local.json` exclude must never silently drop the whole shared
 * `test-patterns.json` include list (or vice versa) just because both files happen to exist - a
 * project-wide convention and a personal addition to it are not in conflict merely by both existing.
 *
 * This deliberately differs from `cli/src/notes.ts`'s local/shared note layers, which DO override each
 * other (`local` wins outright when both are set) - a function note is a single value with one right
 * answer per symbol, so "which one wins" is the only sensible question. A set of test patterns is
 * closer to a firewall rule set: both sources' rules should all apply, and there is no single "the"
 * pattern to pick between.
 *
 * Callers are expected to compile `shared` and `local` SEPARATELY before calling this (never merge the
 * raw pattern-string arrays first) - that is what lets an invalid pattern's error name the actual file
 * it came from instead of an ambiguous merged origin. This function only combines two already-compiled,
 * already-valid results.
 */
export function unionTestPatternsDocuments(
  shared: CompiledTestPatterns,
  local: CompiledTestPatterns,
): CompiledTestPatterns {
  return {
    include: [...shared.include, ...local.include],
    exclude: [...shared.exclude, ...local.exclude],
  };
}
