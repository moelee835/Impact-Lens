import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import test from 'node:test';
import { ProviderReadinessProfile } from '../providers/preset';
import { assertProjectMetadata, ReadinessTracker } from '../providers/readiness';
import { CliError } from '../types';

function profile(overrides: Partial<ProviderReadinessProfile> = {}): ProviderReadinessProfile {
  return { signals: [], budgetMs: 50, onBudgetExceeded: 'proceed-partial', ...overrides };
}

function temporaryDirectory(t: { after(fn: () => void): void }, prefix: string): string {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  return directory;
}

async function rejection(run: () => Promise<unknown>): Promise<CliError> {
  try {
    await run();
  } catch (error) {
    assert.ok(error instanceof CliError, `expected a CliError, got ${String(error)}`);
    return error;
  }
  throw new assert.AssertionError({ message: 'expected the call to reject' });
}

// ---------------------------------------------------------------------------
// Nothing the preset did not declare may raise the reported confidence
// ---------------------------------------------------------------------------

test('an undeclared progress cycle, notification and registration never reach ready', async () => {
  const tracker = new ReadinessTracker(profile());
  tracker.noteProgress('t1', 'begin', 'Indexing project');
  tracker.noteProgress('t1', 'end', undefined);
  tracker.noteNotification('custom/indexed', { state: 'done' });
  tracker.noteCapabilityRegistered('textDocument/callHierarchy');

  // Every one of these is the exact event another server uses to mean "ready". Without a declaration
  // they are just traffic, and reading them as readiness is how an unindexed workspace gets reported
  // as having no callers.
  assert.deepEqual(await tracker.settle(5000), { status: 'working' });
});

test('a progress end whose title does not match the declared pattern is not readiness', async () => {
  const tracker = new ReadinessTracker(profile({
    signals: [{ kind: 'work-done-progress', means: 'ready', titlePattern: 'Indexing' }],
  }));
  tracker.noteProgress('t1', 'begin', 'Checking one file');
  tracker.noteProgress('t1', 'end', undefined);
  assert.deepEqual(await tracker.settle(5000), { status: 'working' });
});

test('a declared notification with a non-matching value is not readiness', async () => {
  const tracker = new ReadinessTracker(profile({
    signals: [{
      kind: 'notification',
      means: 'ready',
      method: 'custom/status',
      match: { path: ['state'], equals: 'ready' },
    }],
  }));
  tracker.noteNotification('custom/status', { state: 'indexing' });
  tracker.noteNotification('custom/status', { other: 'ready' });
  tracker.noteNotification('custom/status', undefined);
  assert.deepEqual(await tracker.settle(5000), { status: 'working' });
});

test('a work-done progress that only began is not readiness', async () => {
  const tracker = new ReadinessTracker(profile({
    signals: [{ kind: 'work-done-progress', means: 'ready', titlePattern: 'Indexing' }],
  }));
  tracker.noteProgress('t1', 'begin', 'Indexing project');
  tracker.noteProgress('t1', 'report', undefined);
  assert.deepEqual(tracker.observation, { status: 'unknown' });
  assert.deepEqual(await tracker.settle(5000), { status: 'working' });
});

// ---------------------------------------------------------------------------
// A declared signal produces ready, with evidence that names the declaration
// ---------------------------------------------------------------------------

test('a declared progress end produces ready evidence naming the declared pattern', async () => {
  const tracker = new ReadinessTracker(profile({
    budgetMs: 5000,
    signals: [{ kind: 'work-done-progress', means: 'ready', titlePattern: 'Indexing' }],
  }));
  tracker.noteProgress('t1', 'begin', 'Indexing project files');
  tracker.noteProgress('t1', 'end', undefined);
  assert.deepEqual(await tracker.settle(5000), {
    status: 'ready',
    // `Indexing` is the manifest's own string. `Indexing project files` was the server's, and it does
    // not appear anywhere in the evidence.
    evidence: { signal: 'work-done-progress', detail: 'Indexing' },
  });
});

test('a declared notification match produces ready evidence naming the method', async () => {
  const tracker = new ReadinessTracker(profile({
    budgetMs: 5000,
    signals: [{
      kind: 'notification',
      means: 'ready',
      method: 'custom/status',
      match: { path: ['index', 'state'], equals: 'ready' },
    }],
  }));
  tracker.noteNotification('custom/status', { index: { state: 'ready' } });
  assert.deepEqual(await tracker.settle(5000), {
    status: 'ready',
    evidence: { signal: 'notification', detail: 'custom/status' },
  });
});

test('a declared capability registration produces ready evidence naming the method', async () => {
  const tracker = new ReadinessTracker(profile({
    budgetMs: 5000,
    signals: [{ kind: 'capability-registered', means: 'ready', method: 'textDocument/callHierarchy' }],
  }));
  tracker.noteCapabilityRegistered('textDocument/didChangeWatchedFiles');
  assert.deepEqual(tracker.observation, { status: 'unknown' });
  tracker.noteCapabilityRegistered('textDocument/callHierarchy');
  assert.deepEqual(await tracker.settle(5000), {
    status: 'ready',
    evidence: { signal: 'capability-registered', detail: 'textDocument/callHierarchy' },
  });
});

test('ready evidence carries no server text, no timestamp and no absolute path', async () => {
  const tracker = new ReadinessTracker(profile({
    budgetMs: 5000,
    signals: [{ kind: 'work-done-progress', means: 'ready' }],
  }));
  tracker.noteProgress('t1', 'begin', `Indexed ${path.join(os.tmpdir(), 'secret-workspace')} at ${new Date().toISOString()}`);
  tracker.noteProgress('t1', 'end', undefined);
  const settled = await tracker.settle(5000);
  assert.deepEqual(settled, { status: 'ready', evidence: { signal: 'work-done-progress' } });
  // Determinism is the requirement being checked: the same run twice must serialize identically, which
  // a title, a path or a clock reading would each break on its own.
  assert.equal(JSON.stringify(settled), '{"status":"ready","evidence":{"signal":"work-done-progress"}}');
});

test('a ready signal that arrives while the budget is still running settles immediately', async () => {
  const tracker = new ReadinessTracker(profile({
    // Long enough that a tracker which merely waited out the clock would fail this test on duration.
    budgetMs: 30000,
    signals: [{ kind: 'notification', means: 'ready', method: 'custom/ready' }],
  }));
  const started = Date.now();
  setTimeout(() => tracker.noteNotification('custom/ready', {}), 10);
  const settled = await tracker.settle(30000);
  assert.equal(settled.status, 'ready');
  assert.ok(Date.now() - started < 5000, 'settle should end on the signal, not on the budget');
});

// ---------------------------------------------------------------------------
// The budget is a ceiling, and the settled answer is frozen
// ---------------------------------------------------------------------------

test('an exceeded proceed-partial budget settles as working, never as ready', async () => {
  const tracker = new ReadinessTracker(profile({
    budgetMs: 20,
    signals: [{ kind: 'notification', means: 'ready', method: 'custom/ready' }],
  }));
  assert.deepEqual(await tracker.settle(5000), { status: 'working' });
});

test('an exceeded fail budget raises provider_not_ready at the indexing stage', async () => {
  const tracker = new ReadinessTracker(profile({
    budgetMs: 20,
    onBudgetExceeded: 'fail',
    signals: [{ kind: 'notification', means: 'ready', method: 'custom/ready' }],
  }));
  const error = await rejection(() => tracker.settle(5000));
  assert.equal(error.code, 'provider_not_ready');
  assert.equal(error.exitCode, 5);
  assert.equal(error.retryable, true);
  assert.deepEqual(error.details, { stage: 'indexing', budgetMs: 20, observedWorking: false });
  assert.match(error.message, /did not report readiness/);
});

test('a declared working signal is reported in the failure without changing the verdict', async () => {
  const tracker = new ReadinessTracker(profile({
    budgetMs: 20,
    onBudgetExceeded: 'fail',
    signals: [
      { kind: 'work-done-progress', means: 'working', titlePattern: 'Indexing' },
      { kind: 'notification', means: 'ready', method: 'custom/ready' },
    ],
  }));
  tracker.noteProgress('t1', 'begin', 'Indexing project');

  const error = await rejection(() => tracker.settle(5000));
  assert.equal(error.code, 'provider_not_ready');
  // The distinction the user acts on: a server that said it was working needs a longer budget, while
  // total silence usually means the declared signal does not match this server at all.
  assert.deepEqual(error.details, { stage: 'indexing', budgetMs: 20, observedWorking: true });
  assert.match(error.message, /still indexing/);
});

test('a working signal alone never settles as ready', async () => {
  const tracker = new ReadinessTracker(profile({
    budgetMs: 20,
    signals: [{ kind: 'capability-registered', means: 'working', method: 'textDocument/callHierarchy' }],
  }));
  tracker.noteCapabilityRegistered('textDocument/callHierarchy');
  assert.deepEqual(await tracker.settle(5000), { status: 'working' });
});

test('a ready signal that arrives after the budget does not upgrade the settled answer', async () => {
  const tracker = new ReadinessTracker(profile({
    budgetMs: 20,
    signals: [{ kind: 'notification', means: 'ready', method: 'custom/ready' }],
  }));
  assert.deepEqual(await tracker.settle(5000), { status: 'working' });
  tracker.noteNotification('custom/ready', {});
  // The queries that ran under `working` did not become complete because the server spoke afterwards.
  assert.deepEqual(tracker.observation, { status: 'working' });
  assert.deepEqual(await tracker.settle(5000), { status: 'working' });
});

test('the session timeout caps a budget that is larger than it', async () => {
  const tracker = new ReadinessTracker(profile({ budgetMs: 600000, signals: [] }));
  const started = Date.now();
  assert.deepEqual(await tracker.settle(30), { status: 'working' });
  assert.ok(Date.now() - started < 5000, 'the wait must not outlast the session timeout');
});

// ---------------------------------------------------------------------------
// Required project files are read, never written, and never read outside the workspace
// ---------------------------------------------------------------------------

test('present required project files pass without touching anything', async t => {
  const workspace = temporaryDirectory(t, 'impact-lens-readiness-present-');
  fs.writeFileSync(path.join(workspace, 'tsconfig.json'), '{}');
  fs.mkdirSync(path.join(workspace, 'nested'));
  fs.writeFileSync(path.join(workspace, 'nested', 'go.mod'), 'module x\n');
  await assertProjectMetadata(workspace, profile({ requiredProjectFiles: ['tsconfig.json', 'nested/go.mod'] }));
  assert.deepEqual(fs.readdirSync(workspace).sort(), ['nested', 'tsconfig.json']);
});

test('a missing required project file fails without generating it', async t => {
  const workspace = temporaryDirectory(t, 'impact-lens-readiness-missing-');
  const error = await rejection(() => assertProjectMetadata(
    workspace,
    profile({ requiredProjectFiles: ['tsconfig.json', 'go.mod'] }),
  ));
  assert.equal(error.code, 'provider_project_metadata_missing');
  assert.equal(error.exitCode, 5);
  assert.equal(error.retryable, false);
  assert.deepEqual(error.details, { stage: 'indexing', missing: ['go.mod', 'tsconfig.json'] });
  // The recovery belongs to the user. A tool that writes build inputs to make its own answer look
  // better is the failure this check exists to avoid.
  assert.deepEqual(fs.readdirSync(workspace), []);
});

test('the failure names relative paths only', async t => {
  const workspace = temporaryDirectory(t, 'impact-lens-readiness-relative-');
  const error = await rejection(() => assertProjectMetadata(
    workspace,
    profile({ requiredProjectFiles: ['build/compile_commands.json'] }),
  ));
  const serialized = JSON.stringify({ message: error.message, details: error.details });
  assert.ok(serialized.includes('build/compile_commands.json'));
  assert.ok(!serialized.includes(workspace), 'the machine layout of the caller must not leak');
});

test('a required path outside the workspace is refused and never read', async t => {
  const parent = temporaryDirectory(t, 'impact-lens-readiness-escape-');
  const workspace = path.join(parent, 'inner');
  fs.mkdirSync(workspace);
  const outside = path.join(parent, 'outside.json');
  fs.writeFileSync(outside, '{}');

  for (const required of ['../outside.json', outside]) {
    const error = await rejection(() => assertProjectMetadata(
      workspace,
      profile({ requiredProjectFiles: [required] }),
    ));
    // Refused as a provider configuration error, not reported as missing: the file exists, and saying
    // "missing" would tell the caller that the escape was attempted and answered.
    assert.equal(error.code, 'provider_config_invalid', required);
    assert.equal(error.exitCode, 5);
    assert.deepEqual(error.details, { stage: 'indexing', requiredProjectFile: required });
  }
});

test('a profile with no required files reads nothing at all', async t => {
  const workspace = path.join(temporaryDirectory(t, 'impact-lens-readiness-none-'), 'does-not-exist');
  // The workspace does not even exist. A check that stat'ed anything would throw here.
  await assertProjectMetadata(workspace, profile());
});
