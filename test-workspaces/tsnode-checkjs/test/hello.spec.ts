import { strictEqual } from 'node:assert';

describe('math', () => {
  it('addition', async () => {
    strictEqual((1 + 1) as number, 2 as any as number);
  });
});
