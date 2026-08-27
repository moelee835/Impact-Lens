import assert from 'node:assert/strict';
import test from 'node:test';
import {
  formatProviderDoctorReport,
  ProviderCheck,
  ProviderDoctorFacts,
  providerDoctorChecks,
  providerDoctorStatus,
} from '../providerDoctor';

function facts(overrides: Partial<ProviderDoctorFacts> = {}): ProviderDoctorFacts {
  return {
    languageId: 'typescript',
    fileName: 'src/controller.ts',
    callHierarchyRootFound: true,
    documentSymbolsFound: true,
    doctorCommandLine: '',
    ...overrides,
  };
}

function check(checks: readonly ProviderCheck[], id: string): ProviderCheck {
  const found = checks.find(candidate => candidate.id === id);
  assert.ok(found, `expected a ${id} check`);
  return found;
}

test('separates a missing language extension from a cursor that is not on a declaration', () => {
  const noLanguageSupport = providerDoctorChecks(facts({
    languageId: 'plaintext',
    callHierarchyRootFound: false,
    documentSymbolsFound: false,
  }));
  assert.equal(check(noLanguageSupport, 'documentSymbols').status, 'fail');
  assert.equal(check(noLanguageSupport, 'callHierarchy').status, 'fail');
  assert.match(check(noLanguageSupport, 'callHierarchy').action ?? '', /Install or enable a language/);

  // A language extension answered, so the failure is either the position or a missing Call Hierarchy
  // implementation. VS Code exposes no way to tell them apart, and the report must not pick one.
  const symbolsOnly = providerDoctorChecks(facts({ callHierarchyRootFound: false }));
  assert.equal(check(symbolsOnly, 'documentSymbols').status, 'pass');
  const callHierarchy = check(symbolsOnly, 'callHierarchy');
  assert.equal(callHierarchy.status, 'warn');
  assert.match(callHierarchy.detail, /not a callable declaration/);
  assert.match(callHierarchy.detail, /does not\n?\s*implement Call Hierarchy|does not implement Call Hierarchy/);
});

test('never claims the CLI doctor ran or was read', () => {
  const unconfigured = check(providerDoctorChecks(facts()), 'agentCli');
  assert.equal(unconfigured.status, 'warn');
  assert.match(unconfigured.detail, /only host-side checks ran/);

  const configured = check(
    providerDoctorChecks(facts({ doctorCommandLine: 'impact-lens doctor bundled-typescript' })),
    'agentCli',
  );
  assert.equal(configured.status, 'pass');
  assert.match(configured.detail, /impact-lens doctor bundled-typescript/);
  assert.match(configured.action ?? '', /never runs it on its own and never reads its output/);
});

test('reports the coverage of the last analysis without settling a bounded one', () => {
  const bounded = check(providerDoctorChecks(facts({
    lastAnalysis: {
      provider: 'vscode/unknown',
      traversalStatus: 'node-limited',
      semanticStatus: 'static-only',
      indexingStatus: 'unknown',
      callerCount: 12,
      reasons: ['node_limit_reached'],
    },
  })), 'coverage');
  assert.equal(bounded.status, 'warn');
  assert.match(bounded.detail, /traversal node-limited/);
  assert.match(bounded.detail, /semantic scope: static call hierarchy only/);
  assert.match(bounded.detail, /index state: not reported/);
  assert.ok(bounded.action);

  const settled = check(providerDoctorChecks(facts({
    lastAnalysis: {
      provider: 'vscode/unknown',
      traversalStatus: 'complete',
      semanticStatus: 'static-only',
      indexingStatus: 'ready',
      callerCount: 3,
      reasons: [],
    },
  })), 'coverage');
  assert.equal(settled.status, 'pass');
  assert.equal(settled.action, undefined);

  // An index that is still building is a boundary even when the traversal itself finished.
  const indexing = check(providerDoctorChecks(facts({
    lastAnalysis: {
      provider: 'vscode/unknown',
      traversalStatus: 'complete',
      semanticStatus: 'static-only',
      indexingStatus: 'working',
      callerCount: 0,
      reasons: ['provider_not_ready'],
    },
  })), 'coverage');
  assert.equal(indexing.status, 'warn');
});

test('rolls the overall status up to the worst check', () => {
  assert.equal(providerDoctorStatus([{ id: 'a', title: 'a', status: 'pass', detail: '' }]), 'pass');
  assert.equal(providerDoctorStatus([
    { id: 'a', title: 'a', status: 'pass', detail: '' },
    { id: 'b', title: 'b', status: 'warn', detail: '' },
  ]), 'warn');
  assert.equal(providerDoctorStatus([
    { id: 'a', title: 'a', status: 'warn', detail: '' },
    { id: 'b', title: 'b', status: 'fail', detail: '' },
  ]), 'fail');
});

test('closes the report with the boundary the checks cannot prove away', () => {
  const report = formatProviderDoctorReport(facts()).join('\n');
  assert.match(report, /^Impact Lens provider doctor/);
  assert.match(report, /Overall: warn/);
  assert.match(report, /static call\nhierarchy only/);
  assert.match(report, /dynamic dispatch, reflection and runtime wiring/);
});
