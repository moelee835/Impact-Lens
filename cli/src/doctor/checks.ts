import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { discoverExecutable } from '../providers/resolve';
import { inspectCompileDatabase } from '../providers/compileDatabase';
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
import { C_FAMILY_LANGUAGE_IDS, languageId } from '../providers/resolve';
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
 * Read-only `compile_commands.json` discovery, surfaced for any preset that claims a C-family
 * language - not a clangd-specific check, so this activates the moment a real preset declares
 * `C_FAMILY_LANGUAGE_IDS` membership, without needing a clangd-specific dispatch branch like
 * `inspectBundledArtifact`'s (M2 clangd lane stage 3, `docs/work/task-m2-clangd-preset.md`).
 *
 * `undefined` for any non-C-family preset - `runDoctor()` omits the check entirely rather than
 * reporting `pass` for a workspace state a TypeScript/Python/Go provider never reads.
 *
 * Surfaces, never gates: `status` is `warn` for missing/stale/ambiguous, never `fail`. Stage 3's own
 * fixture proved clangd gives a fully correct answer with no compile database at all, as long as the
 * query needs nothing a generic fallback command cannot supply - a hard `fail` here would turn every
 * one of those already-working workspaces into a doctor failure the story's own language ("구분한다",
 * "안내한다") does not ask for.
 *
 * The `sample` field is why this function exists in `checks.ts` and not only in
 * `providers/compileDatabase.ts` - it exists to prove the database is readable and real, and a
 * commander review found that redacting compiler-flag CONTENT to do that is an unbounded surface, not
 * a bounded one: a first pass caught `-DNAME=value` but missed a space-separated `-D NAME=value` (a
 * common real shape for a JSON Compilation Database's `arguments` array, and reachable through this
 * check's own token-joining logic), a quoted value whose closing quote lands past the naive token
 * boundary, and MSVC's `/D` spelling (relevant because CI runs windows-latest). Each fix would only
 * close the hole just found, the same shape the response-policy-engine lane in this same session
 * burned five rounds discovering: a lexical pattern match over free-form compiler-flag text does not
 * have a boundary. `sample` closes the surface instead of chasing it - it reports only what the stated
 * purpose actually needs (readable, real, roughly how big) and never puts a flag NAME or VALUE into
 * the response, so there is no text left for a secret to hide inside. That includes the one token this
 * check does read as a name rather than a count - `compiler` - which is itself guarded against a
 * malformed entry whose first token is a flag rather than an executable (see
 * `sampleCompileCommandMetadata()`'s own comment) so the "no flag content" guarantee has no silent
 * exception.
 */
export async function compileDatabaseCheck(
  preset: ProviderPreset,
  workspace: string,
): Promise<DoctorCheck | undefined> {
  if (!preset.languageIds.some(id => C_FAMILY_LANGUAGE_IDS.has(id))) {
    return undefined;
  }
  const observation = await inspectCompileDatabase(workspace);
  if (observation.status === 'missing') {
    return {
      id: 'compile-database',
      status: 'warn',
      state: 'missing',
      reason: 'no compile_commands.json was found at the workspace root or a common build directory',
    };
  }
  if (observation.status === 'ambiguous') {
    return {
      id: 'compile-database',
      status: 'warn',
      state: 'ambiguous',
      candidatePaths: observation.relativePaths,
      reason: 'multiple compile_commands.json candidates were found; the provider picks one internally with no signal about which',
    };
  }
  const sample = await sampleCompileCommandMetadata(workspace, observation.relativePath);
  return {
    id: 'compile-database',
    status: observation.stale ? 'warn' : 'pass',
    state: observation.stale ? 'stale' : 'present',
    path: observation.relativePath,
    ...(sample === undefined ? {} : { sample }),
  };
}

interface CompileCommandSample {
  /**
   * The compiler executable's basename only (`clang`, not `/usr/bin/clang`) - never the full path.
   * Omitted, not shown, if the first token looks like a flag (`-`/`/` prefixed) rather than an
   * executable name - a malformed entry whose `arguments[0]` is itself a flag would otherwise pass its
   * literal text through `path.basename()` unchanged (no separator to strip), which is exactly the
   * flag-content leak this function exists to never produce (found via commander review - `compiler:
   * path.basename(compilerToken!)` was an unconditional pass-through, so a hand-written or malformed
   * database with a flag in the compiler slot defeated the whole point of this redesign).
   */
  readonly compiler?: string;
  /** Workspace-relative; omitted entirely (not shown as absolute) if the entry's file resolves outside the workspace. */
  readonly file?: string;
  /** Count only - the flag names and values themselves are never read into this check's output. */
  readonly argumentCount: number;
}

/**
 * Proof that the first entry of a real `compile_commands.json` is readable and has the shape a
 * compiler invocation actually has - compiler name, target file, how many arguments - without ever
 * putting a flag's name or value into the response. This is the fix for the leak
 * `redactPreprocessorDefines()` (removed) could not close: there is no redaction to defeat when the
 * field never carries the content that would need redacting. `compiler` is the one field that reads a
 * token from `arguments`/`command` at all, and it is guarded (see `looksLikeFlag` below) precisely so
 * that claim stays true even for a malformed entry. Never throws: a database that exists but fails to
 * parse is a fact worth swallowing quietly here, not a doctor crash - the `state` field on the
 * caller's response already told the user the file exists, which is what matters for `pass`/`warn`.
 */
async function sampleCompileCommandMetadata(
  workspace: string,
  relativePath: string,
): Promise<CompileCommandSample | undefined> {
  try {
    const raw = await fs.readFile(path.join(workspace, ...relativePath.split('/')), 'utf8');
    const entries = JSON.parse(raw) as unknown;
    if (!Array.isArray(entries) || entries.length === 0) {
      return undefined;
    }
    const [first] = entries as Array<{ command?: unknown; arguments?: unknown; file?: unknown }>;
    const tokens = Array.isArray(first.arguments)
      ? first.arguments.filter((token): token is string => typeof token === 'string')
      : typeof first.command === 'string' ? first.command.trim().split(/\s+/).filter(token => token.length > 0) : [];
    if (tokens.length === 0) {
      return undefined;
    }
    const [compilerToken, ...rest] = tokens;
    // A well-formed compile database's first token is always the compiler executable, never a flag -
    // but `path.basename()` passes a flag-shaped string through unchanged (no `/` to strip means
    // nothing gets removed), so a hand-written or malformed entry whose arguments[0] is itself, say, a
    // -D define would otherwise leak that define's full text as "the compiler name". Guarded instead of
    // documented as an exception: the value of this redesign is that there is NO content path left to a
    // secret, and one silent exception invites the next one.
    //
    // Not a bare "starts with '-' or '/'" check: a real absolute compiler path (`/usr/bin/clang`,
    // `/opt/homebrew/opt/llvm/bin/clang`) also starts with `/`, and that is the overwhelmingly common
    // real shape of arguments[0] - flagging every `/`-rooted path would omit `compiler` on nearly every
    // real compile database, not just the malformed ones (confirmed by direct measurement before
    // choosing this condition). What actually needs to be excluded is a VALUE-bearing flag, and `=` is
    // the structural marker for that (a `-D<NAME>=<value>` or MSVC `/D<NAME>=<value>`) - a leading `-`
    // is excluded unconditionally since no real executable path is `-`-prefixed either way.
    const looksLikeFlag = compilerToken!.startsWith('-') || (compilerToken!.startsWith('/') && compilerToken!.includes('='));
    // Known, accepted gap, not chased further: a valueless MSVC flag with no '=' (`/DNDEBUG`) has
    // nothing sensitive to leak, but also isn't caught by the `=`-based guard above, so it displays as
    // `compiler: "DNDEBUG"` - a wrong label, never a secret. Catching it would mean recognizing MSVC's
    // single-letter flag codes (/D, /I, /O, /W, /U, ...) by name, which is exactly the kind of
    // enumerate-every-flag-shape chase this redesign exists to avoid (see this function's own
    // docstring). Left as a documented limitation, same call as gap 2 in AMBIGUOUS_LANGUAGE_ID's
    // KNOWN LIMITATION comment (resolve.ts) for a different feature in this lane.
    const file = typeof first.file === 'string' ? workspaceRelativeOrUndefined(workspace, first.file) : undefined;
    return {
      ...(looksLikeFlag ? {} : { compiler: crossPlatformBasename(compilerToken!) }),
      ...(file === undefined ? {} : { file }),
      argumentCount: rest.length,
    };
  } catch {
    return undefined;
  }
}

/**
 * `path.basename()` alone is platform-bound: on POSIX it does not treat `\` as a separator, so a
 * Windows-generated absolute path (`C:\Users\name\LLVM\bin\clang.exe`) read by a doctor process running
 * on macOS/Linux passes through unchanged - the exact user-environment-path leak this whole feature
 * exists to prevent, just triggered by a cross-platform read instead of a flag shape (found via
 * commander review; a `compile_commands.json` committed to a repo and opened on a different OS than it
 * was generated on is not a rare scenario). Splitting on both separators unconditionally, instead of
 * relying on the platform-bound module, closes it regardless of which OS produced the path or which OS
 * this check is running on.
 */
function crossPlatformBasename(token: string): string {
  const segments = token.split(/[\\/]/);
  return segments[segments.length - 1] ?? token;
}

/**
 * Relative path if `file` resolves inside `workspace`, `undefined` otherwise - never an absolute path.
 *
 * Rejects a foreign-platform absolute path outright (same cross-platform gap as `crossPlatformBasename()`
 * above, applied here to the `file` field instead of `compiler`): `path.isAbsolute()` is also
 * platform-bound, so a Windows-style absolute path is invisible to it when this check runs on POSIX,
 * and would otherwise fall into the `path.resolve(workspace, file)` branch below and come back out
 * through `path.relative()` still carrying its full foreign-absolute text (including a Windows
 * username) - `relative.startsWith('..')` never catches this, because on POSIX `path.relative()` never
 * recognizes it as a directory-escaping path in the first place, only as an oddly-named relative
 * segment. Verified against exactly that direction (a Windows path read on POSIX, this test suite's
 * platform); the reverse (a POSIX path read on a native win32 process) is not separately proven.
 */
function workspaceRelativeOrUndefined(workspace: string, file: string): string | undefined {
  if ((path.posix.isAbsolute(file) || path.win32.isAbsolute(file)) && !path.isAbsolute(file)) {
    return undefined;
  }
  const absolute = path.isAbsolute(file) ? file : path.resolve(workspace, file);
  const relative = path.relative(workspace, absolute);
  if (relative.length === 0 || relative.startsWith('..') || path.isAbsolute(relative)) {
    return undefined;
  }
  return relative.split(path.sep).join('/');
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
