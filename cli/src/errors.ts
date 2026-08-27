// Every `error.code` the CLI can put in an `ok: false` envelope, in exit-status order.
//
// The list holds only codes that some line in `cli/src` actually throws today. Codes the contract declares
// but nothing throws live in `CONTRACT_ONLY_ERROR_CODES` below. Adding one of those here would declare a
// code no code produces, which is the same declaration/implementation drift this module exists to prevent.
// The lane that implements each one moves it between the two lists in the same change, and
// `cli/src/test/errors.test.ts` enforces the move in both directions.
//
// Reason codes (`dynamic_calls_not_inferred`, `depth_limit_reached`, `no_incoming_callers`, ...) are a
// different concept and deliberately stay out of this union. A reason is an entry in `coverage.reasons`
// and `limitations` on a *successful* response; an error code identifies a *failed* envelope. Mixing them
// would let `error.code` accept a reason and compile.
//
// Runner-stage codes (`node_runtime_unavailable`, `cli_artifact_missing`, `cli_artifact_not_executable`,
// `npm_runtime_unavailable`, and the release-fallback codes) are absent for a different reason: they are
// emitted by the POSIX shell runner in `plugins/impact-lens/scripts/run-impact-lens` before Node starts,
// so no TypeScript value can carry them.
export const CLI_ERROR_CODES = [
  // exit 2 - invalid command or request
  'invalid_command',
  'invalid_request',
  'workspace_escape',
  'unsupported_uri',
  'unsupported_note_language',
  // exit 3 - missing or ambiguous target
  'target_not_found',
  'target_ambiguous',
  'workspace_not_found',
  // exit 4 - conflict or invalid note document
  'conflict',
  'invalid_note_document',
  'expected_token_required',
  // exit 5 - provider unavailable or missing Call Hierarchy support
  'provider_required_for_language',
  'provider_language_mismatch',
  'provider_launch_failed',
  'provider_initialize_failed',
  'provider_capability_missing',
  'provider_query_failed',
  // Produced by `cli/src/jsonRpc.ts:JsonRpcClient.stageFailure` when a stage fails after this client
  // refused a server -> client request it does not implement. It replaces the stage's own code so the
  // envelope names the cause instead of the symptom.
  'provider_protocol_incompatible',
  'provider_ipc_unavailable',
  'bundled_provider_artifact_missing',
  'bundled_provider_artifact_unreadable',
  'bundled_provider_artifact_corrupt',
  // exit 6 - timeout
  'timeout',
  // exit 7 - unsupported CLI Node.js runtime
  'node_version_unsupported',
  // exit 10 - unexpected CLI error
  'internal_error',
] as const;

export type CliErrorCode = (typeof CLI_ERROR_CODES)[number];

/**
 * Codes `docs/development-management/provider-coverage-contract.md` declares that no line of `cli/src`
 * throws yet.
 *
 * This used to be a sentence in the comment above, which meant nothing checked it: a lane could start
 * throwing one of these codes and the prose would stay true-looking while the union stayed wrong. As an
 * array it is checkable in both directions, and `cli/src/test/errors.test.ts` does check it:
 *
 * - a code may not appear in both lists;
 * - a code here may not be handed to `new CliError(...)` anywhere in `cli/src`.
 *
 * So the moment an implementing lane throws one of these, the build fails until the code is moved into
 * `CLI_ERROR_CODES` — which is the change that also gives it an exit status.
 *
 * The check looks for the `new CliError('<code>'` construction rather than the bare string because reason
 * codes and error codes deliberately share names: `provider_not_ready` is both a `coverage.reasons` entry on
 * a partial success and an error code on a failure, and `cli/src/coverage.ts` writes the reason today.
 *
 * `provider_config_invalid` is here for a different reason from the rest: it was added by lead decision on
 * 2026-08-27 because none of the eleven approved codes covers "the project configuration file failed schema
 * validation". Reusing `invalid_request` was rejected — the request is fine, and saying otherwise points the
 * user at the wrong file to fix. Lane W1-B throws it.
 */
export const CONTRACT_ONLY_ERROR_CODES = [
  'provider_executable_not_found',
  'provider_version_unsupported',
  'provider_version_unreadable',
  'provider_selection_ambiguous',
  'provider_config_invalid',
  'provider_capability_probe_failed',
  'provider_not_ready',
  'provider_project_metadata_missing',
  'provider_fixture_failed',
  'request_cancelled',
] as const;

export type ContractOnlyErrorCode = (typeof CONTRACT_ONLY_ERROR_CODES)[number];

const KNOWN_CODES: ReadonlySet<string> = new Set(CLI_ERROR_CODES);

export function isCliErrorCode(value: unknown): value is CliErrorCode {
  return typeof value === 'string' && KNOWN_CODES.has(value);
}

export interface CliErrorShape {
  readonly code: CliErrorCode;
  readonly message: string;
  readonly retryable: boolean;
  readonly details?: unknown;
}

export class CliError extends Error {
  constructor(
    readonly code: CliErrorCode,
    message: string,
    readonly exitCode: number,
    readonly retryable = false,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = 'CliError';
  }
}
