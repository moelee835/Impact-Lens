---
name: impact-lens-cli
description: Use the Impact Lens machine-readable CLI to analyze incoming callers and transitive code-change impact or to read and manage function notes. Use for impact radius, affected callers or tests, call hierarchy evidence, and Impact Lens shared, source, or local note operations; do not use as runtime tracing or general text search.
---

# Impact Lens CLI

Use the runner at `<plugin-root>/scripts/run-impact-lens`, resolving `<plugin-root>` from this skill's installed path. The runner prefers an explicitly configured CLI, the current Impact Lens source checkout, and a global install before falling back to the pinned GitHub release package. A fallback download may require network approval.

Use stdin JSON for agent-generated requests. It avoids shell escaping ambiguity and is the canonical interface. Read [references/cli-contract.md](references/cli-contract.md) before constructing a request or interpreting a response.

## Analyze impact

- Resolve the workspace root and a workspace-relative target file.
- Use the declaration name position when available. Coordinates are 1-based UTF-16.
- Include `expectedSymbol` when the symbol name or kind is known so an ambiguous target fails instead of silently selecting another declaration.
- Start with the depth needed by the task; do not assume an empty or truncated result means no impact.
- Request source only when it helps the task. Prefer `declaration`; use `body` only when implementation context is necessary.
- Parse the single JSON response and inspect `ok`, `runtime`, `data.completion`, `data.limitationDetails`,
  `provider`, and truncation metadata before reporting conclusions. `coverage`, `complete`, `capabilities`, and
  `limitations` are schema v1 compatibility projections, not independent state.
- Treat `completion.traversalStatus: exhausted` only as completion of the requested static traversal.
  `complete: true` is its compatibility projection. Check `semanticScope` and `indexingStatus` separately;
  `provider-static` prevents claims of complete runtime impact regardless of `indexingStatus`.
- `completion.indexingStatus` (mirrored in `coverage.indexing.status`) is `unknown`, `working`, or `ready`,
  and each permits a different statement. Read
  [references/cli-contract.md](references/cli-contract.md) for the full table and JSON examples before
  summarizing an empty or partial result.
  - `unknown`: the provider made no claim about its index. An empty result is not evidence that no caller
    exists; carry that caveat. `bundled-typescript`, `bundled-pyright`, and `clangd` always produce this
    state (they declare no `readiness` profile); `gopls` does declare one and can produce `working`/`ready`
    instead — do not assume `unknown` just because no provider was configured.
  - `working`: the provider is still indexing (`requestStatus: partial`, `traversalStatus: unknown`,
    `complete: false`, and an `error`-severity `provider_not_ready` limitation). Report the result as
    incomplete because indexing was in progress and recommend re-running; never report it as "no callers".
  - `ready`: the provider proved its index is built (`coverage.indexing.evidence` names a stable signal kind
    plus the preset's matcher string, never server text or a timestamp). An empty result here is a real
    answer within static call-hierarchy scope; omit the index-state caveat rather than repeating it out of
    habit — a caveat attached to every result teaches readers to ignore it. Runtime-completeness claims stay
    forbidden regardless.
- `completion.requestStatus: partial` means the graph is usable but incomplete, never a complete list of
  callers. Name the limiting cause from `limitationDetails` (`depth_limit_reached`, `node_limit_reached`,
  `traversal_timeout`, `traversal_cancelled`, `provider_query_failed`, or `provider_not_ready`).
  `no_incoming_callers` and `index_state_unknown` are absent from a `partial` result by construction; their
  absence does not mean there are no callers.
- When a result has only the root node and no edges, inspect `no_incoming_callers` and, when present,
  `index_state_unknown` in `limitationDetails`. `index_state_unknown` accompanies only `indexingStatus:
  unknown`; its absence under `working` or `ready` is correct, not a gap to fill in.
- Also check for `provider_null_incoming_calls` in `limitationDetails`, including under `indexingStatus:
  ready` — unlike `index_state_unknown` it is not suppressed there, since it says something about this one
  query, not about the index. It means the provider answered with `null` rather than an explicit `[]`, most
  often because the symbol is invoked only through a framework mechanism a static Call Hierarchy provider
  cannot see - measured directly against real FastAPI code: a route handler the framework's router calls
  (never through a call expression in the analyzed code), or a dependency referenced only via `Depends()`
  (never called at all). Both converge on this same signal. When present, do not state or imply that
  nothing calls the symbol.
- For C/C++ (`clangd`), also check `compile_database_missing`, `compile_database_stale`, and
  `compile_database_ambiguous` in `limitationDetails`. Without a valid `compile_commands.json`, clangd falls
  back to a generic command with no cross-file index — it can resolve a call within an already-open file
  (or one that `#include`s the declaring header) but cannot discover a call in a file nothing has opened, so
  an empty or partial result is not evidence those callers do not exist. Unlike `provider_null_incoming_calls`,
  these codes are unconditional on caller count and can appear on a non-empty result too. `.h` files are
  language-ambiguous (C vs. C++), so `languageMatch` reports `'unknown'` for them rather than `true`/`false`
  — read [references/cli-contract.md](references/cli-contract.md) for the full explanation.
- State a summary in this order, conclusion last, because readers act on the first sentence: (1) evidence
  boundary — scope, indexing state, traversal completeness; (2) every `error`-severity then
  `warning`-severity `limitationDetails` entry, before any findings; (3) findings; (4) a conclusion
  explicitly scoped to (1).
- Never describe a result as `no impact`, `safe to change`, `unused`, `fully analyzed`, `complete analysis`, or
  `all callers`; those phrases claim more than static Call Hierarchy evidence establishes.
- Treat incoming-call results as static evidence from the configured Call Hierarchy provider. Do not claim coverage of reflection, dependency injection, decorators, events, generated code, or runtime-only links.

## Select and diagnose providers

- A raw `provider` command is the advanced explicit path. `providerPreset` selects a catalog entry for one
  request. Without either, the CLI checks the trusted project choice and then verified auto-discovery; it never
  guesses between ambiguous candidates or falls back to a provider for another language.
- Request `initializationOptions` and `settings` are bounded JSON trees merged after preset and project values.
  Do not include their values in failure summaries because they may contain secrets.
- Run `doctor <preset>` for machine-readable discovery, version, language, capability, settings, and fixture
  checks. Use `--smoke` when launch/initialize/capability evidence is needed; read every check because the doctor
  continues after individual failures.

## Work with notes

- Use `note list` for workspace inventory and `note get` for one resolved function.
- Personal VS Code notes are unavailable to the CLI. Do not present their absence as deletion or as proof that a function has no Personal note.
- `shared` changes `.impact-lens/notes.json`, `source` changes an `@impact-note` source comment, and `local` changes the Git-ignored `.impact-lens/notes.local.json`.
- For `note set` or `note delete`, first run a preview without `apply`.
- Apply a mutation only when the user requested that repository or workspace change. Send `apply: true` with the exact latest `expectedToken` returned by the preview. On conflict, fetch or preview again and reassess; never invent or reuse a stale token.
- Report which scope and file were changed. Do not treat a preview as a completed write.

## Handle failures

- Read JSON from stderr when the exit status is non-zero.
- A provider unavailable or capability-missing response means the analysis could not be established; it is not an empty graph.
- Distinguish provider discovery, language mismatch, launch, initialize, capability, and query errors
  using the error code and `details.stage`. Do not retry a language mismatch with the bundled
  TypeScript provider.
- `provider_not_ready` names two different things depending on where it appears: a `limitationDetails`
  entry on `ok: true` means analysis ran and a graph exists but the index was not confirmed ready; an
  `error.code` on `ok: false` with `details.stage: "indexing"` (exit 5, retryable) means no analysis ran
  and there is no graph. Never present the failed form as an empty result.
- `provider_project_metadata_missing` (`ok: false`, `details.stage: "indexing"`, exit 5) lists the missing
  workspace-relative project files in `details.missing`. Impact Lens deliberately never generates, builds,
  or syncs these files. Tell the user which files are missing and that they must supply them; do not offer
  to create them.
- For bundled TypeScript/JavaScript startup failures, inspect `runtime.runner.source` and run
  `<plugin-root>/scripts/run-impact-lens doctor bundled-typescript --smoke` once. Use its package,
  entry, initialize, and capability checks before suggesting reinstall/update; do not ask the user
  for a provider command for a bundled language.
- Treat runner Node/npm/CLI resolution errors as installation failures, not provider failures. Do not
  silently fall through from a selected stale explicit/global artifact to another source.
- Preserve the user's authorization boundary. A CLI capability to edit notes does not authorize unrelated source or shared-note changes.
