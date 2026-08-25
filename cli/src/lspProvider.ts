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
    name: 'uninitialized-language-server',
    callHierarchy: false,
    diagnostics: false,
  };
  private readonly languageIdOverride: string | undefined;

  constructor(
    private readonly workspace: string,
    command: ProviderCommand | undefined,
    timeoutMs: number,
  ) {
    const actual = command ?? defaultTypeScriptServerCommand();
    this.languageIdOverride = actual.languageId;
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
    });
  }

  get capabilities(): ProviderCapabilities {
    return this._capabilities;
  }

  async prepare(file: string, position: LspPosition): Promise<readonly CallHierarchyItem[]> {
    await this.initialize();
    const uri = pathToFileURL(file).toString();
    await this.open(file, uri);
    const items = await this.client.request<CallHierarchyItem[] | null>(
      'textDocument/prepareCallHierarchy',
      { textDocument: { uri }, position },
    );
    return items ?? [];
  }

  async incoming(item: CallHierarchyItem): Promise<readonly IncomingCall[]> {
    await this.initialize();
    const calls = await this.client.request<IncomingCall[] | null>('callHierarchy/incomingCalls', { item });
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
    await this.client.dispose();
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
        'provider_unavailable',
        `Cannot initialize the Language Server: ${error instanceof Error ? error.message : String(error)}`,
        5,
        true,
      );
    }
    const callHierarchy = Boolean(result.capabilities?.callHierarchyProvider);
    this._capabilities = {
      name: result.serverInfo?.name ?? 'language-server',
      version: result.serverInfo?.version,
      callHierarchy,
      diagnostics: true,
    };
    if (!callHierarchy) {
      throw new CliError(
        'provider_capability_missing',
        'The configured Language Server does not provide Call Hierarchy.',
        5,
      );
    }
    this.client.notify('initialized', {});
    this.initialized = true;
  }

  private async open(file: string, uri: string): Promise<void> {
    if (this.opened.has(uri)) {
      return;
    }
    const text = await fs.readFile(file, 'utf8');
    this.client.notify('textDocument/didOpen', {
      textDocument: { uri, languageId: this.languageIdOverride ?? languageId(file), version: 1, text },
    });
    this.opened.add(uri);
  }
}

function defaultTypeScriptServerCommand(): ProviderCommand {
  try {
    const entry = require.resolve('typescript-language-server/lib/cli.mjs');
    return { command: process.execPath, args: [entry, '--stdio'] };
  } catch (error) {
    throw new CliError(
      'provider_unavailable',
      'typescript-language-server is not installed; provide an explicit provider command.',
      5,
      false,
      { cause: error instanceof Error ? error.message : String(error) },
    );
  }
}

function languageId(file: string): string {
  switch (path.extname(file).toLowerCase()) {
    case '.ts': return 'typescript';
    case '.tsx': return 'typescriptreact';
    case '.js': return 'javascript';
    case '.jsx': return 'javascriptreact';
    case '.mjs': return 'javascript';
    case '.cjs': return 'javascript';
    default: return 'plaintext';
  }
}
