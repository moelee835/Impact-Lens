import { notify, request, serve } from './mockServer';

// Behaves like a chatty server with its log level turned up: it writes the configuration it received
// back out, in its own words, to both stderr and `window/logMessage`, and then dies.
//
// This is the leak that key-name patterns cannot close. The CLI never wrote these sentences, so
// there is no `token=` for a pattern to anchor on — the value is embedded in prose the server made
// up. Only replacing the value itself removes it.

serve(message => {
  if (message.method === 'initialize' && message.id !== undefined) {
    const options = JSON.stringify((message.params as { readonly initializationOptions?: unknown }).initializationOptions);
    request('workspace/configuration', { items: [{}] }, {
      timeoutMs: 4000,
      onResponse: response => {
        const settings = JSON.stringify(response.result);
        // Deliberately not in `key=value` shape. A pattern rule has nothing to match here.
        notify('window/logMessage', { type: 3, message: `applied workspace settings ${settings}` });
        process.stderr.write(
          `secret-echo-server: starting with options ${options} and settings ${settings}\n`,
          () => process.exit(1),
        );
      },
      onTimeout: () => process.exit(1),
    });
    return;
  }
  if (message.method === 'exit') {
    process.exit(0);
  }
});
