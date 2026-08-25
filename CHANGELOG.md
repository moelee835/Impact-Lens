# Changelog

## Unreleased

- Add structured provider identity, language selection, lifecycle, and traversal/semantic/indexing
  coverage metadata while preserving the schema v1 compatibility fields.
- Prevent the bundled TypeScript provider from running for other languages and distinguish provider
  discovery, language mismatch, launch, initialize, capability, and query failures.
- Preserve redacted Language Server exit diagnostics after stderr closes and expose static coverage
  in the Extension graph, explorer, and status tooltips.
- Add runner resolution provenance, common Node startup checks, bundled TypeScript provider doctor,
  and clean-install Codex/Claude Plugin E2E across the release OS matrix.
- Add a repository-backed Claude Code plugin that shares the existing Impact Lens skill and CLI runner with the Codex plugin.
- Add `/impact-lens:analyze` and `/impact-lens:notes` slash commands that follow the preview-then-apply note contract.
- Add Claude Code marketplace metadata and installation, update, and removal instructions.
- Exclude the Claude Code marketplace directory from VSIX packages.

## 0.5.0

- Add a repository-backed Codex plugin that teaches Codex to analyze incoming-call impact and manage function notes through the Agent CLI.
- Add a safe CLI runner that resolves a local build, a global installation, or the pinned release package without shell-evaluating user input.
- Preserve preview, explicit apply, and conflict-token safeguards for Codex note mutations.
- Add repository marketplace metadata and installation instructions for the Codex plugin.
- Redesign the README as a product landing page with a new Impact Lens graph-and-lens hero.
- Exclude Codex plugin and marketplace files from VSIX packages while retaining the README marketing asset.

## 0.4.0

- Add an isolated Agent CLI with compact, versioned JSON responses and stable error exit codes.
- Analyze TypeScript and JavaScript incoming calls through an independent Language Server process.
- Return Direct, Transitive, and Test nodes, call sites, diagnostics, traversal limits, source fragments, notes, capabilities, and limitations.
- Add Shared, source-comment, and CLI-local note get/list/set/delete operations.
- Protect note mutations with preview-by-default behavior, explicit apply, conflict tokens, atomic writes, and symbol identity checks.
- Keep VS Code Personal notes and the existing Extension runtime path unchanged, and exclude CLI files and dependencies from VSIX packages.

## 0.3.3

- Show Direct, Transitive, and Test relation markers, labels, hop counts, and visible category counts in the graph.
- Recognize common cross-language test directory and filename conventions.
- Size graph layouts from actual visible nodes instead of unused requested-depth columns.
- Fit and center the graph on first open and explicit root changes while preserving same-root live-update viewports.

## 0.3.2

- Exclude repository development guides, work logs, and agent instructions from the VSIX artifact.

## 0.3.1

- Anchor function CodeLens actions to the declaration name even when a language provider returns a body selection.
- Add declaration-location and cross-file call-chain regression coverage.

## 0.3.0

- Add the new Impact Lens package and Marketplace icon.
- Explore incoming Call Hierarchy relationships across files with collision-safe symbol identities.
- Raise the default analysis depth to 5 and support values up to 20.
- Report requested depth, reached depth, and separate depth/node truncation reasons.
- Select and highlight graph nodes with a single click; open code with double-click or Enter.
- Keep the current graph root while opening code and provide explicit root switching with history.
- Add independent visible-depth filtering, zoom controls, fit/reset, and drag panning.
- Preserve graph selection, viewport, and root-specific review state across live updates.
- Document Python/FastAPI Call Hierarchy support and framework-driven relationship limits.

## 0.2.0

- Detect unsaved source edits and invalidate stale impact results immediately.
- Reanalyze the active function after a configurable debounce period.
- Discard analysis results produced for an older document version.
- Compare impact snapshots to show newly added and removed callers and edges.
- Attach VS Code error and warning diagnostics to affected function nodes.
- Mark related test symbols as requiring verification after code changes.
- Add live analysis states, manual review markers, and a clear-session action.
- Preserve Personal, Shared, and source-comment function notes in live graphs.

## 0.1.2

- Add Personal notes stored in VS Code workspace storage.
- Add Shared notes stored in `.impact-lens/notes.json`.
- Preserve `@impact-note` source comments as a compatible fallback.

## 0.1.1

- Fix source-comment note lookup when Call Hierarchy ranges include leading comments.
