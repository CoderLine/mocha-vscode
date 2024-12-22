import assert, { strictEqual } from 'node:assert';

import { fileURLToPath, URL } from 'node:url';

assert(import.meta.url, 'import.meta.url is required');
const importMetaDirname = fileURLToPath(new URL('.', import.meta.url));

describe('import-meta', () => {
  it('dirname', async () => {
    strictEqual(typeof importMetaDirname, 'string');
    strictEqual(typeof __dirname, 'string');
    strictEqual(importMetaDirname, __dirname + '/');
  });
});
