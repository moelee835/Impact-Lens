import { ProviderPreset } from './preset';

/**
 * The shipped preset catalog.
 *
 * It has exactly one entry, and that is the whole point. M1 delivers the preset machinery, not a list
 * of languages. A preset may only enter this file once a real fixture has passed against a pinned
 * version range, because `verified-external` in a catalog is a claim users act on: it says "point this
 * at your project and the answer will be trustworthy". Listing a language we have not exercised would
 * make the tool's own support table the first thing it is wrong about.
 *
 * gopls is the first external candidate (IL-LIM-004 stage 3, milestone M2). Python waits on IL-LIM-006
 * because Pylance cannot legally be discovered or bundled by an independent CLI.
 */

const TYPESCRIPT_FIXTURE_TSCONFIG = `${JSON.stringify(
  {
    compilerOptions: {
      target: 'ES2022',
      module: 'commonjs',
      moduleResolution: 'node',
      strict: true,
      noEmit: true,
    },
    include: ['src/**/*'],
  },
  null,
  2,
)}\n`;

export const BUNDLED_TYPESCRIPT_PRESET_ID = 'bundled-typescript';

/** The specifier `bundledModuleEntry` is allowed to resolve. See `cli/src/runtime.ts`. */
export const BUNDLED_TYPESCRIPT_MODULE = 'typescript-language-server/lib/cli.mjs';

const bundledTypeScript: ProviderPreset = {
  id: BUNDLED_TYPESCRIPT_PRESET_ID,
  displayName: 'Bundled TypeScript Language Server',
  tier: 'bundled',
  languageIds: ['typescript', 'typescriptreact', 'javascript', 'javascriptreact'],
  extensions: ['.ts', '.mts', '.cts', '.tsx', '.js', '.jsx', '.mjs', '.cjs'],
  command: {
    // The command is a runtime value, not a literal: it is this Node executable running the entry
    // point resolved out of the CLI package's own dependency tree. That is why the manifest needs
    // references at all — the only preset in the catalog cannot be written without them.
    candidates: [{ $ref: 'nodeExecutable' }],
    args: [{ $ref: 'bundledModuleEntry', module: BUNDLED_TYPESCRIPT_MODULE }, '--stdio'],
    languageIdFrom: 'detected',
  },
  // No `version`: the server ships inside the tarball, so its version is read from package metadata
  // by the bundled artifact check rather than by starting a process.
  // No `initializationOptions`, no `settings`: both absent resolve to the empty tree, which is the
  // exact initialize frame this CLI sends today.
  // No `readiness`: this preset claims nothing about indexing, so the reported status stays `unknown`.
  fixture: {
    files: [
      { path: 'tsconfig.json', content: TYPESCRIPT_FIXTURE_TSCONFIG },
      {
        path: 'src/target.ts',
        content: 'export function fixtureTarget(value: number): number {\n  return value + 1;\n}\n',
      },
      {
        path: 'src/caller.ts',
        content: [
          "import { fixtureTarget } from './target';",
          '',
          'export function fixtureCaller(value: number): number {',
          '  return fixtureTarget(value);',
          '}',
          '',
        ].join('\n'),
      },
    ],
    // Column 17 is the first character of the exported name on line 1.
    target: { file: 'src/target.ts', line: 1, column: 17 },
    expectedCaller: 'fixtureCaller',
  },
  docs: {
    install: 'https://github.com/typescript-language-server/typescript-language-server#installing',
    limitations: [
      'Dynamic dispatch and reflection-based calls are not part of the Call Hierarchy result.',
      'Cross-file results depend on the project being described by a tsconfig.json or jsconfig.json.',
    ],
  },
};

export const PROVIDER_CATALOG: readonly ProviderPreset[] = [bundledTypeScript];

export function findPreset(catalog: readonly ProviderPreset[], id: string): ProviderPreset | undefined {
  return catalog.find(preset => preset.id === id);
}

export function presetIds(catalog: readonly ProviderPreset[]): readonly string[] {
  return catalog.map(preset => preset.id);
}

export function presetsForLanguage(
  catalog: readonly ProviderPreset[],
  languageId: string,
): readonly ProviderPreset[] {
  return catalog.filter(preset => preset.languageIds.includes(languageId));
}

/**
 * Every language some bundled preset answers for, in catalog order.
 *
 * This feeds `provider_required_for_language`, whose details tell the user which languages work
 * without any configuration. It is derived rather than written twice: a literal list that drifts from
 * the presets would advertise a language nothing can serve.
 */
export function bundledLanguageIds(catalog: readonly ProviderPreset[]): readonly string[] {
  return catalog.filter(preset => preset.tier === 'bundled').flatMap(preset => preset.languageIds);
}
