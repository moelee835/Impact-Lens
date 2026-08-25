import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { JsonRpcClient } from './jsonRpc';
import {
  CallHierarchyItem,
  CallHierarchyProvider,
  CliError,
  IncomingCall,
  LspPosition,
  ProviderCapabilities,
  ProviderCommand,
  ProviderDiagnostic,
  ProviderLifecycleStage,
} from './types';

interface InitializeResult {
  readonly capabilities?: {
    readonly callHierarchyProvider?: unknown;
    readonly diagnosticProvider?: unknown;
  };
  readonly serverInfo?: { readonly name?: string; readonly version?: string };
}

interface PublishDiagnostics {
  readonly uri?: string;
  readonly diagnostics?: Array<{
    readonly range?: ProviderDiagnostic['range'];
    readonly severity?: number;
    readonly message?: string;
  }>;
}

export class LspCallHierarchyProvider implements CallHierarchyProvider {
  private readonly client: JsonRpcClient;
  private readonly opened = new Set<string>();
  private readonly diagnostics = new Map<string, ProviderDiagnostic[]>();
  private initialized = false;
  private initializePromise: Promise<void> | undefined;
  private _capabilities: ProviderCapabilities = {
    host: 'lsp',
    name: 'uninitialized-language-server',
    requestedLanguageId: 'plaintext',
    detectedLanguageId: 'plaintext',
    selectedBy: 'custom',
    languageMatch: 'unknown',
    callHierarchy: false,
    diagnostics: false,
    advertised: { callHierarchy: false, diagnostics: false },
    observed: { prepareCallHierarchy: false, incomingCalls: false, diagnostics: false },
    lifecycle: { stage: 'discovery', status: 'working' },
  };
  private readonly languageIdOverride: string | undefined;

  constructor(
    private readonly workspace: string,
    file: string,
    command: ProviderCommand | undefined,
    timeoutMs: number,
  ) {
    const detectedLanguageId = languageId(file);
    const selectedBy = command ? 'custom' : 'bundled';
    const actual = command ?? defaultTypeScriptServerCommand(detectedLanguageId);
    const requestedLanguageId = actual.languageId ?? detectedLanguageId;
    const languageMatch = detectedLanguageId === 'plaintext'
      ? 'unknown'
      : requestedLanguageId === detectedLanguageId;
    if (languageMatch === false) {
      throw new CliError(
        'provider_language_mismatch',
        `Configured provider languageId ${requestedLanguageId} does not match detected language ${detectedLanguageId}.`,
        5,
        false,
        {
          stage: 'discovery',
          requestedLanguageId,
          detectedLanguageId,
          selectedBy,
        },
      );
    }
    this._capabilities = {
      ...this._capabilities,
      requestedLanguageId,
      detectedLanguageId,
      selectedBy,
      languageMatch,
      lifecycle: { stage: 'launch', status: 'working' },
    };
    this.languageIdOverride = requestedLanguageId;
    this.client = new JsonRpcClient(actual.command, actual.args ?? [], timeoutMs);
    this.client.onNotification('textDocument/publishDiagnostics', params => {
      const value = params as PublishDiagnostics | undefined;
      if (!value?.uri || !Array.isArray(value.diagnostics)) {
        return;
      }
      this.diagnostics.set(value.uri, value.diagnostics.flatMap(diagnostic => {
        if (!diagnostic.range || !diagnostic.message || (diagnostic.severity !== 1 && diagnostic.severity !== 2)) {
          return [];
        }
        return [{
          uri: value.uri as string,
          range: diagnostic.range,
          severity: diagnostic.severity === 1 ? 'error' : 'warning',
          message: diagnostic.message,
        }];
      }));
      this.observe({ diagnostics: true });
    });
  }

  get capabilities(): ProviderCapabilities {
    return this._capabilities;
  }

  async prepare(file: string, position: LspPosition): Promise<readonly CallHierarchyItem[]> {
    await this.initialize();
    const uri = pathToFileURL(file).toString();
    await this.open(file, uri);
    const items = await this.query<CallHierarchyItem[] | null>('textDocument/prepareCallHierarchy', {
      textDocument: { uri }, position,
    });
    this.observe({ prepareCallHierarchy: true });
    return items ?? [];
  }

  async incoming(item: CallHierarchyItem): Promise<readonly IncomingCall[]> {
    await this.initialize();
    const calls = await this.query<IncomingCall[] | null>('callHierarchy/incomingCalls', { item });
    this.observe({ incomingCalls: true });
    return calls ?? [];
  }

  async collectDiagnostics(uris: readonly string[]): Promise<readonly ProviderDiagnostic[]> {
    await this.initialize();
    for (const uri of uris) {
      if (!uri.startsWith('file:') || this.opened.has(uri)) {
        continue;
      }
      try {
        await this.open(fileURLToPath(uri), uri);
      } catch {
        // Invalid or inaccessible provider URIs simply have no collected diagnostics.
      }
    }
    await new Promise(resolve => setTimeout(resolve, 100));
    return uris.flatMap(uri => this.diagnostics.get(uri) ?? []);
  }

  async dispose(): Promise<void> {
    await this.client.dispose(this.initialized);
  }

  private async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }
    if (!this.initializePromise) {
      this.initializePromise = this.doInitialize();
    }
    await this.initializePromise;
  }

  private async doInitialize(): Promise<void> {
    let result: InitializeResult;
    this.lifecycle('initialize', 'working');
    this.client.setLifecycleStage('initialize');
    try {
      result = await this.client.request<InitializeResult>('initialize', {
        processId: process.pid,
        rootUri: pathToFileURL(this.workspace).toString(),
        workspaceFolders: [{ uri: pathToFileURL(this.workspace).toString(), name: path.basename(this.workspace) }],
        capabilities: {
          textDocument: {
            callHierarchy: { dynamicRegistration: false },
            publishDiagnostics: { relatedInformation: true },
          },
          workspace: { workspaceFolders: true },
        },
        initializationOptions: {},
      });
    } catch (error) {
      if (error instanceof CliError) {
        throw error;
      }
      throw new CliError(
        'provider_initialize_failed',
        `Cannot initialize the Language Server: ${error instanceof Error ? error.message : String(error)}`,
        5,
        true,
        { stage: 'initialize' },
      );
    }
    const callHierarchy = Boolean(result.capabilities?.callHierarchyProvider);
    this._capabilities = {
      ...this._capabilities,
      name: result.serverInfo?.name ?? 'language-server',
      version: result.serverInfo?.version,
      callHierarchy,
      diagnostics: true,
      advertised: {
        callHierarchy,
        diagnostics: result.capabilities?.diagnosticProvider ? true : 'unknown',
      },
      lifecycle: { stage: 'capability', status: callHierarchy ? 'ready' : 'failed' },
    };
    if (!callHierarchy) {
      throw new CliError(
        'provider_capability_missing',
        'The configured Language Server does not provide Call Hierarchy.',
        5,
        false,
        {
          stage: 'capability',
          provider: this._capabilities.name,
          advertised: this._capabilities.advertised,
        },
      );
    }
    try {
      this.client.notify('initialized', {});
    } catch (error) {
      if (error instanceof CliError) {
        throw error;
      }
      throw new CliError(
        'provider_initialize_failed',
        `Cannot finish Language Server initialization: ${error instanceof Error ? error.message : String(error)}`,
        5,
        true,
        { stage: 'initialize' },
      );
    }
    this.initialized = true;
    this.lifecycle('indexing', 'unknown');
  }

  private async open(file: string, uri: string): Promise<void> {
    if (this.opened.has(uri)) {
      return;
    }
    const text = await fs.readFile(file, 'utf8');
    try {
      this.lifecycle('query', 'working');
      this.client.setLifecycleStage('query');
      this.client.notify('textDocument/didOpen', {
        textDocument: { uri, languageId: this.languageIdOverride ?? languageId(file), version: 1, text },
      });
      this.lifecycle('query', 'ready');
    } catch (error) {
      this.lifecycle('query', 'failed');
      if (error instanceof CliError) {
        throw error;
      }
      throw new CliError(
        'provider_query_failed',
        `Cannot open the document in the Language Server: ${error instanceof Error ? error.message : String(error)}`,
        5,
        true,
        { stage: 'query', method: 'textDocument/didOpen' },
      );
    }
    this.opened.add(uri);
  }

  private async query<T>(method: string, params: unknown): Promise<T> {
    this.lifecycle('query', 'working');
    this.client.setLifecycleStage('query');
    try {
      const result = await this.client.request<T>(method, params);
      this.lifecycle('query', 'ready');
      return result;
    } catch (error) {
      this.lifecycle('query', 'failed');
      if (error instanceof CliError) {
        throw error;
      }
      throw new CliError(
        'provider_query_failed',
        `Language Server query failed: ${error instanceof Error ? error.message : String(error)}`,
        5,
        true,
        { stage: 'query', method },
      );
    }
  }

  private observe(observed: Partial<ProviderCapabilities['observed']>): void {
    this._capabilities = {
      ...this._capabilities,
      observed: { ...this._capabilities.observed, ...observed },
    };
  }

  private lifecycle(stage: ProviderLifecycleStage, status: ProviderCapabilities['lifecycle']['status']): void {
    this._capabilities = { ...this._capabilities, lifecycle: { stage, status } };
  }
}

function defaultTypeScriptServerCommand(detectedLanguageId: string): ProviderCommand {
  if (!isTypeScriptFamily(detectedLanguageId)) {
    throw new CliError(
      'provider_required_for_language',
      `No bundled provider supports ${detectedLanguageId}; configure a Language Server provider for this language.`,
      5,
      false,
      {
        stage: 'discovery',
        detectedLanguageId,
        bundledLanguageIds: ['typescript', 'typescriptreact', 'javascript', 'javascriptreact'],
      },
    );
  }
  try {
    const entry = require.resolve('typescript-language-server/lib/cli.mjs');
    return { command: process.execPath, args: [entry, '--stdio'], languageId: detectedLanguageId };
  } catch (error) {
    throw new CliError(
      'provider_unavailable',
      'typescript-language-server is not installed; provide an explicit provider command.',
      5,
      false,
      { stage: 'discovery', cause: error instanceof Error ? error.message : String(error) },
    );
  }
}

export function languageId(file: string): string {
  switch (path.extname(file).toLowerCase()) {
    case '.ts': return 'typescript';
    case '.mts': return 'typescript';
    case '.cts': return 'typescript';
    case '.tsx': return 'typescriptreact';
    case '.js': return 'javascript';
    case '.jsx': return 'javascriptreact';
    case '.mjs': return 'javascript';
    case '.cjs': return 'javascript';
    case '.py': return 'python';
    case '.c': return 'c';
    case '.cc': return 'cpp';
    case '.cpp': return 'cpp';
    case '.cxx': return 'cpp';
    case '.hh': return 'cpp';
    case '.hpp': return 'cpp';
    case '.hxx': return 'cpp';
    case '.swift': return 'swift';
    case '.kt': return 'kotlin';
    case '.kts': return 'kotlin';
    default: return 'plaintext';
  }
}

function isTypeScriptFamily(value: string): boolean {
  return ['typescript', 'typescriptreact', 'javascript', 'javascriptreact'].includes(value);
}
