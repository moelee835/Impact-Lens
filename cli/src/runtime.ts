import * as fs from 'node:fs';
import * as path from 'node:path';
import { CliError } from './types';

const cliPackage = require('../package.json') as { readonly name?: unknown; readonly version?: unknown };

export const REQUIRED_NODE_MAJOR = 22;

export type RunnerSource = 'direct' | 'explicit' | 'checkout' | 'global' | 'release-fallback';

export interface RuntimeMetadata {
  readonly cli: {
    readonly name: string;
    readonly version: string;
  };
  readonly node: {
    readonly version: string;
    readonly major: number;
    readonly executable: string;
  };
  readonly runner: {
    readonly source: RunnerSource;
  };
}

export interface BundledTypeScriptArtifact {
  readonly packageName: '@impact-lens/cli';
  readonly serverPackage: 'typescript-language-server';
  readonly serverVersion: string;
  readonly typescriptVersion: string;
  readonly entry: 'lib/cli.mjs';
  readonly entryPath: string;
}

type ModuleResolver = (specifier: string) => string;

export function assertSupportedNode(version = process.versions.node): void {
  const majorText = version.split('.')[0] ?? '';
  const major = Number(majorText);
  if (!Number.isInteger(major) || major < REQUIRED_NODE_MAJOR) {
    throw new CliError(
      'node_version_unsupported',
      `Impact Lens requires Node.js ${REQUIRED_NODE_MAJOR} or newer.`,
      7,
      false,
      {
        stage: 'startup',
        component: 'node',
        requiredMajor: REQUIRED_NODE_MAJOR,
        ...(Number.isInteger(major) ? { detectedMajor: major } : {}),
        recovery: 'switch_to_node_22_or_newer',
      },
    );
  }
}

export function runtimeMetadata(): RuntimeMetadata {
  const version = process.versions.node;
  return {
    cli: {
      name: typeof cliPackage.name === 'string' ? cliPackage.name : '@impact-lens/cli',
      version: typeof cliPackage.version === 'string' ? cliPackage.version : 'unknown',
    },
    node: {
      version,
      major: Number(version.split('.')[0]),
      executable: path.basename(process.execPath),
    },
    runner: { source: runnerSource(process.env.IMPACT_LENS_RUNNER_SOURCE) },
  };
}

export function inspectBundledTypeScriptArtifact(resolveModule: ModuleResolver = require.resolve): BundledTypeScriptArtifact {
  let entryPath: string;
  let serverPackagePath: string;
  let typescriptPackagePath: string;
  try {
    entryPath = resolveModule('typescript-language-server/lib/cli.mjs');
    serverPackagePath = resolveModule('typescript-language-server/package.json');
    typescriptPackagePath = resolveModule('typescript/package.json');
  } catch {
    throw new CliError(
      'bundled_provider_artifact_missing',
      'The bundled TypeScript Language Server artifact is missing. Reinstall the Impact Lens CLI or Plugin.',
      5,
      false,
      {
        stage: 'discovery',
        component: 'bundled-typescript',
        recovery: 'reinstall_impact_lens_cli_or_plugin',
      },
    );
  }

  try {
    fs.accessSync(entryPath, fs.constants.R_OK);
  } catch {
    throw new CliError(
      'bundled_provider_artifact_unreadable',
      'The bundled TypeScript Language Server entry is not readable. Reinstall the Impact Lens CLI or fix its permissions.',
      5,
      false,
      {
        stage: 'discovery',
        component: 'bundled-typescript',
        entry: 'lib/cli.mjs',
        recovery: 'reinstall_or_fix_provider_permissions',
      },
    );
  }

  return {
    packageName: '@impact-lens/cli',
    serverPackage: 'typescript-language-server',
    serverVersion: packageVersion(serverPackagePath, 'typescript-language-server'),
    typescriptVersion: packageVersion(typescriptPackagePath, 'typescript'),
    entry: 'lib/cli.mjs',
    entryPath,
  };
}

/**
 * Resolves the one module specifier a preset manifest is allowed to reference.
 *
 * The catalog's `bundledModuleEntry` reference lands here. It goes through the artifact inspection
 * above rather than calling `require.resolve` directly so that a missing or unreadable server still
 * produces the same reinstall guidance it produced before presets existed.
 *
 * The allowlist is one entry long on purpose. Resolving an arbitrary specifier inside this package's
 * dependency tree is a way to learn where the package is installed, and the manifest that can ask for
 * it is only trusted because it ships in the same tarball.
 */
export function bundledModuleEntryPath(module: string): string {
  if (module === BUNDLED_TYPESCRIPT_MODULE) {
    return inspectBundledTypeScriptArtifact().entryPath;
  }
  // Same sentence shape as every other provider_config_invalid, fixed by truth table row F23.
  throw new CliError(
    'provider_config_invalid',
    `The provider configuration in the shipped preset catalog is not valid: it may not reference the module ${module}.`,
    5,
    false,
    {
      stage: 'discovery',
      origin: 'the shipped preset catalog',
      allowedModules: [BUNDLED_TYPESCRIPT_MODULE],
      action: 'Fix the provider configuration, or remove it to fall back to automatic selection.',
    },
  );
}

const BUNDLED_TYPESCRIPT_MODULE = 'typescript-language-server/lib/cli.mjs';

/**
 * A Language Server that dies before answering usually says nothing on stderr. This opt-in raises its
 * own log level so the next run explains itself; the captured output still goes through redaction.
 *
 * This is the one thing about the bundled preset a manifest cannot express, because expressing it
 * needs a conditional and a conditional turns the manifest into a program. It stays in code, and the
 * resolver appends it to the arguments a bundled preset resolves to.
 */
export function bundledProviderLogArgs(env: NodeJS.ProcessEnv = process.env): readonly string[] {
  const requested = env.IMPACT_LENS_PROVIDER_LOG_LEVEL;
  if (!requested || !/^[1-4]$/.test(requested)) {
    return [];
  }
  return ['--log-level', requested];
}

function packageVersion(packagePath: string, component: string): string {
  try {
    const value = JSON.parse(fs.readFileSync(packagePath, 'utf8')) as { readonly version?: unknown };
    if (typeof value.version === 'string' && value.version.length > 0) {
      return value.version;
    }
  } catch {
    // The stable error below intentionally omits package paths and parser details.
  }
  throw new CliError(
    'bundled_provider_artifact_corrupt',
    `The bundled ${component} package metadata is invalid. Reinstall the Impact Lens CLI or Plugin.`,
    5,
    false,
    {
      stage: 'discovery',
      component,
      recovery: 'reinstall_impact_lens_cli_or_plugin',
    },
  );
}

function runnerSource(value: string | undefined): RunnerSource {
  return value === 'explicit'
    || value === 'checkout'
    || value === 'global'
    || value === 'release-fallback'
    ? value
    : 'direct';
}
