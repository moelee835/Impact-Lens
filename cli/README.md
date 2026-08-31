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
- `data.completion` (`requestStatus`, `traversalStatus`, `semanticScope`, `indexingStatus`) is the single
  source of truth for result state. `data.coverage`, `complete`, and `truncated` are schema v1
  compatibility projections derived from it.
- `complete` only means the configured provider completed the requested static traversal. It never means
  "no impact", "safe to change", "unused", or "all callers" — those claims need runtime and index
  completeness this CLI does not establish.
- `provider` records the host, server identity, detected/requested language, selection source,
  advertised/observed capability, and last lifecycle stage.
- `coverage.traversal` distinguishes complete, depth-limited, and node-limited traversal.
- `coverage.semantic` is `static-only` until provenance-bearing augmentation is implemented.
- `coverage.indexing` (mirrored in `completion.indexingStatus`) is one of `unknown`, `working`, or `ready`.
  No preset in the shipped catalog declares a readiness profile, so **`unknown` is the only value reachable
  with today's catalog** — an empty result under `unknown` is not evidence that no caller exists. A
  user-configured provider with its own `readiness` profile can still report `working` or `ready`.
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

## Provider doctor

Run machine-readable checks for any catalog preset, not just `bundled-typescript`:

```sh
impact-lens doctor bundled-typescript
impact-lens doctor bundled-typescript --smoke
impact-lens doctor bundled-typescript --fixture
```

The default preflight checks the active Node engine, CLI package, the provider executable/artifact and its
version, language support, dotted settings keys, and `.impact-lens/provider.json` validity. `--smoke`
additionally starts the server and verifies initialize and advertised Call Hierarchy capability.
`--fixture` runs the preset's declared fixture through a real Call Hierarchy query. Each check reports
`pass`, `warn`, or `fail` independently and **doctor does not stop at the first failure**, so a missing
executable, an unsupported version, a language mismatch, a missing capability, and a fixture failure are
all distinguishable in one response. Doctor never installs, builds, configures, or syncs a project — a
missing or invalid dependency is reported, not fixed.

Only catalog presets can be diagnosed this way. A raw custom `provider` (no preset id) cannot be checked by
`doctor`; an id that is not in the catalog returns `invalid_command` without diagnosing anything:

```json
{"error":{"code":"invalid_command","message":"Unknown provider preset: not-a-real-preset","details":{"knownPresetIds":["bundled-typescript"]}}}
```

Inspect `runtime.runner.source` to distinguish `direct`, `explicit`, `checkout`, `global`, and
`release-fallback`. Doctor output uses logical package and entry names only; it does not return resolved
absolute paths, registry URLs, or command arguments.

## Provider selection

The CLI picks a provider in this order, stopping at the first match:

1. **Raw custom command** — a `provider` object in the request JSON (below). It wins outright over every
   other tier; whoever supplies it takes responsibility for it.
2. **Explicit preset** — a `providerPreset` string in the request JSON, naming a catalog preset by id.
   Refused with `provider_language_mismatch` if the named preset does not claim the detected file's
   language.
3. **Trusted project choice** — `.impact-lens/provider.json` committed in the workspace (below).
4. **Verified auto-discovery** — the CLI looks for a catalog preset that claims the detected language and
   has a discoverable executable, preferring a bundled preset over an external one. Two installed verified
   providers for one language are reported, not silently guessed between.
5. **Unsupported** — no catalog preset claims the detected language: `provider_required_for_language`.

Selection never crosses a language boundary at any tier: a `.py` file is never analyzed by a TypeScript
provider, whichever tier picked it.

### Shipped catalog

The catalog (`cli/src/providers/catalog.ts`) has exactly one entry today, `bundled-typescript`, covering
`.ts`/`.mts`/`.cts`/`.tsx`/`.js`/`.jsx`/`.mjs`/`.cjs`. Every other language still ends at
`provider_required_for_language` unless a custom `provider` or a project preset is configured — this is
today's shipped state, not a preview of languages that will arrive soon.

### `.impact-lens/provider.json` and request-level overrides

Committing `.impact-lens/provider.json` in a workspace lets every request against that project skip
repeating provider configuration. Exactly six fields are allowed; any other field rejects the whole file
with `provider_config_invalid`:

| Field | Meaning |
| --- | --- |
| `presetId` | Name a catalog preset by id |
| `command` / `args` | Custom provider executable and arguments (relative paths only) |
| `languageId` | Force the languageId reported to the provider |
| `initializationOptions` / `settings` | Initialization values, applied ahead of the preset's own |

The request JSON accepts the same `initializationOptions`/`settings` fields and merges them
`preset < project < request`. Values whose key name contains `token`, `secret`, `password`, `credential`,
`api key`, or `auth` (4+ characters), plus any path a preset marks `sensitive`, are redacted from logs and
failure summaries automatically.

## Custom provider

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
