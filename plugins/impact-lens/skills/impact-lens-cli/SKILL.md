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
  `provider-static` or `unknown` prevents claims of complete runtime impact.
- When a result has only the root node and no edges, inspect `no_incoming_callers` and `index_state_unknown` in
  `limitationDetails`. Zero incoming callers with unknown indexing is not proof that none exist.
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
- For bundled TypeScript/JavaScript startup failures, inspect `runtime.runner.source` and run
  `<plugin-root>/scripts/run-impact-lens doctor bundled-typescript --smoke` once. Use its package,
  entry, initialize, and capability checks before suggesting reinstall/update; do not ask the user
  for a provider command for a bundled language.
- Treat runner Node/npm/CLI resolution errors as installation failures, not provider failures. Do not
  silently fall through from a selected stale explicit/global artifact to another source.
- Preserve the user's authorization boundary. A CLI capability to edit notes does not authorize unrelated source or shared-note changes.
