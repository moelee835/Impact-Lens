import * as vscode from 'vscode';
import { NoteSource } from './noteModel';

export type ImpactRelation = 'root' | 'direct' | 'transitive' | 'test';
export type ImpactAnalysisState = 'current' | 'stale' | 'analyzing' | 'partial' | 'failed';
export type TestFreshness = 'notRun' | 'outdated';
export type TraversalLimit = 'depth' | 'nodes';

export interface ImpactProviderMetadata {
  readonly host: 'vscode';
  readonly name: 'unknown';
  readonly requestedLanguageId: string;
  readonly detectedLanguageId: string;
  readonly selectedBy: 'vscode';
  readonly languageMatch: 'unknown';
  readonly callHierarchy: boolean;
  readonly diagnostics: boolean;
  readonly advertised: {
    readonly callHierarchy: 'unknown';
    readonly diagnostics: 'unknown';
  };
  readonly observed: {
    readonly prepareCallHierarchy: boolean;
    readonly incomingCalls: boolean;
    readonly diagnostics: boolean;
  };
  readonly lifecycle: {
    readonly stage: 'query';
    readonly status: 'ready';
  };
}

export interface ImpactCoverage {
  readonly traversal: {
    readonly status: 'complete' | 'depth-limited' | 'node-limited';
    readonly requestedDepth: number;
    readonly reachedDepth: number;
    readonly maxNodes: number;
  };
  readonly semantic: {
    readonly status: 'static-only';
    readonly evidenceSources: readonly ['vscode-call-hierarchy'];
  };
  readonly indexing: { readonly status: 'unknown' };
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
