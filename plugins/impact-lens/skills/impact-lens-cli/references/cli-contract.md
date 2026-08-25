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
{"schemaVersion":1,"operation":"impact.analyze","ok":true,"data":{},"capabilities":{},"limitations":[],"timings":{}}
```

Failure is one compact JSON document on stderr with a non-zero exit status:

```json
{"schemaVersion":1,"operation":"impact.analyze","ok":false,"error":{"code":"provider_unavailable","message":"...","retryable":false}}
```

Do not parse human-oriented tables or depend on whitespace. Node and edge arrays are deterministically ordered. `complete` means only that the provider completed the requested static traversal. Check limitations and any depth or node truncation fields in `data`.

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
- `10`: unexpected CLI error
- `127`: plugin runner could not locate or launch the CLI runtime
