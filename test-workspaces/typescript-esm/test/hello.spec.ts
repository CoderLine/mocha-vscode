import { strictEqual } from 'node:assert';

import { fileURLToPath, URL } from 'node:url';

const importMetaDirname = fileURLToPath(new URL('.', import.meta.url));
describe('import-meta', () => {
  it('dirname', async () => {
    strictEqual(typeof importMetaDirname, 'string');
  });
});
