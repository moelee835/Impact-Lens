import type { AugmentedEdge, AugmentedEndpoint } from '../cli/dist/types';

// M4 gate 2 UI lane left this logic as literal JS text inside `graphPanel.ts`'s `getHtml()` template
// literal (docs/work/task-m4-gate2-shared-adapter.md, "Backlog - target-synthetic 분기"), because that
// literal is the only place it ran - a reviewer needing to check the `target-synthetic` branch had to
// `eval` the extracted text, a check tied to the template literal's exact formatting rather than a real,
// re-runnable test. This module is the fix: real TypeScript, imported and unit-testable
// (`src/test/candidateGraphResolution.test.ts`) like any other file, embedded into the Webview's client
// script the same already-proven way `graphLayout.ts`'s functions are - `${fn.toString()}` inlined into
// the SAME nonce'd `<script>` block `getHtml()` already writes. That is a deliberate choice, not the
// only one considered: a separate `<script src="...">` file would need its own vsix packaging entry and
// CSP allowance, both new risk this file avoids entirely by reusing the mechanism `calculateGraphLayout`/
// `calculateFitZoom` already ship through without incident.
//
// Purity constraint (same as `graphLayout.ts`): every export below must be usable as its OWN
// `.toString()`'d source with no closure over anything outside its own parameters - the Webview runs it
// with none of this file's other imports, and TypeScript's type annotations disappear from the compiled
// output before `.toString()` ever sees it, so they cost nothing at runtime.

export interface CandidateAnchorNode {
  readonly depth: number;
}

export interface SyntheticNode {
  readonly id: string;
  readonly depth: number;
  readonly name: string;
  readonly path: string;
  readonly line: number;
}

export interface ResolvedCandidateEdge {
  readonly source: string;
  readonly target: string;
}

type SyntheticEndpoint = Extract<AugmentedEndpoint, { readonly kind: 'synthetic' }>;

// M4 gate 2 UI lane (docs/work/task-m4-gate2-shared-adapter.md). The literal string, not a paraphrase -
// `scripts/lib/response-policy-engine.mjs`'s own `CANDIDATE_CALLER_PHRASE` (`'candidate caller'`) is what
// the CLI's response-policy engine and its doc-invariant already share as one source specifically to
// prevent this exact kind of drift; this file cannot import that constant directly (a plain `.mjs`
// script, a different module system from this file's compiled output), so
// `src/test/graphPanelAugmentedEdges.test.ts`'s structural assertion reads response-policy-engine.mjs's
// source text and checks this literal still matches it.
export const CANDIDATE_LABEL_TEXT = 'candidate caller';

/**
 * Resolves one `AugmentedEdge`'s source/target into plain ids the layout/render loops can use - an
 * `existing` endpoint's id must already be in `nodeById` (the depth-filtered node set) or the whole edge
 * is skipped, same reasoning as the confirmed-edge loop's own "if (!source || !target) continue". A
 * `synthetic` endpoint gets (or reuses) a pseudo-node via `resolveSyntheticNode` below.
 *
 * This function is self-contained because its source also runs in the Webview - see this file's own
 * top comment.
 */
export function resolveCandidateEdgeEndpoints(
  augmented: AugmentedEdge,
  nodeById: Map<string, CandidateAnchorNode>,
  syntheticNodesById: Map<string, SyntheticNode>,
): ResolvedCandidateEdge | undefined {
  if (augmented.source.kind === 'existing' && !nodeById.has(augmented.source.id)) return undefined;
  if (augmented.target.kind === 'existing' && !nodeById.has(augmented.target.id)) return undefined;
  const anchor = augmented.source.kind === 'existing' ? nodeById.get(augmented.source.id)
    : augmented.target.kind === 'existing' ? nodeById.get(augmented.target.id) : undefined;
  const sourceId = augmented.source.kind === 'existing' ? augmented.source.id
    : resolveSyntheticNode(augmented.source, anchor, syntheticNodesById);
  const targetId = augmented.target.kind === 'existing' ? augmented.target.id
    : resolveSyntheticNode(augmented.target, anchor, syntheticNodesById);
  if (!sourceId || !targetId) return undefined;
  return { source: sourceId, target: targetId };
}

/**
 * `anchor` is the edge's OTHER endpoint (already confirmed `existing` by the caller) - this is what
 * "depth + 1, not always render" (docs/work/task-m4-gate2-shared-adapter.md's UI to-do list) means in
 * code: without an anchor there is no depth to place a synthetic pseudo-node at, so it is skipped
 * (returns `undefined`) rather than guessed. No adapter produces an edge with no `existing` endpoint at
 * all today - `resolveCandidateEdgeEndpoints` only ever calls this with an `undefined` anchor when BOTH
 * endpoints are synthetic, a shape `fastapiDependencyAdapter.ts` never emits (confirmed against both of
 * its `edges.push` call sites) - so this is a defensive, currently-unreached branch, not one exercised by
 * the current adapter. Pinned directly in `src/test/candidateGraphResolution.test.ts` regardless, since
 * this module (unlike the template-literal text it replaces) can actually `require()` it.
 *
 * This function is self-contained because its source also runs in the Webview - see this file's own
 * top comment.
 */
export function resolveSyntheticNode(
  endpoint: SyntheticEndpoint,
  anchor: CandidateAnchorNode | undefined,
  syntheticNodesById: Map<string, SyntheticNode>,
): string | undefined {
  if (!anchor) return undefined;
  const key = endpoint.file + '#' + endpoint.range.start.line + ':' + endpoint.range.start.column + '#' + endpoint.name;
  if (!syntheticNodesById.has(key)) {
    syntheticNodesById.set(key, {
      id: 'candidate:' + key,
      depth: anchor.depth + 1,
      name: endpoint.name,
      path: endpoint.file,
      line: endpoint.range.start.line,
    });
  }
  return syntheticNodesById.get(key)!.id;
}
