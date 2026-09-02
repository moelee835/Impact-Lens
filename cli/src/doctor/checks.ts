import * as path from 'node:path';
import { discoverExecutable } from '../providers/resolve';
import {
  describeVersionRange,
  isVersionSupported,
  probeVersion,
} from '../providers/discovery';
import { ExecutableLookupOptions } from '../providers/discovery';
import { unreachableDottedKeys } from '../providers/manifest';
import { BUNDLED_PYRIGHT_PRESET_ID, BUNDLED_TYPESCRIPT_PRESET_ID } from '../providers/catalog';
import { JsonObject, ProviderPreset } from '../providers/preset';
import { PROJECT_PROVIDER_CONFIG_PATH } from '../providers/projectConfig';
import { languageId } from '../providers/resolve';
import {
  REQUIRED_NODE_MAJOR,
  BundledPyrightArtifact,
  BundledTypeScriptArtifact,
  inspectBundledPyrightArtifact,
  inspectBundledTypeScriptArtifact,
  runtimeMetadata,
} from '../runtime';
import { CliError } from '../types';

/**
 * The individual diagnoses doctor makes.
 *
 * Every function here returns a check instead of throwing. That is the whole design: a diagnosis that
 * stops at the first problem can only ever tell the user one thing, and the question they actually
 * have is "what works and what does not". A failing check carries a `code` so the five kinds of
 * failure the Wave 1 gate asks about — missing executable, unsupported version, language mismatch,
 * missing capability, failing fixture — stay distinguishable from each other in one response.
 *
 * Those codes are not thrown, and that is deliberate. `error.code` ends the process; a check's `code`
 * is a finding among other findings.
 *
 * No check ever puts an absolute path in its output. What to install is useful; where this machine
 * keeps things is not, and doctor output gets pasted into issues.
 */

export type DoctorCheckStatus = 'pass' | 'warn' | 'fail';

export interface DoctorCheck {
  readonly id: string;
  readonly status: DoctorCheckStatus;
  readonly [field: string]: unknown;
}

export function nodeEngineCheck(): DoctorCheck {
  const detectedMajor = runtimeMetadata().node.major;
  const supported = Number.isInteger(detectedMajor) && detectedMajor >= REQUIRED_NODE_MAJOR;
  return {
    id: 'node-engine',
    status: supported ? 'pass' : 'fail',
    requiredMajor: REQUIRED_NODE_MAJOR,
    detectedMajor,
    ...(supported ? {} : {
      code: 'node_version_unsupported',
      recovery: 'switch_to_node_22_or_newer',
    }),
  };
}

export function cliPackageCheck(): DoctorCheck {
  const runtime = runtimeMetadata();
  return {
    id: 'cli-package',
    status: 'pass',
    package: runtime.cli.name,
    version: runtime.cli.version,
  };
}

/**
 * Whether the chosen preset has something to run.
 *
 * A bundled preset ships inside this tarball, so its check reports the packaged versions and whether
 * the entry is readable. An external preset has to be found, and not finding it is the single most
 * common reason a language does not work — so that check answers with what to install rather than
 * with where the search happened.
 */
export function executableCheck(
  preset: ProviderPreset,
  lookup: ExecutableLookupOptions | undefined,
): DoctorCheck {
  if (preset.tier === 'bundled') {
    try {
      const artifact = inspectBundledArtifact(preset.id);
      return {
        id: 'bundled-provider-artifact',
        status: 'pass',
        package: artifact.serverPackage,
        version: artifact.serverVersion,
        // Only `BundledTypeScriptArtifact` has this field - pyright has no separate compiler package
        // to report a version for (see the comment on `inspectBundledPyrightArtifact`).
        ...(artifact.serverPackage === 'typescript-language-server' ? { typescriptVersion: artifact.typescriptVersion } : {}),
        entry: artifact.entry,
        access: 'readable',
      };
    } catch (error) {
      return {
        id: 'bundled-provider-artifact',
        status: 'fail',
        ...failureFields(error),
        recovery: 'reinstall_impact_lens_cli_or_plugin',
      };
    }
  }
  const candidates = preset.command.candidates.filter((entry): entry is string => typeof entry === 'string');
  let found: string | undefined;
  try {
    found = discoverExecutable(preset, { lookup });
  } catch (error) {
    return { id: 'provider-executable', status: 'fail', candidates, ...failureFields(error) };
  }
  if (found === undefined) {
    return {
      id: 'provider-executable',
      status: 'fail',
      code: 'provider_executable_not_found',
      candidates,
      ...(preset.docs?.install === undefined ? {} : { install: preset.docs.install }),
      // Impact Lens never installs a provider, configures a build or synchronises a package manager.
      recovery: 'install_the_language_server_manually',
    };
  }
  return {
    id: 'provider-executable',
    // The basename only. Which file answers is the finding; the layout of this machine is not.
    status: 'pass',
    executable: path.basename(found),
    candidates,
  };
}

/**
 * Which bundled artifact a `tier: 'bundled'` preset's own inspection describes.
 *
 * A `tier === 'bundled'` branch that called `inspectBundledTypeScriptArtifact()` unconditionally used
 * to sit here directly - correct only because `bundled-typescript` was the only bundled preset. Once
 * `bundled-pyright` shipped, that would have made `doctor bundled-pyright` report TypeScript's package,
 * version and entry as a `pass` - the wrong answer reported as success, not a failure a user would
 * notice, which is worse than the gopls-lane `.go` gap (a real bug this exact class of oversight can
 * reproduce: task-fix-go-language-detection.md). An unrecognized bundled preset id throws instead of
 * silently falling back to the TypeScript inspector, so a future bundled preset that forgets to extend
 * this fails loudly here rather than passing a check for the wrong server.
 */
function inspectBundledArtifact(presetId: string): BundledTypeScriptArtifact | BundledPyrightArtifact {
  if (presetId === BUNDLED_TYPESCRIPT_PRESET_ID) {
    return inspectBundledTypeScriptArtifact();
  }
  if (presetId === BUNDLED_PYRIGHT_PRESET_ID) {
    return inspectBundledPyrightArtifact();
  }
  throw new CliError(
    'internal_error',
    `No bundled artifact inspector is registered for preset "${presetId}".`,
    10,
  );
}

/**
 * Runs the preset's version command, when it declares one.
 *
 * Out of range is a failure because the preset's support claim is what a user relies on. Unreadable
 * is a warning, because failing to parse a version is evidence about our parser as much as about the
 * server, and refusing to work over it would be a stronger claim than we can support.
 */
export function versionCheck(
  preset: ProviderPreset,
  executable: string | undefined,
): DoctorCheck | undefined {
  if (preset.version === undefined) {
    return undefined;
  }
  if (executable === undefined) {
    return {
      id: 'provider-version',
      status: 'warn',
      code: 'provider_version_unreadable',
      reason: 'no-executable',
      supported: describeVersionRange(preset.version.supported),
    };
  }
  const supported = describeVersionRange(preset.version.supported);
  const outcome = probeVersion(executable, preset.version);
  if (outcome.kind === 'found') {
    const ok = isVersionSupported(outcome.version, preset.version.supported);
    return {
      id: 'provider-version',
      status: ok ? 'pass' : 'fail',
      detected: outcome.version,
      supported,
      ...(ok ? {} : { code: 'provider_version_unsupported', recovery: 'upgrade_the_language_server' }),
    };
  }
  return {
    id: 'provider-version',
    status: 'warn',
    code: 'provider_version_unreadable',
    reason: outcome.kind === 'timeout'
      ? 'timeout'
      : outcome.kind === 'failed'
        ? 'version-command-failed'
        : 'no-version-in-output',
    supported,
  };
}

/**
 * Whether this preset can answer for the file the user asked about.
 *
 * Only meaningful when a file is named, which is why doctor takes `--file`. Answering for the wrong
 * language is the failure this whole selection layer exists to prevent, and a user who hit it needs
 * to see it stated rather than inferred from an empty result.
 */
export function languageSupportCheck(preset: ProviderPreset, file: string | undefined): DoctorCheck {
  const base = {
    id: 'language-support',
    languageIds: preset.languageIds,
    extensions: preset.extensions,
  };
  if (file === undefined) {
    return { ...base, status: 'pass' };
  }
  const detectedLanguageId = languageId(file);
  if (detectedLanguageId === 'plaintext') {
    return {
      ...base,
      status: 'warn',
      detectedLanguageId,
      // An unrecognised extension asserts nothing either way, so this is not a mismatch.
      reason: 'unrecognised-extension',
    };
  }
  const supported = preset.languageIds.includes(detectedLanguageId);
  return {
    ...base,
    status: supported ? 'pass' : 'fail',
    detectedLanguageId,
    ...(supported ? {} : {
      code: 'provider_language_mismatch',
      recovery: 'choose_a_preset_for_this_language_or_configure_a_custom_provider',
    }),
  };
}

/**
 * Settings keys that a `workspace/configuration` section request can never reach.
 *
 * A literal `"typescript.preferences"` key is resolved by walking the tree, so a server asking for
 * that section gets nothing. This warns instead of failing because a dotted key inside a value — a
 * glob in `files.exclude`, for instance — is perfectly normal, and syntax cannot tell the two apart.
 */
export function settingsKeysCheck(settings: JsonObject): DoctorCheck {
  const unreachable = unreachableDottedKeys(settings);
  return {
    id: 'settings-keys',
    status: unreachable.length === 0 ? 'pass' : 'warn',
    ...(unreachable.length === 0 ? {} : {
      unreachableSections: unreachable,
      reason: 'a dotted key is not reachable by a workspace/configuration section request',
    }),
  };
}

export function projectConfigCheck(state: 'absent' | 'valid', error?: unknown): DoctorCheck {
  if (error !== undefined) {
    return {
      id: 'project-config',
      status: 'fail',
      file: PROJECT_PROVIDER_CONFIG_PATH,
      ...failureFields(error),
    };
  }
  return { id: 'project-config', status: 'pass', file: PROJECT_PROVIDER_CONFIG_PATH, state };
}

/**
 * The code and message of whatever went wrong, with nothing else from the error.
 *
 * `details` is dropped on purpose: it can carry a resolved path or a redacted stderr tail, and a
 * check is a summary line rather than an incident report.
 */
export function failureFields(error: unknown): Record<string, unknown> {
  if (error instanceof CliError) {
    return { code: error.code, detail: error.message };
  }
  return { code: 'internal_error', detail: error instanceof Error ? error.message : String(error) };
}
