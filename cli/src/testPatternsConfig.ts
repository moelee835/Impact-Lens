import * as fs from 'node:fs';
import * as path from 'node:path';
import { CliError } from './errors';
import { CompiledTestPatterns, compileTestPatterns, InvalidTestPatternError } from './shared/testFileClassifier';
import {
  InvalidTestPatternsDocumentError,
  RawTestPatternsDocument,
  TEST_PATTERNS_DOCUMENT_ALLOWED_FIELDS,
  unionTestPatternsDocuments,
  validateTestPatternsDocumentShape,
} from './shared/testPatternsDocument';

/**
 * Two committed/personal workspace files, read by BOTH hosts (IL-LIM-010 stage 1 completion, docs/work/
 * task-m4-il-lim-010-stage1-completion.md's "설정 소스" section). Modeled directly on
 * `cli/src/notes.ts`'s `sharedPath`/`localPath` pair - a project-wide convention plus a personal
 * override, not a host-specific setting. This is deliberate: giving Extension and CLI different input
 * sources for the classifier would reopen exactly the divergence PR #91 measured and fixed one layer
 * down (two hosts, same classifier, different answers) - see the work document for the full argument.
 */
export const SHARED_TEST_PATTERNS_PATH = '.impact-lens/test-patterns.json';
export const LOCAL_TEST_PATTERNS_PATH = '.impact-lens/test-patterns.local.json';

/**
 * `.impact-lens/test-patterns.json` in either workspace file is not itself a `CliError` - it is created
 * here, next to the module that actually reads the file, following this repository's own convention
 * (`providerConfigInvalid()` lives in `providers/manifest.ts`, a provider-domain module, not in the
 * generic `errors.ts` taxonomy file). Deliberately does NOT set `details.stage`: this read happens
 * before any provider lifecycle stage begins, and `docs/development-management/provider-coverage-
 * contract.md`'s own rule is that `details.stage` only appears when the throw site actually knows a
 * lifecycle stage.
 */
function testPatternConfigInvalid(problem: string, details: Record<string, unknown> & { readonly origin: string }): CliError {
  return new CliError(
    'test_pattern_config_invalid',
    `The test pattern configuration in ${details.origin} is not valid: ${problem}`,
    8,
    false,
    {
      ...details,
      action: 'Fix the test pattern configuration, or remove it to fall back to the default test-file classification rules.',
    },
  );
}

function asCliError(error: InvalidTestPatternsDocumentError, origin: string): CliError {
  return testPatternConfigInvalid(error.message, {
    origin,
    ...(error.field ? { field: error.field } : {}),
    allowedFields: TEST_PATTERNS_DOCUMENT_ALLOWED_FIELDS,
  });
}

/** A missing file is not an error - most projects will have neither file. A file that exists but
 * cannot be understood IS an error (same reasoning as `readProjectProviderChoice()`'s own doc comment:
 * telling someone their request is malformed when the problem is a committed file misdirects them). */
function readRaw(workspace: string, relativePath: string): RawTestPatternsDocument {
  const file = path.join(workspace, ...relativePath.split('/'));
  let text: string;
  try {
    text = fs.readFileSync(file, 'utf8');
  } catch {
    return { include: [], exclude: [] };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (error) {
    throw testPatternConfigInvalid('it is not valid JSON.', {
      origin: relativePath,
      reason: error instanceof Error ? error.message : 'parse failed',
    });
  }
  try {
    return validateTestPatternsDocumentShape(parsed);
  } catch (error) {
    if (error instanceof InvalidTestPatternsDocumentError) {
      throw asCliError(error, relativePath);
    }
    throw error;
  }
}

function readAndCompileOne(workspace: string, relativePath: string): CompiledTestPatterns {
  const raw = readRaw(workspace, relativePath);
  try {
    return compileTestPatterns(raw.include, raw.exclude);
  } catch (error) {
    if (error instanceof InvalidTestPatternError) {
      throw testPatternConfigInvalid(
        `its "${error.field}" list contains an unsupported pattern: ${error.message}`,
        { origin: relativePath, field: error.field, pattern: error.pattern },
      );
    }
    throw error;
  }
}

/**
 * Reads and compiles both workspace test-pattern files, then unions them via
 * `unionTestPatternsDocuments()` (see that function's own doc comment for why this is a union, not an
 * override - that decision now lives beside its only implementation, not duplicated in each host's file
 * next to a plain array spread). Compiles each file separately before merging so an invalid pattern's
 * error always names the ACTUAL file it came from, not a merged, ambiguous origin.
 *
 * Never throws for a missing file (the common case - most projects have neither file). Throws
 * `CliError('test_pattern_config_invalid', ...)` for a file that exists but is malformed or uses
 * unsupported glob syntax - callers must let this propagate as a request failure, not catch and
 * silently proceed with a smaller pattern set (that is exactly the "quiet drop" this lane's user
 * pattern feature exists to avoid inflicting on itself).
 */
export function readProjectTestPatterns(workspace: string): CompiledTestPatterns {
  const shared = readAndCompileOne(workspace, SHARED_TEST_PATTERNS_PATH);
  const local = readAndCompileOne(workspace, LOCAL_TEST_PATTERNS_PATH);
  return unionTestPatternsDocuments(shared, local);
}
