/*---------------------------------------------------------
 * Copyright (C) OpenJS Foundation and contributors, https://openjsf.org
 * Copyright (C) Microsoft Corporation. All rights reserved.
 *--------------------------------------------------------*/

import { expect } from 'chai';
import { defaultTestSymbols } from '../../constants';
import { NodeKind } from '../../extract';
import { extractWithEvaluation } from '../../extract/evaluate';

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
        endColumn: 5,
        endLine: 3,
        children: [
          {
            name: 'works',
            kind: NodeKind.Test,
            startLine: 2,
            startColumn: 7,
            endColumn: Number.MAX_SAFE_INTEGER,
            endLine: 2,
            children: [],
          },
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
        endColumn: 5,
        endLine: 5,
        children: [
          {
            name: 'foo',
            kind: NodeKind.Test,
            startLine: 3,
            startColumn: 9,
            endLine: 3,
            endColumn: Number.MAX_SAFE_INTEGER,
            children: [],
          },
          {
            name: 'bar',
            kind: NodeKind.Test,
            startLine: 3,
            startColumn: 9,
            endLine: 3,
            endColumn: Number.MAX_SAFE_INTEGER,
            children: [],
          },
          {
            name: 'baz',
            kind: NodeKind.Test,
            startLine: 3,
            startColumn: 9,
            endLine: 3,
            endColumn: Number.MAX_SAFE_INTEGER,
            children: [],
          },
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
        endLine: 3,
        endColumn: 5,
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
        endLine: 4,
        endColumn: 5,
        children: [
          {
            name: 'a',
            kind: NodeKind.Test,
            startLine: 2,
            startColumn: 12,
            endLine: 2,
            endColumn: Number.MAX_SAFE_INTEGER,
            children: [],
            directive: 'only',
          },
          {
            name: 'a',
            kind: NodeKind.Test,
            startLine: 3,
            startColumn: 12,
            endLine: 3,
            endColumn: Number.MAX_SAFE_INTEGER,
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

  it('runs esbuild-style modules', () => {
    const src = extractWithEvaluation(
      `var foo = () => suite('hello', () => {}); foo();`,
      defaultTestSymbols,
    );
    expect(src).to.deep.equal([
      {
        name: 'hello',
        kind: 0,
        startLine: 1,
        startColumn: 17,
        endLine: 1,
        endColumn: Number.MAX_SAFE_INTEGER,
        children: [],
      },
    ]);
  });
});
