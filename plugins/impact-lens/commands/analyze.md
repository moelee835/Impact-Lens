---
description: Analyze the change impact of a function with the Impact Lens CLI
argument-hint: [function name, or path/to/file.ts:LINE:COLUMN]
allowed-tools: Bash, Read, Glob, Grep
---

Analyze the incoming-call impact of a function with the Impact Lens Agent CLI.

Target requested by the user: $ARGUMENTS

Follow the `impact-lens-cli` skill. Read its `references/cli-contract.md` before building a request
or interpreting a response.

## 1. Resolve the target

- Use the absolute workspace root and a workspace-relative file path.
- If the argument is already `file:line:column`, use it directly.
- If the argument is a function name, locate the declaration with Grep or Glob and use the position
  of the declaration name. Coordinates are 1-based UTF-16.
- If no argument was given, use the function the user is currently discussing or the active
  selection. Ask which function to analyze only when the target is genuinely ambiguous.
- Include `expectedSymbol` whenever the name and kind are known, so an ambiguous position fails
  instead of silently analyzing a different declaration.

## 2. Run the analysis

```sh
"${CLAUDE_PLUGIN_ROOT}/scripts/run-impact-lens" analyze --stdin <<'JSON'
{
  "workspace": "/absolute/path/to/project",
  "file": "src/order.ts",
  "line": 42,
  "column": 17,
  "depth": 5,
  "includeSource": "declaration",
  "expectedSymbol": {"name": "calculateTotal", "kind": "function"}
}
JSON
```

- Start at the depth the task needs. Raise it only when the result is truncated and more depth would
  change the answer.
- Use `includeSource: "body"` only when implementation context is necessary.
- On a non-zero exit status, read the JSON error from stderr. Exit 5 means the provider could not be
  established, which is not an empty impact graph.

## 3. Report the impact

Summarize from the parsed JSON, not from raw output:

- Direct callers, transitive callers, and affected tests, with hop distance and call sites.
- Any existing function notes on the impacted symbols.
- Truncation: report the requested depth, the reached depth, and whether a depth or node limit
  stopped the traversal. Never present a truncated or empty result as proof of no impact.
- The `limitations` array as stated by the CLI.

State plainly that these are static Call Hierarchy relationships. Do not claim coverage of
reflection, dependency injection, decorator routing, event buses, generated code, or other
runtime-only links. Do not run tests or infer that unrun tests pass.
