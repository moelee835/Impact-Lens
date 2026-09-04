// Turns an (Impact Lens response, agent summary) pair into a list of policy violations.
//
// This is a bounded heuristic, not a semantic entailment checker. It operates per sentence with an
// explicit negation-marker list (see NEGATION_MARKERS) and a small set of hand-written phrase patterns.
// It catches the assertive phrasings the M1 response-policy story names — a summary that states a banned
// conclusion outright, or a real state (`working`, `partial`, `ok: false`) reported as something better
// than it is. It does NOT understand meaning: a summary can still mislead a reader through phrasing this
// engine has no pattern for, and a correct negation ("this does not mean X") always clears the sentence it
// is in even if the rest of the paragraph is misleading. What this module guarantees is narrower and still
// worth having: the policy in SKILL.md and cli-contract.md is executable and pinned, so weakening it (in
// the docs, or in what an agent's summary is allowed to say) is a test failure, not a silent regression.
//
// No file I/O and no process exit here on purpose (see scripts/test-response-policy.mjs, which is the only
// place that reads files or exits). A pure function over plain values is what lets the doc-invariant
// self-test in that runner feed this module mutated in-memory document text and assert the check itself
// can fail, which is the negative-direction proof the response-policy work document requires.
//
// SCOPE (read this before deciding a false positive/negative here is worth another round of precision
// work): evaluateSummary()'s only caller is scripts/test-response-policy.mjs, run as `npm run
// test:response-policy` in .github/workflows/unit-tests.yml. Nothing under cli/ or plugins/ imports this
// module (response-policy-doc-invariants.mjs imports only FORBIDDEN_PHRASES from it, not evaluateSummary).
// It is not shipped in the CLI or the plugin, never runs in a user's runtime, and never grades a real
// agent's live output - it is a dev-time regression harness over fixtures this repository wrote and the
// worked examples extracted from cli-contract.md. That scope is what should set the required precision:
// the real cost of a false positive here is blocking a future fixture/doc-example author (or worse,
// tempting them to reword a correct doc example to satisfy the checker), not a live miscue reaching a
// user. See INDEX_SCOPED_MAY_NOT_UNCERTAINTY's comment below for a concrete case history of this tradeoff.

/** The six phrases the response-policy story names. Kept identical to SKILL.md and cli-contract.md; the
 * doc-invariant checker in response-policy-doc-invariants.mjs asserts both files still contain them. */
export const FORBIDDEN_PHRASES = Object.freeze([
  'no impact',
  'safe to change',
  'unused',
  'fully analyzed',
  'complete analysis',
  'all callers',
]);

export const VIOLATION_CODES = Object.freeze([
  'forbidden_phrase',
  'unsupported_no_impact_conclusion',
  'missing_index_caveat',
  'stale_index_caveat',
  'partial_reported_as_complete',
  'missing_high_severity_disclosure',
  'conclusion_before_boundary',
  'failure_reported_as_empty',
  'augmented_edges_not_distinguished',
]);

// A sentence is treated as negating anything it contains once any of these markers appears in it,
// anywhere. That is deliberately coarse (R3 of the step-3 spec calls for exactly this): "this is not
// evidence the function is unused" negates "unused" in that sentence even though the marker is nowhere
// near the phrase. The cost is a small number of sentences that use "not" in an unrelated clause and get
// treated as negated anyway; the alternative (proximity-based negation) is a slippery slope toward parsing
// grammar, which this module explicitly does not do.
const NEGATION_MARKERS = [
  'not', 'cannot', "can't", "isn't", "doesn't", "wasn't", "aren't", "weren't", "won't",
  'no evidence', 'not proof', 'no proof', 'without evidence', 'never',
];

// Existential claims about the world ("nothing calls this", "no callers exist"), as opposed to a report of
// what one query returned ("no incoming callers were returned", "no callers were found"). The distinction
// matters: cli-contract.md's `unknown` worked example says "No incoming callers were returned" and that is
// correct, hedged reporting, not the unsupported conclusion this check exists to catch. Deliberately does
// not include a bare "no callers" pattern for that reason.
const NO_IMPACT_ASSERTION_PATTERNS = [
  /\bnothing (?:in (?:this|the) workspace )?calls\b/i,
  /\bno callers? exists?\b/i,
  /\bis not called\b/i,
  /\bisn't called\b/i,
  /\bnot called by\b/i,
  /\bno impact\b/i,
];

// Broader than NO_IMPACT_ASSERTION_PATTERNS on purpose: on a failed envelope there is no graph at all, so
// even the hedged "no incoming callers were returned" framing is wrong, not just an unsupported existential
// claim.
const EMPTY_RESULT_PATTERNS = [
  ...NO_IMPACT_ASSERTION_PATTERNS,
  /\bno callers? (?:were|was) (?:returned|found)\b/i,
  /\bempty result\b/i,
  /\bzero callers?\b/i,
  /\bno callers? found\b/i,
];

const COMPLETENESS_CLAIM_PATTERNS = [
  /\ball callers\b/i,
  /\bcomplete list\b/i,
  /\bexhaustive\b/i,
  /\bevery caller\b/i,
  /\bfully analyzed\b/i,
  /\bcomplete analysis\b/i,
];

const CONCLUSION_MARKERS = [
  /\bsafe to\b/i,
  /\bin conclusion\b/i,
  /\btherefore\b/i,
  /\bconclud/i,
  /\byou (?:can|may|could)\b/i,
  /\bit is (?:safe|fine|ok)\b/i,
  ...NO_IMPACT_ASSERTION_PATTERNS,
  ...COMPLETENESS_CLAIM_PATTERNS,
];

const BOUNDARY_MARKERS = [
  /static call hierarchy/i,
  /\bindex(?:ing)?\b/i,
  /\bscope\b/i,
  /\btraversal\b/i,
  /\bprovider\b/i,
  /\brequest\s*status\b/i,
  /\bpartial\b/i,
  /\bexhausted\b/i,
];

// The uncertainty vocabulary the CLI's own `index_state_unknown` message and this repository's docs use.
// Shared by missing_index_caveat (must be present under `unknown`) and stale_index_caveat (must be absent
// under `ready`) because they are the same question asked in opposite directions.
const INDEX_UNCERTAINTY_PATTERN = /(unknown|did not report|not proof|not evidence|unproven|no evidence|not confirmed|has not (?:been )?(?:proven|confirmed))/i;
const INDEX_WORD_PATTERN = /\bindex(?:ing)?\b/i;

// "may not cover/include/reflect/capture" is only a genuine index-completeness caveat when the index is
// its own grammatical subject ("the index may not cover every file"). Left in whole-summary
// INDEX_UNCERTAINTY_PATTERN (as it briefly was), it fired on any summary that happened to mention "index"
// ANYWHERE and separately, honestly disclosed an unrelated limitation using "may not" phrasing elsewhere -
// "the index is ready. This static analysis may not capture dynamic dispatch..." is not an index caveat at
// all, it is dynamic_calls_not_inferred in different words, but the two checks don't require the same
// sentence, only the same summary. Scoped to `[^.!?]*` (no numeric character bound - the same
// sentence-boundary idiom CALLER_EXISTENCE_UNCERTAINTY_PHRASE already uses in this file) so "index" and
// "may not X" must share a sentence, which is enough to separate all four false positives above (each puts
// the "index...ready" claim and the unrelated "may not" caveat in different sentences, see fixtures 16-19)
// from the genuine case (found via commander/reviewer review, task-m2-python-preset.md stage 6 addendum 4).
//
// KNOWN LIMITATION, DELIBERATELY NOT FIXED - read this before tightening this predicate further. This is a
// lexical-heuristic match, not parsing, so a genuine index caveat can still slip past it, or an unrelated
// one can still be swallowed, in ways a reviewer found while checking fix proposals (not yet real bugs, so
// no fixture locks these in - a passing fixture would enshrine the wrong behavior as correct):
//   1. Pronoun reference, no literal "index" in the caveat's own sentence: "The index is large. It may not
//      cover every file." - undetected, because INDEX_WORD_PATTERN requires the literal word "index"/
//      "indexing" somewhere in the same [^.!?]* span as "may not X", and "It" doesn't match that word.
//   2. (Considered, did not materialize here) a very long appositive/insertion clause between "index" and
//      "may not X" was suspected to escape a character-count window - moot for this implementation
//      specifically because it uses sentence scoping ([^.!?]*, no numeric bound) rather than a character
//      window, so an arbitrarily long insertion clause is still caught as long as no sentence boundary
//      falls between "index" and "may not X".
//   3. An unrelated "may not" caveat sharing a sentence with "index" via a conjunction, rather than two
//      separate sentences - reviewer's exact examples: "The index is ready, but reflection may not cover
//      every call site." / "...an index that is proven ready, though dynamic dispatch may not include..."
//      / "Within static call-hierarchy scope and a fully-built index, decorator-based routing may not
//      include every entry point." - false-flagged stale_index_caveat, same root cause as the four cases
//      fixtures 16-19 lock in (a same-sentence "index" and "may not X" that don't actually share a
//      subject), just with the two clauses joined by but/though/and instead of split into two sentences.
//      Same-sentence proximity was never sufficient to prove "index" is the grammatical subject of "may
//      not X"; it just happened to be necessary for fixtures 16-19's specific shape.
//      commander measured a conjunction-boundary fix (require no but/though/and/while/although/whereas
//      between "index" and "may not X") and it failed in both directions on the reviewer's own examples:
//      the third example above still slips past it, because its "and" sits BEFORE "index" ("...scope and a
//      fully-built index, decorator-based routing may not include...") rather than between "index" and
//      "may not X"; and the addendum-4 legitimate 124-character insertion clause ("The index, which was
//      built... and reported completion, may not cover every file...") gets newly blocked by it, because
//      its own "and" (inside the appositive, describing when indexing finished) now reads as a clause
//      boundary. One fix, one still-open false positive, one newly-broken legitimate case - not
//      implemented, per the same reasoning as gaps 1 and 2 above.
// Four rounds of this addendum each closed one axis of this same lexical/semantic tradeoff and opened
// another (narrow the null-caveat exclusion -> misses cross-sentence marker placement; widen it -> masks a
// genuine index caveat sharing vocabulary; widen INDEX_UNCERTAINTY_PATTERN whole-summary -> catches
// unrelated "may not" disclosures; scope it to the sentence -> still can't resolve a pronoun with no
// antecedent lookup, or a same-sentence conjunction that doesn't bind "index" to "may not X"). That pattern
// is not a sequence of bugs to keep chasing - it is the structural fact that a regex-based lexical match
// over free-text prose cannot, in general, attribute a claim to its true subject, confirmed a fifth time by
// actually building and measuring the next candidate fix rather than reasoning about it. See
// task-m2-python-preset.md stage 6 addendum 5 for the round-by-round history and why the lane stops here.
//
// One more reason this specific residual imprecision is acceptable where the other seven VIOLATION_CODES
// entries would not be: stale_index_caveat is the only one of the eight that catches UNDERclaiming (a
// summary being more cautious than the evidence requires) rather than OVERclaiming (a summary asserting
// more than the evidence supports). forbidden_phrase, unsupported_no_impact_conclusion,
// missing_index_caveat, partial_reported_as_complete, missing_high_severity_disclosure,
// conclusion_before_boundary and failure_reported_as_empty all exist to stop a false claim from reaching a
// reader. A stale_index_caveat false positive instead penalizes an author for being MORE careful than
// necessary - it never lets a false claim through. That asymmetry, not just this predicate's dev-time-only
// blast radius (see the file-top SCOPE comment), is why the remaining gaps above are left as documented
// limitations instead of a fifth implementation attempt.
//
// This predicate's actual blast radius, and why that scope is what sets how much precision it needs: the
// only caller of evaluateSummary() (which uses this predicate) is scripts/test-response-policy.mjs, a
// dev-time-only CI check (`npm run test:response-policy`, wired into .github/workflows/unit-tests.yml). It
// is never imported by anything under cli/ or plugins/, is not part of the shipped CLI or plugin runtime,
// and never sees a real user's or a real agent's live output - it only grades fixtures this repository
// wrote and the worked examples extracted from cli-contract.md. A false positive here blocks a future
// fixture/doc-example author and, worse, tempts them to reword a correct doc example to satisfy the
// checker instead of the other way around (exactly what reviewer's 4 examples would have caused) - that is
// the real cost this addendum's work closes. A missed case (the two gaps above) is a precision gap against
// hypothetical prose this corpus does not currently contain, not a live miscue reaching a user.
const INDEX_SCOPED_MAY_NOT_UNCERTAINTY = /\bindex(?:ing)?\b[^.!?]*\bmay not\s+(?:cover|include|reflect|capture)\b/i;

// Per-code natural-language stand-ins for a limitationDetails entry being "surfaced" in a summary. A
// fallback derived from the code itself (underscores to spaces) covers any future code this table has not
// been taught yet, so a new severity:error/warning reason does not silently pass unnoticed — it just gets
// checked against its literal words instead of a hand-tuned phrase.
// The vocabulary SKILL.md/cli-contract.md actually teach an agent to use for provider_null_incoming_calls
// (`null`, "did not commit to zero", "dependency injection", `Depends()`) - coverage.ts's own `action` text
// for this code says "such as dependency injection or a framework decorator" verbatim, so an agent that
// follows the CLI's own suggested wording must be recognized here too, not just an agent that says "null".
// Feeds only LIMITATION_SURFACE_PATTERNS.provider_null_incoming_calls below (is the limitation surfaced at
// all). It used to also anchor stale_index_caveat's exclusion of this code's own uncertainty phrase
// (widening it there once fixed a false positive but caused a worse one - see
// CALLER_EXISTENCE_UNCERTAINTY_PHRASE's comment, which excludes that phrase without needing any marker at
// all, task-m2-python-preset.md stage 6 addendum 3).
const PROVIDER_NULL_INCOMING_CALLS_MARKERS = [/\bnull\b/i, /\bdid not commit to zero\b/i, /\bdependency injection\b/i, /Depends\(\)/i];

// M2 clangd lane, stage 6 (task-m2-clangd-preset.md): compile_database_missing/_stale/_ambiguous
// (coverage.ts) are the C/C++ analogue of provider_null_incoming_calls - the risk they exist to catch is
// the same shape (an incomplete answer that looks complete), so they get the same treatment: real teaching
// vocabulary from cli-contract.md/SKILL.md's own wording, not just the underscored code name the generic
// fallback would produce. Kept as three separate entries, not one shared "compile database" pattern,
// because a summary correctly naming one state (say, "stale") must not be credited with surfacing a
// different one (say, "missing") it never mentioned - the same reasoning that keeps provider_not_ready's
// "still indexing"/"not ready" markers from overlapping with any other code's patterns above.
const COMPILE_DATABASE_MISSING_MARKERS = [
  /\bno compile[ _-]?database\b/i,
  /\bcompile[ _-]?database\b[^.!?]*\bmissing\b/i,
  /\bmissing\b[^.!?]*\bcompile[ _-]?database\b/i,
  /\bno compile_commands\.json\b/i,
  /\bcompile_commands\.json\b[^.!?]*\b(?:missing|not found|absent)\b/i,
];
const COMPILE_DATABASE_STALE_MARKERS = [
  /\bstale compile[ _-]?database\b/i,
  /\bcompile[ _-]?database\b[^.!?]*\bstale\b/i,
  /\bstale\b[^.!?]*\bcompile[ _-]?database\b/i,
  /\bout-?of-?date compile[ _-]?database\b/i,
];
const COMPILE_DATABASE_AMBIGUOUS_MARKERS = [
  /\bambiguous compile[ _-]?database\b/i,
  /\bcompile[ _-]?database\b[^.!?]*\bambiguous\b/i,
  /\bmultiple compile_commands\.json\b/i,
  /\bmultiple compile[ _-]?database\b/i,
];

// M4 stage 3, plugin-doc prerequisite (docs/work/task-m4-stage2-fastapi-adapter.md's "필수 선행" item):
// `data.augmentedEdges` (a candidate caller, e.g. a FastAPI Depends() inference) and `data.edges` (a
// confirmed caller, from the Call Hierarchy provider itself) must never be described with the same bare
// word - calling both "callers" in one summary is exactly the "inference read as confirmed" failure this
// whole milestone exists to prevent, just relocated from a response field to an agent's prose. This is
// checked by REQUIRED PRESENCE of the specific taught phrase (SKILL.md/cli-contract.md teach "candidate
// caller" as the only acceptable way to refer to an augmentedEdges-sourced result), not by a generic
// uncertainty-word list - deliberately, after measuring the alternative first. A generic list ("not
// confirmed", "unproven", etc., mirroring INDEX_UNCERTAINTY_PATTERN's approach) was tried against a
// correct summary that legitimately used "not confirmed" for the candidate-vs-confirmed distinction while
// separately, correctly stating "the provider index is ready" - stale_index_caveat fired on it anyway,
// because that check scans the WHOLE summary for "index" and any uncertainty word regardless of
// which claim each belongs to (see its own KNOWN LIMITATION comment above, gap 3). A specific required
// phrase does not carry that risk because it is not shared vocabulary with any existing pattern in this
// file. KNOWN, ACCEPTED GAP (same acceptance reasoning as stale_index_caveat's own documented gaps, not
// chased further for the same reason): this is presence-only, not sentence-order-aware, so a summary that
// states an undistinguished "two callers: X and Y" list FIRST and only adds "Y is a candidate caller"
// afterward still passes - measured directly (a fixture of exactly this shape produces zero violations
// both before and after this check existed). Catches the complete-omission case, which is the actual
// current risk (the docs taught no vocabulary at all before this), not the partial-hedge case.
const CANDIDATE_CALLER_PATTERN = /\bcandidate callers?\b/i;

const LIMITATION_SURFACE_PATTERNS = {
  no_incoming_callers: [/\bno (?:incoming )?callers?\b/i],
  index_state_unknown: [INDEX_UNCERTAINTY_PATTERN], // paired with INDEX_WORD_PATTERN, see surfacesLimitation
  depth_limit_reached: [/\bdepth limit\b/i, /\bdepth of \d+\b/i],
  node_limit_reached: [/\bnode (?:budget|limit)\b/i],
  traversal_timeout: [/\btimeout\b/i, /\btimed out\b/i],
  traversal_cancelled: [/\bcancell?ed\b/i],
  provider_query_failed: [/\bquery failed\b/i, /\bprovider\b.*\bfail/i],
  provider_not_ready: [/\bstill indexing\b/i, /\bnot ready\b/i, /\bprovider_not_ready\b/i],
  inferred_edges_included: [/\binferred edges?\b/i],
  observed_edges_included: [/\bobserved edges?\b/i, /\bruntime observation\b/i],
  provider_null_incoming_calls: PROVIDER_NULL_INCOMING_CALLS_MARKERS,
  compile_database_missing: COMPILE_DATABASE_MISSING_MARKERS,
  compile_database_stale: COMPILE_DATABASE_STALE_MARKERS,
  compile_database_ambiguous: COMPILE_DATABASE_AMBIGUOUS_MARKERS,
};

function escapeRegExp(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Heuristic sentence split on `.`/`!`/`?` followed by whitespace. Good enough for prose summaries; not a
 * real sentence boundary detector (it will not split on markdown list items without terminal punctuation,
 * for instance). Exported so the fixture runner and doc-invariant tests can share it if useful. */
export function splitSentences(text) {
  return text
    .split(/(?<=[.!?])\s+/)
    .map(sentence => sentence.trim())
    .filter(sentence => sentence.length > 0);
}

function isNegated(sentenceLower) {
  return NEGATION_MARKERS.some(marker => new RegExp(`\\b${escapeRegExp(marker)}\\b`, 'i').test(sentenceLower));
}

function matchesAny(patterns, text) {
  return patterns.some(pattern => pattern.test(text));
}

// `provider_null_incoming_calls`'s own canonical wording ("this is not evidence that no caller exists")
// satisfies INDEX_UNCERTAINTY_PATTERN on its own ("not evidence"), so a summary that mentions "index"
// while correctly confirming `ready` and separately surfaces that warning's "not evidence" phrasing was
// tripping `stale_index_caveat` on a fully compliant summary (found via direct measurement,
// task-m2-python-preset.md stage 6) - the two claims are about different things (index completeness vs.
// one query's answer) and must not be conflated just because both words appear in the same summary.
//
// A claim that an answer "is not evidence/proof that no caller(s) exist(s)" is, by its own grammar, a
// statement about caller existence - not a statement about index completeness - regardless of which
// provider_null_incoming_calls marker word (if any) is nearby, and regardless of which sentence it is
// written in relative to that marker. Excluding by marker proximity (an earlier attempt, see git history)
// either missed the marker-in-a-different-sentence case (too narrow: SKILL.md's/cli-contract.md's own
// "Fixed summary shape" puts the marker and this hedge in separate sentences) or, once the marker list
// widened to match LIMITATION_SURFACE_PATTERNS, started swallowing an unrelated GENUINE index-uncertainty
// caveat that happened to share this exact "not evidence ... no caller exists" wording with
// `index_state_unknown`'s own canonical CLI message (see fixture 01's limitationDetails, which uses the
// identical construction for a completely different limitation) - a masking false positive under
// indexingStatus: unknown that broke both missing_index_caveat and missing_high_severity_disclosure at
// once, since both route through this same function (surfacesLimitation('index_state_unknown', ...) below
// calls it directly - found via commander/reviewer review, task-m2-python-preset.md stage 6 addendum 3).
// Scoped to the "no caller(s) exist(s)" construction specifically - not bare "no caller(s)", which is also
// how the CLI legitimately reports "no callers were returned/found", a different claim - so this exclusion
// cannot be satisfied by anything except this one clause, and never needs a marker word to fire.
const CALLER_EXISTENCE_UNCERTAINTY_PHRASE =
  /\b(?:not evidence|not proof)\b[^.!?]*\bno\s+callers?\s+exists?\b|\bno\s+callers?\s+exists?\b[^.!?]*\b(?:not evidence|not proof)\b/i;

function mentionsIndexUncertainty(text) {
  const withoutCallerExistencePhrase = text.replace(CALLER_EXISTENCE_UNCERTAINTY_PHRASE, ' ');
  if (INDEX_WORD_PATTERN.test(withoutCallerExistencePhrase) && INDEX_UNCERTAINTY_PATTERN.test(withoutCallerExistencePhrase)) {
    return true;
  }
  return INDEX_SCOPED_MAY_NOT_UNCERTAINTY.test(withoutCallerExistencePhrase);
}

function surfacesLimitation(code, summaryText) {
  if (code === 'index_state_unknown') {
    return mentionsIndexUncertainty(summaryText);
  }
  const patterns = LIMITATION_SURFACE_PATTERNS[code]
    ?? [new RegExp(`\\b${escapeRegExp(code.replace(/_/g, ' '))}\\b`, 'i')];
  return matchesAny(patterns, summaryText);
}

function completionOf(response) {
  return response?.data?.completion;
}

function isEmptyResult(response) {
  const nodes = response?.data?.nodes;
  return Array.isArray(nodes) && nodes.length <= 1;
}

function highSeverityLimitations(response) {
  const details = response?.data?.limitationDetails;
  return Array.isArray(details) ? details.filter(detail => detail.severity === 'error' || detail.severity === 'warning') : [];
}

/**
 * The one exported check. Returns `[]` for a fully compliant (response, summary) pair.
 *
 * `response` is a parsed Impact Lens `impact.analyze` envelope (`ok: true` or `ok: false`); `summary` is
 * the agent's plain-text report. Neither is mutated.
 */
export function evaluateSummary(response, summary) {
  const violations = [];
  const sentences = splitSentences(summary);
  const summaryLower = summary.toLowerCase();

  // forbidden_phrase: applies regardless of ok/failed, and regardless of the other checks below, because a
  // banned phrase is a violation on its own terms.
  for (const phrase of FORBIDDEN_PHRASES) {
    const phraseRegex = new RegExp(escapeRegExp(phrase), 'i');
    const asserted = sentences.some(sentence => phraseRegex.test(sentence) && !isNegated(sentence.toLowerCase()));
    if (asserted) {
      violations.push({ code: 'forbidden_phrase', message: `Summary asserts the banned phrase "${phrase}" without negating it in the same sentence.` });
    }
  }

  if (response?.ok === false) {
    const failureAsserted = sentences.some(sentence => matchesAny(EMPTY_RESULT_PATTERNS, sentence) && !isNegated(sentence.toLowerCase()));
    if (failureAsserted) {
      violations.push({ code: 'failure_reported_as_empty', message: 'Summary reports an empty result or "no callers" for a failed (ok: false) envelope, which has no graph at all.' });
    }
    return violations;
  }

  const completion = completionOf(response);
  const indexingStatus = completion?.indexingStatus;
  const requestStatus = completion?.requestStatus;
  const empty = isEmptyResult(response);

  // `provider_null_incoming_calls` (task-m2-python-preset.md stage 3) is a per-query "did not commit to
  // zero" signal, independent of index completeness - coverage.ts and cli-contract.md are explicit that it
  // "can appear together with `indexingStatus: ready`" (proving the index is built says nothing about what
  // this one query returned). Without checking for it here, a `ready` + `succeeded` response with this code
  // present let a "nothing calls this" conclusion through unflagged, because the pre-existing condition only
  // ever looked at indexingStatus/requestStatus - exactly the misreading this code exists to prevent (found
  // via direct measurement against the real engine, not assumed; see stage 6 of the same document).
  const nullIncomingCallsPresent = highSeverityLimitations(response).some(detail => detail.code === 'provider_null_incoming_calls');
  const noImpactAsserted = sentences.some(sentence => matchesAny(NO_IMPACT_ASSERTION_PATTERNS, sentence) && !isNegated(sentence.toLowerCase()));
  if (noImpactAsserted && (indexingStatus !== 'ready' || requestStatus === 'partial' || nullIncomingCallsPresent)) {
    violations.push({ code: 'unsupported_no_impact_conclusion', message: `Summary asserts nothing calls the symbol, but indexingStatus is "${indexingStatus}" and requestStatus is "${requestStatus}"${nullIncomingCallsPresent ? ' and the provider answered this query with null (provider_null_incoming_calls)' : ''}, which does not support that conclusion.` });
  }

  if (indexingStatus === 'unknown' && empty && !mentionsIndexUncertainty(summaryLower)) {
    violations.push({ code: 'missing_index_caveat', message: 'indexingStatus is "unknown" on an empty result, but the summary never mentions that the index state is unproven.' });
  }

  if (indexingStatus === 'ready' && mentionsIndexUncertainty(summaryLower)) {
    violations.push({ code: 'stale_index_caveat', message: 'indexingStatus is "ready" (index proven built), but the summary still asserts the index state is unknown or unproven.' });
  }

  if (requestStatus === 'partial') {
    const completenessAsserted = sentences.some(sentence => matchesAny(COMPLETENESS_CLAIM_PATTERNS, sentence) && !isNegated(sentence.toLowerCase()));
    if (completenessAsserted) {
      violations.push({ code: 'partial_reported_as_complete', message: 'requestStatus is "partial", but the summary claims a complete or exhaustive caller list.' });
    }
  }

  const unsurfaced = highSeverityLimitations(response).filter(detail => !surfacesLimitation(detail.code, summaryLower));
  if (unsurfaced.length > 0) {
    violations.push({
      code: 'missing_high_severity_disclosure',
      message: `Summary never surfaces ${unsurfaced.length === 1 ? 'this' : 'these'} ${unsurfaced.map(detail => `${detail.code} (${detail.severity})`).join(', ')} limitationDetails entr${unsurfaced.length === 1 ? 'y' : 'ies'}.`,
    });
  }

  // See CANDIDATE_CALLER_PATTERN's comment above for why this is presence-only and what it deliberately
  // does not catch. Gated strictly on a non-empty `augmentedEdges` array - a summary describing a response
  // with none has nothing to distinguish.
  const augmentedEdges = response?.data?.augmentedEdges;
  if (Array.isArray(augmentedEdges) && augmentedEdges.length > 0 && !CANDIDATE_CALLER_PATTERN.test(summary)) {
    violations.push({
      code: 'augmented_edges_not_distinguished',
      message: 'data.augmentedEdges is non-empty, but the summary never uses the required "candidate caller" phrase to distinguish it from a confirmed caller in data.edges.',
    });
  }

  if (sentences.length > 0) {
    const first = sentences[0];
    const firstLower = first.toLowerCase();
    const firstIsConclusion = matchesAny(CONCLUSION_MARKERS, first) && !isNegated(firstLower);
    const firstIsBoundary = matchesAny(BOUNDARY_MARKERS, first);
    if (firstIsConclusion && !firstIsBoundary) {
      violations.push({ code: 'conclusion_before_boundary', message: 'The first sentence states a conclusion before establishing the evidence boundary (scope, indexing state, traversal completeness).' });
    }
  }

  return violations;
}
