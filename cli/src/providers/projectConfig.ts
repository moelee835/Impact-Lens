import * as fs from 'node:fs';
import * as path from 'node:path';
import { assertPlainJsonObject, providerConfigInvalid } from './manifest';
import { JsonObject, ProviderOverride } from './preset';

/**
 * The trusted project choice: what a workspace records about which provider it wants.
 *
 * This is the third tier of the selection order, above auto-discovery and below an explicit preset.
 * It exists so that a repository can say "this project is served by X" once instead of every caller
 * repeating it, which is what turns a working setup into a reproducible one.
 *
 * The file is read, never written. Nothing in it is executed at read time.
 */
export const PROJECT_PROVIDER_CONFIG_PATH = '.impact-lens/provider.json';

const ALLOWED_FIELDS = ['presetId', 'command', 'args', 'languageId', 'initializationOptions', 'settings'];

export interface ProjectProviderChoice extends ProviderOverride {
  /** Relative, for error details. An absolute path here would leak the machine layout into output. */
  readonly source: string;
}

/**
 * Reads `<workspace>/.impact-lens/provider.json` if it exists.
 *
 * A missing file is not an error: most projects will not have one. A file that exists but cannot be
 * understood *is* an error, and it is reported as `provider_config_invalid` rather than
 * `invalid_request`. The distinction is the whole reason that code exists — telling someone their
 * request is malformed when the problem is a committed configuration file points them at the wrong
 * thing to fix, and a tool whose purpose is accurate reporting must not misdirect its own diagnosis.
 */
export function readProjectProviderChoice(workspace: string): ProjectProviderChoice | undefined {
  const file = path.join(workspace, ...PROJECT_PROVIDER_CONFIG_PATH.split('/'));
  let text: string;
  try {
    text = fs.readFileSync(file, 'utf8');
  } catch {
    return undefined;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (error) {
    throw providerConfigInvalid(
      `${PROJECT_PROVIDER_CONFIG_PATH} is not valid JSON.`,
      {
        origin: PROJECT_PROVIDER_CONFIG_PATH,
        // The parser message quotes offsets, not content, so it is safe to pass through and it is the
        // only thing that makes a syntax error findable.
        reason: error instanceof Error ? error.message : 'parse failed',
      },
    );
  }
  return validate(parsed);
}

function validate(parsed: unknown): ProjectProviderChoice {
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw providerConfigInvalid(`${PROJECT_PROVIDER_CONFIG_PATH} must contain a JSON object.`, {
      origin: PROJECT_PROVIDER_CONFIG_PATH,
    });
  }
  const value = parsed as Record<string, unknown>;
  const unknown = Object.keys(value).filter(key => !ALLOWED_FIELDS.includes(key));
  if (unknown.length > 0) {
    throw providerConfigInvalid(
      `${PROJECT_PROVIDER_CONFIG_PATH} has unknown fields: ${unknown.sort().join(', ')}`,
      { origin: PROJECT_PROVIDER_CONFIG_PATH, allowedFields: ALLOWED_FIELDS },
    );
  }
  const presetId = optionalString(value.presetId, 'presetId');
  const command = optionalString(value.command, 'command');
  if (presetId === undefined && command === undefined) {
    throw providerConfigInvalid(
      `${PROJECT_PROVIDER_CONFIG_PATH} must name a presetId or a command.`,
      { origin: PROJECT_PROVIDER_CONFIG_PATH, allowedFields: ALLOWED_FIELDS },
    );
  }
  if (command !== undefined && path.isAbsolute(command)) {
    // A committed project file is shared by every machine that checks the repository out, so an
    // absolute path in it is guaranteed to be wrong somewhere. The escape hatch is the request-level
    // provider block, which is per-invocation and not committed.
    throw providerConfigInvalid(
      `${PROJECT_PROVIDER_CONFIG_PATH} may not use an absolute command path.`,
      { origin: PROJECT_PROVIDER_CONFIG_PATH, field: 'command' },
    );
  }
  return {
    source: PROJECT_PROVIDER_CONFIG_PATH,
    presetId,
    command,
    args: optionalStringArray(value.args, 'args'),
    languageId: optionalString(value.languageId, 'languageId'),
    initializationOptions: optionalTree(value.initializationOptions, 'initializationOptions'),
    settings: optionalTree(value.settings, 'settings'),
  };
}

function optionalString(value: unknown, field: string): string | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (typeof value !== 'string' || value.length === 0) {
    throw providerConfigInvalid(
      `${PROJECT_PROVIDER_CONFIG_PATH} field ${field} must be a non-empty string.`,
      { origin: PROJECT_PROVIDER_CONFIG_PATH, field },
    );
  }
  return value;
}

function optionalStringArray(value: unknown, field: string): readonly string[] | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (!Array.isArray(value) || !value.every(entry => typeof entry === 'string')) {
    throw providerConfigInvalid(
      `${PROJECT_PROVIDER_CONFIG_PATH} field ${field} must be an array of strings.`,
      { origin: PROJECT_PROVIDER_CONFIG_PATH, field },
    );
  }
  return value as readonly string[];
}

function optionalTree(value: unknown, field: string): JsonObject | undefined {
  return value === undefined
    ? undefined
    : assertPlainJsonObject(value, `${PROJECT_PROVIDER_CONFIG_PATH} field ${field}`);
}
