import * as vscode from 'vscode';

export type ImpactRelation = 'root' | 'direct' | 'transitive' | 'test';

export interface ImpactNode {
  readonly id: string;
  readonly item: vscode.CallHierarchyItem;
  readonly depth: number;
  readonly relation: ImpactRelation;
  readonly callSiteRanges: readonly vscode.Range[];
  note: string;
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
  readonly analyzedAt: number;
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
}
