import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { JsonRpcClient, redactProviderText } from './jsonRpc';
import { JsonObject } from './lsp/configuration';
import { CapabilityRegistration, createServerRequestHandlers } from './lsp/serverRequests';
import { ProviderSessionConfig, resolveSession, SettingsDelivery } from './lsp/session';
import { languageId, resolveProvider } from './providers/resolve';
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

interface ProgressState {
  readonly kind: 'begin' | 'report' | 'end';
  readonly title: string | undefined;
  /** True when the token came from a `window/workDoneProgress/create` this client answered. */
  readonly serverCreated: boolean;
}

// Upper bound for the diagnostics wait, capped further by the session timeout. It is not a judgement
// that the provider is done; it is how long we are willing to wait for a server that never publishes.
const DIAGNOSTICS_BUDGET_MS = 2000;

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
  private readonly settings: JsonObject;
  private readonly initializationOptions: JsonObject;
  private readonly settingsDelivery: readonly SettingsDelivery[];
  private readonly redactionValues: readonly string[];
  /** Dynamic registrations the server announced. Wave 2 merges these into observed capabilities. */
  private readonly registrations = new Map<string, CapabilityRegistration>();
  /** Progress tokens the server asked us to create. A token is not evidence that indexing finished. */
  private readonly progressTokens = new Set<string>();
  private readonly progress = new Map<string, ProgressState>();
  /** URIs that have produced at least one `textDocument/publishDiagnostics`. */
  private readonly published = new Set<string>();
  private readonly diagnosticsWaiters = new Set<() => void>();
  private readonly timeoutMs: number;

  constructor(
    private readonly workspace: string,
    file: string,
    command: ProviderCommand | undefined,
    timeoutMs: number,
    // The protocol layer never reads a preset manifest. It receives already-resolved plain JSON,
    // because reference resolution and override merging belong to `providers/`. The default is an
    // empty session, which produces exactly the frames this client sent before configuration existed.
    session: ProviderSessionConfig = {},
  ) {
    const resolved = resolveProvider(file, command);
    const resolvedSession = resolveSession(session);
    this.settings = resolvedSession.settings;
    this.initializationOptions = resolvedSession.initializationOptions;
    this.settingsDelivery = resolvedSession.settingsDelivery;
    this.redactionValues = resolvedSession.redactionValues;
    this.timeoutMs = timeoutMs;
    this._capabilities = {
      ...this._capabilities,
      requestedLanguageId: resolved.requestedLanguageId,
      detectedLanguageId: resolved.detectedLanguageId,
      selectedBy: resolved.selectedBy,
      languageMatch: resolved.languageMatch,
      lifecycle: { stage: 'launch', status: 'working' },
    };
    this.languageIdOverride = resolved.requestedLanguageId;
    this.client = new JsonRpcClient(resolved.command.command, resolved.command.args ?? [], timeoutMs);
    // Installed before anything can fail, so a secret cannot escape through an early launch error.
    this.client.setRedactionValues(resolvedSession.redactionValues);
    // Installed before `initialize` is written on purpose: a server may ask for configuration before
    // it answers `initialize`, and a client that resolves its answers lazily deadlocks right there.
    this.client.setRequestHandlers(createServerRequestHandlers({
      workspaceFolders: [{ uri: pathToFileURL(workspace).toString(), name: path.basename(workspace) }],
      settings: this.settings,
      onRegisterCapability: entries => {
        for (const entry of entries) {
          this.registrations.set(`${entry.id}:${entry.method}`, entry);
        }
      },
      onUnregisterCapability: entries => {
        for (const entry of entries) {
          this.registrations.delete(`${entry.id}:${entry.method}`);
        }
      },
      onWorkDoneProgressCreate: token => {
        this.progressTokens.add(String(token));
      },
    }));
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
      this.published.add(value.uri);
      this.observe({ diagnostics: true });
      for (const waiter of [...this.diagnosticsWaiters]) {
        waiter();
      }
    });
    this.client.onNotification('$/progress', params => this.recordProgress(params));
  }

  /**
   * Keeps what the server says about long-running work, and nothing more.
   *
   * An `end` means the operation behind that token finished. Whether that operation was indexing the
   * workspace or checking one file is known only to the server that created the token, so this is
   * recorded as an observation and never promoted to "the provider is ready". Turning it into a
   * readiness signal needs a preset that declares which token means what, which is Wave 2.
   */
  private recordProgress(params: unknown): void {
    const value = params as { readonly token?: unknown; readonly value?: Record<string, unknown> } | undefined;
    if ((typeof value?.token !== 'string' && typeof value?.token !== 'number') || !value.value) {
      return;
    }
    const token = String(value.token);
    const kind = value.value.kind;
    if (kind !== 'begin' && kind !== 'report' && kind !== 'end') {
      return;
    }
    const previous = this.progress.get(token);
    this.progress.set(token, {
      kind,
      title: kind === 'begin' && typeof value.value.title === 'string' ? value.value.title : previous?.title,
      serverCreated: this.progressTokens.has(token),
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
    await this.awaitPublishedDiagnostics(uris);
    return uris.flatMap(uri => this.diagnostics.get(uri) ?? []);
  }

  /**
   * Waits for the diagnostics of the documents this session opened.
   *
   * This used to be a flat 100ms sleep, which is wrong in both directions: it is dead time for a
   * server that already answered, and it silently discards everything a slower server publishes
   * afterwards. Worse, the result of that race reaches the response — `observed.diagnostics` flipped
   * between runs of the *same* build — so the report depended on machine load rather than on the
   * provider.
   *
   * The wait now ends on the event it was always waiting for: one `publishDiagnostics` per opened
   * document. The budget is only an upper bound, for the servers that publish nothing at all.
   */
  private async awaitPublishedDiagnostics(uris: readonly string[]): Promise<void> {
    const outstanding = (): boolean =>
      uris.some(uri => this.opened.has(uri) && !this.published.has(uri));
    if (!outstanding()) {
      return;
    }
    const budgetMs = Math.min(this.timeoutMs, DIAGNOSTICS_BUDGET_MS);
    await new Promise<void>(resolve => {
      const finish = (): void => {
        clearTimeout(timer);
        this.diagnosticsWaiters.delete(waiter);
        resolve();
      };
      const waiter = (): void => {
        if (!outstanding()) {
          finish();
        }
      };
      const timer = setTimeout(finish, budgetMs);
      this.diagnosticsWaiters.add(waiter);
    });
  }

  async dispose(): Promise<void> {
    this.writeTranscript();
    await this.client.dispose(this.initialized);
  }

  /**
   * Opt-in session transcript, on stderr, one JSON line, only when the environment asks for it.
   *
   * The successful envelope deliberately says nothing about refused server requests or progress
   * tokens: adding a field to a success response is a contract change owned by another lane, and an
   * agent cannot act on it in Wave 1 anyway. Silence in the default output is not the same as having
   * nowhere to look, so the facts live here. stdout stays exactly one JSON line either way.
   */
  private writeTranscript(): void {
    if (process.env.IMPACT_LENS_LSP_TRANSCRIPT !== '1') {
      return;
    }
    const transcript = {
      impactLensLspTranscript: {
        provider: this._capabilities.name,
        ...this.client.protocolCounters(),
        dynamicRegistrations: [...this.registrations.values()].map(entry => entry.method),
        workDoneProgressTokens: [...this.progressTokens],
        progress: [...this.progress.entries()].map(([token, state]) => ({
          token,
          kind: state.kind,
          // A title is server-authored text; it goes through the same redaction as any other.
          ...(state.title ? { title: redactProviderText(state.title, this.redactionValues) } : {}),
          serverCreated: state.serverCreated,
        })),
        diagnosticsPublishedFor: this.published.size,
        openedDocuments: this.opened.size,
      },
    };
    process.stderr.write(`${JSON.stringify(transcript)}\n`);
  }

  async initializeForDoctor(): Promise<ProviderCapabilities> {
    await this.initialize();
    return this.capabilities;
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
        // A Language Server that receives a parent processId polls it with kill(pid, 0) every few
        // seconds and exits 1 without any stderr when the probe throws. That happens whenever the
        // child cannot signal the parent, such as a different PID namespace or a sandbox that denies
        // the syscall, and it would surface as an unexplained initialize failure. Impact Lens owns
        // the child directly: it is killed on dispose, and closing the stdin pipe when this process
        // dies already ends the server. The watchdog is redundant, so no processId is handed over.
        processId: null,
        rootUri: pathToFileURL(this.workspace).toString(),
        workspaceFolders: [{ uri: pathToFileURL(this.workspace).toString(), name: path.basename(this.workspace) }],
        capabilities: {
          textDocument: {
            // Left off in Wave 1. Turning it on lets a server advertise Call Hierarchy through a
            // dynamic registration instead of the static capability, and the check below reads only
            // the static one — so the run would fail as `provider_capability_missing` against a
            // server that does support it. It goes on once static and dynamic are merged.
            callHierarchy: { dynamicRegistration: false },
            publishDiagnostics: { relatedInformation: true },
          },
          workspace: {
            workspaceFolders: true,
            // A spec-abiding server never sends `workspace/configuration` unless the client says it
            // can answer. Without this line the answer implemented in `lsp/serverRequests.ts` would
            // only ever run against a mock, and settings could not reach a real server at all.
            configuration: true,
          },
          // We now answer `window/workDoneProgress/create` and record `$/progress`.
          window: { workDoneProgress: true },
        },
        initializationOptions: this.initializationOptions,
      });
    } catch (error) {
      if (error instanceof CliError) {
        throw error;
      }
      throw this.client.stageFailure(new CliError(
        'provider_initialize_failed',
        `Cannot initialize the Language Server: ${error instanceof Error ? error.message : String(error)}`,
        5,
        true,
        { stage: 'initialize' },
      ), 'initialize');
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
      this.pushSettings();
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

  /**
   * Pushes settings only when the preset asked for it and there is something to push.
   *
   * Some servers read configuration only from `workspace/didChangeConfiguration` and never ask for
   * it, so the path has to exist. Sending it unconditionally would be the easy choice and the wrong
   * one: this client sends no such notification today, and adding a frame to the bundled TypeScript
   * handshake to serve a server that is not bundled TypeScript changes working behaviour for no
   * benefit. The empty-tree guard is what keeps the bundled wire identical, since the reference
   * preset carries no settings.
   *
   * Ordering is a requirement, not a preference: the notification follows `initialized`, and the
   * settings tree itself is resolved in the constructor because a server may ask for configuration
   * before it even answers `initialize`.
   */
  private pushSettings(): void {
    if (!this.settingsDelivery.includes('did-change-configuration')) {
      return;
    }
    if (Object.keys(this.settings).length === 0) {
      return;
    }
    this.client.notify('workspace/didChangeConfiguration', { settings: this.settings });
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
      throw this.client.stageFailure(new CliError(
        'provider_query_failed',
        `Cannot open the document in the Language Server: ${error instanceof Error ? error.message : String(error)}`,
        5,
        true,
        { stage: 'query', method: 'textDocument/didOpen' },
      ), 'query');
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
      throw this.client.stageFailure(new CliError(
        'provider_query_failed',
        `Language Server query failed: ${error instanceof Error ? error.message : String(error)}`,
        5,
        true,
        { stage: 'query', method },
      ), 'query');
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
