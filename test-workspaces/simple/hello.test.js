const { strictEqual } = require('node:assert');

describe('math', () => {
  it('addition', async () => {
    strictEqual(1 + 1, 2);
  });

  it(`subtraction`, async () => {
    strictEqual(1 - 1, 0);
  });
});
