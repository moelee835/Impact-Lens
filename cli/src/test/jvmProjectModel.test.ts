import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import test from 'node:test';
import { inspectJvmProjectModel } from '../providers/jvmProjectModel';

function temporaryDirectory(t: { after(fn: () => void): void }, prefix: string): string {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  return directory;
}

function writeFile(directory: string, relativePath: string, content: string): void {
  const target = path.join(directory, ...relativePath.split('/'));
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, content);
}

test('an empty workspace reports missing with no source files, so multipleSourceFiles is false', async t => {
  const workspace = temporaryDirectory(t, 'jvmmodel-empty-');
  const observation = await inspectJvmProjectModel(workspace);
  assert.deepEqual(observation, { status: 'missing', multipleSourceFiles: false });
});

test('a single standalone .java file reports missing but multipleSourceFiles is false - the entry gate\'s own verified case', async t => {
  const workspace = temporaryDirectory(t, 'jvmmodel-single-file-');
  writeFile(workspace, 'Fixture.java', 'public class Fixture {}\n');
  const observation = await inspectJvmProjectModel(workspace);
  assert.deepEqual(observation, { status: 'missing', multipleSourceFiles: false });
});

test('two .java files with no build marker reports missing with multipleSourceFiles true - the unverified case Lane J reproduced', async t => {
  const workspace = temporaryDirectory(t, 'jvmmodel-multi-file-');
  writeFile(workspace, 'Target.java', 'public class Target {}\n');
  writeFile(workspace, 'Caller.java', 'public class Caller {}\n');
  const observation = await inspectJvmProjectModel(workspace);
  assert.deepEqual(observation, { status: 'missing', multipleSourceFiles: true });
});

test('two .java files in different subdirectories are still found, not just the root', async t => {
  const workspace = temporaryDirectory(t, 'jvmmodel-multi-file-nested-');
  writeFile(workspace, 'src/main/Target.java', 'public class Target {}\n');
  writeFile(workspace, 'src/test/Caller.java', 'public class Caller {}\n');
  const observation = await inspectJvmProjectModel(workspace);
  assert.deepEqual(observation, { status: 'missing', multipleSourceFiles: true });
});

test('a build.gradle at the root reports present with marker gradle, regardless of file count', async t => {
  const workspace = temporaryDirectory(t, 'jvmmodel-gradle-');
  writeFile(workspace, 'build.gradle', "plugins { id 'java' }\n");
  writeFile(workspace, 'src/main/java/Target.java', 'public class Target {}\n');
  writeFile(workspace, 'src/main/java/Caller.java', 'public class Caller {}\n');
  const observation = await inspectJvmProjectModel(workspace);
  assert.deepEqual(observation, { status: 'present', marker: 'gradle' });
});

test('build.gradle.kts is recognized the same way as build.gradle', async t => {
  const workspace = temporaryDirectory(t, 'jvmmodel-gradle-kts-');
  writeFile(workspace, 'build.gradle.kts', 'plugins { java }\n');
  const observation = await inspectJvmProjectModel(workspace);
  assert.deepEqual(observation, { status: 'present', marker: 'gradle' });
});

test('settings.gradle alone (a multi-module root with no build.gradle of its own) reports present', async t => {
  const workspace = temporaryDirectory(t, 'jvmmodel-settings-gradle-');
  writeFile(workspace, 'settings.gradle', "include 'api', 'core'\n");
  const observation = await inspectJvmProjectModel(workspace);
  assert.deepEqual(observation, { status: 'present', marker: 'gradle' });
});

test('a pom.xml at the root reports present with marker maven', async t => {
  const workspace = temporaryDirectory(t, 'jvmmodel-maven-');
  writeFile(workspace, 'pom.xml', '<project></project>\n');
  writeFile(workspace, 'src/main/java/Target.java', 'public class Target {}\n');
  writeFile(workspace, 'src/main/java/Caller.java', 'public class Caller {}\n');
  const observation = await inspectJvmProjectModel(workspace);
  assert.deepEqual(observation, { status: 'present', marker: 'maven' });
});

test('gradle is checked before maven when, implausibly, both markers exist', async t => {
  const workspace = temporaryDirectory(t, 'jvmmodel-both-');
  writeFile(workspace, 'build.gradle', "plugins { id 'java' }\n");
  writeFile(workspace, 'pom.xml', '<project></project>\n');
  const observation = await inspectJvmProjectModel(workspace);
  assert.deepEqual(observation, { status: 'present', marker: 'gradle' });
});

test('build output and VCS directories are skipped, so their own .java copies never manufacture a false multi-file reading', async t => {
  const workspace = temporaryDirectory(t, 'jvmmodel-ignored-dirs-');
  writeFile(workspace, 'Target.java', 'public class Target {}\n');
  writeFile(workspace, 'build/generated/Target.java', 'public class Target {}\n');
  writeFile(workspace, 'target/classes/Target.java', 'public class Target {}\n');
  writeFile(workspace, '.git/objects/Target.java', 'not really a class\n');
  const observation = await inspectJvmProjectModel(workspace);
  assert.deepEqual(observation, { status: 'missing', multipleSourceFiles: false });
});

test('never generates, configures, syncs or builds anything - a read-only scan writes nothing', async t => {
  const workspace = temporaryDirectory(t, 'jvmmodel-readonly-');
  writeFile(workspace, 'Target.java', 'public class Target {}\n');
  writeFile(workspace, 'Caller.java', 'public class Caller {}\n');
  const before = fs.readdirSync(workspace).sort();
  await inspectJvmProjectModel(workspace);
  assert.deepEqual(fs.readdirSync(workspace).sort(), before);
});
