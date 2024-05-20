const { strictEqual } = require('node:assert');

describe.skip('skip-suite-1', () => {
  it('addition', async () => {
    strictEqual(1 + 1, 2);
  });

  it('subtraction', async () => {
    strictEqual(1 - 1, 0);
  });
});

describe('skip-suite-2', () => {
  it.skip('addition', async () => {
    strictEqual(1 + 1, 2);
  });

  it('subtraction', async () => {
    strictEqual(1 - 1, 0);
  });
});
