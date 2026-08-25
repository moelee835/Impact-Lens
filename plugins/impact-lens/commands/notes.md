---
description: Read or manage Impact Lens function notes
argument-hint: [list | get | set | delete] [function or path/to/file.ts:LINE:COLUMN]
allowed-tools: Bash, Read, Glob, Grep
---

Read or manage Impact Lens function notes with the Agent CLI.

Request: $ARGUMENTS

Follow the `impact-lens-cli` skill. Read its `references/cli-contract.md` before building a request.

## Scopes

| Scope | File | Shared through Git |
| --- | --- | --- |
| `shared` | `.impact-lens/notes.json` | yes |
| `source` | `@impact-note` comment above the declaration | yes, with the source |
| `local` | `.impact-lens/notes.local.json` | no, Git-ignored |

VS Code Personal notes are stored in editor workspace storage and are not visible to the CLI. Never
report their absence as a deletion or as proof that a function has no note.

## Read

```sh
"${CLAUDE_PLUGIN_ROOT}/scripts/run-impact-lens" note list --workspace /absolute/path/to/project
```

```sh
"${CLAUDE_PLUGIN_ROOT}/scripts/run-impact-lens" note get --stdin <<'JSON'
{
  "workspace": "/absolute/path/to/project",
  "target": {
    "file": "src/order.ts",
    "position": {"line": 42, "column": 17},
    "expectedSymbol": {"name": "calculateTotal", "kind": "function"}
  }
}
JSON
```

Use `note list` for a workspace inventory, optionally filtered with `"scope"`, and `note get` for a
single resolved function.

## Write

`note set` and `note delete` are previews unless `apply` is true.

1. Run the request without `apply` and show the user what would change.
2. Only when the user asked for that repository or workspace change, repeat the exact same request
   with `"apply": true` and the exact `expectedToken` from the latest preview.

```sh
"${CLAUDE_PLUGIN_ROOT}/scripts/run-impact-lens" note set --stdin <<'JSON'
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
JSON
```

`note delete` uses the same target and scope with no `text` field.

Never invent a token or reuse a stale one. On a conflict (exit 4), preview again and reassess rather
than retrying with the old token. Report which scope and file changed, and never describe a preview
as a completed write. A capability to edit notes does not authorize unrelated source changes.
