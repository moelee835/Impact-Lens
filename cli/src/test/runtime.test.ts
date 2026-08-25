import assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import test from 'node:test';
import {
  assertSupportedNode,
  inspectBundledTypeScriptArtifact,
  runtimeMetadata,
} from '../runtime';
import { CliError } from '../types';

test('runtime metadata exposes versions and only an allowlisted runner source', () => {
  const previous = process.env.IMPACT_LENS_RUNNER_SOURCE;
  process.env.IMPACT_LENS_RUNNER_SOURCE = 'https://user:secret@example.invalid/private.tgz';
  try {
    const runtime = runtimeMetadata();
    assert.equal(runtime.cli.name, '@impact-lens/cli');
    assert.match(runtime.cli.version, /^\d+\.\d+\.\d+/);
    assert.equal(runtime.node.version, process.versions.node);
    assert.equal(runtime.runner.source, 'direct');
    assert.doesNotMatch(JSON.stringify(runtime), /secret|example\.invalid/);
  } finally {
    if (previous === undefined) {
      delete process.env.IMPACT_LENS_RUNNER_SOURCE;
    } else {
      process.env.IMPACT_LENS_RUNNER_SOURCE = previous;
    }
  }
});

test('startup guard rejects unsupported Node with an actionable error', () => {
  assert.throws(
    () => assertSupportedNode('20.19.0'),
    (error: unknown) => error instanceof CliError
      && error.code === 'node_version_unsupported'
      && (error.details as { recovery?: string }).recovery === 'switch_to_node_22_or_newer',
  );
});

test('bundled artifact inspection reports package versions without exposing its path contract', () => {
  const artifact = inspectBundledTypeScriptArtifact();
  assert.equal(artifact.serverVersion, '6.0.0');
  assert.equal(artifact.typescriptVersion, '5.9.3');
  assert.equal(artifact.entry, 'lib/cli.mjs');
  assert.ok(artifact.entryPath.endsWith(artifact.entry));
});

test('bundled artifact inspection maps resolution failure to a stable reinstall error', () => {
  assert.throws(
    () => inspectBundledTypeScriptArtifact(() => { throw new Error('/secret/provider/path'); }),
    (error: unknown) => error instanceof CliError
      && error.code === 'bundled_provider_artifact_missing'
      && !JSON.stringify(error.details).includes('/secret/provider/path'),
  );
});

test('bundled artifact inspection distinguishes unreadable entry and corrupt package metadata', async t => {
  const unreadableResolver = (specifier: string) => specifier.endsWith('cli.mjs')
    ? '/definitely/missing/impact-lens-provider-entry.mjs'
    : require.resolve(specifier);
  assert.throws(
    () => inspectBundledTypeScriptArtifact(unreadableResolver),
    (error: unknown) => error instanceof CliError && error.code === 'bundled_provider_artifact_unreadable',
  );

  const temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'impact-lens-corrupt-provider-'));
  t.after(() => fs.rm(temporary, { recursive: true, force: true }));
  const corruptPackage = path.join(temporary, 'package.json');
  await fs.writeFile(corruptPackage, '{invalid');
  const corruptResolver = (specifier: string) => specifier === 'typescript-language-server/package.json'
    ? corruptPackage
    : require.resolve(specifier);
  assert.throws(
    () => inspectBundledTypeScriptArtifact(corruptResolver),
    (error: unknown) => error instanceof CliError
      && error.code === 'bundled_provider_artifact_corrupt'
      && !JSON.stringify(error.details).includes(temporary),
  );
});
