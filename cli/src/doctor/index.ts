import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { LspCallHierarchyProvider } from '../lspProvider';
import { PROVIDER_CATALOG, findPreset, presetIds } from '../providers/catalog';
import { ExecutableLookupOptions } from '../providers/discovery';
import { JsonObject, ProviderPreset } from '../providers/preset';
import { readProjectProviderChoice } from '../providers/projectConfig';
import { ProviderResolutionOptions, resolveProvider, resolveSessionValues } from '../providers/resolve';
import { CliError, ProviderCommand } from '../types';
import {
  DoctorCheck,
  cliPackageCheck,
  executableCheck,
  failureFields,
  languageSupportCheck,
  nodeEngineCheck,
  projectConfigCheck,
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
  /** Progress sink. Defaults to stderr; tests pass their own to prove stdout stays clean. */
  readonly log?: (line: string) => void;
}

export async function runDoctor(
  presetId: string,
  options: DoctorOptions = {},
): Promise<Record<string, unknown>> {
  const catalog = options.catalog ?? PROVIDER_CATALOG;
  const preset = findPreset(catalog, presetId);
  if (preset === undefined) {
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
  checks.push(executableCheck(preset, options.lookup));
  const versionResult = versionCheck(preset, resolution.executable);
  if (versionResult !== undefined) {
    checks.push(versionResult);
  }
  checks.push(languageSupportCheck(preset, options.file));
  checks.push(settingsKeysCheck(resolution.settings));
  checks.push(projectConfigCheck(project.state, project.error));

  if (mode !== 'preflight') {
    checks.push(await capabilitySmokeCheck(resolution.command, workspace, preset, options, log));
  }
  if (mode === 'fixture') {
    checks.push(await fixtureCheck(resolution.command, preset, options, log));
  }

  return {
    status: aggregate(checks),
    mode,
    preset: {
      id: preset.id,
      displayName: preset.displayName,
      tier: preset.tier,
      languageIds: preset.languageIds,
      ...(preset.lastVerified === undefined ? {} : { lastVerified: preset.lastVerified }),
      ...(preset.docs?.limitations === undefined ? {} : { limitations: preset.docs.limitations }),
    },
    checks,
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
  preset: ProviderPreset,
  options: DoctorOptions,
  choice: ReturnType<typeof readProjectProviderChoice>,
): Resolution {
  const probeFile = `impact-lens-doctor${preset.extensions[0] ?? ''}`;
  const resolution: ProviderResolutionOptions = {
    providerPreset: preset.id,
    catalog: options.catalog,
    lookup: options.lookup,
    env: options.env,
  };
  let settings: JsonObject = {};
  try {
    settings = resolveSessionValues(preset, choice, resolution).settings;
  } catch {
    // A manifest that cannot even be validated is reported by the checks that touch it; an empty
    // tree here only keeps the remaining checks running.
  }
  try {
    const resolved = resolveProvider(probeFile, undefined, resolution);
    return { command: resolved.command, executable: resolved.command.command, settings };
  } catch {
    // The executable and artifact checks report this in their own words; this only has to survive.
    return { command: { command: '' }, settings };
  }
}

async function capabilitySmokeCheck(
  command: ProviderCommand,
  workspace: string,
  preset: ProviderPreset,
  options: DoctorOptions,
  log: (line: string) => void,
): Promise<DoctorCheck> {
  if (command.command === '') {
    return {
      id: 'initialize-capability-smoke',
      status: 'fail',
      code: 'provider_executable_not_found',
      detail: 'No executable was resolved for this preset.',
    };
  }
  log(`impact-lens doctor: initializing ${preset.id}`);
  const provider = new LspCallHierarchyProvider(
    workspace,
    `impact-lens-doctor${preset.extensions[0] ?? ''}`,
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
