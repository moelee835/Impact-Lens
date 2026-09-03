# Changelog

## Unreleased

## 0.8.0

- **Known limitation**: Python (`bundled-pyright`), Go (`gopls`), and C/C++ (`clangd`) are new in this
  release, but none of the three has been validated by an actual user doing real work yet — that
  validation is a separate, deliberately deferred step. All three ship as `experimental`; treat their
  results with the same scrutiny you would a preset with no track record, not as "verified."
- A Go developer with `gopls` installed and discoverable on `PATH` now gets function-impact analysis
  with no provider configuration at all — `gopls` is a second `verified-external` catalog preset,
  verified end to end (Call Hierarchy, version policy, readiness) on darwin/arm64 by hand and, for its
  pinned minimum version, on Linux/macOS/Windows CI on every push.
- `coverage.indexing.status` (and `completion.indexingStatus`) can now report `working`/`ready`, not only
  `unknown` — `gopls` is the first shipped preset to declare a `readiness` profile, so a Go analysis
  distinguishes "still indexing" and "index confirmed ready" instead of always reading as "no claim
  made."
- A Python developer now gets function-impact analysis with no provider configuration and nothing to
  install — `bundled-pyright` ships `pyright` inside the CLI itself (`bundled` tier, like
  `bundled-typescript`), unlike `gopls`'s `verified-external` tier where the user still installs the
  server. Verified end to end (Call Hierarchy, doctor, real `.py` auto-discovery) by hand on darwin/arm64
  and covered unconditionally by the existing cross-OS `cli:test` jobs (no separate CI job needed, since
  a pinned `dependencies` entry has no install step to gate, unlike `gopls`).
- `limitationDetails` can now carry `provider_null_incoming_calls`, a response-contract addition that
  applies to every provider, not only Python: LSP's `callHierarchy/incomingCalls` lets a server answer
  `null` instead of an explicit `[]`, and Impact Lens used to collapse both into the same empty result.
  `null` no longer reads as a proven zero — it can appear even under `indexingStatus: ready`, since it
  reports on this one query, not on index completeness. The motivating case is a symbol invoked only
  through a mechanism static Call Hierarchy cannot see, such as FastAPI's `Depends()`.
- A C/C++ developer with `clangd` installed and discoverable on `PATH` now gets function-impact analysis
  with no provider configuration at all — `clangd` is a third `verified-external` catalog preset,
  covering `.c`/`.cc`/`.cpp`/`.cxx`/`.h`/`.hh`/`.hpp`/`.hxx`, verified end to end (Call Hierarchy, version
  policy, a real cross-file compile-database round trip) on darwin/arm64 by hand and, for its pinned
  minimum version, on Linux/macOS/Windows CI on every push. Unlike `gopls`, `clangd` declares no
  `readiness` profile, so `indexingStatus` is always `unknown` for C/C++ (the same reason
  `bundled-pyright` reports `unknown` too).
- `limitationDetails` can now carry `compile_database_missing`, `compile_database_stale`, or
  `compile_database_ambiguous` (C/C++ only, severity `warning`): without a valid `compile_commands.json`,
  `clangd` falls back to a generic command with no cross-file index, so it can resolve a call within an
  already-open file but cannot discover one in a file nothing has opened. Unlike
  `provider_null_incoming_calls`, these codes are unconditional on caller count, since a stale or
  ambiguous database can misdirect a non-empty result too.
- `.h` files are now recognized as language-ambiguous (a header alone cannot say C vs. C++) instead of
  being guessed as one or the other: they get the internal language id `c-cpp-header`, and
  `provider.languageMatch` reports `'unknown'` for them rather than `true`/`false`. `clangd` still claims
  and analyzes `.h` files once selected.
- Corrected an inaccurate `clangd` limitation claim before it ever reached a release: a call reached only
  through virtual dispatch on a base-class pointer always shows up under the base method's Call Hierarchy
  result (true on every clangd version measured), but whether it *also* shows up under a derived
  override's result depends on the clangd version — absent on Apple clangd 17.0.0, present on upstream
  LLVM clangd 22.1.7/23.1.0/23.1.1 (versions 18–21 are untested and not guessed at either way).
- Corrected an inaccurate `clangd` limitation claim about macros before it ever reached a release: a
  simple macro that expands directly to a function call is resolved correctly, not treated as a blind
  spot — only more complex macro patterns (token-pasting, X-macros) remain untested.
- A provider's self-reported version string can no longer dominate a response: `gopls`'s real
  `serverInfo.version` measured 3,062 bytes and made up over half of an 11,219-byte response an agent
  pays to read on every analysis. It (and any provider's, not only `gopls`'s) is now bounded to 256 bytes
  with a visible truncation marker when cut, the same way this CLI already bounds a spawned process's raw
  output.

## 0.7.0

- Pick a provider by name with `doctor <preset>` and see partial failures instead of an all-or-nothing
  pass: missing executable, unsupported version, language mismatch, and missing Call Hierarchy
  capability are now each reported independently, without stopping at the first one.
- Start with no provider configuration at all and get a safe, deterministic choice — custom command,
  then an explicitly named preset, then a trusted project setting, then verified auto-discovery — that
  never silently falls back to another language's provider.
- A Language Server that requires `workspace/configuration`, dynamic Call Hierarchy registration, or
  cancellation of an abandoned request now initializes and behaves correctly, instead of appearing as a
  timeout or an unexplained `provider_initialize_failed`.
- A Language Server that is still building its index is now told apart from one that genuinely found no
  callers, instead of both reading as the same empty result.
- The Extension tells an empty graph (no caller found, or no provider answered at all — VS Code's public
  API cannot distinguish the two causes, so they share one message) apart from a graph that exists but
  carries a completeness caveat, instead of rendering both as the same blank tree.
- An agent reading `complete: true` can no longer conclude "no impact" or "safe to change" on its own —
  the response policy eval now fails any response that does.
- Configure a provider per request (initialization options, settings) instead of only through a fixed
  command line, with values that look like secrets automatically redacted from logs and failure output.
- The response gains `data.completion` and structured `limitationDetails` as the source of truth for
  result state; `complete`, `truncated`, and `limitations` remain exactly as before, now defined as
  compatibility projections of the new fields — nothing existing was removed or renamed.
- README, INSTALL, and the CLI's own README now document the provider selection order, `doctor <preset>`,
  `.impact-lens/provider.json`, and the completeness vocabulary — previously only the agent-facing plugin
  contract had this.
- **Known limitation**: the shipped provider catalog still has exactly one entry, `bundled-typescript` —
  every other language still needs a custom provider configured by hand.
- Match the current Codex plugin manifest schema and ship the plugin's own icons, so the listing shows
  the intended name, colour, and artwork.

## 0.6.3

- Identify environments that start child processes but never deliver their stdio, which restricted
  agent sandboxes and containers do, and report `provider_ipc_unavailable` instead of an unexplained
  Language Server failure.

## 0.6.2

- Report how long a Language Server lived, how much protocol it spoke, and how many requests were sent
  when it exits without any diagnostics, and add `IMPACT_LENS_PROVIDER_LOG_LEVEL` to make a silent
  server explain itself.
- Separate a read-only filesystem from a permission problem when the plugin runner release fallback
  cannot write the npm cache, which is what agent sandboxes and containers produce.
- Keep the Language Server's own `window/logMessage` diagnostics in provider failures. The bundled
  TypeScript server never writes to stderr, so its explanation was being discarded.

## 0.6.1

- Report a failed plugin runner release fallback as one structured JSON error that separates network,
  npm permission, missing release, and disk-space causes instead of raw npm output.
- Keep the started CLI's own error envelope and exit status unchanged, and add
  `IMPACT_LENS_RUNNER_NPM_OUTPUT=passthrough` for reading the original npm output.
- Stop sending a parent process id to the Language Server, which made it exit without any diagnostics
  in sandboxed and containerised environments where probing the parent process is not permitted.

## 0.6.0

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
- Pin the plugin runner release fallback to the v0.6.0 CLI package so installed plugins reach the runtime and doctor contract without an override.
- Exclude the CI workflow, the release E2E script, and host-local plugin settings from VSIX packages.

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
