# Changelog

## Unreleased

## 0.9.0

- **Known limitation**: semantic augmentation — the whole headline capability of this release — is
  **off by default in both hosts and is not recommended to be turned on by default yet**
  (`impactLens.augmentationEnabled`, and the CLI's `--augmentation`, both default to `false`). Its
  measured recall against real projects is roughly 57%, it carries seven named residuals, and **no
  actual user has yet done real work with it**. That validation is a separate, deliberately deferred
  step: `docs/development-management/user-tests/m4-user-test-spec.md` defines it, and writing a spec is
  not running it.
- **Known limitation**: in Go and C/C++, an entry reported as a caller **may be a plain reference rather
  than a call**. `gopls` and `clangd` both report a bare mention of a function — no invocation anywhere —
  as `relation: direct`, indistinguishable in the response from a real call site; `bundled-typescript`
  and `bundled-pyright` do not. The relationship itself is real (change the signature and that code
  breaks, so impact analysis should show it), but "called from 3 places" can mean "called from 2,
  referenced from 1". Measured directly against real `gopls v0.19.1` and Apple `clangd 17.0.0` by two
  independent sessions with separate fixtures. No filtering or relabeling is attempted in this release —
  a reference cannot be told from a call without information the Call Hierarchy does not carry, and
  relabeling `data.edges` is a contract change this release deliberately does not make.
- Impact analysis can now surface **candidate callers that a static Call Hierarchy cannot see on its
  own** — a FastAPI route handler reached only through `Depends()`, a router mounted with
  `include_router`, or a function handed to a spec-designated callback position such as
  `addEventListener`/`setTimeout`/`forEach`. They arrive in a **new top-level field,
  `data.augmentedEdges`**, and in the VS Code graph as visually distinct candidate edges.
  **`data.edges` is byte-for-byte unaffected by this release** — not one existing value changed
  meaning, which is why the new relationships needed a field of their own rather than a new optional
  property on an existing one.
- A candidate carries what it actually claims, in two independent axes: `evidenceSource`
  (`static-inference`) and `resolution` (`single`/`multiple`). **The word `confirmed` is deliberately
  absent** from that vocabulary — an augmented edge is by definition something the provider did not
  confirm. And the callback adapter's claim is precisely "a function was passed into a position the
  framework's own spec designates as a callback", never "it is called": `[].forEach(cb)` calls zero
  times, a `setTimeout` can be cleared, an event may never fire.
- **Relationships the analysis recognized but could not narrow to a specific caller are now reported
  instead of silently dropped** (`augmentation_inference_unresolved`, severity `warning`). Previously
  they vanished with no trace and a shorter result read as "this is the whole impact". The message says
  both halves that matter: the static call graph is unaffected, **and** the caller list may be
  incomplete at those points, which can understate the real impact radius. One entry per analysis with
  per-category counts, never one per occurrence — a single callback-registration site in real code was
  measured producing three rejections on its own.
- **Turning augmentation off is a complete rollback**, and an adapter failure can no longer take the
  static graph down with it. Every adapter runs inside its own guard, and the orchestration around them
  inside another, reported as two separate codes (`augmentation_adapter_failed` for an adapter,
  `augmentation_internal_error` for our own bug) so that our defect never reads as a framework's
  limitation.
- Related-test discovery now **tells you why a file was classified as a test**, and lets you correct it.
  Each test node carries `testRule` (which rule matched), and a project can add its own patterns in
  `.impact-lens/test-patterns.json` (plus `.impact-lens/test-patterns.local.json` for personal ones,
  the same shared/local pair notes already use). Excludes always win over includes and there is no
  un-exclude, reproducing Jest's `testPathIgnorePatterns` model. **Both hosts read the same workspace
  file** rather than each having its own source, and an unusable pattern is rejected with an error that
  names what *is* supported (`test_pattern_config_invalid`, exit code 8) instead of being silently
  ignored — including patterns that are syntactically valid but can never match, such as a leading or
  trailing `/`.
- Fixed a defect that misclassified **every file as a test** when the workspace path itself contained a
  segment like `test` — measured at 468 of 468 rows under a path such as `/Users/test/…`. The two hosts
  had drifted into two different classifiers; they now share one, with stable rule ids and each rule
  citing the framework whose default discovery it reproduces.
- Fixed a FastAPI defect that made most multi-route files return wrong dependency relationships: the
  scanner searched *below* a `Depends()` reference for the enclosing function, while the decorator that
  names the route sits *above* it. Any file with more than one route — an extremely common shape — was
  affected. Found via `tiangolo/full-stack-fastapi-template`: one query returned 2 real callers plus 2
  false positives, missing 4 of its 6 actual callers entirely; after the fix, the same query returns all
  6, with zero false positives. Re-measured separately against `Netflix/dispatch`'s 8-query census (used
  throughout this release's other FastAPI numbers): 6 of those 8 queries returned a false positive before
  the fix, and none do after, with no regressions on the 2 queries that were already correct.
- Fixed six shapes of false route-mount attribution, where an unrelated variable that merely shared a
  router's name (a function parameter, a loop variable, an import, a dict or attribute value, a factory
  return, a non-`APIRouter` typed binding) was enough to make the analysis assert an entrypoint
  reachability it had not established.
- Fixed candidate-caller mis-attribution in the callback adapter for a callback registered inside a
  method written in object-literal or class shorthand form: found via this repo's own real code, where a
  shim's `prepare` method was the actual caller but the adapter reported the unrelated outer factory
  that merely returns it. A related, still-open channel — a callback wrapped in an inline arrow function
  (`items.forEach((x) => setTimeout(handler, 0))`) — was measured against this repo's own 31 real call
  sites and found not to currently mis-attribute, but only because two separate recognition gaps happen
  to stack; it is left as a named, unfixed residual rather than silently closed by this change.
- Test nodes in the graph no longer borrow VS Code's **passing-test** color. Impact Lens never runs
  tests, and the data model has no way to express a passed state at all — the palette was asserting in
  color exactly what the model deliberately refuses to assert.
- `fastapi-static-v1`'s file budget rose from 200 to 1,500 files, derived from the latency budget rather
  than picked: at 200, a real 717-file open-source FastAPI project returned nothing at all for 7 of 8
  queries. The budget is now per adapter, so a number derived from one adapter's cost no longer silently
  applies to another that walks a different path.
- Corrected a published Go limitation that measurement showed was wrong: a reflective call written as
  `reflect.ValueOf(Target).Call(...)` **is** found — but not because `gopls` resolves reflection. It is
  found because `gopls` reports the identifier reference itself (see the second known limitation above).
  True name-string reflection (`MethodByName("Target")`, with no static reference anywhere) is still
  invisible, as documented. The old wording asserted the absence unconditionally and would have kept
  reading as true forever.
- Every language whose provider ships in the catalog — TypeScript/JavaScript, Python, Go, C — now has a
  **repeating fixture that re-measures its documented dynamic-dispatch limitation against a real
  language server in CI**, instead of a one-time manual probe recorded once in prose. This matters
  because the one such claim that had ever been converted to a repeating fixture turned out to be false
  the moment it was: an unqualified "never" that three operating systems contradicted on the fixture's
  first real run.

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
  policy, a real cross-file compile-database round trip) on darwin/arm64 by hand at its pinned minimum
  version (17.0.0), and separately on Linux/macOS/Windows CI on every push — but not at that same
  version: CI installs newer clangd (23.1.1 on Linux, 23.1.0 on macOS, 22.1.7 on Windows, since
  Chocolatey does not distribute a 23.x package), never 17.0.0 itself. Unlike `gopls`, `clangd` declares
  no `readiness` profile, so `indexingStatus` is always `unknown` for C/C++ (the same reason
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
