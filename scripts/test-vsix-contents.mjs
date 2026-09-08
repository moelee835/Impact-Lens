import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

// M4 gate 2 shared-adapter lane (docs/work/task-m4-gate2-shared-adapter.md). Nothing in this repo
// packaged or inspected a `.vsix` before this lane - `@vscode/vsce` was a devDependency nobody called.
// That gap is exactly where this lane's real risk lives: `.vscodeignore` excludes `cli/**` wholesale,
// and this lane punches one hole in that exclusion (`cli/dist/shared/**/*.js`) so the extension can
// reach the FastAPI adapter's compiled output. A too-wide negation pattern would silently ship
// `cli/node_modules/**` (pyright, typescript-language-server) inside the vsix - nobody would notice
// until a user downloaded a multi-hundred-MB extension (commander's finding, this lane).
//
// `vsce ls` lists exactly what packaging WOULD include without building a real .vsix (fast, no zip to
// unpack) - used for every content assertion below. A real `vsce package` run backs the size tripwire
// only, since `vsce ls` reports paths, not bytes.
//
// What this does NOT prove (recorded, not silently skipped - this milestone's own rule, "쟀다" != "통과
//했다"): that the extension actually LOADS and its FastAPI-augmented queries work once installed from
// this vsix. That needs a real VS Code extension-host run against a packaged vsix, which this repository
// has no harness for. This script proves the vsix's CONTENTS are what they should be, not that VS Code
// can successfully activate them.

const repository = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function run(command, args) {
  const result = spawnSync(command, args, { cwd: repository, encoding: 'utf8', shell: process.platform === 'win32' });
  assert.equal(
    result.status, 0,
    `${command} ${args.join(' ')} failed (status ${result.status}):\n--- stdout ---\n${result.stdout}\n--- stderr ---\n${result.stderr}`,
  );
  return result;
}

// 1. Content assertions via `vsce ls` - fast, no real .vsix built.
const listed = run('npx', ['--yes', '@vscode/vsce', 'ls', '--no-yarn']);
const files = listed.stdout.split(/\r?\n/).map(line => line.trim()).filter(Boolean);
assert.ok(files.length > 0, `vsce ls produced no files - packaging itself is broken, not just this check:\n${listed.stdout}`);
const posixFiles = files.map(f => f.split(path.sep).join('/'));

const sharedJs = posixFiles.filter(f => f.startsWith('cli/dist/shared/') && f.endsWith('.js'));
assert.ok(
  sharedJs.length > 0,
  'expected at least one cli/dist/shared/**/*.js in the packaged vsix (the FastAPI adapter\'s compiled ' +
  `output) - got none. Full file list:\n${posixFiles.join('\n')}`,
);

const forbiddenPrefixes = ['cli/node_modules/', 'cli/src/'];
for (const prefix of forbiddenPrefixes) {
  const offenders = posixFiles.filter(f => f.startsWith(prefix));
  assert.equal(offenders.length, 0, `${prefix} must never appear in the packaged vsix - found:\n${offenders.join('\n')}`);
}

// cli/dist/index.js (and anything else directly under cli/dist/, outside cli/dist/shared/) must not
// leak in either - the extension only needs the shared adapter's output, never the CLI's own entrypoint
// or its other compiled modules.
const cliDistOutsideShared = posixFiles.filter(f => f.startsWith('cli/dist/') && !f.startsWith('cli/dist/shared/'));
assert.equal(
  cliDistOutsideShared.length, 0,
  `only cli/dist/shared/** may appear in the vsix, found other cli/dist/ paths:\n${cliDistOutsideShared.join('\n')}`,
);

// `declaration: true` on cli/tsconfig.json (needed so the extension can type-check against `.d.ts`
// files sitting next to `cli/dist/**`'s `.js`) means `.d.ts` now exists on disk under `cli/dist/` - a
// compile-time-only artifact the extension never requires() at runtime, so it must never ship either,
// regardless of directory. Source maps are excluded the same way, everywhere, by the repo's existing
// `**/*.map` rule - re-asserted here for cli/dist/shared specifically since that is the one directory
// this lane deliberately un-excludes.
const declarationOrMap = posixFiles.filter(f => f.startsWith('cli/dist/') && (f.endsWith('.d.ts') || f.endsWith('.map')));
assert.equal(
  declarationOrMap.length, 0,
  `.d.ts/.map are compile-time-only, must never ship in the vsix:\n${declarationOrMap.join('\n')}`,
);

// commander's finding: every assertion above only checks "new things must not leak in" - none of them
// would catch this lane's `.vscodeignore` negation rule (`!cli/dist/shared/**/*.js`) accidentally
// breaking an EXISTING inclusion instead, e.g. by matching more broadly than intended and shadowing the
// `out/**` files package.json's own "main" needs. `package.json`'s "main" field is the actual contract
// VS Code reads to find the extension's entrypoint - assert it by reading that field, not by hardcoding
// the path a second time and letting the two silently drift apart.
const packageJson = JSON.parse(await fs.readFile(path.join(repository, 'package.json'), 'utf8'));
assert.ok(
  posixFiles.includes(packageJson.main.replace(/^\.\//, '')),
  `package.json's "main" (${packageJson.main}) must be present in the packaged vsix - got none. This is ` +
  `the extension's real entrypoint; without it VS Code cannot activate the extension at all, regardless ` +
  `of anything else in this file list:\n${posixFiles.join('\n')}`,
);
const outJsCount = posixFiles.filter(f => f.startsWith('out/') && f.endsWith('.js')).length;
assert.ok(
  outJsCount >= 20,
  `expected at least 20 compiled out/**/*.js files (a rough floor - this repo's compiled extension has ` +
  `far more than that today), got ${outJsCount} - a partial out/** inclusion would still pass every ` +
  `other check in this file if it happened to keep extension.js itself`,
);

console.log(`vsce ls: ${posixFiles.length} files total, ${sharedJs.length} under cli/dist/shared/**/*.js, none forbidden.`);

// 2. Size tripwire - `vsce ls` reports paths only, not bytes, so this needs a real package.
const temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'impact-lens-vsix-'));
try {
  const outputVsix = path.join(temporary, 'impact-lens.vsix');
  run('npx', ['--yes', '@vscode/vsce', 'package', '--no-yarn', '--out', outputVsix]);
  const { size } = await fs.stat(outputVsix);
  const sizeMb = size / (1024 * 1024);
  // Loose on purpose (this milestone's own latency-gate style: catch an unbounded regression, not
  // normal variance) - a vsix accidentally including cli/node_modules/pyright alone would be tens of MB,
  // an order of magnitude over this. Tighten once a real baseline size is on record from an actual
  // release build.
  const MAX_SIZE_MB = 5;
  assert.ok(
    sizeMb < MAX_SIZE_MB,
    `packaged vsix is ${sizeMb.toFixed(2)}MB, expected under ${MAX_SIZE_MB}MB - likely a node_modules or ` +
    'other unintended inclusion regression',
  );
  console.log(`vsce package: ${sizeMb.toFixed(2)}MB (< ${MAX_SIZE_MB}MB tripwire).`);
} finally {
  await fs.rm(temporary, { recursive: true, force: true });
}

console.log('\nWhat this proves: the packaged vsix\'s file list and size are what this lane intends.');
console.log('What this does NOT prove: that VS Code can actually load and activate this vsix, or that');
console.log('the FastAPI-augmented queries work once installed - this repo has no extension-host harness');
console.log('for that yet (recorded in docs/work/task-m4-gate2-shared-adapter.md, not silently skipped).');
