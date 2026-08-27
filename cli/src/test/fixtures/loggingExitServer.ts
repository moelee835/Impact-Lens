import { notify, serve } from './mockServer';

// Reports its own diagnostics over window/logMessage and then dies without touching stderr, which is
// exactly how the bundled TypeScript Language Server behaves: it never writes to stderr at all.
serve(message => {
  if (message.method === 'initialize') {
    notify('window/logMessage', { type: 3, message: `Using Typescript version (bundled) 5.9.3 from ${process.env.HOME}/lib` });
    notify('window/logMessage', { type: 1, message: 'tsserver exited unexpectedly. token=super-secret' });
    process.exit(1);
  }
});
