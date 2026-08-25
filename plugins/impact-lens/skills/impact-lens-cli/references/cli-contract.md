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

## Response envelope

Success is one compact JSON document on stdout:

```json
{"schemaVersion":1,"operation":"impact.analyze","ok":true,"runtime":{"cli":{"name":"@impact-lens/cli","version":"0.5.0"},"node":{"version":"22.0.0","major":22,"executable":"node"},"runner":{"source":"release-fallback"}},"data":{},"capabilities":{},"limitations":[],"timings":{}}
```

Failure is one compact JSON document on stderr with a non-zero exit status:

```json
{"schemaVersion":1,"operation":"impact.analyze","ok":false,"runtime":{"cli":{"name":"@impact-lens/cli","version":"0.5.0"},"node":{"version":"22.0.0","major":22,"executable":"node"},"runner":{"source":"global"}},"error":{"code":"provider_initialize_failed","message":"...","retryable":true}}
```

Do not parse human-oriented tables or depend on whitespace. Node and edge arrays are deterministically ordered. `complete` means only that the provider completed the requested static traversal. Inspect `data.provider` and `data.coverage`; check traversal, semantic and indexing coverage as well as the compatibility `limitations` and truncation fields.

Top-level `runtime` identifies CLI/Node versions and an allowlisted runner source (`direct`,
`explicit`, `checkout`, `global`, or `release-fallback`). It intentionally omits resolved absolute
paths, the release package URL, credentials, and the full argument list.

## Bundled TypeScript doctor

Run a fast package/entry preflight or an explicit initialize/capability smoke:

```sh
<plugin-root>/scripts/run-impact-lens doctor bundled-typescript
<plugin-root>/scripts/run-impact-lens doctor bundled-typescript --smoke
```

Use this for TypeScript/JavaScript installation failures before asking for provider configuration.
`bundled_provider_artifact_missing`, `bundled_provider_artifact_unreadable`, and
`bundled_provider_artifact_corrupt` are reinstall/permission problems. Provider launch, initialize,
capability, and query codes mean the artifact was selected but failed later in its lifecycle.

Successful analysis includes additive schema v1 metadata:

```json
{
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
  }
}
```

`complete: true` does not override `semantic.status: static-only` or `indexing.status: unknown`.

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

TypeScript and JavaScript use the packaged language server. For another language, add a standard LSP Call Hierarchy provider:

```json
{
  "provider": {
    "command": "/absolute/path/to/language-server",
    "args": ["--stdio"],
    "languageId": "python"
  }
}
```

The executable and arguments are passed directly without shell evaluation. Provider-specific initialization may be unsupported and must be reported from the response rather than inferred as zero callers.

Without an explicit provider, non-TypeScript/JavaScript files return
`provider_required_for_language`. An explicit `languageId` that conflicts with the detected file
type returns `provider_language_mismatch`; the bundled TypeScript provider is not tried.

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

Provider exit-5 errors distinguish `provider_launch_failed`, `provider_initialize_failed`,
`provider_capability_missing`, and `provider_query_failed`. Use `error.details.stage` and the
redacted stderr tail when present; these errors mean analysis was not established, not zero callers.
Runner exit-127 errors distinguish Node missing/unreadable/unsupported, selected CLI artifact
missing/not executable, and npm unavailable. Read `runtime.runner.source` and the stable recovery code
in `error.details`; do not infer provider failure when the CLI never started.
