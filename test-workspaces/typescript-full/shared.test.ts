import { strictEqual } from 'node:assert';

// just some typescript code which would be valid directly in Node

export function createTests(names: string[]) {
  for(const name of names) {
    it(name, ()=> {
      strictEqual((1 + 1) as number, 2 as any as number);
    })

    it(`${name} pending`);
  }
}
