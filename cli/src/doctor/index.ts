import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { LspCallHierarchyProvider } from '../lspProvider';
import { PROVIDER_CATALOG, findPreset, presetIds } from '../providers/catalog';
import { ExecutableLookupOptions } from '../providers/discovery';
import { JsonObject, ProviderPreset } from '../providers/preset';
import { readProjectProviderChoice } from '../providers/projectConfig';
import { ProviderResolutionOptions, languageId as detectLanguageId, resolveProvider, resolveSessionValues } from '../providers/resolve';
import { CliError, ProviderCommand } from '../types';
import {
  DoctorCheck,
  cliPackageCheck,
  compileDatabaseCheck,
  executableCheck,
  failureFields,
  languageSupportCheck,
  nodeEngineCheck,
  projectConfigCheck,
  rawExecutableCheck,
  settingsKeysCheck,
  versionCheck,
} from './checks';

/**
 * `impact-lens doctor <preset>`.
 *
 * Three properties hold no matter which preset or mode is asked for.
 *
 * 1. Every check runs. A failure is recorded and the run continues, because "the bundled artifact is
 *    missing" and "this preset does not serve your language" are separate facts and a user who has
 *    both should be told both. The previous implementation threw on the first problem and hard-coded
 *    `status: 'pass'` on the rest, so it could not report a partial failure at all.
 * 2. stdout stays exactly one JSON line. Progress goes to stderr and only in the modes that start a
 *    process, so the machine-readable contract is never interleaved with human output.
 * 3. Starting a process is opt-in and layered. `preflight` starts nothing, `--smoke` initialises the
 *    server and reads its advertised capability, `--fixture` additionally runs a real Call Hierarchy
 *    query. Folding the fixture into `--smoke` would have multiplied the cost of the cheap check
 *    without anyone asking for it.
 */

export type DoctorMode = 'preflight' | 'smoke' | 'fixture';

/**
 * `ready` when everything passed, `degraded` when something warned, `blocked` when something failed.
 *
 * The envelope stays `ok: true` and the exit status stays 0 in all three. Diagnosing successfully is
 * a different event from the subject being healthy, and in this CLI exit statuses are bound to
 * `error.code`; giving doctor a non-zero exit with no error would break that correspondence.
 */
export type DoctorStatus = 'ready' | 'degraded' | 'blocked';

export interface DoctorOptions {
  readonly mode?: DoctorMode;
  readonly timeoutMs?: number;
  readonly workspace?: string;
  /** Answers "would this preset serve this file". Supplied by `--file`. */
  readonly file?: string;
  readonly catalog?: readonly ProviderPreset[];
  readonly lookup?: ExecutableLookupOptions;
  readonly env?: NodeJS.ProcessEnv;
  /**
   * A raw command to diagnose instead of a catalog preset - the language a raw-command user actually
   * runs, for a language with no preset yet (this is what motivated adding it: a Java/jdtls doctor
   * check has nowhere to register itself while jdtls stays unregistered). Mutually exclusive with a
   * presetId; `runDoctor` rejects both being set the same way `analyze` rejects `provider` and
   * `providerPreset` together, rather than silently picking one.
   */
  readonly command?: ProviderCommand;
  /** Progress sink. Defaults to stderr; tests pass their own to prove stdout stays clean. */
  readonly log?: (line: string) => void;
}

export async function runDoctor(
  presetId: string | undefined,
  options: DoctorOptions = {},
): Promise<Record<string, unknown>> {
  if (presetId !== undefined && options.command !== undefined) {
    throw new CliError(
      'invalid_request',
      'A preset id and a raw command cannot both be diagnosed in one doctor run.',
      2,
    );
  }
  if (presetId === undefined && options.command === undefined) {
    throw new CliError('invalid_command', 'doctor requires a preset id or a raw provider command.', 2);
  }
  if (presetId === undefined && (options.mode ?? 'preflight') === 'fixture') {
    // Rejected before any check runs, including the smoke check `mode !== 'preflight'` would
    // otherwise pay for first - a raw command structurally cannot have a catalog fixture (fixtures are
    // how a preset earns `verified-external`, a promotion mechanism the user's own command was never
    // entered into), and silently downgrading to `--smoke` behavior would narrow the contract without
    // saying so. This says so instead, and does it before spending the cost of starting the process.
    throw new CliError(
      'invalid_request',
      '--fixture has no meaning for a raw command diagnosed via --stdin - it only applies to a catalog preset, which declares its own fixture.',
      2,
    );
  }
  const catalog = options.catalog ?? PROVIDER_CATALOG;
  const preset = presetId === undefined ? undefined : findPreset(catalog, presetId);
  if (presetId !== undefined && preset === undefined) {
    // Nothing to diagnose. This is the one hard failure doctor has, and it is a bad request rather
    // than a provider problem.
    throw new CliError('invalid_command', `Unknown provider preset: ${presetId}`, 2, false, {
      stage: 'startup',
      knownPresetIds: presetIds(catalog),
    });
  }
  const mode: DoctorMode = options.mode ?? 'preflight';
  const workspace = options.workspace ?? process.cwd();
  const log = options.log ?? ((line: string) => process.stderr.write(`${line}\n`));

  const checks: DoctorCheck[] = [nodeEngineCheck(), cliPackageCheck()];

  const project = readProjectChoice(workspace);
  const resolution = resolveSession(preset, options, project.choice);
  checks.push(
    preset === undefined
      ? rawExecutableCheck(resolution.command, options.lookup)
      : executableCheck(preset, options.lookup),
  );
  if (preset !== undefined) {
    const versionResult = versionCheck(preset, resolution.executable);
    if (versionResult !== undefined) {
      checks.push(versionResult);
    }
    checks.push(languageSupportCheck(preset, options.file));
    const compileDatabaseResult = await compileDatabaseCheck(preset, workspace);
    if (compileDatabaseResult !== undefined) {
      checks.push(compileDatabaseResult);
    }
  }
  // `settingsKeysCheck`/`projectConfigCheck` read the resolved settings tree and the project config
  // file respectively - neither depends on there being a catalog preset, so both run for a raw command
  // exactly as they do for a preset.
  checks.push(settingsKeysCheck(resolution.settings));
  checks.push(projectConfigCheck(project.state, project.error));

  if (mode !== 'preflight') {
    checks.push(await capabilitySmokeCheck(resolution.command, workspace, preset, options, log));
  }
  if (mode === 'fixture') {
    // `preset` is guaranteed defined here: the `--fixture`-with-no-preset case was already rejected
    // above, before any check ran.
    checks.push(await fixtureCheck(resolution.command, preset!, options, log));
  }

  return {
    status: aggregate(checks),
    mode,
    ...(preset === undefined
      ? { command: rawCommandSummary(resolution.command, options.file) }
      : {
        preset: {
          id: preset.id,
          displayName: preset.displayName,
          tier: preset.tier,
          languageIds: preset.languageIds,
          ...(preset.lastVerified === undefined ? {} : { lastVerified: preset.lastVerified }),
          ...(preset.docs?.limitations === undefined ? {} : { limitations: preset.docs.limitations }),
        },
      }),
    checks,
  };
}

/**
 * The raw-command sibling of the `preset` block - deliberately not a `preset` object with placeholder
 * fields (`tier: 'custom'`, no `displayName`/`lastVerified`/`docs`). A placeholder would let a
 * consumer read "no data" as "verified empty", the exact ambiguity this contract's other rules already
 * forbid (a provider failure must never read as a successful empty graph). This field exists in
 * neither branch's shape by accident of a missing key - a raw-command response always carries
 * `command`, never `preset`, and vice versa.
 *
 * `languageId` is reported only when there was a real signal to report - the command's own declared
 * `languageId`, or a `--file` whose extension `languageId()` actually read. Neither given means this
 * doctor run had nothing to detect from, and that is a different state from "detected, and the answer
 * is plaintext" - collapsing the two would show a user diagnosing Java "Detected language: plaintext"
 * for a command that never got a file to look at, which reads as a diagnosis of their project rather
 * than as "you didn't pass --file". `languageId()`'s honest `'plaintext'` answer for an unrecognised
 * extension is preserved as-is when a `--file` WAS given - that case has a real file to be honest about.
 */
function rawCommandSummary(command: ProviderCommand, file: string | undefined): JsonObject {
  const resolvedLanguageId = command.languageId ?? (file === undefined ? undefined : detectLanguageId(file));
  return {
    command: command.command,
    ...(command.args === undefined ? {} : { args: command.args }),
    ...(resolvedLanguageId === undefined ? { languageId: null, languageSource: 'none' } : {
      languageId: resolvedLanguageId,
      languageSource: command.languageId !== undefined ? 'command' : 'file',
    }),
  };
}

function aggregate(checks: readonly DoctorCheck[]): DoctorStatus {
  if (checks.some(check => check.status === 'fail')) {
    return 'blocked';
  }
  return checks.some(check => check.status === 'warn') ? 'degraded' : 'ready';
}

interface ProjectState {
  readonly state: 'absent' | 'valid';
  readonly choice?: ReturnType<typeof readProjectProviderChoice>;
  readonly error?: unknown;
}

/**
 * Reads the project file without letting a broken one end the run.
 *
 * A malformed `.impact-lens/provider.json` is exactly the situation someone runs doctor for, so it
 * has to arrive as a finding rather than as the reason there are no findings.
 */
function readProjectChoice(workspace: string): ProjectState {
  try {
    const choice = readProjectProviderChoice(workspace);
    return choice === undefined ? { state: 'absent' } : { state: 'valid', choice };
  } catch (error) {
    return { state: 'absent', error };
  }
}

interface Resolution {
  readonly command: ProviderCommand;
  readonly executable?: string;
  readonly settings: JsonObject;
}

/**
 * Resolves the preset the same way an analysis would, so doctor reports on what would actually run.
 *
 * Two things are deliberate here.
 *
 * The settings tree is resolved separately from the command, so a preset whose executable is missing
 * still gets its settings inspected. Deriving both from one call once made a missing executable
 * silently turn the settings check into a vacuous pass, which is the exact failure this design is
 * supposed to prevent.
 *
 * The workspace is not handed to `resolveProvider`: the project file was already read above, and
 * reading it twice would let a broken file throw here after it had been reported as a check. Its
 * value overrides are passed through instead, which produces the same merged tree.
 */
function resolveSession(
  preset: ProviderPreset | undefined,
  options: DoctorOptions,
  choice: ReturnType<typeof readProjectProviderChoice>,
): Resolution {
  // Only ever fed into `resolveProvider()`'s internal `chooseProvider()` call, which never consults
  // the detected language for a raw command (it wins outright on priority alone - see `chooseProvider`
  // in resolve.ts). So this placeholder is safe for that internal use even with no real file signal;
  // it is never what gets reported to the user - `rawCommandSummary()` computes that separately, from
  // `options.file` or `command.languageId` only, never from this placeholder.
  const probeFile = preset === undefined
    ? options.file ?? 'impact-lens-doctor'
    : `impact-lens-doctor${preset.extensions[0] ?? ''}`;
  const resolution: ProviderResolutionOptions = {
    ...(preset === undefined ? {} : { providerPreset: preset.id }),
    catalog: options.catalog,
    lookup: options.lookup,
    env: options.env,
  };
  let settings: JsonObject = {};
  if (preset !== undefined) {
    try {
      settings = resolveSessionValues(preset, choice, resolution).settings;
    } catch {
      // A manifest that cannot even be validated is reported by the checks that touch it; an empty
      // tree here only keeps the remaining checks running.
    }
  }
  // A raw command has no manifest, so there is nothing analogous to resolve here - `settings` stays
  // `{}`, and `settingsKeysCheck({})` reports a trivial pass rather than being skipped, which is the
  // honest answer ("no unreachable keys" is true of an empty tree, not a lie about one that exists).
  try {
    const resolved = resolveProvider(probeFile, options.command, resolution);
    return { command: resolved.command, executable: resolved.command.command, settings };
  } catch {
    // The executable and artifact checks report this in their own words; this only has to survive.
    return { command: options.command ?? { command: '' }, settings };
  }
}

async function capabilitySmokeCheck(
  command: ProviderCommand,
  workspace: string,
  preset: ProviderPreset | undefined,
  options: DoctorOptions,
  log: (line: string) => void,
): Promise<DoctorCheck> {
  if (command.command === '') {
    return {
      id: 'initialize-capability-smoke',
      status: 'fail',
      code: 'provider_executable_not_found',
      detail: preset === undefined ? 'No executable was resolved for this command.' : 'No executable was resolved for this preset.',
    };
  }
  log(`impact-lens doctor: initializing ${preset === undefined ? 'the raw command' : preset.id}`);
  const provider = new LspCallHierarchyProvider(
    workspace,
    preset === undefined ? (options.file ?? 'impact-lens-doctor') : `impact-lens-doctor${preset.extensions[0] ?? ''}`,
    command,
    options.timeoutMs ?? 15000,
  );
  try {
    const capabilities = await provider.initializeForDoctor();
    return {
      id: 'initialize-capability-smoke',
      status: 'pass',
      provider: capabilities.name,
      ...(capabilities.version ? { version: capabilities.version } : {}),
      callHierarchy: capabilities.advertised.callHierarchy,
    };
  } catch (error) {
    return {
      id: 'initialize-capability-smoke',
      status: 'fail',
      callHierarchy: false,
      ...failureFields(error),
    };
  } finally {
    await provider.dispose();
  }
}

/**
 * Runs the preset's own cross-file fixture and checks that the expected caller comes back.
 *
 * This is the check that separates "the server says it does Call Hierarchy" from "the server
 * actually answers", and it is why a preset may only be promoted to `verified-external` after it
 * passes. It runs in a temporary directory so it cannot touch the user's project, and the temporary
 * directory never appears in the output.
 */
async function fixtureCheck(
  command: ProviderCommand,
  preset: ProviderPreset,
  options: DoctorOptions,
  log: (line: string) => void,
): Promise<DoctorCheck> {
  const fixture = preset.fixture;
  if (fixture === undefined) {
    return {
      id: 'fixture-call-hierarchy',
      status: 'warn',
      code: 'provider_fixture_failed',
      reason: 'no-fixture-declared',
      // A preset without a fixture cannot be promoted, which is the point of saying so here.
      detail: `Preset ${preset.id} declares no Call Hierarchy fixture.`,
    };
  }
  if (command.command === '') {
    return {
      id: 'fixture-call-hierarchy',
      status: 'fail',
      code: 'provider_executable_not_found',
      expectedCaller: fixture.expectedCaller,
    };
  }
  log(`impact-lens doctor: running the ${preset.id} Call Hierarchy fixture`);
  const workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'impact-lens-doctor-fixture-'));
  const provider = new LspCallHierarchyProvider(workspace, fixture.target.file, command, options.timeoutMs ?? 15000);
  try {
    for (const file of fixture.files) {
      const absolute = path.join(workspace, ...file.path.split('/'));
      fs.mkdirSync(path.dirname(absolute), { recursive: true });
      fs.writeFileSync(absolute, file.content);
    }
    const target = path.join(workspace, ...fixture.target.file.split('/'));
    const items = await provider.prepare(target, {
      line: fixture.target.line - 1,
      character: fixture.target.column - 1,
    });
    const root = items[0];
    if (root === undefined) {
      return {
        id: 'fixture-call-hierarchy',
        status: 'fail',
        code: 'provider_fixture_failed',
        reason: 'no-symbol-at-fixture-target',
        expectedCaller: fixture.expectedCaller,
      };
    }
    const callers = (await provider.incoming(root)).map(call => call.from.name);
    const found = callers.includes(fixture.expectedCaller);
    return {
      id: 'fixture-call-hierarchy',
      status: found ? 'pass' : 'fail',
      expectedCaller: fixture.expectedCaller,
      observedCallers: callers,
      ...(found ? {} : { code: 'provider_fixture_failed', reason: 'expected-caller-missing' }),
    };
  } catch (error) {
    return {
      id: 'fixture-call-hierarchy',
      status: 'fail',
      expectedCaller: fixture.expectedCaller,
      ...failureFields(error),
    };
  } finally {
    await provider.dispose();
    fs.rmSync(workspace, { recursive: true, force: true });
  }
}
