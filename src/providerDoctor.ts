import { IndexingStatus, SemanticStatus, TraversalStatus } from './types';
import { indexingLabel, semanticScopeLabel } from './completeness';

/**
 * Host-side provider doctor.
 *
 * The Agent CLI grows its own `doctor` with per-check pass/warn/fail in W1-B. This module deliberately does
 * **not** consume that: it reports what the VS Code host can observe by itself, and treats a configured CLI
 * command as an opaque command line that the user may choose to run in a terminal. Impact Lens never parses
 * its output and never composes a preset id into it, so a change to the CLI's doctor output or preset id
 * scheme cannot break this surface.
 *
 * The `pass`/`warn`/`fail` words are shared with the CLI on purpose — one vocabulary for the same idea — but
 * nothing here depends on the CLI producing them.
 *
 * Like `src/completeness.ts`, this module must not touch `vscode` at runtime so it can be unit tested.
 */

export type ProviderCheckStatus = 'pass' | 'warn' | 'fail';

export interface ProviderDoctorFacts {
  readonly languageId: string;
  readonly fileName: string;
  /** `vscode.prepareCallHierarchy` returned an item at the requested position. */
  readonly callHierarchyRootFound: boolean;
  /** `vscode.executeDocumentSymbolProvider` returned symbols for the document. */
  readonly documentSymbolsFound: boolean;
  readonly lastAnalysis?: {
    readonly provider: string;
    readonly traversalStatus: TraversalStatus;
    readonly semanticStatus: SemanticStatus;
    readonly indexingStatus: IndexingStatus;
    readonly callerCount: number;
    readonly reasons: readonly string[];
  };
  /** `impactLens.provider.doctorCommandLine`. Empty means host-side checks only. */
  readonly doctorCommandLine: string;
}

export interface ProviderCheck {
  readonly id: string;
  readonly title: string;
  readonly status: ProviderCheckStatus;
  readonly detail: string;
  readonly action?: string;
}

export function providerDoctorChecks(facts: ProviderDoctorFacts): ProviderCheck[] {
  const checks: ProviderCheck[] = [
    {
      id: 'language',
      title: 'Detected language',
      status: 'pass',
      detail: `${facts.fileName} is treated as "${facts.languageId}".`,
    },
  ];

  // A document symbol provider is the cheapest evidence that a language extension is active at all. It is
  // what separates "no language support in this window" from "the cursor is not on a declaration".
  checks.push(facts.documentSymbolsFound
    ? {
      id: 'documentSymbols',
      title: 'Document symbols',
      status: 'pass',
      detail: 'A document symbol provider answered for this file.',
    }
    : {
      id: 'documentSymbols',
      title: 'Document symbols',
      status: 'fail',
      detail: `No document symbol provider answered for "${facts.languageId}". Usually no language`
        + ' extension is active for this file.',
      action: `Install or enable a language extension for "${facts.languageId}", then reload the window.`,
    });

  if (facts.callHierarchyRootFound) {
    checks.push({
      id: 'callHierarchy',
      title: 'Call Hierarchy',
      status: 'pass',
      detail: 'A Call Hierarchy root came back for the current position.',
    });
  } else if (facts.documentSymbolsFound) {
    // This is the case the VS Code API cannot resolve for us: a language extension is present, but we
    // cannot ask whether it registered a Call Hierarchy provider. Both causes are stated instead of one
    // being guessed.
    checks.push({
      id: 'callHierarchy',
      title: 'Call Hierarchy',
      status: 'warn',
      detail: 'A language extension answered, but no Call Hierarchy root came back for the current'
        + ' position. Either the position is not a callable declaration, or this extension does not'
        + ' implement Call Hierarchy. VS Code does not expose which.',
      action: 'Point at the declaration name, not the body, and run this check again.',
    });
  } else {
    checks.push({
      id: 'callHierarchy',
      title: 'Call Hierarchy',
      status: 'fail',
      detail: 'No Call Hierarchy root came back for the current position, and no language extension'
        + ' answered either.',
      action: `Install or enable a language extension for "${facts.languageId}" that provides Call`
        + ' Hierarchy, then reload the window.',
    });
  }

  if (facts.lastAnalysis) {
    const last = facts.lastAnalysis;
    const settled = last.traversalStatus === 'complete' && last.indexingStatus !== 'working';
    checks.push({
      id: 'coverage',
      title: 'Last analysis coverage',
      status: settled ? 'pass' : 'warn',
      detail: [
        `provider ${last.provider}`,
        `${last.callerCount} caller${last.callerCount === 1 ? '' : 's'} returned`,
        `traversal ${last.traversalStatus}`,
        `semantic scope: ${semanticScopeLabel(last.semanticStatus)}`,
        indexingLabel(last.indexingStatus),
      ].join(' · '),
      action: settled ? undefined : 'Re-run the analysis once the boundary above no longer applies.',
    });
  } else {
    checks.push({
      id: 'coverage',
      title: 'Last analysis coverage',
      status: 'warn',
      detail: 'No analysis has run in this session yet.',
      action: 'Run "Impact Lens: Show Impact for Current Function".',
    });
  }

  checks.push(facts.doctorCommandLine
    ? {
      id: 'agentCli',
      title: 'Agent CLI doctor',
      status: 'pass',
      detail: `Configured command line: ${facts.doctorCommandLine}`,
      action: 'Choose "Run in terminal" to execute it. Impact Lens never runs it on its own and never'
        + ' reads its output.',
    }
    : {
      id: 'agentCli',
      title: 'Agent CLI doctor',
      status: 'warn',
      detail: 'No Agent CLI doctor command line is configured, so only host-side checks ran.',
      action: 'Set "impactLens.provider.doctorCommandLine" to the full command line, then run this'
        + ' command again.',
    });

  return checks;
}

export function providerDoctorStatus(checks: readonly ProviderCheck[]): ProviderCheckStatus {
  if (checks.some(check => check.status === 'fail')) {
    return 'fail';
  }
  if (checks.some(check => check.status === 'warn')) {
    return 'warn';
  }
  return 'pass';
}

export function formatProviderDoctorReport(facts: ProviderDoctorFacts): string[] {
  const checks = providerDoctorChecks(facts);
  const lines = [
    'Impact Lens provider doctor',
    `Overall: ${providerDoctorStatus(checks)}`,
    '',
  ];
  for (const check of checks) {
    lines.push(`[${check.status}] ${check.title}`);
    lines.push(`  ${check.detail}`);
    if (check.action) {
      lines.push(`  → ${check.action}`);
    }
    lines.push('');
  }
  lines.push(
    'Impact Lens analyzes through the VS Code language services. Results describe the static call',
    'hierarchy only; dynamic dispatch, reflection and runtime wiring are outside what it can observe.',
  );
  return lines;
}
