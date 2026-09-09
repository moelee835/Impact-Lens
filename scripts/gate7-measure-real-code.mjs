#!/usr/bin/env node
// M4 gate 7 (docs/work/task-m4-gate7-budget-and-real-code-measurement.md) real-code measurement
// script for `fastapi-static-v1`. Committed per that document's 3-0 decision: a pinned commit hash
// plus prose is not reproducible by itself - this script plus the commit hash is a one-line rerun.
//
// Usage:
//   node scripts/gate7-measure-real-code.mjs precision <cliDistIndexJs> <workspace> <relFile> <defName> [maxNodes]
//   node scripts/gate7-measure-real-code.mjs latency <cliDistIndexJs> <workspace> <relFile> <defName> [reps]
//   node scripts/gate7-measure-real-code.mjs walk-order <workspace> <relFile...>
//
// `precision` queries the CLI (augmentationEnabled: true) for the given def's incoming
// `augmentedEdges` and prints them for manual classification against a hand-built census.
// `latency` runs the SAME query with augmentationEnabled true/false N times and reports the median
// delta - the adapter's own added cost, isolated from CLI/pyright startup noise that dominates total
// wall time.
// `walk-order` replicates `walkPythonFiles()`'s exact traversal order (readdir order, skipping
// `IGNORED_DIRECTORIES`, counting only *.py files) to report at what visited-file-count position each
// given file appears - i.e. the minimum `maxFiles` that would have reached it. Read-only, does not
// invoke the CLI.
//
// The target project itself is never committed (license/size/drift reasons, see the work document) -
// clone it at the pinned commit named in that document and pass its local path as `<workspace>`.
import { spawnSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';

const IGNORED_DIRECTORIES = new Set([
  '.git', 'node_modules', 'out', 'dist', '.pnpm-store',
  '__pycache__', 'venv', '.venv', 'env', 'site-packages',
]);

function findDefPosition(workspace, file, name) {
  const abs = path.join(workspace, file);
  const lines = fs.readFileSync(abs, 'utf8').split('\n');
  const defRe = new RegExp(`^(?:\\s*)(?:async\\s+)?def\\s+(${name})\\s*\\(`);
  for (let i = 0; i < lines.length; i++) {
    if (defRe.test(lines[i])) {
      const column = lines[i].indexOf('def ') + 4 + 1;
      return { line: i + 1, column };
    }
  }
  throw new Error(`def ${name} not found in ${abs}`);
}

function runCli(cliPath, workspace, file, line, column, augmentationEnabled) {
  const request = { workspace, file, line, column, depth: 5, maxNodes: 50, augmentationEnabled };
  const start = process.hrtime.bigint();
  const result = spawnSync(process.execPath, [cliPath, 'analyze', '--stdin'], {
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
    input: JSON.stringify(request),
  });
  const elapsedMs = Number(process.hrtime.bigint() - start) / 1e6;
  if (result.status !== 0 && !result.stdout) {
    throw new Error(`CLI failed: ${result.stderr}`);
  }
  return { response: JSON.parse(result.stdout), elapsedMs };
}

function precisionCommand(args) {
  const [cliPath, workspace, file, name, maxNodesArg] = args;
  const { line, column } = findDefPosition(workspace, file, name);
  const { response, elapsedMs } = runCli(cliPath, workspace, file, line, column, true);
  console.log(`=== ${name} @ ${file}:${line}:${column} (elapsed ${elapsedMs.toFixed(0)}ms) ===`);
  console.log('ok:', response.ok);
  if (!response.ok) {
    console.log('error:', JSON.stringify(response.error));
    return;
  }
  const edges = response.data.augmentedEdges ?? [];
  console.log('augmentedEdges count:', edges.length);
  for (const e of edges) console.log('  -', JSON.stringify(e));
  const budgetExceeded = (response.data.limitationDetails ?? []).some(d => d.code === 'augmentation_budget_exceeded');
  console.log('augmentation_budget_exceeded:', budgetExceeded);
}

function latencyCommand(args) {
  const [cliPath, workspace, file, name, repsArg] = args;
  const reps = repsArg ? Number(repsArg) : 5;
  const { line, column } = findDefPosition(workspace, file, name);
  function median(augmentationEnabled) {
    const times = [];
    for (let i = 0; i < reps; i++) {
      times.push(runCli(cliPath, workspace, file, line, column, augmentationEnabled).elapsedMs);
    }
    times.sort((a, b) => a - b);
    return { median: times[Math.floor(times.length / 2)], times };
  }
  const off = median(false);
  const on = median(true);
  console.log(`${name}: off median=${off.median.toFixed(1)}ms on median=${on.median.toFixed(1)}ms delta=${(on.median - off.median).toFixed(1)}ms`);
  console.log(`  off raw: ${off.times.map(t => t.toFixed(0)).join(',')}`);
  console.log(`  on  raw: ${on.times.map(t => t.toFixed(0)).join(',')}`);
}

function walkOrderCommand(args) {
  const [workspace, ...targets] = args;
  const targetSet = new Set(targets.map(t => path.resolve(workspace, t)));
  const found = new Map();
  let count = 0;
  function walk(dir) {
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (IGNORED_DIRECTORIES.has(entry.name)) continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full);
      } else if (entry.isFile() && entry.name.endsWith('.py')) {
        count += 1;
        if (targetSet.has(full)) found.set(full, count);
      }
    }
  }
  walk(workspace);
  console.log(`total .py files walked: ${count}`);
  for (const t of targets) {
    console.log(`${t}: reached at file #${found.get(path.resolve(workspace, t)) ?? 'NOT FOUND'}`);
  }
}

const [, , command, ...rest] = process.argv;
const commands = { precision: precisionCommand, latency: latencyCommand, 'walk-order': walkOrderCommand };
if (!commands[command]) {
  console.error('usage: gate7-measure-real-code.mjs <precision|latency|walk-order> ...');
  process.exit(2);
}
commands[command](rest);
