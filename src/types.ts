import * as vscode from 'vscode';
import { NoteSource } from './noteModel';
// Type-only (erased at compile time, no require() emitted - see adapterProviderShim.ts's own note on
// this). Not duplicated the way the response-schema vocabulary above is: `AugmentedEdge` IS the CLI's
// adapter-output contract passed through unchanged (M4 gate 2 shared-adapter lane,
// docs/work/task-m4-gate2-shared-adapter.md), not a value this file computes its own version of.
import type { AugmentedEdge } from '../cli/dist/types';

export type ImpactRelation = 'root' | 'direct' | 'transitive' | 'test';
export type ImpactAnalysisState = 'current' | 'stale' | 'analyzing' | 'partial' | 'failed';
// This has only ever had `'notRun'`/`'outdated'`, never a `'passed'`/`'failed'` value - so far that has
// been a coincidental safety property, not a verified one: nothing in this type PREVENTS misreporting an
// unexecuted test as having passed, there has simply never been a code path that tries. IL-LIM-010 stage
// 3 (test-run-result import, out of this lane's scope - docs/work/task-m4-il-lim-010-stage1-completion.md)
// is expected to add such a value; the moment it does, "does an unrun test ever get reported as passed"
// needs to be re-verified against the new code, not assumed still true because it was true here before.
export type TestFreshness = 'notRun' | 'outdated';
export type TraversalLimit = 'depth' | 'nodes';

// ---------------------------------------------------------------------------
// Node-level test classification evidence (IL-LIM-010 stage 1 completion, mirrors
// `cli/src/types.ts` - see that file's comment for why these are separate from `ImpactRelation` and why
// they are not named `testEvidence`). Duplicated rather than imported for the same reason the vocabulary
// arrays above are: the Extension and the CLI are separate TypeScript projects with separate packaging.
// ---------------------------------------------------------------------------

/** Why a node was classified `relation: 'test'`. See `cli/src/types.ts`'s `TestClassificationRule`. */
export interface TestClassificationRule {
  readonly id: string;
  readonly source: 'default-convention' | 'user-include';
}

/** Why a node that would otherwise be `relation: 'test'` is not - a user exclude pattern overrode the
 * match. Mutually exclusive with `TestClassificationRule` on the same node. See `cli/src/types.ts`'s
 * `SuppressedTestRule`. */
export interface SuppressedTestRule {
  readonly ruleId: string | null;
  readonly excludePattern: string;
}

// This vocabulary is the same contract the Agent CLI serializes, declared by
// `cli/schemas/response.schema.json`. It is duplicated rather than imported because the Extension and the
// CLI are separate TypeScript projects with separate packaging; `src/test/coverage.test.ts` compares these
// arrays against that schema so the two copies cannot drift apart.
//
// The values are deliberately wider than what `src/coverage.ts` produces today. Narrowing each field to the
// single literal the VS Code broker emits made the type a statement about one call site instead of about the
// contract, so every new state value broke compilation in the type layer before any UI could be written to
// handle it. Widening them costs nothing here: `src/graphPanel.ts` reads all of these as plain strings.

export const PROVIDER_HOSTS = ['lsp', 'vscode'] as const;
export type ProviderHost = (typeof PROVIDER_HOSTS)[number];

export const PROVIDER_SELECTED_BY = ['bundled', 'auto', 'preset', 'project', 'custom', 'vscode'] as const;
export type ProviderSelectedBy = (typeof PROVIDER_SELECTED_BY)[number];

export const PROVIDER_LIFECYCLE_STAGES = [
  'discovery',
  'launch',
  'initialize',
  'indexing',
  'capability',
  'query',
] as const;
export type ProviderLifecycleStage = (typeof PROVIDER_LIFECYCLE_STAGES)[number];

export const PROVIDER_LIFECYCLE_STATUSES = ['working', 'ready', 'failed', 'unknown'] as const;
export type ProviderLifecycleStatus = (typeof PROVIDER_LIFECYCLE_STATUSES)[number];

export const TRAVERSAL_STATUSES = ['complete', 'depth-limited', 'node-limited', 'timeout', 'failed'] as const;
export type TraversalStatus = (typeof TRAVERSAL_STATUSES)[number];

export const SEMANTIC_STATUSES = ['static-only', 'augmented'] as const;
export type SemanticStatus = (typeof SEMANTIC_STATUSES)[number];

export const INDEXING_STATUSES = ['ready', 'working', 'unknown'] as const;
export type IndexingStatus = (typeof INDEXING_STATUSES)[number];

export interface ImpactProviderMetadata {
  readonly host: ProviderHost;
  readonly name: string;
  readonly version?: string;
  readonly requestedLanguageId: string;
  readonly detectedLanguageId: string;
  readonly selectedBy: ProviderSelectedBy;
  readonly languageMatch: boolean | 'unknown';
  readonly callHierarchy: boolean;
  readonly diagnostics: boolean;
  readonly advertised: {
    readonly callHierarchy: boolean | 'unknown';
    readonly diagnostics: boolean | 'unknown';
  };
  readonly observed: {
    readonly prepareCallHierarchy: boolean;
    readonly incomingCalls: boolean;
    readonly diagnostics: boolean;
  };
  readonly lifecycle: {
    readonly stage: ProviderLifecycleStage;
    readonly status: ProviderLifecycleStatus;
  };
}

export interface ImpactCoverage {
  readonly traversal: {
    readonly status: TraversalStatus;
    readonly requestedDepth: number;
    readonly reachedDepth: number;
    readonly maxNodes: number;
  };
  readonly semantic: {
    readonly status: SemanticStatus;
    readonly evidenceSources: readonly string[];
  };
  readonly indexing: { readonly status: IndexingStatus };
  readonly reasons: readonly string[];
}

export interface ImpactDiagnostic {
  readonly severity: 'error' | 'warning';
  readonly message: string;
  readonly line: number;
}

export interface ImpactDelta {
  readonly addedNodeIds: readonly string[];
  readonly removedNodeIds: readonly string[];
  readonly addedEdgeCount: number;
  readonly removedEdgeCount: number;
  readonly addedDiagnosticCount: number;
}

export interface ImpactNode {
  readonly id: string;
  readonly item: vscode.CallHierarchyItem;
  readonly depth: number;
  readonly relation: ImpactRelation;
  readonly callSiteRanges: readonly vscode.Range[];
  note: string;
  noteSource?: NoteSource;
  diagnostics: readonly ImpactDiagnostic[];
  changed: boolean;
  reviewed: boolean;
  testFreshness?: TestFreshness;
  /** Non-null if and only if `relation === 'test'` - the classification evidence for that verdict. */
  readonly testRule: TestClassificationRule | null;
  /** Non-null if and only if a user exclude pattern is the reason this node is NOT `relation: 'test'`.
   * Can be true even when `relation` is `'direct'`/`'transitive'` - the classifier runs on every graph
   * node regardless of relation. Mutually exclusive with `testRule`. */
  readonly testRuleSuppressed: SuppressedTestRule | null;
}

export interface ImpactEdge {
  readonly source: string;
  readonly target: string;
  readonly callSiteRanges: readonly vscode.Range[];
}

export interface ImpactResult {
  readonly root: ImpactNode;
  readonly nodes: readonly ImpactNode[];
  readonly edges: readonly ImpactEdge[];
  readonly truncated: boolean;
  readonly traversalLimits: readonly TraversalLimit[];
  readonly requestedDepth: number;
  readonly reachedDepth: number;
  readonly maxNodes: number;
  readonly provider: ImpactProviderMetadata;
  readonly coverage: ImpactCoverage;
  readonly limitations: readonly string[];
  readonly analyzedAt: number;
  analysisState: ImpactAnalysisState;
  delta: ImpactDelta;
  changedAt?: number;
  /** Candidate callers the FastAPI adapter found that a static Call Hierarchy cannot see on its own
   * (`Depends()` references, route-mount entrypoints) - never merged into `nodes`/`edges`, which stay a
   * pure claim about what the language service itself confirmed (M4 stage 1's own rollback contract,
   * unaffected by this lane). Empty when augmentation is off (the default) or found nothing. `graphPanel.ts`
   * is responsible for rendering these as visually distinct from `edges` - a confirmed vs. candidate
   * relationship is a difference in evidence strength, not a fourth `ImpactRelation` kind (M4 gate 2 UI
   * design decision, docs/work/task-m4-gate2-shared-adapter.md). */
  readonly augmentedEdges: readonly AugmentedEdge[];
}

export interface TraversalEntry<T> {
  readonly value: T;
  readonly depth: number;
  readonly parentKey?: string;
}

export interface TraversalEdge {
  readonly source: string;
  readonly target: string;
}

export interface TraversalResult<T> {
  readonly entries: readonly TraversalEntry<T>[];
  readonly edges: readonly TraversalEdge[];
  readonly truncated: boolean;
  readonly limits: readonly TraversalLimit[];
  readonly reachedDepth: number;
}
