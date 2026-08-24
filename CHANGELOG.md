# Changelog

## 0.3.0

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
