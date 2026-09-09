import assert from 'node:assert/strict';
import test from 'node:test';
import { isTrustedStandardDeclaration } from '../shared/adapters/dynamicCallbackAdapter';

// IL-LIM-001 stage 3 (docs/work/task-il-lim-001-stage3-callback-adapter-design.md). This function
// answers "is the resolved callee really a trusted standard declaration" (axis 1 of the adapter's two
// verification axes) - segment-anchored, per gate 4's `pathEndsWithSegments` lesson and IL-LIM-010's
// ancestor-directory lesson: a filename or directory name alone (`lib.dom.d.ts`, `typescript/`) proves
// nothing, since either could exist anywhere, vendored or workspace-written. Both accepted trust tiers
// require a REAL `node_modules` segment immediately before the rest of the pattern.

test('a real bundled TypeScript lib declaration, flat node_modules layout, is trusted', () => {
  assert.equal(
    isTrustedStandardDeclaration('file:///repo/node_modules/typescript/lib/lib.es5.d.ts'),
    true,
  );
});

test('a real bundled TypeScript lib declaration, pnpm nested layout, is trusted', () => {
  // Measured directly against a real pnpm install (docs/work/task-il-lim-001-stage3-callback-adapter-
  // design.md): the actual path has TWO node_modules segments, the closest to "typescript/lib" is the
  // one that matters, not the first one relative to the workspace root.
  assert.equal(
    isTrustedStandardDeclaration('file:///repo/node_modules/.pnpm/typescript@5.9.3/node_modules/typescript/lib/lib.dom.d.ts'),
    true,
  );
});

test('a real @types/node declaration, pnpm nested layout, is trusted (weaker tier, still accepted)', () => {
  // Measured directly: pnpm's real path is node_modules/.pnpm/@types+node@x/node_modules/@types/node/... -
  // the workspace-relative first two segments are node_modules/.pnpm, NOT node_modules/@types. An
  // earlier version of this function checked only the path relative to the workspace root and would
  // have wrongly rejected this exact real-world shape.
  assert.equal(
    isTrustedStandardDeclaration('file:///repo/node_modules/.pnpm/@types+node@22.20.1/node_modules/@types/node/timers.d.ts'),
    true,
  );
});

test('a flat @types/node declaration (npm/yarn layout, no pnpm nesting) is trusted', () => {
  assert.equal(
    isTrustedStandardDeclaration('file:///repo/node_modules/@types/node/timers.d.ts'),
    true,
  );
});

test('a workspace source file that merely CONTAINS "typescript"/"lib" as directory names, with no real node_modules ancestor, is rejected', () => {
  // The anti-mimicry case this segment-anchoring exists for: a user's own source tree at
  // src/typescript/lib/fake.d.ts must not pass just because it has the right directory names in the
  // right order - real installations always sit under a genuine node_modules directory.
  assert.equal(
    isTrustedStandardDeclaration('file:///repo/src/typescript/lib/fake.d.ts'),
    false,
  );
});

test('a vendored copy under a non-node_modules "vendored" directory is rejected the same way', () => {
  assert.equal(
    isTrustedStandardDeclaration('file:///repo/src/vendored/typescript/lib/copy.d.ts'),
    false,
  );
});

test('an ordinary workspace source file is rejected', () => {
  assert.equal(
    isTrustedStandardDeclaration('file:///repo/src/registerCallback.ts'),
    false,
  );
});

test('a non-file: URI (defensive - CallHierarchyItem.uri is always file: in practice) is rejected', () => {
  assert.equal(isTrustedStandardDeclaration('untitled:Untitled-1'), false);
});
