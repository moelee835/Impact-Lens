import * as os from 'node:os';

process.stderr.write(`token=top-secret home=${os.homedir()} final-stderr-line\n`, () => {
  process.exit(1);
});
