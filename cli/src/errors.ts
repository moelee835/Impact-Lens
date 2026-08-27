// Every `error.code` the CLI can put in an `ok: false` envelope, in exit-status order.
//
// The list holds only codes that some line in `cli/src` actually throws today. The contract document
// declares eight more (`provider_not_ready`, `provider_version_unsupported`, `provider_version_unreadable`,
// `provider_protocol_incompatible`, `provider_capability_probe_failed`, `provider_project_metadata_missing`,
// `provider_fixture_failed`, `request_cancelled`) that nothing throws yet. Adding them here would declare a
// code no code produces, which is the same declaration/implementation drift this module exists to
// prevent. The lane that implements each one adds it here in the same change.
// `cli/src/test/errors.test.ts` enforces that.
//
// Four of those eight appear in `cli/src/doctor/` as the `code` of a failing check. That is not the
// same thing as throwing them, and it is why doctor can report five different problems in one
// response: a check records its failure and the run continues, while a thrown code ends the process.
// They enter this union when some path actually fails an envelope with them.
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
  'provider_executable_not_found',
  'provider_selection_ambiguous',
  'provider_config_invalid',
  'provider_launch_failed',
  'provider_initialize_failed',
  'provider_capability_missing',
  'provider_query_failed',
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
