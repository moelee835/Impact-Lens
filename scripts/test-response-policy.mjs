// Runs the M1 response-policy eval: proves the policy in SKILL.md / cli-contract.md / analyze.md is an
// executable, pinned check rather than prose an agent or a future edit can silently ignore or weaken.
//
// Three things happen here, in order:
//   1. Every fixture in scripts/fixtures/response-policy/*.json is checked against
//      response-policy-engine.mjs and must produce exactly its declared `expectedViolations` — not just
//      pass/fail, so a fixture failing for the wrong reason cannot look green.
//   2. The two worked examples inside cli-contract.md are extracted at runtime (not copied into a fixture)
//      and run through the same engine, so editing an example into something non-compliant fails this eval.
//   3. The doc invariants (forbidden phrases, the three index states, the conclusion-last summary order)
//      are checked against the real files, then proven capable of failing by re-running them against
//      mutated in-memory copies with one rule's supporting text deleted.
//
// Node built-ins only, deterministic, offline. Run via `npm run test:response-policy`, which builds the CLI
// first so cli/dist/test/jsonSchema.js exists; this script also checks for it directly and fails loudly
// with instructions rather than silently skipping schema validation (see checkSchemaValidatorAvailable).

import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { evaluateSummary } from './lib/response-policy-engine.mjs';
import { checkDocInvariants } from './lib/response-policy-doc-invariants.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const fixturesDir = path.join(repoRoot, 'scripts', 'fixtures', 'response-policy');
const schemaValidatorPath = path.join(repoRoot, 'cli', 'dist', 'test', 'jsonSchema.js');
const schemaPath = path.join(repoRoot, 'cli', 'schemas', 'response.schema.json');

const DOC_PATHS = {
  skillMd: path.join(repoRoot, 'plugins', 'impact-lens', 'skills', 'impact-lens-cli', 'SKILL.md'),
  cliContractMd: path.join(repoRoot, 'plugins', 'impact-lens', 'skills', 'impact-lens-cli', 'references', 'cli-contract.md'),
  analyzeMd: path.join(repoRoot, 'plugins', 'impact-lens', 'commands', 'analyze.md'),
};

const EXAMPLE_START = marker => `<!-- response-policy-example: ${marker} -->`;
const EXAMPLE_END = '<!-- /response-policy-example -->';

const failures = [];
let checkCount = 0;

function record(label, fn) {
  checkCount += 1;
  try {
    fn();
    process.stdout.write(`ok - ${label}\n`);
  } catch (error) {
    failures.push({ label, error });
    process.stdout.write(`FAIL - ${label}\n  ${error.message.split('\n').join('\n  ')}\n`);
  }
}

// ---------------------------------------------------------------------------
// 0. The schema validator this script depends on lives in cli/dist, which is gitignored build output.
// `npm run test:response-policy` builds it first; this check exists for anyone who runs this file directly
// with a stale or absent build, so the failure mode is a clear instruction instead of every fixture
// silently skipping its schema check.
// ---------------------------------------------------------------------------

function checkSchemaValidatorAvailable() {
  if (!fs.existsSync(schemaValidatorPath)) {
    throw new Error(
      `${schemaValidatorPath} does not exist.\n` +
      'The response-policy eval validates every fixture against the real response schema using the ' +
      'compiled test helper in cli/dist, and refuses to run without it rather than silently skipping ' +
      'validation.\n' +
      'Run `npm run cli:build` (or `npm run test:response-policy`, which does this for you) before ' +
      'invoking this script directly.',
    );
  }
}

checkSchemaValidatorAvailable();
const { validate } = await import(pathToFileURL(schemaValidatorPath).href);
const responseSchema = JSON.parse(fs.readFileSync(schemaPath, 'utf8'));

// ---------------------------------------------------------------------------
// 1 & 2. Fixtures, including the two extracted from cli-contract.md.
// ---------------------------------------------------------------------------

function extractDelimitedExample(text, marker, sourceLabel) {
  const start = EXAMPLE_START(marker);
  const startIndex = text.indexOf(start);
  if (startIndex === -1) {
    throw new Error(`${sourceLabel}: could not find start marker ${JSON.stringify(start)}.`);
  }
  const afterStart = startIndex + start.length;
  const endIndex = text.indexOf(EXAMPLE_END, afterStart);
  if (endIndex === -1) {
    throw new Error(`${sourceLabel}: could not find closing marker for ${JSON.stringify(start)}.`);
  }
  const block = text.slice(afterStart, endIndex);
  const joined = block
    .split('\n')
    .map(line => line.trim())
    .filter(line => line.length > 0)
    .map(line => line.replace(/^>\s?/, ''))
    .join(' ');
  const firstQuote = joined.indexOf('"');
  const lastQuote = joined.lastIndexOf('"');
  if (firstQuote === -1 || lastQuote === -1 || firstQuote === lastQuote) {
    throw new Error(`${sourceLabel}: marker ${JSON.stringify(marker)} does not wrap a "quoted" summary.`);
  }
  return joined.slice(firstQuote + 1, lastQuote);
}

function resolveSummary(fixture) {
  if (typeof fixture.summary === 'string') {
    return fixture.summary;
  }
  if (fixture.summarySource) {
    const sourcePath = path.join(repoRoot, fixture.summarySource.file);
    const text = fs.readFileSync(sourcePath, 'utf8');
    return extractDelimitedExample(text, fixture.summarySource.marker, fixture.summarySource.file);
  }
  throw new Error(`fixture ${fixture.name} has neither "summary" nor "summarySource".`);
}

function uniqueSorted(values) {
  return [...new Set(values)].sort();
}

function runFixture(fixture) {
  const schemaErrors = validate(responseSchema, fixture.response);
  assert.deepEqual(
    schemaErrors,
    [],
    `fixture "${fixture.name}" has a response that does not satisfy response.schema.json (a fixture ` +
    `describing an impossible response tests nothing):\n${schemaErrors.join('\n')}`,
  );

  const summary = resolveSummary(fixture);
  const violations = evaluateSummary(fixture.response, summary);
  const actualCodes = uniqueSorted(violations.map(violation => violation.code));
  const expectedCodes = uniqueSorted(fixture.expectedViolations ?? []);

  assert.deepEqual(
    actualCodes,
    expectedCodes,
    `fixture "${fixture.name}" produced violations ${JSON.stringify(actualCodes)}, expected ` +
    `${JSON.stringify(expectedCodes)}.\nSummary evaluated: ${JSON.stringify(summary)}\nViolation detail: ` +
    `${violations.map(v => `${v.code}: ${v.message}`).join(' | ') || '(none)'}`,
  );

  const shouldPass = fixture.expect === 'pass';
  assert.equal(
    actualCodes.length === 0,
    shouldPass,
    `fixture "${fixture.name}" declares expect: "${fixture.expect}" but produced ` +
    `${actualCodes.length === 0 ? 'zero' : actualCodes.length} violation(s).`,
  );
}

const fixtureFiles = fs.readdirSync(fixturesDir).filter(file => file.endsWith('.json')).sort();
assert.ok(fixtureFiles.length > 0, `no fixtures found in ${fixturesDir}`);

for (const file of fixtureFiles) {
  const fixture = JSON.parse(fs.readFileSync(path.join(fixturesDir, file), 'utf8'));
  record(`fixture ${file}: ${fixture.name}`, () => runFixture(fixture));
}

// ---------------------------------------------------------------------------
// 3. Doc invariants: real files must satisfy every rule, and a mutated copy with one rule's supporting
// text deleted must fail the corresponding check. Without the second half this is a check that has never
// been observed to fail.
// ---------------------------------------------------------------------------

const docText = Object.fromEntries(
  Object.entries(DOC_PATHS).map(([key, filePath]) => [key, fs.readFileSync(filePath, 'utf8')]),
);

record('doc invariants hold against the real SKILL.md, cli-contract.md and analyze.md', () => {
  const violations = checkDocInvariants(docText);
  assert.deepEqual(violations, [], `unexpected doc invariant violations:\n${violations.map(v => `${v.code}: ${v.message}`).join('\n')}`);
});

function removeSentenceContaining(text, needle) {
  const sentences = text.split(/(?<=[.!?])\s+/);
  const kept = sentences.filter(sentence => !sentence.toLowerCase().includes(needle.toLowerCase()));
  assert.ok(kept.length < sentences.length, `expected to find and remove a sentence containing ${JSON.stringify(needle)}`);
  return kept.join(' ');
}

record('deleting the forbidden-phrase rule from SKILL.md makes the doc-invariant check fail (negative direction)', () => {
  const mutated = { ...docText, skillMd: removeSentenceContaining(docText.skillMd, 'those phrases claim more than static call hierarchy evidence establishes') };
  const violations = checkDocInvariants(mutated);
  assert.ok(
    violations.some(v => v.code === 'doc_missing_forbidden_phrase'),
    'expected doc_missing_forbidden_phrase after deleting the forbidden-phrase sentence from SKILL.md',
  );
});

record('deleting the forbidden-phrase rule from cli-contract.md makes the doc-invariant check fail (negative direction)', () => {
  const mutated = { ...docText, cliContractMd: removeSentenceContaining(docText.cliContractMd, 'never produce the conclusions') };
  const violations = checkDocInvariants(mutated);
  assert.ok(
    violations.some(v => v.code === 'doc_missing_forbidden_phrase'),
    'expected doc_missing_forbidden_phrase after deleting the forbidden-phrase sentence from cli-contract.md',
  );
});

record('un-marking every `working` code span in cli-contract.md makes the doc-invariant check fail (negative direction)', () => {
  // The doc mentions `working` in four places (a heading and three cross-references), so deleting only the
  // section heading leaves the other backtick-wrapped mentions behind and proves nothing. Stripping the
  // code-span backticks everywhere is the mutation that actually removes every marker the check looks for.
  assert.ok(docText.cliContractMd.includes('`working`'), 'expected to find at least one `working` code span to un-mark');
  const mutated = { ...docText, cliContractMd: docText.cliContractMd.replaceAll('`working`', 'working') };
  const violations = checkDocInvariants(mutated);
  assert.ok(
    violations.some(v => v.code === 'doc_missing_index_state' && v.message.includes('working')),
    'expected doc_missing_index_state for "working" after un-marking every `working` code span in cli-contract.md',
  );
});

record('deleting the conclusion-last summary order from SKILL.md makes the doc-invariant check fail (negative direction)', () => {
  const mutated = { ...docText, skillMd: removeSentenceContaining(docText.skillMd, 'state a summary in this order, conclusion last') };
  const violations = checkDocInvariants(mutated);
  assert.ok(
    violations.some(v => v.code === 'doc_missing_summary_order'),
    'expected doc_missing_summary_order after deleting the conclusion-last rule from SKILL.md',
  );
});

record('deleting the conclusion-last summary order from analyze.md makes the doc-invariant check fail (negative direction)', () => {
  const mutated = { ...docText, analyzeMd: docText.analyzeMd.replace(', in this order — conclusion last:', ':') };
  const violations = checkDocInvariants(mutated);
  assert.ok(
    violations.some(v => v.code === 'doc_missing_summary_order'),
    'expected doc_missing_summary_order after removing "conclusion last" from analyze.md',
  );
});

// ---------------------------------------------------------------------------

if (failures.length > 0) {
  process.stderr.write(`\n${failures.length} of ${checkCount} response-policy checks failed.\n`);
  process.exit(1);
}

process.stdout.write(`\nResponse policy eval passed: ${checkCount} checks (${fixtureFiles.length} fixtures, doc invariants, doc-invariant negative-direction proofs).\n`);
