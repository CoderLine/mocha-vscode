/*---------------------------------------------------------
 * Copyright (C) Microsoft Corporation. All rights reserved.
 *--------------------------------------------------------*/

import { expect } from 'chai';
import { NodeKind } from '.';
import { defaultTestSymbols } from '../constants';
import { extractWithEvaluation } from './evaluate';

describe('evaluate', () => {
  it('extracts basic suite', () => {
    const src = extractWithEvaluation(
      `suite('hello', () => {
      it('works', () => {});
    })`,
      defaultTestSymbols,
    );
    expect(src).to.deep.equal([
      {
        name: 'hello',
        kind: NodeKind.Suite,
        startLine: 1,
        startColumn: 1,
        children: [
          { name: 'works', kind: NodeKind.Test, startLine: 2, startColumn: 7, children: [] },
        ],
      },
    ]);
  });

  it('can evaluate and extract a test table', () => {
    const src = extractWithEvaluation(
      `suite('hello', () => {
      for (const name of ['foo', 'bar', 'baz']) {
        it(name, () => {});
      }
    })`,
      defaultTestSymbols,
    );
    expect(src).to.deep.equal([
      {
        name: 'hello',
        kind: NodeKind.Suite,
        startLine: 1,
        startColumn: 1,
        children: [
          { name: 'foo', kind: NodeKind.Test, startLine: 3, startColumn: 9, children: [] },
          { name: 'bar', kind: NodeKind.Test, startLine: 3, startColumn: 9, children: [] },
          { name: 'baz', kind: NodeKind.Test, startLine: 3, startColumn: 9, children: [] },
        ],
      },
    ]);
  });
  it('handles errors appropriately', () => {
    const src = extractWithEvaluation(
      `suite('hello', () => {
        throw new Error('whoops');
    })`,
      defaultTestSymbols,
    );
    expect(src).to.deep.equal([
      {
        name: 'hello',
        kind: NodeKind.Suite,
        startLine: 1,
        startColumn: 1,
        children: [],
        error: 'whoops',
      },
    ]);
  });
  it('works with skip/only', () => {
    const src = extractWithEvaluation(
      `suite('hello', () => {
        it.only('a', ()=>{});
        it.skip('a', ()=>{});
    })`,
      defaultTestSymbols,
    );
    expect(src).to.deep.equal([
      {
        name: 'hello',
        kind: NodeKind.Suite,
        startLine: 1,
        startColumn: 1,
        children: [
          {
            name: 'a',
            kind: NodeKind.Test,
            startLine: 2,
            startColumn: 12,
            children: [],
            directive: 'only',
          },
          {
            name: 'a',
            kind: NodeKind.Test,
            startLine: 3,
            startColumn: 12,
            children: [],
            directive: 'skip',
          },
        ],
      },
    ]);
  });

  it('stubs out requires and placeholds correctly', () => {
    const src = extractWithEvaluation(
      `require("some invalid module").doing().other.things()`,
      defaultTestSymbols,
    );
    expect(src).to.deep.equal([]);
  });
});
