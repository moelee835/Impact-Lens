# Impact Lens Agent CLI contract

## Runner

Resolve the plugin root from the installed `SKILL.md` path and invoke:

```sh
<plugin-root>/scripts/run-impact-lens <operation> --stdin < request.json
```

The runner passes every argument through without shell evaluation. Override its CLI resolution only with a filesystem path:

```sh
IMPACT_LENS_CLI_PATH=/absolute/path/to/impact-lens \
  <plugin-root>/scripts/run-impact-lens note list --workspace /path/to/project
```

`IMPACT_LENS_CLI_PATH` may point to an executable or a JavaScript entrypoint. `IMPACT_LENS_CLI_PACKAGE` may override the pinned release package used by the final npm fallback.

When the release fallback fails before the CLI starts, the runner reports one JSON envelope instead of
raw npm output. Set `IMPACT_LENS_RUNNER_NPM_OUTPUT=passthrough` to see the original npm text and exit
status for human debugging; that mode does not produce a parseable envelope.

## Response envelope

Success is one compact JSON document on stdout:

```json
{"schemaVersion":1,"operation":"impact.analyze","ok":true,"runtime":{"cli":{"name":"@impact-lens/cli","version":"0.7.0"},"node":{"version":"22.0.0","major":22,"executable":"node"},"runner":{"source":"release-fallback"}},"data":{},"capabilities":{},"limitations":[],"timings":{}}
```

Failure is one compact JSON document on stderr with a non-zero exit status:

```json
{"schemaVersion":1,"operation":"impact.analyze","ok":false,"runtime":{"cli":{"name":"@impact-lens/cli","version":"0.7.0"},"node":{"version":"22.0.0","major":22,"executable":"node"},"runner":{"source":"global"}},"error":{"code":"provider_initialize_failed","message":"...","retryable":true}}
```

Do not parse human-oriented tables or depend on whitespace. Node and edge arrays are deterministically
ordered. Read `data.completion` as the single source of result state and `data.limitationDetails` for structured
code, severity, scope, message, and recovery action. `data.coverage`, `complete`, `truncated`,
`traversalLimits`, and `limitations` are schema v1 compatibility projections derived from that state.
`completion.traversalStatus: exhausted` means only that the requested static traversal finished without a
bound; it says nothing about runtime-only relationships or an unreported index state.

Top-level `runtime` identifies CLI/Node versions and an allowlisted runner source (`direct`,
`explicit`, `checkout`, `global`, or `release-fallback`). It intentionally omits resolved absolute
paths, the release package URL, credentials, and the full argument list.

## Provider doctor

Run machine-readable checks for any catalog preset, or add `--smoke` for launch, initialize, capability, and
fixture evidence:

```sh
<plugin-root>/scripts/run-impact-lens doctor <preset>
<plugin-root>/scripts/run-impact-lens doctor <preset> --smoke
```

The response retains every check with `pass`, `warn`, or `fail`; inspect them all instead of stopping at the
first failure. Checks distinguish executable discovery, readable/supported versions, language match,
capability, dotted settings, and an optional fixture. Doctor does not install, build, configure, or sync a
project.

For bundled TypeScript/JavaScript installation failures, run `doctor bundled-typescript` before asking for
provider configuration.
`bundled_provider_artifact_missing`, `bundled_provider_artifact_unreadable`, and
`bundled_provider_artifact_corrupt` are reinstall/permission problems. Provider launch, initialize,
capability, and query codes mean the artifact was selected but failed later in its lifecycle.

Successful analysis includes additive schema v1 metadata:

```json
{
  "completion": {
    "requestStatus": "succeeded",
    "traversalStatus": "exhausted",
    "semanticScope": "provider-static",
    "indexingStatus": "unknown"
  },
  "provider": {
    "host": "lsp",
    "name": "typescript-language-server",
    "requestedLanguageId": "typescript",
    "detectedLanguageId": "typescript",
    "selectedBy": "bundled",
    "languageMatch": true,
    "advertised": {"callHierarchy": true, "diagnostics": "unknown"},
    "observed": {"prepareCallHierarchy": true, "incomingCalls": true, "diagnostics": true},
    "lifecycle": {"stage": "query", "status": "ready"}
  },
  "coverage": {
    "traversal": {"status": "complete", "requestedDepth": 5, "reachedDepth": 2, "maxNodes": 120},
    "semantic": {"status": "static-only", "evidenceSources": ["lsp-call-hierarchy"]},
    "indexing": {"status": "unknown"},
    "reasons": ["dynamic_calls_not_inferred", "unsaved_buffers_unavailable"]
  },
  "limitationDetails": [
    {
      "code": "dynamic_calls_not_inferred",
      "severity": "info",
      "scope": "semantic",
      "message": "Dynamic dispatch, reflection and runtime wiring are not inferred from a static call hierarchy."
    },
    {
      "code": "unsaved_buffers_unavailable",
      "severity": "info",
      "scope": "request",
      "message": "Unsaved editor buffers are not visible to the CLI, so the analysis used the files on disk."
    }
  ]
}
```

`coverage.reasons` and the top-level compatibility `limitations` are code projections of
`limitationDetails`; use the structured entries when producing guidance.

`complete: true` is the v1 projection of `completion.traversalStatus: exhausted`. It does not override
`semanticScope: provider-static` or `indexingStatus: unknown`. Never produce the conclusions `no impact`,
`safe to change`, `unused`, `fully analyzed`, `complete analysis`, or `all callers` from an Impact Lens
response. They claim runtime or index completeness that static Call Hierarchy evidence does not establish.

An empty incoming-call result has one root node and no edges. Read its limitation details:

- `no_incoming_callers` reports what the configured provider returned within this traversal.
- `index_state_unknown` means the provider did not prove its index ready, so the empty result is not evidence
  that no callers exist. It is present only when `indexingStatus: unknown`; see "Indexing state and
  completeness" below for what the same empty result means under `working` and `ready`.

## Indexing state and completeness

`coverage.indexing.status` (mirrored in `completion.indexingStatus`) is one of three values. Each permits a
different statement about an empty or partial result; do not treat them interchangeably.

### `unknown` — the provider made no claim

The provider never reported an index state. An empty result is not evidence that no caller exists, which is
why the response carries `index_state_unknown`. No preset in the shipped catalog declares a `readiness`
profile yet (`cli/src/providers/catalog.ts` marks every bundled preset "claims nothing about indexing"), so
`unknown` is what agents see with every bundled and catalog provider today. No request field or
`.impact-lens/provider.json` field lets a user attach a `readiness` profile — `readiness` is not part of
either schema, so a user cannot reach `ready` or `working` through any configuration available today.
Those two states only start appearing once a preset that declares `readiness` enters the shipped catalog,
which is a code change, not something this CLI's current surface exposes. Implement handling for both
states anyway: they are part of the schema and will become reachable without warning once that catalog
change ships, so do not hard-code an assumption that only `unknown` exists.

### `working` — the provider is still indexing

```json
{
  "completion": {
    "requestStatus": "partial",
    "traversalStatus": "unknown",
    "semanticScope": "provider-static",
    "indexingStatus": "working"
  },
  "coverage": {
    "traversal": {"status": "failed", "requestedDepth": 5, "reachedDepth": 0, "maxNodes": 120},
    "semantic": {"status": "static-only", "evidenceSources": ["lsp-call-hierarchy"]},
    "indexing": {"status": "working"},
    "reasons": ["dynamic_calls_not_inferred", "unsaved_buffers_unavailable", "provider_not_ready"]
  },
  "limitationDetails": [
    {"code": "dynamic_calls_not_inferred", "severity": "info", "scope": "semantic", "message": "Dynamic dispatch, reflection and runtime wiring are not inferred from a static call hierarchy."},
    {"code": "unsaved_buffers_unavailable", "severity": "info", "scope": "request", "message": "Unsaved editor buffers are not visible to the CLI, so the analysis used the files on disk."},
    {"code": "provider_not_ready", "severity": "error", "scope": "indexing", "message": "The provider is still indexing, so the returned set of callers is incomplete.", "action": "Wait for indexing to finish and re-run."}
  ]
}
```

`indexingStatus: working` always pairs with `requestStatus: partial`, `traversalStatus: unknown`, and
`complete: false` (schema rule X9: a working index cannot belong to a `succeeded` request).
`coverage.traversal.status` reads `failed` here — that is the v1 spelling's conservative loss described
above for an unresolved traversal, not a query failure. Report this result as incomplete because indexing
was in progress, name `provider_not_ready` as the cause, and recommend re-running. Reporting it as "no
callers" is forbidden.

### `ready` — the provider proved its index is built

```json
{
  "completion": {
    "requestStatus": "succeeded",
    "traversalStatus": "exhausted",
    "semanticScope": "provider-static",
    "indexingStatus": "ready"
  },
  "coverage": {
    "traversal": {"status": "complete", "requestedDepth": 5, "reachedDepth": 0, "maxNodes": 120},
    "semantic": {"status": "static-only", "evidenceSources": ["lsp-call-hierarchy"]},
    "indexing": {"status": "ready", "evidence": {"signal": "work-done-progress", "detail": "indexing"}},
    "reasons": ["dynamic_calls_not_inferred", "unsaved_buffers_unavailable"]
  },
  "limitationDetails": [
    {"code": "dynamic_calls_not_inferred", "severity": "info", "scope": "semantic", "message": "Dynamic dispatch, reflection and runtime wiring are not inferred from a static call hierarchy."},
    {"code": "unsaved_buffers_unavailable", "severity": "info", "scope": "request", "message": "Unsaved editor buffers are not visible to the CLI, so the analysis used the files on disk."},
    {"code": "no_incoming_callers", "severity": "warning", "scope": "semantic", "message": "No incoming callers were returned for this symbol.", "action": "Confirm dynamic entry points manually before removing this symbol."}
  ]
}
```

`coverage.indexing.evidence` is `{signal, detail?}`: a stable signal kind plus the preset's own matcher
string (schema rule X3 requires `evidence` whenever `status: ready`). It never carries server-authored text
or a timestamp — both are excluded so identical runs stay byte-identical. Name the signal if useful, but do
not present it as proof of runtime completeness: it proves only that the provider's index is built, not that
every caller is reachable through this Call Hierarchy provider.

An empty result under `ready` is a real answer within static call-hierarchy scope. `index_state_unknown` is
absent here by construction — the CLI only adds it when `indexingStatus: unknown` — and the response must
not carry that caveat anyway. If every empty result carried the same index-state warning, it would read as
background noise and get ignored on the one run where it matters; suppressing it once the index is proven
ready is what keeps it meaningful when it does appear. `no_incoming_callers` still applies: the empty result
is still reported, just without the unproven-index caveat. Runtime-completeness claims (reflection,
dependency injection, generated code, other runtime-only wiring) stay forbidden regardless of
`indexingStatus`.

## `requestStatus: partial`

`partial` means the graph is usable but incomplete, never a complete list of callers. Name the cause from
`data.limitationDetails`: `depth_limit_reached`, `node_limit_reached`, `traversal_timeout`,
`traversal_cancelled`, `provider_query_failed`, or `provider_not_ready`. Every bounded `traversalStatus` the
CLI can produce (`depth-limited`, `node-limited`, `timeout`, `cancelled`, `unknown`, `failed`) maps to
exactly one of these six causes.

`no_incoming_callers` and `index_state_unknown` are absent from a `partial` result by construction: both
codes are added only when `completion.requestStatus === 'succeeded'`. Their absence on a `partial` result is
not evidence there are no callers — it means the traversal never reached the point of deciding that. Do not
infer "so there are no callers" from their absence.

## `provider_not_ready`: two distinct meanings

The same code names two different things depending on where it appears. Confusing them turns a hard failure
into a false empty result.

- As a `limitationDetails` entry on `ok: true` (severity `error`, scope `indexing`, shown above under
  `working`): analysis ran, a graph exists, and the index was not ready while it ran. Report the graph as
  incomplete.
- As `error.code` on `ok: false`, with `details.stage: "indexing"`, exit 5, `retryable: true`:

  ```json
  {
    "schemaVersion": 1,
    "operation": "impact.analyze",
    "ok": false,
    "runtime": {"cli": {"name": "@impact-lens/cli", "version": "0.7.0"}, "node": {"version": "22.0.0", "major": 22, "executable": "node"}, "runner": {"source": "checkout"}},
    "error": {
      "code": "provider_not_ready",
      "message": "The provider did not report readiness within 30000ms.",
      "retryable": true,
      "details": {"stage": "indexing", "budgetMs": 30000, "observedWorking": false}
    }
  }
  ```

  No analysis ran and there is no graph. Presenting this as an empty result is forbidden; report it as a
  failed run and recommend re-running once indexing finishes.

`provider_project_metadata_missing` is the sibling failure for a missing project file the provider's preset
declared it needs (`ok: false`, `details.stage: "indexing"`, exit 5, `details.missing` listing the
workspace-relative paths). Impact Lens deliberately never generates, builds, or syncs these files. Tell the
user which files are missing and that they must supply them; do not offer to create them.

## Fixed summary shape

State a summary in this order, conclusion last, because readers act on the first sentence:

1. **Evidence boundary** — scope (static call hierarchy from the configured provider), indexing state,
   traversal completeness.
2. **High-severity limitations** — every `limitationDetails` entry with `severity: error`, then `warning`,
   before any findings.
3. **Findings** — direct/transitive callers, affected tests, hop distance, call sites, existing notes.
4. **Conclusion** — explicitly scoped to the boundary stated in step 1.

Two short compliant examples for an empty result, showing the same shape producing different conclusions.
Both are extracted at runtime by `scripts/test-response-policy.mjs` (marked by the HTML comments below, not
copied into the fixtures), so editing an example into something non-compliant fails that eval.

<!-- response-policy-example: unknown-empty -->
> **`unknown`, empty result:** "Static call hierarchy from typescript-language-server; the provider did not
> report an index state, so this empty result is not proof no caller exists. No incoming callers were
> returned for `calculateTotal` at depth 5. Because the index state is unknown, this is not evidence the
> function is unused — re-run after indexing finishes or verify with a workspace search before removing it."
<!-- /response-policy-example -->

<!-- response-policy-example: ready-empty -->
> **`ready`, empty result:** "Static call hierarchy from typescript-language-server; the provider's index is
> proven ready (`work-done-progress` signal). No incoming callers were returned for `calculateTotal` at
> depth 5. Within static call-hierarchy scope, nothing in this workspace calls it directly — this does not
> rule out reflection, dependency injection, or other runtime-only wiring, so confirm dynamic entry points
> before removing it."
<!-- /response-policy-example -->

## Analyze

Command:

```sh
<plugin-root>/scripts/run-impact-lens analyze --stdin < request.json
```

Request:

```json
{
  "workspace": "/absolute/path/to/project",
  "file": "src/order.ts",
  "line": 42,
  "column": 17,
  "depth": 5,
  "maxNodes": 120,
  "includeSource": "declaration",
  "expectedSymbol": {
    "name": "calculateTotal",
    "kind": "function"
  }
}
```

Required fields are `workspace`, `file`, `line`, and `column`. `depth` is 1-20, `maxNodes` is 1-1000, and `includeSource` is `none`, `declaration`, or `body`. All positions are 1-based UTF-16.

Provider selection is deterministic:

1. A request-level raw `provider` command is the advanced custom path.
2. A request-level `providerPreset` explicitly names a catalog preset.
3. A trusted `.impact-lens/provider.json` in the analyzed workspace can select a preset or command.
4. Verified auto-discovery may select one unambiguous installed preset for the detected language.
5. Otherwise the request fails instead of guessing, selecting an unverified server, or falling back to a
   provider for another language.

`provider` and `providerPreset` are mutually exclusive in one request. TypeScript and JavaScript have a
verified bundled preset, so their default path needs no raw command. To select a catalog entry explicitly:

```json
{
  "workspace": "/absolute/path/to/project",
  "file": "src/order.ts",
  "line": 42,
  "column": 17,
  "providerPreset": "bundled-typescript"
}
```

For an advanced custom Language Server, provide a standard LSP Call Hierarchy command directly:

```json
{
  "provider": {
    "command": "/absolute/path/to/language-server",
    "args": ["--stdio"],
    "languageId": "python"
  }
}
```

The executable and arguments are passed directly without shell evaluation. Request-level
`initializationOptions` and `settings` are bounded JSON trees. They merge after preset and trusted project
values (`preset < project < request`) and are delivered only for that analysis. Individual and merged trees
are limited to 16 levels, 1000 keys, and 64 KiB; forbidden prototype keys and non-JSON numbers are rejected.
These values may be secret, so failure summaries must not quote them.

If no verified auto provider serves the detected language, the request returns
`provider_required_for_language`. An explicit `languageId` that conflicts with the detected file type returns
`provider_language_mismatch`; the bundled TypeScript provider is not tried for another language.

## Note list

Command:

```sh
<plugin-root>/scripts/run-impact-lens note list --stdin < request.json
```

Request all CLI-visible scopes:

```json
{"workspace":"/absolute/path/to/project"}
```

Or filter by `shared`, `source`, or `local`:

```json
{"workspace":"/absolute/path/to/project","scope":"shared"}
```

## Note get

```sh
<plugin-root>/scripts/run-impact-lens note get --stdin < request.json
```

```json
{
  "workspace": "/absolute/path/to/project",
  "target": {
    "file": "src/order.ts",
    "position": {"line": 42, "column": 17},
    "expectedSymbol": {"name": "calculateTotal", "kind": "function"}
  }
}
```

## Note set

First preview the write:

```sh
<plugin-root>/scripts/run-impact-lens note set --stdin < preview.json
```

```json
{
  "workspace": "/absolute/path/to/project",
  "target": {
    "file": "src/order.ts",
    "position": {"line": 42, "column": 17},
    "expectedSymbol": {"name": "calculateTotal", "kind": "function"}
  },
  "scope": "shared",
  "text": "Calculates the final amount including tax"
}
```

Only when the user requested the change, repeat the same request with the preview's exact token:

```json
{
  "workspace": "/absolute/path/to/project",
  "target": {
    "file": "src/order.ts",
    "position": {"line": 42, "column": 17},
    "expectedSymbol": {"name": "calculateTotal", "kind": "function"}
  },
  "scope": "shared",
  "text": "Calculates the final amount including tax",
  "apply": true,
  "expectedToken": "TOKEN_FROM_PREVIEW"
}
```

## Note delete

Use the same target and scope with `note delete`. Preview first without `apply` or `expectedToken`, then repeat with `apply: true` and the latest preview token when deletion was requested. A delete request has no `text` field.

## Exit status

- `0`: success, including a usable partial analysis
- `2`: invalid command or request
- `3`: missing or ambiguous target
- `4`: conflict or invalid note document
- `5`: provider unavailable or missing Call Hierarchy support
- `6`: timeout
- `7`: unsupported CLI Node.js runtime
- `10`: unexpected CLI error
- `127`: plugin runner could not locate or launch the CLI runtime

Provider exit-5 errors distinguish discovery and configuration (`provider_required_for_language`,
`provider_language_mismatch`, `provider_executable_not_found`, `provider_selection_ambiguous`,
`provider_config_invalid`), lifecycle (`provider_launch_failed`, `provider_initialize_failed`,
`provider_protocol_incompatible`, `provider_capability_missing`, `provider_query_failed`), and bundled
artifact failures. Use `error.details.stage` and the redacted stderr/provider log when present; these errors
mean analysis was not established, not zero callers.

Provider failures also carry `msSinceSpawn`, `bytesFromServer`, and `requestsSent`. A server that dies
with `bytesFromServer: 0` never spoke the protocol, which points at the launch environment rather than
at anything the server did. `providerLog` holds the server's own redacted `window/logMessage` and
`window/showMessage` output; many servers, including the bundled TypeScript one, never write to stderr
at all, so this is where their explanation appears. `IMPACT_LENS_PROVIDER_LOG_LEVEL=1..4` raises the
bundled server's log level for one run.

`provider_ipc_unavailable` means the environment starts child processes but does not deliver their
stdio, so no Language Server can be reached from here. It is reported only when the provider produced
no output at all and a trivial echo child is also unreachable. Its `details.stage` is `launch` or
`initialize`; a query-stage failure cannot qualify because reaching query proves the initialize response was
received. Do not treat it as a provider or installation fault; the recovery is to run outside the sandbox or
to allow child process I/O.
Runner exit-127 errors distinguish Node missing/unreadable/unsupported, selected CLI artifact
missing/not executable, npm unavailable, and a failed release-fallback download. Read
`runtime.runner.source` and the stable recovery code in `error.details`; do not infer provider failure
when the CLI never started.

Release-fallback download failures use `npm_network_unreachable` (retryable), `cli_release_unavailable`,
`npm_permission_denied`, `npm_disk_space_unavailable`, and `npm_release_fallback_failed`. Their
`error.details` carry `stage: resolution`, `component: npm`, `source: release-fallback`, the npm
`exitCode`, a recovery code, and `npmOutput: suppressed`. The raw npm text is withheld because it can
contain absolute paths, the release package URL, and registry or proxy credentials. An error raised
after the CLI started keeps the CLI's own envelope and exit status unchanged.
