// The vocabulary below is the response contract, not an implementation detail. `cli/schemas/response.schema.json`
// ships in the npm tarball, so its enums are already public and cannot be narrowed inside schemaVersion 1.
// These arrays exist at runtime so `cli/src/test/schema.test.ts` can compare them against the schema and fail
// the build when one side gains a value the other does not. A plain TypeScript union would disappear at compile
// time and let the two drift apart unnoticed, which is exactly how the drift this file just fixed appeared.

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

// `timeout` and `failed` have no producer yet. The approved decision adopts them as v1 projection targets for
// `completion.traversalStatus` instead of deleting them, because deleting a declared value narrows the producer
// contract and that is a v2-only change. See docs/work/task-m1-state-truth-table.md section 4.1.
export const TRAVERSAL_STATUSES = ['complete', 'depth-limited', 'node-limited', 'timeout', 'failed'] as const;
export type TraversalStatus = (typeof TRAVERSAL_STATUSES)[number];

export const SEMANTIC_STATUSES = ['static-only', 'augmented'] as const;
export type SemanticStatus = (typeof SEMANTIC_STATUSES)[number];

export const INDEXING_STATUSES = ['ready', 'working', 'unknown'] as const;
export type IndexingStatus = (typeof INDEXING_STATUSES)[number];

export interface Position {
  readonly line: number;
  readonly column: number;
}

export interface SourceRange {
  readonly start: Position;
  readonly end: Position;
}

export interface LspPosition {
  readonly line: number;
  readonly character: number;
}

export interface LspRange {
  readonly start: LspPosition;
  readonly end: LspPosition;
}

export interface CallHierarchyItem {
  readonly name: string;
  readonly kind: number;
  readonly detail?: string;
  readonly uri: string;
  readonly range: LspRange;
  readonly selectionRange: LspRange;
  readonly data?: unknown;
}

export interface IncomingCall {
  readonly from: CallHierarchyItem;
  readonly fromRanges: readonly LspRange[];
}

export interface ProviderCapabilities {
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
    readonly callHierarchy: boolean;
    readonly diagnostics: boolean | 'unknown';
  };
  readonly observed: {
    readonly prepareCallHierarchy: boolean;
    readonly incomingCalls: boolean;
    readonly diagnostics: boolean;
  };
  readonly lifecycle: ProviderLifecycle;
}

export interface ProviderLifecycle {
  readonly stage: ProviderLifecycleStage;
  readonly status: ProviderLifecycleStatus;
}

export interface Coverage {
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
  readonly indexing: {
    readonly status: IndexingStatus;
  };
  readonly reasons: readonly string[];
}

export interface ProviderDiagnostic {
  readonly uri: string;
  readonly range: LspRange;
  readonly severity: 'error' | 'warning';
  readonly message: string;
}

export interface CallHierarchyProvider {
  readonly capabilities: ProviderCapabilities;
  prepare(file: string, position: LspPosition): Promise<readonly CallHierarchyItem[]>;
  incoming(item: CallHierarchyItem): Promise<readonly IncomingCall[]>;
  collectDiagnostics(uris: readonly string[]): Promise<readonly ProviderDiagnostic[]>;
  dispose(): Promise<void>;
}

export type ImpactRelation = 'root' | 'direct' | 'transitive' | 'test';
export type SourceMode = 'none' | 'declaration' | 'body';

export interface AnalyzeRequest {
  readonly workspace: string;
  readonly file: string;
  readonly line: number;
  readonly column: number;
  readonly depth?: number;
  readonly maxNodes?: number;
  readonly includeSource?: SourceMode;
  readonly timeoutMs?: number;
  readonly expectedSymbol?: ExpectedSymbol;
  readonly provider?: ProviderCommand;
}

export interface ProviderCommand {
  readonly command: string;
  readonly args?: readonly string[];
  readonly languageId?: string;
}

export interface ExpectedSymbol {
  readonly name?: string;
  readonly kind?: string | number;
  readonly detail?: string;
}

export interface SymbolTarget {
  readonly file: string;
  readonly position: Position;
  readonly expectedSymbol?: ExpectedSymbol;
}

export type NoteScope = 'shared' | 'source' | 'local';

export interface NoteGetRequest {
  readonly workspace: string;
  readonly target: SymbolTarget;
  readonly provider?: ProviderCommand;
  readonly timeoutMs?: number;
}

export interface NoteListRequest {
  readonly workspace: string;
  readonly scope?: NoteScope;
}

export interface NoteMutationRequest extends NoteGetRequest {
  readonly scope: NoteScope;
  readonly text?: string;
  readonly apply?: boolean;
  readonly expectedToken?: string;
}

export interface StoredNoteIdentity {
  readonly workspace: string;
  readonly file: string;
  readonly symbol: string;
  readonly kind: number;
  readonly detail: string;
  readonly line: number;
  readonly character: number;
}

export interface StoredNote extends StoredNoteIdentity {
  readonly text: string;
  readonly updatedAt: string;
  readonly [key: string]: unknown;
}

export interface NoteLayers {
  readonly local?: string;
  readonly shared?: string;
  readonly sourceComment?: string;
}

export interface ResolvedNote {
  readonly effective: string | null;
  readonly effectiveSource: NoteScope | null;
  readonly layers: {
    readonly local: string | null;
    readonly shared: string | null;
    readonly sourceComment: string | null;
    readonly personal: {
      readonly available: false;
      readonly reason: 'vscode_workspace_state_unavailable';
    };
  };
}

// `CliError` lives in ./errors together with the code union. It is re-exported here because every existing
// import reaches for './types', including files this change is not allowed to touch.
export { CLI_ERROR_CODES, CliError, isCliErrorCode } from './errors';
export type { CliErrorCode, CliErrorShape } from './errors';
