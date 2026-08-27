import * as fs from 'node:fs';
import { request, respond, serve } from './mockServer';

// A server that refuses to initialize until it has the settings it needs, and checks that what it
// gets is what the client was told to send.
//
// It is the oracle for three separate things that only work together:
//   - the client declares `workspace.configuration`, without which a spec-abiding server would never
//     ask and the whole answer path would be unreachable outside a mock;
//   - `initializationOptions` carries the resolved tree instead of the hardcoded `{}`;
//   - the answer to `workspace/configuration` matches the lookup rules for the sections asked about.
//
// IMPACT_LENS_MOCK_EXPECT_INIT_OPTIONS  JSON the initialize request must carry.
// IMPACT_LENS_MOCK_CONFIG_ITEMS         JSON ConfigurationParams.items to ask for.
// IMPACT_LENS_MOCK_EXPECT_CONFIG        JSON the answer must equal.
// IMPACT_LENS_MOCK_SETTINGS_LOG         File to append `didChangeConfiguration:<json>` to.

const expectedInitOptions = process.env.IMPACT_LENS_MOCK_EXPECT_INIT_OPTIONS ?? '{}';
const items = JSON.parse(process.env.IMPACT_LENS_MOCK_CONFIG_ITEMS ?? '[{"section":"impactLens"}]');
const expectedConfig = process.env.IMPACT_LENS_MOCK_EXPECT_CONFIG ?? '[null]';
const settingsLog = process.env.IMPACT_LENS_MOCK_SETTINGS_LOG;

serve(message => {
  if (message.method === 'initialize' && message.id !== undefined) {
    const params = message.params as {
      readonly initializationOptions?: unknown;
      readonly capabilities?: { readonly workspace?: Record<string, unknown>; readonly window?: Record<string, unknown> };
    };
    if (params?.capabilities?.workspace?.configuration !== true) {
      die('client did not declare workspace.configuration');
      return;
    }
    if (params?.capabilities?.window?.workDoneProgress !== true) {
      die('client did not declare window.workDoneProgress');
      return;
    }
    if (JSON.stringify(params?.initializationOptions) !== expectedInitOptions) {
      die(`initializationOptions was ${JSON.stringify(params?.initializationOptions)}`);
      return;
    }
    const initializeId = message.id;
    request('workspace/configuration', { items }, {
      timeoutMs: 4000,
      onResponse: response => {
        if (JSON.stringify(response.result) !== expectedConfig) {
          die(`workspace/configuration answered ${JSON.stringify(response.result)}`);
          return;
        }
        respond(initializeId, {
          capabilities: { callHierarchyProvider: true },
          serverInfo: { name: 'settings-required-server', version: '1.0.0' },
        });
      },
      onTimeout: () => die('no client answer to workspace/configuration'),
    });
    return;
  }
  if (message.method === 'workspace/didChangeConfiguration') {
    const settings = (message.params as { readonly settings?: unknown } | undefined)?.settings;
    if (settingsLog) {
      fs.appendFileSync(settingsLog, `didChangeConfiguration:${JSON.stringify(settings)}\n`);
    }
    return;
  }
  if (message.method === 'textDocument/prepareCallHierarchy' && message.id !== undefined) {
    respond(message.id, []);
    return;
  }
  if (message.method === 'shutdown' && message.id !== undefined) {
    respond(message.id, null);
    return;
  }
  if (message.method === 'exit') {
    process.exit(0);
  }
});

function die(reason: string): void {
  process.stderr.write(`settings-required-server: ${reason}\n`, () => process.exit(1));
}
