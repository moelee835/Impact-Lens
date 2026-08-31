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

// Per-code natural-language stand-ins for a limitationDetails entry being "surfaced" in a summary. A
// fallback derived from the code itself (underscores to spaces) covers any future code this table has not
// been taught yet, so a new severity:error/warning reason does not silently pass unnoticed — it just gets
// checked against its literal words instead of a hand-tuned phrase.
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

function mentionsIndexUncertainty(text) {
  return INDEX_WORD_PATTERN.test(text) && INDEX_UNCERTAINTY_PATTERN.test(text);
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

  const noImpactAsserted = sentences.some(sentence => matchesAny(NO_IMPACT_ASSERTION_PATTERNS, sentence) && !isNegated(sentence.toLowerCase()));
  if (noImpactAsserted && (indexingStatus !== 'ready' || requestStatus === 'partial')) {
    violations.push({ code: 'unsupported_no_impact_conclusion', message: `Summary asserts nothing calls the symbol, but indexingStatus is "${indexingStatus}" and requestStatus is "${requestStatus}", which does not support that conclusion.` });
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
