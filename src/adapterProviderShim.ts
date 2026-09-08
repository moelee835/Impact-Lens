import * as vscode from 'vscode';
import { toAdapterItem } from './adapterItemConversion';
// Type-only imports (erased at compile time, no require() emitted - never touches the vsix regardless
// of what `cli/dist/**` is or is not shipped). Runtime imports of the adapter itself live wherever it is
// actually invoked (M4 gate 2 shared-adapter lane, docs/work/task-m4-gate2-shared-adapter.md).
import type { CallHierarchyItem, LspPosition } from '../cli/dist/types';

// `toAdapterItem`/`idOf`'s actual logic lives in `adapterItemConversion.ts`, which imports no `vscode`
// module at all so it stays unit-testable with plain `node --test` - this file's own `import * as vscode`
// makes it (and anything else defined in it) impossible to load outside a real VS Code extension host.
export { idOf } from './adapterItemConversion';

/**
 * Wraps `vscode.prepareCallHierarchy` to satisfy the FastAPI adapter's own provider contract
 * (`Pick<CallHierarchyProvider, 'prepare'>`, `cli/src/shared/adapters/types.ts`) - the ONLY member the
 * adapter calls (verified against all three `resolveEndpoint()` call sites before that type was narrowed,
 * M4 gate 2 shared-adapter lane). This is why the extension's shim can be this small: the adapter never
 * asks for `incoming`/`collectDiagnostics`/`dispose`/`capabilities`/`analysisObservations`.
 */
export function createAdapterProvider(): { readonly prepare: (file: string, position: LspPosition) => Promise<readonly CallHierarchyItem[]> } {
  return {
    async prepare(file: string, position: LspPosition): Promise<readonly CallHierarchyItem[]> {
      const uri = vscode.Uri.file(file);
      const vscodePosition = new vscode.Position(position.line, position.character);
      let items: vscode.CallHierarchyItem[] | undefined;
      try {
        items = await vscode.commands.executeCommand<vscode.CallHierarchyItem[]>(
          'vscode.prepareCallHierarchy',
          uri,
          vscodePosition,
        );
      } catch {
        // Matches the adapter's own resolveEndpoint() fold-to-abandonment contract (adapters/types.ts's
        // FrameworkAdapter doc comment): a failed lookup here must join the "could not confirm" branch,
        // never be treated as a promotion opportunity. Returning [] here means the adapter sees this
        // exactly the same way it sees pyright resolving nothing.
        return [];
      }
      return (items ?? []).map(toAdapterItem);
    },
  };
}
