import { strictEqual } from 'node:assert';

// just some typescript code which would be valid directly in Node

function topLevel(a: number): string {
  return a.toString() as string;
}

describe('math', () => {
  function inDescribe(a: number): string {
    return a.toString() as string;
  }
  inDescribe(1);
  topLevel(0);

  it('addition', async () => {
    strictEqual((1 + 1) as number, 2 as any as number);
  });

  it('subtraction', async () => {
    strictEqual((1 - 1) as number, 0 as any as number);
  });

  it('failing', async () => {
    strictEqual((1 * 1) as number, 0 as any as number);
  });

  it('pending');
});
