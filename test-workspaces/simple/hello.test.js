const { strictEqual } = require('node:assert');

describe('math', () => {
  it('addition', async () => {
    strictEqual(1 + 1, 2);
  });

  it('subtraction', async () => {
    strictEqual(1 - 1, 0);
  });
  it('failing', async () => {
    strictEqual(1 * 1, 0);
  });
});
