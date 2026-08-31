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
  established, which is not an empty impact graph. Use the provider error code and `details.stage`
  to distinguish discovery, language mismatch, launch, initialize, capability, and query failures.

## 3. Report the impact

Follow the `impact-lens-cli` skill's indexing-state and summary-order rules; this step restates only what
this command needs inline.

Summarize from the parsed JSON, not from raw output, in this order — conclusion last:

1. Evidence boundary: provider host/name/language/selection, static call-hierarchy scope, and
   `completion.indexingStatus` (`unknown`, `working`, or `ready` — see the skill for what each permits).
2. Traversal completeness: `requestStatus`, whether the result is truncated, the requested depth, the
   reached depth, and whether a depth or node limit stopped the traversal.
3. Every `data.limitationDetails` entry with `severity: error`, then `severity: warning`, before any
   findings; include the recovery action when present.
4. Findings: direct callers, transitive callers, and affected tests, with hop distance and call sites, and
   any existing function notes on the impacted symbols. Advertised versus observed capability and the last
   lifecycle stage from `provider`.
5. A conclusion explicitly scoped to the evidence boundary from step 1.

- `completion.traversalStatus: exhausted` only confirms that the requested static traversal finished;
  `complete: true` is its v1 projection. It does not override `semanticScope: provider-static` or a
  non-`ready` `indexingStatus`.
- `requestStatus: partial` is a usable but incomplete graph, never a complete list of callers; name the
  limiting cause from `limitationDetails`. Never report a `working`-indexing or `partial` result as "no
  callers".
- For one root node and no edges, inspect `no_incoming_callers` and, when present, `index_state_unknown` in
  `limitationDetails`. Its absence under `indexingStatus: ready` is correct, not a gap.
- A `provider_not_ready` `error.code` on `ok: false` means no analysis ran and there is no graph; never
  present it as an empty result. A `provider_project_metadata_missing` failure names files the user must
  supply — Impact Lens never generates or syncs them; do not offer to create them.

State plainly that these are static Call Hierarchy relationships. Do not claim coverage of
reflection, dependency injection, decorator routing, event buses, generated code, or other
runtime-only links. Never describe the result as `no impact`, `safe to change`, `unused`, `fully analyzed`,
`complete analysis`, or `all callers`. Do not run tests or infer that unrun tests pass.
