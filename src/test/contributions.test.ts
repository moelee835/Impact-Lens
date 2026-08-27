import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import test from 'node:test';

interface ConfigurationProperty {
  readonly type?: string;
  readonly scope?: string;
  readonly enum?: readonly string[];
}

const manifest = JSON.parse(
  fs.readFileSync(path.resolve(__dirname, '..', '..', 'package.json'), 'utf8'),
) as {
  contributes: {
    configuration: { properties: Record<string, ConfigurationProperty> };
    commands: ReadonlyArray<{ command: string; title: string }>;
  };
};

const properties = manifest.contributes.configuration.properties;

// A workspace-settable value that reaches a shell is a way for a repository to hand the person who opens
// it a command line and have it presented as their own. The confirmation prompt in
// `src/controller.ts:runProviderDoctor` cannot close that hole, because it cannot tell the reader whether
// the command came from them or from the folder they just opened. The trust boundary has to be closed in
// the manifest instead, and this test is what keeps it closed.
test('the doctor command line can only come from user settings', () => {
  const property = properties['impactLens.provider.doctorCommandLine'];
  assert.ok(property, 'the setting should exist');
  assert.equal(property.scope, 'machine');
  // `machine-overridable` is the trap here: it reads like a stricter scope but hands the override back to
  // remote and workspace settings, which is exactly the path being closed.
  assert.notEqual(property.scope, 'machine-overridable');
});

// Forward-looking form of the same rule. A free-form string is the shape a value takes when it can carry a
// path, a command or an argument list, so a new one has to state a deliberate decision about scope.
test('every free-form string setting declares a scope decision', () => {
  // Add an id here only with a reason: the value must not be able to reach a process, a shell or a file
  // write when it comes from a workspace the user has merely opened.
  const workspaceSettableStrings: readonly string[] = [];

  const undecided = Object.entries(properties)
    .filter(([, property]) => property.type === 'string' && !property.enum)
    .filter(([id, property]) => property.scope !== 'machine' && !workspaceSettableStrings.includes(id))
    .map(([id]) => id);
  assert.deepEqual(undecided, []);
});

test('every contributed command is declared with a title', () => {
  for (const command of manifest.contributes.commands) {
    assert.ok(command.command.startsWith('impactLens.'), `${command.command} should be namespaced`);
    assert.ok(command.title.length > 0, `${command.command} needs a title`);
  }
  const ids = manifest.contributes.commands.map(command => command.command);
  assert.ok(ids.includes('impactLens.runProviderDoctor'));
});
