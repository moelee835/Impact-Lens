import * as vscode from 'vscode';
import {
  CompiledTestPatterns,
  compileTestPatterns,
  InvalidTestPatternError,
} from '../cli/dist/shared/testFileClassifier';
import {
  InvalidTestPatternsDocumentError,
  RawTestPatternsDocument,
  validateTestPatternsDocumentShape,
} from '../cli/dist/shared/testPatternsDocument';

/**
 * IL-LIM-010 stage 1 completion (docs/work/task-m4-il-lim-010-stage1-completion.md, "설정 소스"
 * section). Mirrors `NoteStore`'s own `.impact-lens/notes.json`/`notes.local.json` file-reading
 * approach (`vscode.workspace.fs.readFile` + `createFileSystemWatcher`, cached until invalidated) -
 * this is deliberately the SAME two files `cli/src/testPatternsConfig.ts` reads on the CLI side, not a
 * VS Code setting: a setting would be a second, host-specific input source for the shared classifier,
 * reopening one layer up the exact divergence PR #91 measured and fixed (two hosts, one classifier,
 * different answers because their INPUTS differed).
 *
 * reviewer's finding (docs/work/task-m4-il-lim-010-stage1-completion.md): this file used to carry its
 * own hand-copied `validateShape()`/`optionalStringArray()`, identical in intent to
 * `cli/src/testPatternsConfig.ts`'s but with nothing proving the two actually agreed - the exact
 * "two hosts, same rule, no parity guarantee" shape PR #91 found and fixed for path classification
 * itself. Both hosts now call the same `validateTestPatternsDocumentShape()`
 * (`cli/src/shared/testPatternsDocument.ts`) - only the file I/O and how a failure is surfaced
 * (`CliError` vs a plain `Error`) stay host-specific.
 *
 * No test in this repository exercises THIS class directly: it imports the real `vscode` module
 * (`workspace.fs`, `Uri`, `FileSystemWatcher`), which does not resolve under the plain `node --test`
 * runner `npm test` uses (`require('vscode')` throws `Cannot find module 'vscode'` outside a real
 * extension host, confirmed directly) - the same pre-existing harness gap `test:vsix-contents`'s own
 * comment already discloses for VS Code UI verification generally. That is why the shape-validation
 * logic was moved OUT of this file and into `testPatternsDocument.ts` above: that half of this class's
 * correctness is proven by `cli/src/test/testPatternsDocument.test.ts` (a pure, `vscode`-free test) and
 * inherited here by construction, since this class calls that exact function rather than a copy of it.
 * The remaining, genuinely host-specific half - reading bytes via `vscode.workspace.fs` and the watcher
 * invalidation - has no automated coverage and needs a real extension-host run to verify; recorded as a
 * residual, not fixed in this lane.
 */
const TEST_PATTERNS_DIRECTORY = '.impact-lens';
const SHARED_TEST_PATTERNS_FILE = 'test-patterns.json';
const LOCAL_TEST_PATTERNS_FILE = 'test-patterns.local.json';

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
  private async readRaw(uri: vscode.Uri, origin: string): Promise<RawTestPatternsDocument | undefined> {
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
    try {
      return validateTestPatternsDocumentShape(parsed);
    } catch (error) {
      if (error instanceof InvalidTestPatternsDocumentError) {
        throw new Error(`The test pattern configuration in ${origin} is not valid: ${error.message}`);
      }
      throw error;
    }
  }

  dispose(): void {
    this.watcher.dispose();
  }
}

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
