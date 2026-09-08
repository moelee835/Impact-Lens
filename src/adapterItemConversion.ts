import { createSymbolKey } from './symbolIdentity';
// Type-only (erased at compile time, no require() emitted - never touches the vsix regardless of what
// cli/dist/** is or is not shipped, M4 gate 2 shared-adapter lane, docs/work/task-m4-gate2-shared-
// adapter.md).
import type { CallHierarchyItem } from '../cli/dist/types';

// Deliberately NOT `vscode.CallHierarchyItem`/`vscode.Range` - this file imports no `vscode` module at
// all, on purpose, so its conversion logic is unit-testable with plain `node --test` (matching
// `symbolIdentity.ts`'s own reason for staying vscode-free - the extension's test suite cannot run
// anything that requires('vscode'), since nothing in this repo hosts a real VS Code extension process for
// tests, and `adapterProviderShim.ts` itself does `import * as vscode from 'vscode'` at its top, so
// anything living in that file - even a function that never touches a vscode.* value directly - becomes
// untestable the moment Node tries to load the module). A real `vscode.CallHierarchyItem`/`vscode.Range`
// structurally satisfies these narrower shapes without a cast; `adapterProviderShim.ts` passes one in
// directly.
interface VscodeLikePosition {
  readonly line: number;
  readonly character: number;
}
interface VscodeLikeRange {
  readonly start: VscodeLikePosition;
  readonly end: VscodeLikePosition;
}
export interface VscodeLikeCallHierarchyItem {
  readonly name: string;
  readonly kind: number;
  readonly detail?: string;
  readonly uri: { toString(): string };
  readonly range: VscodeLikeRange;
  readonly selectionRange: VscodeLikeRange;
}

/**
 * Converts a vscode-shaped call hierarchy item to the adapter's plain LSP-shaped `CallHierarchyItem` (a
 * JSON-safe string uri, `{line, character}` positions - what the CLI's own `prepare()` returns and what
 * `AdapterInput.root`/`resolveEndpoint()`'s results are expected to look like). `adapterProviderShim.ts`
 * uses this for every item `vscode.prepareCallHierarchy` returns AND for the analysis root itself
 * (`AdapterInput.root` needs this shape too, the same conversion `createAdapterProvider()`'s own
 * `prepare()` already applies to its results).
 */
export function toAdapterItem(item: VscodeLikeCallHierarchyItem): CallHierarchyItem {
  return {
    name: item.name,
    kind: item.kind,
    detail: item.detail || undefined,
    uri: item.uri.toString(),
    range: toLspRange(item.range),
    selectionRange: toLspRange(item.selectionRange),
  };
}

function toLspRange(range: VscodeLikeRange): CallHierarchyItem['range'] {
  return {
    start: { line: range.start.line, character: range.start.character },
    end: { line: range.end.line, character: range.end.character },
  };
}

/**
 * The extension's own id scheme, given an adapter-shaped (plain LSP) `CallHierarchyItem` instead of a
 * `vscode.CallHierarchyItem` - `AdapterInput.idOf`'s doc comment (`cli/src/shared/adapters/types.ts`)
 * requires every host supply this, since the adapter has no way to compute a host's id scheme itself.
 * Produces the exact same string `impactAnalyzer.ts`'s own `symbolKey()` would for the equivalent
 * `vscode.CallHierarchyItem` - both funnel through `createSymbolKey()` (`symbolIdentity.ts`) with the
 * same six fields, just read from a different item shape (confirmed directly: `uri`/`kind`/`name`/
 * `detail` line up field-for-field, `selectionRange.start.{line,character}` is what both functions read,
 * never `range`). This is what makes an adapter-emitted `{kind: 'existing', id}` endpoint (see
 * `endpointFor()` in `fastapiDependencyAdapter.ts`) land on the SAME id `nodes`/`edges` already use in
 * this extension's own graph, instead of a value only the adapter itself would recognize.
 */
export function idOf(item: CallHierarchyItem): string {
  return createSymbolKey({
    uri: item.uri,
    kind: item.kind,
    name: item.name,
    detail: item.detail,
    line: item.selectionRange.start.line,
    character: item.selectionRange.start.character,
  });
}
