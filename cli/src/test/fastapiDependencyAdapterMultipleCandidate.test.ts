import assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import test from 'node:test';
import { pathToFileURL } from 'node:url';
import { fastapiDependencyAdapter } from '../adapters/fastapiDependencyAdapter';
import { AdapterInput } from '../adapters/types';
import { symbolId } from '../impact';
import { CallHierarchyItem, CallHierarchyProvider, IncomingCall, ProviderCapabilities, ProviderDiagnostic } from '../types';

// M4 stage 3, "단계 4" (docs/work/task-m4-stage3-accuracy-latency-gates.md). `resolution: 'multiple'`
// (`resolutionCandidateCount > 1 ? 'multiple' : 'single'` in fastapiDependencyAdapter.ts) has never been
// exercised by a test - two real attempts at a Python source construction that makes pyright's
// `prepareCallHierarchy` return more than one candidate for a single reference both collapsed to exactly
// one candidate (stage 2's conditional redefinition, stage 3's try/except import fallback; see the work
// document). That is a fact about pyright's binder, not about this adapter's own code, and it left the
// `'multiple'` branch itself with zero coverage - exactly the shape stage 2 already found three of its
// five real defects in (a code path with no fixture reaching it at all).
//
// This test closes that specific gap without pretending pyright produces this: `AdapterInput.provider`
// is the `CallHierarchyProvider` interface, and `fastapiDependencyAdapter()` is a plain function of that
// input - nothing about it requires the real pyright-backed provider `impact.test.ts`'s own
// `FakeProvider` already substitutes elsewhere in this codebase. Standing in a provider whose `prepare()`
// returns two items for the `Depends(get_db)` reference (one of them genuinely root, by `symbolId`) drives
// the adapter's own resolution-counting logic through the `'multiple'` branch on a real (if synthetic)
// Python file layout, proving the code assigns the label, evidence range and edge shape correctly when
// more than one candidate exists - a claim about THIS CODE, deliberately narrower than "pyright can be
// made to do this on real source", which stays recorded as unresolved in the work document.

const range = (line: number, character = 0) => ({
  start: { line, character },
  end: { line, character: character + 10 },
});

function item(workspace: string, file: string, name: string, line: number, character = 0): CallHierarchyItem {
  return {
    name,
    kind: 12,
    uri: pathToFileURL(path.join(workspace, file)).toString(),
    range: range(line, character),
    selectionRange: range(line, character),
  };
}

/**
 * Returns a fixed sequence of `prepare()` results, one per call, in the order the adapter is known to
 * call them for this exact fixture (Depends() reference first, then the enclosing `def`) - traced
 * directly from `fastapiDependencyAdapter()`'s own source, not guessed. A call beyond the scripted
 * sequence returns `[]`, the same "unresolved" value a real provider gives for a position it cannot
 * resolve - a call at an unscripted position was never going to name a real symbol regardless. What
 * actually protects this test against a future change to the adapter's call order or count is its own
 * `edges.length`/`resolution`/`source name` assertions below, not this provider: an earlier version of
 * this comment claimed an unscripted call would throw and "fail loudly", but `resolveEndpoint()` in
 * fastapiDependencyAdapter.ts wraps every `prepare()` call in try/catch and converts any exception to
 * `{ items: [] }` - a throw here is caught and silently becomes the same `[]` a plain return would give,
 * so it defended nothing (found by a reviewer's mutation test: replacing the throw with `return []`
 * produced a byte-identical failure message on the same broken-code probe below).
 */
class ScriptedProvider implements CallHierarchyProvider {
  readonly capabilities: ProviderCapabilities = {
    host: 'lsp',
    name: 'scripted-provider',
    version: '1.0.0',
    requestedLanguageId: 'python',
    detectedLanguageId: 'python',
    selectedBy: 'custom',
    languageMatch: true,
    callHierarchy: true,
    diagnostics: false,
    advertised: { callHierarchy: true, diagnostics: false },
    observed: { prepareCallHierarchy: true, incomingCalls: false, diagnostics: false },
    lifecycle: { stage: 'query', status: 'ready' },
  };

  private callIndex = 0;

  constructor(private readonly results: ReadonlyArray<readonly CallHierarchyItem[]>) {}

  async prepare(): Promise<readonly CallHierarchyItem[]> {
    if (this.callIndex >= this.results.length) {
      return [];
    }
    const result = this.results[this.callIndex];
    this.callIndex += 1;
    return result;
  }

  async incoming(): Promise<readonly IncomingCall[]> {
    return [];
  }

  async collectDiagnostics(): Promise<readonly ProviderDiagnostic[]> {
    return [];
  }

  async dispose(): Promise<void> {}
}

test(
  'fastapiDependencyAdapter, Depends() reference resolves to two provider candidates: resolution is multiple, both endpoints preserved',
  async t => {
    const workspace = await fs.mkdtemp(path.join(os.tmpdir(), 'impact-lens-fastapi-multiple-'));
    t.after(() => fs.rm(workspace, { recursive: true, force: true }));

    // real_module.py has no fastapi import and no `Depends(` text, so the adapter's own early-out skips
    // it during the workspace walk - only consumer.py is ever visited, keeping the scripted prepare()
    // sequence to exactly the two calls below.
    await fs.writeFile(path.join(workspace, 'real_module.py'), 'def get_db():\n    return object()\n');
    await fs.writeFile(
      path.join(workspace, 'consumer.py'),
      [
        'from fastapi import Depends',
        'from real_module import get_db',
        '',
        'def handler(db=Depends(get_db)):',
        '    return db',
        '',
      ].join('\n'),
    );

    const root = item(workspace, 'real_module.py', 'get_db', 0, 4);
    const rootId = symbolId(root);
    // A second, genuinely different candidate (different uri/selectionRange) - what a real ambiguous
    // reference would resolve to alongside root, if pyright ever produced one.
    const otherCandidate = item(workspace, 'other_module.py', 'get_db', 0, 4);
    const handler = item(workspace, 'consumer.py', 'handler', 3, 4);

    const provider = new ScriptedProvider([
      [root, otherCandidate], // prepare() at the `Depends(get_db)` reference in consumer.py
      [handler], // prepare() at the enclosing `def handler` in consumer.py
    ]);

    const input: AdapterInput = {
      workspace,
      root,
      rootId,
      provider,
      existingNodeIds: new Set([rootId, symbolId(handler)]),
      budget: { maxFiles: 200, maxMatchesPerFile: 20 },
    };

    const result = await fastapiDependencyAdapter(input);

    assert.equal(result.edges.length, 1, JSON.stringify(result.edges));
    const edge = result.edges[0]!;
    assert.equal(edge.resolution, 'multiple', 'two provider candidates for the reference must produce resolution: multiple');
    assert.equal(edge.reasonCode, 'fastapi-depends');
    assert.deepEqual(edge.target, { kind: 'existing', id: rootId }, 'target must still be root, not the other candidate');
    assert.deepEqual(edge.source, { kind: 'existing', id: symbolId(handler) });
  },
);

test(
  'fastapiDependencyAdapter, Depends() reference resolves to exactly one provider candidate: resolution is single (control)',
  async t => {
    const workspace = await fs.mkdtemp(path.join(os.tmpdir(), 'impact-lens-fastapi-single-'));
    t.after(() => fs.rm(workspace, { recursive: true, force: true }));

    await fs.writeFile(path.join(workspace, 'real_module.py'), 'def get_db():\n    return object()\n');
    await fs.writeFile(
      path.join(workspace, 'consumer.py'),
      [
        'from fastapi import Depends',
        'from real_module import get_db',
        '',
        'def handler(db=Depends(get_db)):',
        '    return db',
        '',
      ].join('\n'),
    );

    const root = item(workspace, 'real_module.py', 'get_db', 0, 4);
    const rootId = symbolId(root);
    const handler = item(workspace, 'consumer.py', 'handler', 3, 4);

    // The control for the test above: same fixture, but the reference resolves to root alone - proves
    // the 'multiple' result above comes from the candidate count, not from some other difference between
    // the two test setups.
    const provider = new ScriptedProvider([
      [root],
      [handler],
    ]);

    const input: AdapterInput = {
      workspace,
      root,
      rootId,
      provider,
      existingNodeIds: new Set([rootId, symbolId(handler)]),
      budget: { maxFiles: 200, maxMatchesPerFile: 20 },
    };

    const result = await fastapiDependencyAdapter(input);

    assert.equal(result.edges.length, 1, JSON.stringify(result.edges));
    assert.equal(result.edges[0]!.resolution, 'single');
  },
);
