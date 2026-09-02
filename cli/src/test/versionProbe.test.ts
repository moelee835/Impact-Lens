import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import test from 'node:test';
import { findPreset, GOPLS_PRESET_ID, PROVIDER_CATALOG } from '../providers/catalog';
import { parseVersion, probeVersion } from '../providers/discovery';

// Guards the misparse `cli/src/providers/catalog.ts` documents on the `gopls` preset's `version` field:
// `gopls version -json` prints the Go COMPILER's version (`GoVersion`) before gopls's OWN version
// (nested under `Main.Version`), and `parseVersion()` takes the first dotted number it finds in the
// whole probe output - so pointing the probe at `-json` output silently reports the compiler's version
// as gopls's. Plain `gopls version` prints exactly one dotted number and has no such hazard. Without this
// file, the comment in catalog.ts is the only thing enforcing `args: ['version']` over
// `args: ['version', '-json']` - a comment nobody runs.
//
// Both fixtures below are real captured output (`gopls version` / `gopls version -json`, v0.23.0 on
// darwin/arm64, 2026-09-02), trimmed of the dependency list `-json` also prints - irrelevant to the
// misparse and would only make this file harder to read. What matters, and what is preserved verbatim, is
// the field order: `GoVersion` appears before `Main.Version`.

const GOPLS_JSON_OUTPUT = `{
\t"GoVersion": "go1.26.1",
\t"Path": "golang.org/x/tools/gopls",
\t"Main": {
\t\t"Path": "golang.org/x/tools/gopls",
\t\t"Version": "v0.23.0",
\t\t"Sum": "h1:Dn6mf9WXu9iLnTftDDMb9wV0c6Se7PjzEMqP0LEe08Y="
\t},
\t"Settings": [
\t\t{ "Key": "GOARCH", "Value": "arm64" },
\t\t{ "Key": "GOOS", "Value": "darwin" }
\t],
\t"Version": "v0.23.0"
}`;

const GOPLS_PLAIN_OUTPUT = 'golang.org/x/tools/gopls v0.23.0\n';

function temporaryDirectory(t: { after(fn: () => void): void }, prefix: string): string {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  return directory;
}

function scriptPrinting(t: { after(fn: () => void): void }, output: string): string {
  const directory = temporaryDirectory(t, 'impact-lens-gopls-version-');
  const script = path.join(directory, 'version.js');
  fs.writeFileSync(script, `process.stdout.write(${JSON.stringify(output)});\n`);
  return script;
}

test('gopls version -json would report the Go compiler version, not gopls\'s own version, if ever probed', () => {
  // This is the hazard, demonstrated: parseVersion has no notion of JSON structure, so it returns the
  // FIRST dotted number in the text regardless of which field it came from - here that is `GoVersion`'s
  // "go1.26.1" (parsed as "1.26.1"), not the "v0.23.0" gopls itself reports twice further down. A preset
  // whose `version.args` included `-json` would have this outcome silently reported as its own version.
  assert.equal(parseVersion(GOPLS_JSON_OUTPUT), '1.26.1');
});

test('plain gopls version reports gopls\'s own version with no such hazard', () => {
  assert.equal(parseVersion(GOPLS_PLAIN_OUTPUT), '0.23.0');
});

test('probeVersion against the real spawn path reproduces the same misparse for -json output', t => {
  const jsonOutcome = probeVersion(process.execPath, {
    args: [scriptPrinting(t, GOPLS_JSON_OUTPUT)],
    timeoutMs: 5000,
    maxOutputBytes: 8192,
    supported: { minimum: '0.19.1' },
  });
  assert.equal(jsonOutcome.kind, 'found');
  assert.equal(jsonOutcome.kind === 'found' && jsonOutcome.version, '1.26.1');

  const plainOutcome = probeVersion(process.execPath, {
    args: [scriptPrinting(t, GOPLS_PLAIN_OUTPUT)],
    timeoutMs: 5000,
    maxOutputBytes: 8192,
    supported: { minimum: '0.19.1' },
  });
  assert.equal(plainOutcome.kind, 'found');
  assert.equal(plainOutcome.kind === 'found' && plainOutcome.version, '0.23.0');
});

test('the shipped gopls preset probes with plain "version", never "-json"', () => {
  const gopls = findPreset(PROVIDER_CATALOG, GOPLS_PRESET_ID);
  assert.ok(gopls, 'expected a gopls preset in the shipped catalog');
  assert.ok(gopls?.version, 'expected the gopls preset to declare a version probe');
  const args = gopls!.version!.args;
  assert.deepEqual(args, ['version']);
  assert.ok(
    !args.includes('-json'),
    'the gopls preset must not probe with -json - see the misparse this file documents above',
  );
});
