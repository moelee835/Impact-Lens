import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { JsonRpcClient, redactProviderText } from './jsonRpc';
import { JsonObject } from './lsp/configuration';
import { CapabilityRegistration, createServerRequestHandlers } from './lsp/serverRequests';
import { mergeSessionValues, ProviderSessionConfig, SettingsDelivery } from './lsp/session';
import { truncate } from './providers/discovery';
import { ProviderReadinessProfile } from './providers/preset';
import { assertProjectMetadata, ReadinessTracker, UNKNOWN_INDEXING } from './providers/readiness';
import { languageId, ProviderResolutionOptions, resolveProvider } from './providers/resolve';
import {
  AnalysisObservations,
  CallHierarchyItem,
  CallHierarchyProvider,
  CliError,
  IncomingCall,
  IndexingCoverage,
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

/** The LSP method a dynamic Call Hierarchy registration names. */
const CALL_HIERARCHY_METHOD = 'textDocument/callHierarchy';

/**
 * How long a server that advertised no static Call Hierarchy gets to register one dynamically.
 *
 * The spec allows a registration only after `initialized`, so a client that decided on the static
 * capability alone would reject a server that does support Call Hierarchy. The wait ends on the
 * registration itself and this bound only covers servers that will never send one, which is why it is
 * short: for them it is pure added latency before an error that was always going to be raised.
 */
const DYNAMIC_REGISTRATION_BUDGET_MS = 250;

/**
 * Ceiling on `serverInfo.version` as reported in the response, in UTF-8 bytes.
 *
 * This is NOT the same unit as `response.schema.json`'s `$defs/provider.version` `maxLength` - the
 * contract checker (`cli/src/test/jsonSchema.ts`) measures `maxLength` in Unicode codepoints
 * (`[...value].length`, matching the JSON Schema spec), not UTF-8 bytes. Both being 256 today is a
 * choice, not a requirement; nothing enforces that they stay equal.
 *
 * Staying within `maxLength` needs BOTH of the following, independently - satisfying one does not imply
 * the other, and losing either one breaks the schema guarantee on its own:
 *
 *   (i)  `truncate()` (`providers/discovery.ts`) must enforce its byte ceiling with no overshoot. This
 *        was broken until it stripped a trailing U+FFFD artifact: a cut landing mid-character left an
 *        incomplete UTF-8 sequence that `Buffer.toString('utf8')` replaces with U+FFFD, whose own
 *        re-encoding could be wider than the bytes it replaced, so the naive cut came out 1-2 bytes OVER
 *        `SERVER_VERSION_MAX_BYTES`. Guarded by the `truncate()` test in `cli/src/test/providers.test.ts`
 *        - reverting the U+FFFD fix makes that test fail immediately.
 *   (ii) `SERVER_VERSION_MAX_BYTES <= maxLength` (the schema constant, currently also 256) must hold on
 *        its own - because every codepoint takes at least 1 UTF-8 byte, a value bounded to N bytes has
 *        at most N codepoints, so a byte ceiling AT OR BELOW `maxLength` cannot produce more codepoints
 *        than `maxLength` allows. This holds regardless of whether (i) is perfect: raising
 *        `SERVER_VERSION_MAX_BYTES` past `maxLength` (e.g. to 500, marker unchanged) makes even a
 *        flawless byte-exact `truncate()` emit ~498 ASCII codepoints, violating a `maxLength` of 256 -
 *        confirmed directly. Guarded by `cli/src/test/schema.test.ts`'s dedicated test, which reads
 *        `maxLength` straight out of the live schema and fails if `SERVER_VERSION_MAX_BYTES` exceeds it.
 *
 * `cli/src/test/schema.test.ts` also validates a real bounded `serverInfo.version` (ASCII and multi-byte)
 * against the live schema and confirms `maxLength` still rejects an out-of-bounds value - but those two
 * checks alone check codepoints like the schema does, so they CANNOT see a byte-ceiling overshoot from
 * (i): reverting the U+FFFD fix leaves both passing even though a real 258-byte response goes out.
 * Guarding (i) is `providers.test.ts`'s `truncate()` test alone; guarding (ii) is the dedicated
 * `schema.test.ts` comparison just mentioned, not these two response-shaped checks.
 *
 * `serverInfo.version` is a server-controlled, unbounded string handed straight to two response
 * locations (`data.provider.version` and top-level `capabilities.version`, both projections of the same
 * `_capabilities` object). No provider probed here is scoped to a sane length: `gopls`'s own
 * `-json`-flavoured self-description was measured at 3,062 bytes and appeared in both locations at once
 * (6,124 bytes, 54.6% of an 11,219-byte response) before this bound existed. Every real version string
 * measured against this codebase - `gopls version`'s plain output, a generous synthetic semver-plus-
 * build-metadata string - stayed under 100 bytes, so 256 is not a tight fit for anything legitimate; it
 * exists to stop a server's incidental self-description from dominating a response an agent pays tokens
 * to read. `typescript-language-server` reports no `serverInfo.version` at all today, so this bound
 * changes nothing for it.
 *
 * Deliberately bounded at exactly one point (here, where `_capabilities.version` is first assigned) and
 * not at either place that later reads it - a third consumer would otherwise need its own copy of this
 * same logic to stay safe.
 */
export const SERVER_VERSION_MAX_BYTES = 256;

/**
 * Appended when `serverInfo.version` is cut, so a consumer can tell "the version is exactly this" from
 * "the version was longer and this is a prefix" - the existing `truncate()` in `discovery.ts` marks
 * neither case, because the process-output budget it guards is a safety cap a human debugs from raw logs,
 * never a value handed to an agent as though it were complete. This field is the opposite: agents read it
 * as data, so silent truncation here would misinform them instead of merely under-informing them.
 */
const VERSION_TRUNCATION_MARKER = '…[truncated]';

/** Bounds `serverInfo.version` to `SERVER_VERSION_MAX_BYTES`, marking the cut when it happens. */
function boundServerVersion(version: string | undefined): string | undefined {
  if (version === undefined || Buffer.byteLength(version, 'utf8') <= SERVER_VERSION_MAX_BYTES) {
    return version;
  }
  const budget = SERVER_VERSION_MAX_BYTES - Buffer.byteLength(VERSION_TRUNCATION_MARKER, 'utf8');
  return `${truncate(version, budget)}${VERSION_TRUNCATION_MARKER}`;
}

interface PublishDiagnostics {
  readonly uri?: string;
  readonly diagnostics?: Array<{
    readonly range?: ProviderDiagnostic['range'];
    readonly severity?: number;
    readonly message?: string;
  }>;
}

export interface LspCallHierarchyProviderOptions {
  /** Provider selection and preset/project/request value resolution. The analyzed workspace is fixed by the constructor. */
  readonly resolution?: Omit<ProviderResolutionOptions, 'workspace'>;
  /** Already-resolved values for tests and doctor paths that construct a protocol session directly. */
  readonly session?: ProviderSessionConfig;
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
  /** Dynamic registrations the server announced, merged into the observed capabilities below. */
  private readonly registrations = new Map<string, CapabilityRegistration>();
  /** What `initialize` advertised statically, kept so an unregister can fall back to it. */
  private staticCallHierarchy = false;
  private readonly registrationWaiters = new Set<() => void>();
  /** Absent means this provider claims nothing about its index, and the answer stays `unknown`. */
  private readonly readiness: ProviderReadinessProfile | undefined;
  private readonly readinessTracker: ReadinessTracker | undefined;
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
    options: LspCallHierarchyProviderOptions = {},
  ) {
    // The workspace is passed explicitly because the trusted project tier has no `process.cwd()`
    // fallback. Falling back would make the provider depend on the directory the CLI happened to be
    // launched from, so a `.impact-lens/provider.json` in an unrelated tree could choose the provider
    // for this one. A trust boundary that moves with the shell's working directory is not a boundary.
    // Request values enter through provider resolution so preset < project < request deep merge,
    // post-merge budgets and secret collection all happen before the protocol sees a plain tree.
    // Direct session values remain a separate test/doctor escape hatch and never stand in for a request.
    const resolved = resolveProvider(file, command, { ...options.resolution, workspace });
    const resolvedSession = mergeSessionValues(resolved, options.session);
    this.settings = resolvedSession.settings;
    this.initializationOptions = resolvedSession.initializationOptions;
    this.settingsDelivery = resolvedSession.settingsDelivery;
    this.redactionValues = resolvedSession.redactionValues;
    this.timeoutMs = timeoutMs;
    // Readiness comes off the resolved provider, not off `mergeSessionValues`: a direct session config
    // is a test and doctor escape hatch for wire values, and letting it invent a readiness claim would
    // let a caller assert an index state no preset ever declared.
    this.readiness = resolved.readiness;
    this.readinessTracker = resolved.readiness ? new ReadinessTracker(resolved.readiness) : undefined;
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
          this.readinessTracker?.noteCapabilityRegistered(entry.method);
        }
        this.syncCallHierarchyCapability();
      },
      onUnregisterCapability: entries => {
        for (const entry of entries) {
          this.registrations.delete(`${entry.id}:${entry.method}`);
        }
        this.syncCallHierarchyCapability();
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
    // Subscribed per declared method rather than through a catch-all, so a server notification this
    // preset never named cannot reach the readiness tracker at all.
    for (const method of new Set(
      (resolved.readiness?.signals ?? [])
        .flatMap(signal => (signal.kind === 'notification' ? [signal.method] : [])),
    )) {
      this.client.onNotification(method, params => this.readinessTracker?.noteNotification(method, params));
    }
  }

  /**
   * Recomputes Call Hierarchy support from the static capability and the live registration map.
   *
   * The two are one state, not two: a server may advertise it in `initialize`, register it after
   * `initialized`, or both, and a client that reads only the static half rejects the second kind. An
   * unregister falls back to the static answer rather than to `false`, because withdrawing a dynamic
   * registration does not withdraw a capability the server also advertised statically.
   */
  private syncCallHierarchyCapability(): void {
    const callHierarchy = this.staticCallHierarchy || this.hasCallHierarchyRegistration();
    if (this._capabilities.callHierarchy !== callHierarchy) {
      this._capabilities = {
        ...this._capabilities,
        callHierarchy,
        advertised: { ...this._capabilities.advertised, callHierarchy },
      };
    }
    if (callHierarchy) {
      for (const waiter of [...this.registrationWaiters]) {
        waiter();
      }
    }
  }

  private hasCallHierarchyRegistration(): boolean {
    for (const entry of this.registrations.values()) {
      if (entry.method === CALL_HIERARCHY_METHOD) {
        return true;
      }
    }
    return false;
  }

  /**
   * Keeps what the server says about long-running work, and nothing more.
   *
   * An `end` means the operation behind that token finished. Whether that operation was indexing the
   * workspace or checking one file is known only to the server that created the token, so this is
   * recorded as an observation and never promoted to "the provider is ready" on its own. It reaches
   * the readiness tracker only when a preset declared which title means what, and the tracker drops it
   * again unless the declared pattern matches.
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
    const title = kind === 'begin' && typeof value.value.title === 'string' ? value.value.title : previous?.title;
    this.progress.set(token, {
      kind,
      title,
      serverCreated: this.progressTokens.has(token),
    });
    this.readinessTracker?.noteProgress(token, kind, title);
  }

  get capabilities(): ProviderCapabilities {
    return this._capabilities;
  }

  /**
   * What this session observed that the traversal cannot see for itself.
   *
   * Optional on `CallHierarchyProvider` so every other implementation keeps today's conservative
   * defaults without a change. A provider that declares no readiness profile answers `unknown` here,
   * which is byte-for-byte the response the analyze path already produced.
   */
  analysisObservations(): AnalysisObservations {
    return { indexing: this.indexing() };
  }

  private indexing(): IndexingCoverage {
    return this.readinessTracker?.observation ?? UNKNOWN_INDEXING;
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
            // On now that `syncCallHierarchyCapability()` merges the static capability with the live
            // registration map. Declaring it while reading only the static half was the trap this
            // replaced: a server that registers Call Hierarchy after `initialized` would have been
            // rejected as `provider_capability_missing` even though it does support it.
            callHierarchy: { dynamicRegistration: true },
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
    this.staticCallHierarchy = Boolean(result.capabilities?.callHierarchyProvider);
    this._capabilities = {
      ...this._capabilities,
      name: result.serverInfo?.name ?? 'language-server',
      version: boundServerVersion(result.serverInfo?.version),
      callHierarchy: this.staticCallHierarchy,
      diagnostics: true,
      advertised: {
        callHierarchy: this.staticCallHierarchy,
        diagnostics: result.capabilities?.diagnosticProvider ? true : 'unknown',
      },
      lifecycle: { stage: 'capability', status: this.staticCallHierarchy ? 'ready' : 'working' },
    };
    // `initialized` now precedes the capability verdict, because a dynamic registration is only legal
    // after it. For a server that advertised Call Hierarchy statically the frames are unchanged; for
    // one that did not, this is the only order in which it can still answer.
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
    if (!this.staticCallHierarchy) {
      await this.awaitCallHierarchyRegistration();
    }
    this.syncCallHierarchyCapability();
    const callHierarchy = this._capabilities.callHierarchy;
    this.lifecycle('capability', callHierarchy ? 'ready' : 'failed');
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
    this.initialized = true;
    await this.awaitReadiness();
  }

  /** Ends on the registration, not on the clock; the bound only covers servers that never send one. */
  private async awaitCallHierarchyRegistration(): Promise<void> {
    if (this.hasCallHierarchyRegistration()) {
      return;
    }
    const budgetMs = Math.min(this.timeoutMs, DYNAMIC_REGISTRATION_BUDGET_MS);
    await new Promise<void>(resolve => {
      const finish = (): void => {
        clearTimeout(timer);
        this.registrationWaiters.delete(waiter);
        resolve();
      };
      const waiter = (): void => finish();
      const timer = setTimeout(finish, budgetMs);
      this.registrationWaiters.add(waiter);
    });
  }

  /**
   * Decides the index state before the first query, and only from what the preset declared.
   *
   * A provider with no readiness profile is left exactly where it was: lifecycle `indexing/unknown`,
   * no waiting, no extra frames, `coverage.indexing.status: unknown`. That is not a gap to fill later
   * — it is the honest answer for a server that makes no claim about its index, and the bundled
   * TypeScript path depends on it staying byte-identical.
   */
  private async awaitReadiness(): Promise<void> {
    if (!this.readiness || !this.readinessTracker) {
      this.lifecycle('indexing', 'unknown');
      return;
    }
    this.lifecycle('indexing', 'working');
    // Read-only, and before the wait: waiting out a budget for a server that cannot index this
    // workspace at all only delays naming the real problem.
    await assertProjectMetadata(this.workspace, this.readiness);
    const indexing = await this.readinessTracker.settle(this.timeoutMs);
    this.lifecycle('indexing', indexing.status === 'ready' ? 'ready' : 'working');
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
