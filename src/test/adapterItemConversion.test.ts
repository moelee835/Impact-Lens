import assert from 'node:assert/strict';
import test from 'node:test';
import { idOf, toAdapterItem } from '../adapterItemConversion';
import { createSymbolKey } from '../symbolIdentity';

// M4 gate 2 shared-adapter lane (docs/work/task-m4-gate2-shared-adapter.md). Plain object literals stand
// in for `vscode.CallHierarchyItem`/`vscode.Range` on purpose - this file imports no `vscode` module at
// all, matching adapterItemConversion.ts's own reason for staying vscode-free (nothing in this repo can
// require('vscode') outside a real extension host). A real vscode.CallHierarchyItem structurally
// satisfies the same shape without a cast; these fixtures are not a fake, they are literally what the
// conversion functions read.
function vscodeLikeItem(overrides: Partial<{
  name: string;
  kind: number;
  detail: string | undefined;
  uri: string;
  rangeStartLine: number;
  selectionLine: number;
  selectionCharacter: number;
}> = {}) {
  const {
    name = 'get_db',
    kind = 12,
    detail = undefined,
    uri = 'file:///workspace/app.py',
    rangeStartLine = 10,
    selectionLine = 10,
    selectionCharacter = 4,
  } = overrides;
  return {
    name,
    kind,
    detail,
    uri: { toString: () => uri },
    range: { start: { line: rangeStartLine, character: 0 }, end: { line: rangeStartLine + 2, character: 0 } },
    selectionRange: {
      start: { line: selectionLine, character: selectionCharacter },
      end: { line: selectionLine, character: selectionCharacter + name.length },
    },
  };
}

test('toAdapterItem converts uri via toString(), not by reading it as a plain string field', () => {
  const item = vscodeLikeItem({ uri: 'file:///workspace/routers/users.py' });
  assert.equal(toAdapterItem(item).uri, 'file:///workspace/routers/users.py');
});

test('toAdapterItem reads range and selectionRange as two independent ranges, not the same range twice', () => {
  const item = vscodeLikeItem({ rangeStartLine: 8, selectionLine: 10, selectionCharacter: 4 });
  const converted = toAdapterItem(item);
  assert.equal(converted.range.start.line, 8, 'range must reflect the DECORATOR/definition span, not selectionRange');
  assert.equal(converted.selectionRange.start.line, 10);
  assert.equal(converted.selectionRange.start.character, 4);
});

test('toAdapterItem turns an empty-string detail into undefined, matching the CLI\'s own optional-detail convention', () => {
  // `item.detail || undefined`, not `?? undefined` - vscode.CallHierarchyItem.detail is a plain string
  // (never null/undefined itself, empty string when there is no detail), and the CLI's own
  // CallHierarchyItem.detail is genuinely optional. `||` collapses the empty-string case to undefined;
  // `??` would have left it as `''`, which is not the same value createSymbolKey()/symbolId() would see
  // from a real CLI-side CallHierarchyItem that never had a detail at all.
  const item = vscodeLikeItem({ detail: '' });
  assert.equal(toAdapterItem(item).detail, undefined);
});

test('idOf(toAdapterItem(item)) equals createSymbolKey() computed directly from the same vscode-shaped fields', () => {
  // The property that actually matters: an adapter-emitted {kind: 'existing', id} endpoint must land on
  // the SAME id impactAnalyzer.ts's own symbolKey() would have assigned this item in `nodes`/`edges` - if
  // the two-step (vscode item -> toAdapterItem -> idOf) path ever diverged from the direct
  // (vscode item -> createSymbolKey) path symbolKey() takes, every adapter-found candidate caller for an
  // EXISTING node would silently render as a phantom synthetic node instead of linking to the real one.
  //
  // reviewer's finding (only half of what "the property that actually matters" needs is actually pinned
  // here): this test proves the FUNCTION-level half - both paths compute the same key from the same
  // input object. It does NOT prove the other half - that `vscode.prepareCallHierarchy`, called a second
  // time from inside the adapter's own `resolveEndpoint()` (via `adapterProviderShim.ts`'s `prepare()`),
  // returns an item whose `uri`/`kind`/`name`/`detail`/`selectionRange.start` fields are IDENTICAL to the
  // ones `impactAnalyzer.ts` already used to build `nodes` from the FIRST call. That is a real, separate
  // assumption about vscode's own query stability across two lookups of the same logical symbol, and
  // this repository has no real-vscode-host harness to measure it directly - the same shape of assumption
  // the CLI itself already carries for pyright (a second `prepareCallHierarchy` call on the same position
  // is trusted to resolve the same symbol), never independently verified there either.
  const item = vscodeLikeItem({ name: 'handler', kind: 12, detail: 'async', uri: 'file:///workspace/app.py', selectionLine: 20, selectionCharacter: 4 });
  const direct = createSymbolKey({
    uri: item.uri.toString(),
    kind: item.kind,
    name: item.name,
    detail: item.detail,
    line: item.selectionRange.start.line,
    character: item.selectionRange.start.character,
  });
  assert.equal(idOf(toAdapterItem(item)), direct);
});

test('idOf keeps otherwise-identical items in different files distinct (the adapter-item-shaped path, not just the vscode-shaped one symbolIdentity.test.ts already covers)', () => {
  const a = toAdapterItem(vscodeLikeItem({ uri: 'file:///workspace/routes/a.py' }));
  const b = toAdapterItem(vscodeLikeItem({ uri: 'file:///workspace/routes/b.py' }));
  assert.notEqual(idOf(a), idOf(b));
});
