// Checks that the plugin agent-instruction documents still say what the response policy requires them to
// say. Pure functions over document text (never file paths), same reason as response-policy-engine.mjs:
// the negative-direction proof this lane's work document requires — "delete a rule, watch the check fail"
// — needs to feed this module a mutated in-memory copy, not a file on disk.
//
// This is a narrower guarantee than "the docs are correct". It only proves the specific sentences and
// phrases the M1 response-policy story pins are still present, in the files that are supposed to carry
// them. It cannot tell whether surrounding prose still makes sense after an edit.

import { FORBIDDEN_PHRASES } from './response-policy-engine.mjs';

export const INDEX_STATES = Object.freeze(['unknown', 'working', 'ready']);

const CONCLUSION_LAST_MARKER = 'conclusion last';

function includesCaseInsensitive(haystack, needle) {
  return haystack.toLowerCase().includes(needle.toLowerCase());
}

/**
 * `docs` is `{ skillMd, cliContractMd, analyzeMd }` — raw text, not paths. Returns `[]` when every
 * invariant holds.
 */
export function checkDocInvariants(docs) {
  const violations = [];

  for (const phrase of FORBIDDEN_PHRASES) {
    if (!includesCaseInsensitive(docs.skillMd, phrase)) {
      violations.push({ code: 'doc_missing_forbidden_phrase', message: `SKILL.md no longer contains the forbidden phrase "${phrase}".` });
    }
    if (!includesCaseInsensitive(docs.cliContractMd, phrase)) {
      violations.push({ code: 'doc_missing_forbidden_phrase', message: `cli-contract.md no longer contains the forbidden phrase "${phrase}".` });
    }
  }

  for (const state of INDEX_STATES) {
    const marker = `\`${state}\``;
    if (!docs.skillMd.includes(marker)) {
      violations.push({ code: 'doc_missing_index_state', message: `SKILL.md no longer documents the indexing state "${state}" (looked for the code span \`${state}\`).` });
    }
    if (!docs.cliContractMd.includes(marker)) {
      violations.push({ code: 'doc_missing_index_state', message: `cli-contract.md no longer documents the indexing state "${state}" (looked for the code span \`${state}\`).` });
    }
  }

  if (!includesCaseInsensitive(docs.skillMd, CONCLUSION_LAST_MARKER)) {
    violations.push({ code: 'doc_missing_summary_order', message: 'SKILL.md no longer states that a summary puts the conclusion last.' });
  }
  if (!includesCaseInsensitive(docs.analyzeMd, CONCLUSION_LAST_MARKER)) {
    violations.push({ code: 'doc_missing_summary_order', message: 'analyze.md no longer states that a summary puts the conclusion last.' });
  }

  return violations;
}
