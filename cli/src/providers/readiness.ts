// Turns the readiness signals a preset declares into one indexing observation.
//
// The rule this module exists to enforce is negative: nothing here may conclude "the provider is
// ready" from anything the preset did not declare. A `$/progress` end, a dynamic registration and a
// custom notification are all just protocol traffic; which of them means "the index is usable" is
// known only to the manifest that describes that server. Promoting any of them globally would hand a
// confident empty result to a user whose workspace was never indexed, which is the single failure
// mode the whole coverage contract exists to prevent.
//
// Time is the other thing that is never evidence. `budgetMs` is a ceiling on how long the session is
// willing to wait, never a criterion for readiness: exceeding it produces `working` or a failure, and
// never `ready`.

import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { CliError } from '../errors';
import { IndexingCoverage, IndexingReadinessEvidence } from '../types';
import { ProviderReadinessProfile, ReadinessMatch, ReadinessSignal } from './preset';

/** What a session observes when it never asked a readiness question. */
export const UNKNOWN_INDEXING: IndexingCoverage = { status: 'unknown' };

/**
 * Evidence carries the declared signal kind and the manifest's own matcher, never server text.
 *
 * A server-authored progress title or log line would make the response non-deterministic between runs
 * and would carry whatever the server chose to print, including paths and credentials that the
 * redaction list may not know about. The manifest strings are authored in this repository's catalog,
 * so they are stable and safe by construction. Absolute timestamps are excluded for the same
 * determinism reason: two identical runs must produce identical bytes.
 */
function evidenceFor(signal: ReadinessSignal): IndexingReadinessEvidence {
  switch (signal.kind) {
    case 'work-done-progress':
      return signal.titlePattern === undefined
        ? { signal: 'work-done-progress' }
        : { signal: 'work-done-progress', detail: signal.titlePattern };
    case 'notification':
      return { signal: 'notification', detail: signal.method };
    case 'capability-registered':
      return { signal: 'capability-registered', detail: signal.method };
  }
}

/** Scalar equality at one declared path. The manifest contract admits no expression language (D8). */
function matches(params: unknown, match: ReadinessMatch | undefined): boolean {
  if (match === undefined) {
    return true;
  }
  let cursor: unknown = params;
  for (const key of match.path) {
    if (typeof cursor !== 'object' || cursor === null || Array.isArray(cursor)) {
      return false;
    }
    cursor = (cursor as Record<string, unknown>)[key];
  }
  return cursor === match.equals;
}

/**
 * Reads whether the files a preset says its server needs are present. Existence, and nothing else.
 *
 * A missing `tsconfig.json` or `go.mod` makes a server answer Call Hierarchy with an empty result
 * rather than an error, so without this check the run would report "no callers" for a project the
 * server never understood. The recovery is the user's: this never generates, builds, configures or
 * syncs anything, because a tool that silently writes build inputs into a workspace to make its own
 * answer look better is worse than a tool that says it cannot answer.
 */
export async function assertProjectMetadata(
  workspace: string,
  profile: ProviderReadinessProfile,
): Promise<void> {
  const required = profile.requiredProjectFiles ?? [];
  if (required.length === 0) {
    return;
  }
  const missing: string[] = [];
  for (const relative of required) {
    const resolved = path.resolve(workspace, relative);
    const escape = path.relative(workspace, resolved);
    if (escape === '..' || escape.startsWith(`..${path.sep}`) || path.isAbsolute(escape)) {
      // Rejected before the stat, so a manifest cannot use this check to probe for files outside the
      // analyzed tree. The path is a preset authoring mistake, not a request mistake, which is why it
      // fails as a provider configuration error.
      throw new CliError(
        'provider_config_invalid',
        `The provider declares a required project file outside the workspace: ${relative}`,
        5,
        false,
        { stage: 'indexing', requiredProjectFile: relative },
      );
    }
    try {
      await fs.stat(resolved);
    } catch {
      missing.push(relative);
    }
  }
  if (missing.length > 0) {
    throw new CliError(
      'provider_project_metadata_missing',
      `The workspace is missing project files this provider needs: ${[...missing].sort().join(', ')}`,
      5,
      false,
      // Relative paths only. An absolute path would leak the machine layout of whoever ran the CLI.
      { stage: 'indexing', missing: [...missing].sort() },
    );
  }
}

export type ProgressKind = 'begin' | 'report' | 'end';

/**
 * Collects declared signals until one says `ready` or the budget runs out, then freezes.
 *
 * Freezing is the point. A `ready` that arrives after the session gave up and started querying does
 * not retroactively make the queries that already ran complete, so admitting it would upgrade a
 * result whose evidence never existed. The first settled value is the one the response carries.
 */
export class ReadinessTracker {
  private settled: IndexingCoverage | undefined;
  /**
   * Whether a declared `working` signal ever arrived.
   *
   * It cannot change the settled answer — only a `ready` signal can, and only upwards — but it changes
   * what the user should do about a failure. "The server said it was still indexing and never finished"
   * asks for a longer budget; "the server said nothing at all" usually means the declared signal is
   * wrong for this server version, and waiting longer will never help.
   */
  private observedWorking = false;
  private readonly waiters = new Set<() => void>();
  /** Progress titles per token, so an `end` can be matched against the `begin` that named the work. */
  private readonly titles = new Map<string, string | undefined>();

  constructor(private readonly profile: ProviderReadinessProfile) {}

  /** The frozen observation. `unknown` until `settle()` has decided, which is the conservative default. */
  get observation(): IndexingCoverage {
    return this.settled ?? UNKNOWN_INDEXING;
  }

  noteProgress(token: string, kind: ProgressKind, title: string | undefined): void {
    if (kind === 'begin') {
      this.titles.set(token, title);
    }
    const known = this.titles.get(token);
    for (const signal of this.profile.signals) {
      if (signal.kind !== 'work-done-progress') {
        continue;
      }
      if (signal.titlePattern !== undefined && !(known ?? '').includes(signal.titlePattern)) {
        continue;
      }
      // Only the end of the declared operation can mean "finished". A `begin` or `report` on the same
      // token is the opposite statement and is recorded as such.
      if (signal.means === 'ready') {
        if (kind === 'end') {
          this.markReady(signal);
        }
      } else {
        this.observedWorking = true;
      }
    }
  }

  noteNotification(method: string, params: unknown): void {
    for (const signal of this.profile.signals) {
      if (signal.kind !== 'notification' || signal.method !== method || !matches(params, signal.match)) {
        continue;
      }
      if (signal.means === 'ready') {
        this.markReady(signal);
      } else {
        this.observedWorking = true;
      }
    }
  }

  noteCapabilityRegistered(method: string): void {
    for (const signal of this.profile.signals) {
      if (signal.kind !== 'capability-registered' || signal.method !== method) {
        continue;
      }
      if (signal.means === 'ready') {
        this.markReady(signal);
      } else {
        this.observedWorking = true;
      }
    }
  }

  /**
   * Waits for a declared `ready` signal, bounded by the preset's budget.
   *
   * `capMs` is the session timeout. Waiting past it would spend the caller's entire budget inside the
   * handshake and then fail the first query as a timeout, which names the wrong cause.
   */
  async settle(capMs: number): Promise<IndexingCoverage> {
    if (this.settled) {
      return this.settled;
    }
    const budgetMs = Math.max(0, Math.min(this.profile.budgetMs, capMs));
    if (budgetMs > 0) {
      await new Promise<void>(resolve => {
        const finish = (): void => {
          clearTimeout(timer);
          this.waiters.delete(waiter);
          resolve();
        };
        const waiter = (): void => finish();
        const timer = setTimeout(finish, budgetMs);
        this.waiters.add(waiter);
      });
    }
    if (this.settled) {
      return this.settled;
    }
    if (this.profile.onBudgetExceeded === 'fail') {
      // Thrown before any query is sent, so the envelope names the index rather than an empty graph.
      throw new CliError(
        'provider_not_ready',
        this.observedWorking
          ? `The provider was still indexing after ${this.profile.budgetMs}ms.`
          : `The provider did not report readiness within ${this.profile.budgetMs}ms.`,
        5,
        true,
        { stage: 'indexing', budgetMs: this.profile.budgetMs, observedWorking: this.observedWorking },
      );
    }
    // No ready evidence arrived, so the index state is `working`, not `unknown`: the preset told us
    // this server reports readiness, and it has not. `working` is what stops the traversal being
    // called exhausted, which is what keeps an empty result from reading as "no caller exists".
    this.settled = { status: 'working' };
    return this.settled;
  }

  private markReady(signal: ReadinessSignal): void {
    if (this.settled) {
      return;
    }
    this.settled = { status: 'ready', evidence: evidenceFor(signal) };
    for (const waiter of [...this.waiters]) {
      waiter();
    }
  }
}
