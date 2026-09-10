// Read-only JVM project-model discovery: is there a build system (Gradle/Maven) telling jdtls what
// belongs together, or is this workspace flying without one?
//
// Why this exists: Lane J (docs/work/task-m3-java-project-import-readiness.md) ran a real end-to-end
// query against the real jdtls binary on a build-system-free, multi-file fixture (two separate .java
// files, one genuinely calling the other) and got back an empty `incomingCalls` - reported honestly as
// `no_incoming_callers`, never silently, but still the wrong shape of honesty: the user reads "no
// caller" when the real situation is "this configuration cannot see across files at all." jdtls itself
// reported `ready` throughout (readiness is about indexing progress, not about whether a project model
// exists), so `readiness`/`index_state_unknown` cannot catch this - it is a different axis, exactly the
// one IL-LIM-018 stage 3's exit condition names separately ("project not imported" vs indexing/ready/
// query failure). This module supplies the signal for that first axis, the same way
// `compileDatabase.ts` supplies the signal C/C++'s silent-fallback problem needs (same root shape: a
// provider degrades without saying so at the protocol level, so this CLI has to look at project state
// itself rather than trust the response alone).
//
// The IL-LIM-018 entry gate lane (docs/work/task-m3-java-entry-gate.md) only ever verified standalone
// mode with a SINGLE file - not multiple files with no build system. That is the exact boundary this
// module draws: no marker and only one source file is the verified case (no limitation attached); no
// marker and more than one source file is unverified (limitation attached).
//
// Never generates, configures, syncs or builds anything (IL-LIM-018's own excluded scope, same rule
// compileDatabase.ts follows for C/C++): markers are read, never written, and no Gradle/Maven process
// is ever spawned.

import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { JvmProjectModelObservation } from '../types';

/**
 * Workspace-root markers only, not a directory search like `compileDatabase.ts`'s
 * `CANDIDATE_DIRECTORIES`: jdtls's `-data` (this CLI's `workspaceRoot` $ref, `preset.ts`) is keyed to
 * the workspace root, so the root is the one place a Gradle/Maven project's own entry point can be.
 * `settings.gradle(.kts)` is included even though it is not itself a build script: its presence alone
 * already tells a multi-module project apart from "no build system", which is all this module needs to
 * know - it does not need to parse which modules it declares.
 */
const GRADLE_MARKERS = ['build.gradle', 'build.gradle.kts', 'settings.gradle', 'settings.gradle.kts'];
const MAVEN_MARKERS = ['pom.xml'];

const IGNORED_DIRECTORIES = new Set(['.git', 'node_modules', 'out', 'dist', 'build', 'target', '.gradle']);
const JAVA_EXTENSION = '.java';

async function exists(file: string): Promise<boolean> {
  try {
    await fs.stat(file);
    return true;
  } catch {
    return false;
  }
}

async function firstExistingMarker(workspace: string, markers: readonly string[]): Promise<boolean> {
  for (const marker of markers) {
    if (await exists(path.join(workspace, marker))) {
      return true;
    }
  }
  return false;
}

/**
 * True as soon as a second `.java` file is found anywhere under `root` - never a full count, and never
 * more than the two `readdir` calls a genuine two-file answer needs, because the only question this
 * asks is "one file or more than one", not "how many". Directories `IGNORED_DIRECTORIES` names (build
 * output, VCS, dependency caches) are skipped so a project's own build artifacts never manufacture a
 * false "multiple files" reading.
 */
async function hasMultipleJavaFiles(root: string, found: { count: number }): Promise<boolean> {
  let entries;
  try {
    entries = await fs.readdir(root, { withFileTypes: true });
  } catch {
    return false;
  }
  for (const entry of entries) {
    if (entry.isDirectory()) {
      if (IGNORED_DIRECTORIES.has(entry.name)) {
        continue;
      }
      if (await hasMultipleJavaFiles(path.join(root, entry.name), found)) {
        return true;
      }
    } else if (entry.isFile() && path.extname(entry.name) === JAVA_EXTENSION) {
      found.count += 1;
      if (found.count >= 2) {
        return true;
      }
    }
  }
  return false;
}

/**
 * Read-only discovery of JVM project-model state for a workspace.
 *
 * Only ever called for a `java` request (gated by `JVM_LANGUAGE_IDS` in `preset.ts`, mirroring how
 * `compileDatabase.ts` is gated by `C_FAMILY_LANGUAGE_IDS`) - a non-JVM request never pays for this.
 */
export async function inspectJvmProjectModel(workspace: string): Promise<JvmProjectModelObservation> {
  if (await firstExistingMarker(workspace, GRADLE_MARKERS)) {
    return { status: 'present', marker: 'gradle' };
  }
  if (await firstExistingMarker(workspace, MAVEN_MARKERS)) {
    return { status: 'present', marker: 'maven' };
  }
  const multipleSourceFiles = await hasMultipleJavaFiles(workspace, { count: 0 });
  return { status: 'missing', multipleSourceFiles };
}
