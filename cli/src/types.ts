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
  readonly name: string;
  readonly version?: string;
  readonly callHierarchy: boolean;
  readonly diagnostics: boolean;
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

export interface CliErrorShape {
  readonly code: string;
  readonly message: string;
  readonly retryable: boolean;
  readonly details?: unknown;
}

export class CliError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly exitCode: number,
    readonly retryable = false,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = 'CliError';
  }
}
