import * as vscode from 'vscode';
import { NoteSource } from './noteModel';

export type ImpactRelation = 'root' | 'direct' | 'transitive' | 'test';
export type ImpactAnalysisState = 'current' | 'stale' | 'analyzing' | 'partial' | 'failed';
export type TestFreshness = 'notRun' | 'outdated';
export type TraversalLimit = 'depth' | 'nodes';

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
