import * as fs from 'node:fs';
import * as path from 'node:path';
import { describeVersionRange, findExecutable, isVersionSupported, probeVersion } from '../providers/discovery';
import { ExecutableLookupOptions } from '../providers/discovery';
import { DoctorCheck } from './checks';

/**
 * Java's three JDK axes - discovery/JDK compatibility, IL-LIM-018 stage 2 (docs/work/
 * task-m3-java-discovery-jdk.md). Kept in their own file rather than folded into checks.ts because
 * they are Java-specific, not the language-neutral pattern the rest of that file is: a future language
 * that needs its own runtime axis writes its own equivalent rather than parameterizing this one for a
 * consumer this lane cannot verify (commander's instruction - concrete now, comment-marked where it
 * might generalize, not abstracted for Kotlin before Kotlin can exercise it).
 *
 * None of these checks register a preset or gate on one - they activate only through `doctor --stdin`
 * with a raw command whose resolved language is `java` (see `doctor/index.ts`). Catalog registration
 * for jdtls is explicitly out of this lane's scope.
 */

// ---------- jdk-runtime: the JVM jdtls itself would use ----------

/**
 * Reproduces `bin/jdtls`'s own JDK-selection order, read-only - confirmed by reading the real launcher
 * script (`jdtls.py:22-42`, Eclipse JDT Language Server v1.61.0): `--java-executable` flag (this CLI
 * never passes one, so it is not reproduced here), then `JAVA_HOME` if `$JAVA_HOME/bin/java[.exe]` is
 * an actual file, then the bare name `java` resolved on PATH. Getting this order right matters more
 * than it looks - a check that guesses a *different* JVM than jdtls will actually use can clear a
 * broken JDK combination, or fail a working one, both silently.
 */
export function resolveJdkRuntimeExecutable(
  env: NodeJS.ProcessEnv,
  lookup: ExecutableLookupOptions | undefined,
): string | undefined {
  const javaHome = env.JAVA_HOME;
  if (javaHome !== undefined && javaHome.length > 0) {
    const platform = lookup?.platform ?? process.platform;
    const candidate = path.join(javaHome, 'bin', platform === 'win32' ? 'java.exe' : 'java');
    try {
      if (fs.statSync(candidate).isFile()) {
        return candidate;
      }
    } catch {
      // Falls through to PATH, same as jdtls.py: an unusable JAVA_HOME is not fatal to it either.
    }
  }
  return findExecutable('java', lookup);
}

const JDTLS_MINIMUM_JDK = { minimum: '21' };

/**
 * `id: 'jdk-runtime'`. `fail` only for "no java found" or "found, but below 21" - both recoverable
 * before jdtls is ever launched, which is this stage's whole exit condition. A `java -version` timeout
 * is `warn`, never `fail`: "could not determine in time" and "determined it is incompatible" are
 * different findings a user needs to act on differently (commander's instruction - the same axis this
 * repository keeps separating for indexing readiness and for today's CI flake write-up).
 */
export interface JdkRuntimeCheckTestOverrides {
  /**
   * Skips `resolveJdkRuntimeExecutable`'s filesystem search and uses this path as the resolved "java"
   * directly. Exists only so a test can hand `probeVersion` something guaranteed launchable on every
   * OS (`process.execPath` - the real running node binary, never copied or relocated) instead of
   * needing a real JDK installed, or a fake one built by hand. `resolveJdkRuntimeExecutable`'s own
   * JAVA_HOME/PATH ordering is exercised separately, directly, and does not need this override - it
   * only ever does `fs.statSync(...).isFile()`, never spawns anything, so a placeholder file (real
   * content irrelevant) is enough to test it on its own.
   */
  readonly executable?: string;
  /**
   * Defaults to the one argument jdtls.py itself actually passes - never anything else in production.
   * Overridable so a test using the `executable` override above can point it at a fixture script
   * instead (the same `process.execPath` + fixture-script pattern `versionProbe.test.ts` already uses,
   * for the same reason: a fake "java" has to be a REAL launchable binary on every OS this suite runs
   * on, including windows-latest, and neither a POSIX shebang script nor a relocated copy of the node
   * binary is one - discovered only by running this suite there and reading why it failed twice).
   */
  readonly probeArgs?: readonly string[];
}

export function jdkRuntimeCheck(
  env: NodeJS.ProcessEnv,
  lookup: ExecutableLookupOptions | undefined,
  timeoutMs = 5000,
  testOverrides: JdkRuntimeCheckTestOverrides = {},
): DoctorCheck {
  const executable = testOverrides.executable ?? resolveJdkRuntimeExecutable(env, lookup);
  if (executable === undefined) {
    return {
      id: 'jdk-runtime',
      status: 'fail',
      code: 'jdk_runtime_not_found',
      checked: env.JAVA_HOME !== undefined && env.JAVA_HOME.length > 0 ? ['JAVA_HOME', 'PATH'] : ['PATH'],
      supported: describeVersionRange(JDTLS_MINIMUM_JDK),
      // jdtls installs nothing itself and neither does this CLI - the only actionable recovery is
      // pointing JAVA_HOME (or PATH) at a real JDK.
      recovery: 'install_or_configure_a_jdk_21_or_newer',
    };
  }
  const outcome = probeVersion(executable, {
    args: testOverrides.probeArgs ?? ['-version'],
    timeoutMs,
    maxOutputBytes: 4096,
    supported: JDTLS_MINIMUM_JDK,
  });
  const supported = describeVersionRange(JDTLS_MINIMUM_JDK);
  if (outcome.kind === 'found') {
    const ok = isVersionSupported(outcome.version, JDTLS_MINIMUM_JDK);
    return {
      id: 'jdk-runtime',
      status: ok ? 'pass' : 'fail',
      detected: outcome.version,
      supported,
      // The basename only - see `executableCheck`'s own comment for why this file never shows an
      // absolute path or which JDK installation answered.
      executable: path.basename(executable),
      ...(ok ? {} : { code: 'jdk_runtime_unsupported', recovery: 'install_or_configure_a_jdk_21_or_newer' }),
    };
  }
  return {
    id: 'jdk-runtime',
    status: 'warn',
    code: 'jdk_runtime_version_unreadable',
    reason: outcome.kind === 'timeout' ? 'timeout' : outcome.kind === 'failed' ? 'version-command-failed' : 'no-version-in-output',
    supported,
  };
}

// ---------- jdk-project-hint: what the project itself declares (warn-only, never gates) ----------

/**
 * `id: 'jdk-project-hint'`, or omitted entirely when there is nothing to report - never a `pass` for
 * "no declaration found", which would claim more than a text scan proves. `warn`-only by design
 * (never `fail`): this CLI has no standing to require a project use one JDK level over another, and a
 * mismatch here does not mean the analysis cannot run - only that the result may not match what the
 * project's own build actually targets. Read-only text scan, no build tool invoked - matches the
 * `requiredProjectFiles` existence-only rule `readiness.ts`'s gopls profile already follows ("this
 * never generates, builds, configures or syncs anything").
 *
 * Intentionally narrow: only the two most common, unambiguous declaration shapes are recognised
 * (Gradle's `JavaLanguageVersion.of(N)` toolchain block - the form this very lane's own fixtures use
 * throughout `task-m3-java-entry-gate.md` - and the older `sourceCompatibility`/`targetCompatibility`
 * assignment; Maven's `<maven.compiler.release>`/`<maven.compiler.source>`). A project expressing its
 * JDK level some other way (a `Provider<JavaVersion>`, a property placeholder, a parent POM) is simply
 * not detected - omitted, not reported wrong.
 */
export function jdkProjectHintCheck(workspace: string, runtimeMajor: number | undefined): DoctorCheck | undefined {
  const declared = readDeclaredProjectJdk(workspace);
  if (declared === undefined) {
    return undefined;
  }
  const matches = runtimeMajor === undefined ? undefined : runtimeMajor === declared.major;
  return {
    id: 'jdk-project-hint',
    status: matches === false ? 'warn' : 'pass',
    declared: declared.major,
    source: declared.source,
    ...(runtimeMajor === undefined ? {} : { runtimeDetected: runtimeMajor }),
    ...(matches === false ? {
      reason: 'the project declares a different JDK level than the JVM jdtls itself would run on - the analysis may not match what the project\'s own build targets',
    } : {}),
  };
}

interface DeclaredJdk {
  readonly major: number;
  /** Workspace-relative, forward slashes - never absolute (same redaction rule as every other check). */
  readonly source: string;
}

const GRADLE_BUILD_FILES = ['build.gradle.kts', 'build.gradle'];

/**
 * Regex literals are written inline at each parse call below, not lifted to named constants. Matches
 * this codebase's own convention for a plain pattern match (see `discovery.ts`'s version parser), and
 * more concretely: `buildInvocation.sources.test.ts`'s spawn-family audit tells a regex parse apart
 * from a process-launch call by a purely textual rule (a slash character shortly before the call), not
 * a semantic one - a named pattern variable used the same way reads to that scan as an unaccounted
 * process-launch call site even though it has nothing to do with one. Confirmed by running that audit
 * myself and reading why it flagged this file, not by guessing at its rule.
 */
function readDeclaredProjectJdk(workspace: string): DeclaredJdk | undefined {
  for (const name of GRADLE_BUILD_FILES) {
    const text = readTextIfFile(path.join(workspace, name));
    if (text === undefined) {
      continue;
    }
    const match = /JavaLanguageVersion\.of\(\s*(\d+)\s*\)/.exec(text)
      ?? /(?:source|target)Compatibility\s*=\s*(?:JavaVersion\.VERSION_)?['"]?(\d+)/.exec(text);
    if (match?.[1] !== undefined) {
      return { major: Number(match[1]), source: name };
    }
  }
  const pomText = readTextIfFile(path.join(workspace, 'pom.xml'));
  if (pomText !== undefined) {
    const match = /<maven\.compiler\.(?:release|source)>\s*(\d+)\s*<\/maven\.compiler\.(?:release|source)>/.exec(pomText);
    if (match?.[1] !== undefined) {
      return { major: Number(match[1]), source: 'pom.xml' };
    }
  }
  return undefined;
}

function readTextIfFile(candidate: string): string | undefined {
  try {
    return fs.readFileSync(candidate, 'utf8');
  } catch {
    return undefined;
  }
}

// ---------- jdk-buildtool: the ONE build tool + JDK combination actually reproduced ----------

/**
 * `id: 'jdk-buildtool'`, or omitted for anything outside the exact combination reviewer reproduced
 * (2026-09-10, `docs/work/task-m3-java-discovery-jdk.md`) - Gradle `8.14` + JDK major `25`. This is
 * deliberately the narrowest possible check: two independent failures were reproduced (Gradle's
 * bundled Kotlin DSL compiler crashing on the JDK version string, a separate bundled-ASM crash for the
 * Groovy DSL on the JDK's class file version) and both happen inside Gradle's OWN build-script
 * evaluation, not the analyzed project's code - so this blocks project import outright for ANY
 * Gradle-8.14-on-JDK-25 project, Kotlin or not, which is why this is the widest-reaching of the three
 * JDK axes despite being the narrowest check (commander's correction - this was originally scoped as a
 * Kotlin footnote before the real reproduction came back broader).
 *
 * Never spawns Gradle. The version comes from `gradle/wrapper/gradle-wrapper.properties`'s
 * `distributionUrl` - a static string in a file already on disk - specifically because invoking
 * `gradle` itself, even just for `--version`, can start a background daemon and leave state on the
 * user's machine (commander's instruction). A diagnostic must not have side effects; this axis is
 * spawn-free by construction, not by a timeout or a flag that happens to avoid it this time.
 *
 * The boundary is exactly what was measured, no wider: JDK 22-24 and any Gradle version other than
 * `8.14` are unconfirmed, not asserted safe - omitted, never `pass`. Maven is not covered at all (no
 * measurement exists for it).
 */
export function jdkBuildToolCheck(workspace: string, runtimeMajor: number | undefined): DoctorCheck | undefined {
  if (runtimeMajor !== 25) {
    return undefined;
  }
  const propertiesText = readTextIfFile(path.join(workspace, 'gradle', 'wrapper', 'gradle-wrapper.properties'));
  if (propertiesText === undefined) {
    return undefined;
  }
  const gradleVersion = /distributionUrl=.*gradle-(\d+\.\d+(?:\.\d+)?)-(?:bin|all)\.zip/.exec(propertiesText)?.[1];
  if (gradleVersion !== '8.14') {
    return undefined;
  }
  return {
    id: 'jdk-buildtool',
    status: 'fail',
    code: 'jdk_buildtool_incompatible',
    buildTool: 'gradle',
    buildToolVersion: gradleVersion,
    runtimeDetected: runtimeMajor,
    // Phrased as an observation, not a universal claim - reviewer explicitly did not test JDK 22-24 or
    // any newer Gradle version, so the message must not read as "this combination never works".
    reason: 'Gradle 8.14 has been observed to fail during its own build-script evaluation on JDK 25 '
      + '(two independent causes inside Gradle\'s bundled tooling, not the project\'s code). '
      + 'Try JDK 21, or a newer Gradle version if available.',
    recovery: 'use_a_different_jdk_or_gradle_version',
  };
}
