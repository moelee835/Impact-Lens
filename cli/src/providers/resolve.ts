import * as path from 'node:path';
import { bundledTypeScriptCommand } from '../runtime';
import { CliError, ProviderCapabilities, ProviderCommand } from '../types';

/**
 * Everything provider selection decides before a process is spawned.
 *
 * Selection is deliberately separate from the LSP session in `lspProvider.ts`: the session owns the
 * protocol, this module owns which executable answers for which language. Nothing here launches a
 * process, reads a configuration file, or touches the filesystem.
 */
export interface ResolvedProvider {
  /** The command the session will spawn. */
  readonly command: ProviderCommand;
  readonly selectedBy: ProviderCapabilities['selectedBy'];
  /** The languageId handed to the provider, which is what `textDocument/didOpen` announces. */
  readonly requestedLanguageId: string;
  /** The languageId derived from the file extension alone. */
  readonly detectedLanguageId: string;
  readonly languageMatch: ProviderCapabilities['languageMatch'];
}

const BUNDLED_LANGUAGE_IDS = ['typescript', 'typescriptreact', 'javascript', 'javascriptreact'];

/**
 * Chooses the provider for `file`.
 *
 * A raw custom command always wins; otherwise the bundled TypeScript server answers, and only for
 * the languages it actually supports. There is no fallback to another language's provider: a
 * TypeScript server pointed at Python would return an empty Call Hierarchy that reads exactly like
 * "nothing calls this", which is the one answer this tool must never fabricate.
 */
export function resolveProvider(file: string, command: ProviderCommand | undefined): ResolvedProvider {
  const detectedLanguageId = languageId(file);
  const selectedBy = command ? 'custom' : 'bundled';
  const actual = command ?? defaultTypeScriptServerCommand(detectedLanguageId);
  const requestedLanguageId = actual.languageId ?? detectedLanguageId;
  // An unrecognized extension carries no claim about the language, so a configured provider is not
  // contradicted by it. That is 'unknown', not a mismatch.
  const languageMatch = detectedLanguageId === 'plaintext'
    ? 'unknown'
    : requestedLanguageId === detectedLanguageId;
  if (languageMatch === false) {
    throw new CliError(
      'provider_language_mismatch',
      `Configured provider languageId ${requestedLanguageId} does not match detected language ${detectedLanguageId}.`,
      5,
      false,
      {
        stage: 'discovery',
        requestedLanguageId,
        detectedLanguageId,
        selectedBy,
      },
    );
  }
  return { command: actual, selectedBy, requestedLanguageId, detectedLanguageId, languageMatch };
}

export function languageId(file: string): string {
  switch (path.extname(file).toLowerCase()) {
    case '.ts': return 'typescript';
    case '.mts': return 'typescript';
    case '.cts': return 'typescript';
    case '.tsx': return 'typescriptreact';
    case '.js': return 'javascript';
    case '.jsx': return 'javascriptreact';
    case '.mjs': return 'javascript';
    case '.cjs': return 'javascript';
    case '.py': return 'python';
    case '.c': return 'c';
    case '.cc': return 'cpp';
    case '.cpp': return 'cpp';
    case '.cxx': return 'cpp';
    case '.hh': return 'cpp';
    case '.hpp': return 'cpp';
    case '.hxx': return 'cpp';
    case '.swift': return 'swift';
    case '.kt': return 'kotlin';
    case '.kts': return 'kotlin';
    default: return 'plaintext';
  }
}

function defaultTypeScriptServerCommand(detectedLanguageId: string): ProviderCommand {
  if (!isTypeScriptFamily(detectedLanguageId)) {
    throw new CliError(
      'provider_required_for_language',
      `No bundled provider supports ${detectedLanguageId}; configure a Language Server provider for this language.`,
      5,
      false,
      {
        stage: 'discovery',
        detectedLanguageId,
        bundledLanguageIds: BUNDLED_LANGUAGE_IDS,
      },
    );
  }
  return bundledTypeScriptCommand(detectedLanguageId);
}

function isTypeScriptFamily(value: string): boolean {
  return BUNDLED_LANGUAGE_IDS.includes(value);
}
