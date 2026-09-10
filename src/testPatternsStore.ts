import * as vscode from 'vscode';
import {
  CompiledTestPatterns,
  compileTestPatterns,
  InvalidTestPatternError,
} from '../cli/dist/shared/testFileClassifier';

/**
 * IL-LIM-010 stage 1 completion (docs/work/task-m4-il-lim-010-stage1-completion.md, "설정 소스"
 * section). Mirrors `NoteStore`'s own `.impact-lens/notes.json`/`notes.local.json` file-reading
 * approach (`vscode.workspace.fs.readFile` + `createFileSystemWatcher`, cached until invalidated) -
 * this is deliberately the SAME two files `cli/src/testPatternsConfig.ts` reads on the CLI side, not a
 * VS Code setting: a setting would be a second, host-specific input source for the shared classifier,
 * reopening one layer up the exact divergence PR #91 measured and fixed (two hosts, one classifier,
 * different answers because their INPUTS differed).
 */
const TEST_PATTERNS_DIRECTORY = '.impact-lens';
const SHARED_TEST_PATTERNS_FILE = 'test-patterns.json';
const LOCAL_TEST_PATTERNS_FILE = 'test-patterns.local.json';
const ALLOWED_FIELDS = ['include', 'exclude'];

interface RawTestPatterns {
  readonly include: readonly string[];
  readonly exclude: readonly string[];
}

export class TestPatternsStore implements vscode.Disposable {
  private readonly cache = new Map<string, Promise<CompiledTestPatterns>>();
  private readonly watcher: vscode.FileSystemWatcher;

  constructor() {
    // Matches both file names under any `.impact-lens` directory in any workspace folder - a single
    // glob covers the shared and local file, same as `NoteStore`'s watcher covers just the one it has.
    this.watcher = vscode.workspace.createFileSystemWatcher('**/.impact-lens/test-patterns{.local,}.json');
    const invalidate = (): void => this.cache.clear();
    this.watcher.onDidCreate(invalidate);
    this.watcher.onDidChange(invalidate);
    this.watcher.onDidDelete(invalidate);
  }

  /**
   * Compiled patterns for a workspace folder, unioned from its shared and local files (never one
   * overriding the other - see `cli/src/testPatternsConfig.ts`'s identical reasoning). Rejects with an
   * `Error` (not a `CliError` - this is Extension-side, there is no CLI envelope here) describing the
   * problem and naming the actual file when either file is malformed - callers must let this propagate
   * as an analysis failure (the existing `vscode.window.showErrorMessage` path in `controller.ts`),
   * never catch and silently proceed with fewer patterns.
   */
  async patternsFor(folder: vscode.WorkspaceFolder): Promise<CompiledTestPatterns> {
    const cacheKey = folder.uri.toString();
    let pending = this.cache.get(cacheKey);
    if (!pending) {
      pending = this.load(folder);
      this.cache.set(cacheKey, pending);
    }
    return pending;
  }

  private async load(folder: vscode.WorkspaceFolder): Promise<CompiledTestPatterns> {
    const shared = await this.readAndCompile(folder, SHARED_TEST_PATTERNS_FILE);
    const local = await this.readAndCompile(folder, LOCAL_TEST_PATTERNS_FILE);
    return {
      include: [...shared.include, ...local.include],
      exclude: [...shared.exclude, ...local.exclude],
    };
  }

  private async readAndCompile(folder: vscode.WorkspaceFolder, fileName: string): Promise<CompiledTestPatterns> {
    const origin = `${TEST_PATTERNS_DIRECTORY}/${fileName}`;
    const uri = vscode.Uri.joinPath(folder.uri, TEST_PATTERNS_DIRECTORY, fileName);
    const raw = await this.readRaw(uri, origin);
    if (raw === undefined) {
      return { include: [], exclude: [] };
    }
    try {
      return compileTestPatterns(raw.include, raw.exclude);
    } catch (error) {
      if (error instanceof InvalidTestPatternError) {
        throw new Error(
          `The test pattern configuration in ${origin} is not valid: its "${error.field}" list `
          + `contains an unsupported pattern: ${error.message}`,
        );
      }
      throw error;
    }
  }

  /** Returns `undefined` for a missing file - not an error, most workspaces will have neither file. */
  private async readRaw(uri: vscode.Uri, origin: string): Promise<RawTestPatterns | undefined> {
    let bytes: Uint8Array;
    try {
      bytes = await vscode.workspace.fs.readFile(uri);
    } catch (error) {
      if (error instanceof vscode.FileSystemError && error.code === 'FileNotFound') {
        return undefined;
      }
      throw new Error(`The test pattern configuration in ${origin} could not be read: ${describeError(error)}`);
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(new TextDecoder().decode(bytes));
    } catch (error) {
      throw new Error(`The test pattern configuration in ${origin} is not valid: it is not valid JSON (${describeError(error)}).`);
    }
    return validateShape(parsed, origin);
  }

  dispose(): void {
    this.watcher.dispose();
  }
}

function validateShape(parsed: unknown, origin: string): RawTestPatterns {
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new Error(`The test pattern configuration in ${origin} is not valid: it must contain a JSON object.`);
  }
  const value = parsed as Record<string, unknown>;
  const unknownFields = Object.keys(value).filter(key => !ALLOWED_FIELDS.includes(key));
  if (unknownFields.length > 0) {
    throw new Error(
      `The test pattern configuration in ${origin} is not valid: it has unknown fields: `
      + `${unknownFields.sort().join(', ')}.`,
    );
  }
  return {
    include: optionalStringArray(value.include, 'include', origin),
    exclude: optionalStringArray(value.exclude, 'exclude', origin),
  };
}

function optionalStringArray(value: unknown, field: string, origin: string): readonly string[] {
  if (value === undefined) {
    return [];
  }
  if (!Array.isArray(value) || !value.every(entry => typeof entry === 'string')) {
    throw new Error(`The test pattern configuration in ${origin} is not valid: field "${field}" must be an array of strings.`);
  }
  return value;
}

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
