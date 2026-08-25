# Impact Lens Agent CLI

This package exposes Impact Lens incoming-call analysis and function-note operations as compact JSON for code agents. It runs independently from the VS Code Extension and does not read or modify VS Code Personal notes.

## Build and test

```sh
pnpm --dir cli run build
pnpm --dir cli test
```

## Analyze

```sh
pnpm --dir cli exec impact-lens analyze \
  --workspace /path/to/project \
  --file src/order.ts \
  --line 42 \
  --column 1
```

The canonical Agent interface accepts a JSON request from stdin:

```sh
pnpm --dir cli exec impact-lens analyze --stdin < request.json
```

```json
{
  "workspace": "/path/to/project",
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

Coordinates are 1-based. Output is one compact JSON document on stdout. Failures are one compact JSON document on stderr with a non-zero exit code.

## Notes

```sh
pnpm --dir cli exec impact-lens note get --stdin < note-get.json
pnpm --dir cli exec impact-lens note list --workspace /path/to/project --scope shared
pnpm --dir cli exec impact-lens note set --stdin < note-set-preview.json
pnpm --dir cli exec impact-lens note delete --stdin < note-delete-preview.json
```

`note set` and `note delete` are previews unless `apply` is true. Applying a change also requires the latest `expectedToken` returned by `note get` or a preview. Supported scopes are:

- `shared`: `.impact-lens/notes.json`, compatible with the Extension
- `source`: `@impact-note` directly above the declaration
- `local`: `.impact-lens/notes.local.json`, CLI-only and ignored by Git

VS Code Personal notes remain in Extension `workspaceState` and are reported as unavailable. Dynamic calls and unsaved editor buffers are not inferred.

Canonical note target:

```json
{
  "workspace": "/path/to/project",
  "target": {
    "file": "src/order.ts",
    "position": { "line": 42, "column": 17 },
    "expectedSymbol": { "name": "calculateTotal", "kind": "function" }
  }
}
```

To preview an update, add `scope` and `text`:

```json
{
  "workspace": "/path/to/project",
  "target": {
    "file": "src/order.ts",
    "position": { "line": 42, "column": 17 },
    "expectedSymbol": { "name": "calculateTotal", "kind": "function" }
  },
  "scope": "shared",
  "text": "Calculates the final amount including tax"
}
```

Repeat the request with `"apply": true` and the preview's `"expectedToken"` to write it. Delete uses the same request without `text` through `note delete`.

## Contract

- [stdin request schema](schemas/request.schema.json)
- [response envelope schema](schemas/response.schema.json)
- `schemaVersion` is currently `1`.
- `line` and `column` are 1-based UTF-16 positions.
- Node and edge arrays use deterministic ordering.
- `complete` only means the configured provider completed the requested static traversal.
- `provider` records the host, server identity, detected/requested language, selection source,
  advertised/observed capability, and last lifecycle stage.
- `coverage.traversal` distinguishes complete, depth-limited, and node-limited traversal.
- `coverage.semantic` is `static-only` until provenance-bearing augmentation is implemented.
- `coverage.indexing` is `unknown` unless a provider gives an explicit readiness signal.
- Top-level `runtime` records the CLI and Node versions plus the allowlisted runner source without
  exposing an absolute executable, package URL, or full argument list.
- Top-level `capabilities` and `limitations` remain schema v1 compatibility projections.

An empty caller list with a prepared root is a successful static result. A missing, mismatched,
failed, or capability-incompatible provider is an error and is never returned as an empty graph.

Exit codes:

- `0`: success, including a usable partial analysis
- `2`: invalid command or request
- `3`: missing or ambiguous target
- `4`: conflict or invalid note document
- `5`: provider unavailable or missing Call Hierarchy support
- `6`: timeout
- `7`: unsupported CLI Node.js runtime
- `10`: unexpected internal error

## Bundled provider doctor

TypeScript/JavaScript installation checks do not require a provider configuration:

```sh
impact-lens doctor bundled-typescript
impact-lens doctor bundled-typescript --smoke
```

The default preflight checks the active Node engine, CLI package, `typescript-language-server`,
TypeScript version, and readable packaged entry. `--smoke` additionally starts the server and verifies
initialize and advertised Call Hierarchy capability. It is explicit so normal analyze requests do not
pay for an extra server process.

Inspect `runtime.runner.source` to distinguish `direct`, `explicit`, `checkout`, `global`, and
`release-fallback`. Doctor output uses logical package and entry names only; it does not return resolved
absolute paths, registry URLs, or command arguments.

## Provider

TypeScript and JavaScript use the packaged `typescript-language-server` by default. A different standard LSP Call Hierarchy server can be supplied in stdin JSON:

```json
{
  "provider": {
    "command": "/absolute/path/to/language-server",
    "args": ["--stdio"],
    "languageId": "python"
  }
}
```

The CLI passes executable and arguments directly without shell evaluation. Provider-specific initialization requirements may need a future adapter; unsupported Call Hierarchy is returned as `provider_capability_missing` rather than an empty graph.

The bundled provider is selected only for TypeScript and JavaScript file types. Other languages fail
before process launch with `provider_required_for_language`; an explicit `languageId` that conflicts
with the detected file language fails with `provider_language_mismatch`.

Provider lifecycle errors are separated into `provider_launch_failed`,
`provider_initialize_failed`, and `provider_query_failed`. When a child process exits, `error.details`
contains the failure stage and, when available, its executable basename, exit code/signal, and a
redacted stderr tail.
