/*---------------------------------------------------------
 * Copyright (C) OpenJS Foundation and contributors, https://openjsf.org
 * Copyright (C) Microsoft Corporation. All rights reserved.
 *--------------------------------------------------------*/

import { expect } from 'chai';
import { defaultTestSymbols } from '../../../constants';
import { NodeKind } from '../../../extract';
import { extractWithEvaluation } from '../../../extract/evaluate';

describe('evaluate', () => {
  it('extracts basic suite', async () => {
    const src = await extractWithEvaluation(
      'test.js',
      [
        "suite('hello', () => {",
        "  it('works', () => {});",
        "})"
      ].join('\n'),
      defaultTestSymbols,
    );
    expect(src).to.deep.equal([
      {
        name: 'hello',
        kind: NodeKind.Suite,
        startLine: 0,
        startColumn: 0,
        endColumn: 1,
        endLine: 2,
        children: [
          {
            name: 'works',
            kind: NodeKind.Test,
            startLine: 1,
            startColumn: 2,
            endColumn: Number.MAX_SAFE_INTEGER,
            endLine: 1,
            children: [],
          },
        ],
      },
    ]);
  });

  it('can evaluate and extract a test table', async () => {
    const src = await extractWithEvaluation(
      'test.js',
      [
        "suite('hello', () => {",
        "  for (const name of ['foo', 'bar', 'baz']) {",
        "    it(name, () => {});",
        "  }",
        "})"
      ].join('\n'),
      defaultTestSymbols,
    );
    expect(src).to.deep.equal([
      {
        name: 'hello',
        kind: NodeKind.Suite,
        startLine: 0,
        startColumn: 0,
        endColumn: 1,
        endLine: 4,
        children: [
          {
            name: 'foo',
            kind: NodeKind.Test,
            startLine: 2,
            startColumn: 4,
            endLine: 2,
            endColumn: Number.MAX_SAFE_INTEGER,
            children: [],
          },
          {
            name: 'bar',
            kind: NodeKind.Test,
            startLine: 2,
            startColumn: 4,
            endLine: 2,
            endColumn: Number.MAX_SAFE_INTEGER,
            children: [],
          },
          {
            name: 'baz',
            kind: NodeKind.Test,
            startLine: 2,
            startColumn: 4,
            endLine: 2,
            endColumn: Number.MAX_SAFE_INTEGER,
            children: [],
          },
        ],
      },
    ]);
  });
  it('handles errors appropriately', async () => {
    const src = await extractWithEvaluation(
      'test.js',
      [
        "suite('hello', () => {",
        "  throw new Error('whoops');",
        "})"
      ].join('\n')
      ,
      defaultTestSymbols,
    );
    expect(src).to.deep.equal([
      {
        name: 'hello',
        kind: NodeKind.Suite,
        startLine: 0,
        startColumn: 0,
        endLine: 2,
        endColumn: 1,
        children: [],
        error: 'whoops',
      },
    ]);
  });
  it('works with skip/only', async () => {
    const src = await extractWithEvaluation(
      'test.js',
      [
        "suite('hello', () => {",
        "  it.only('a', ()=>{});",
        "  it.skip('a', ()=>{});",
        "})"
      ].join('\n')
      ,
      defaultTestSymbols,
    );
    expect(src).to.deep.equal([
      {
        name: 'hello',
        kind: NodeKind.Suite,
        startLine: 0,
        startColumn: 0,
        endLine: 3,
        endColumn: 1,
        children: [
          {
            name: 'a',
            kind: NodeKind.Test,
            startLine: 1,
            startColumn: 5, // marked at the begin of only()
            endLine: 1,
            endColumn: Number.MAX_SAFE_INTEGER,
            children: [],
            directive: 'only',
          },
          {
            name: 'a',
            kind: NodeKind.Test,
            startLine: 2,
            startColumn: 5,
            endLine: 2,
            endColumn: Number.MAX_SAFE_INTEGER,
            children: [],
            directive: 'skip',
          },
        ],
      },
    ]);
  });

  it('stubs out requires and placeholds correctly', async () => {
    const src = await extractWithEvaluation(
      'test.js',
      `require("some invalid module").doing().other.things()`,
      defaultTestSymbols,
    );
    expect(src).to.deep.equal([]);
  });

  it('runs esbuild-style modules', async () => {
    const src = await extractWithEvaluation(
      'test.js',
      `var foo = () => suite('hello', () => {}); foo();`,
      defaultTestSymbols,
    );
    expect(src).to.deep.equal([
      {
        name: 'hello',
        kind: 0,
        startLine: 0,
        startColumn: 16,
        endLine: 0,
        endColumn: Number.MAX_SAFE_INTEGER,
        children: [],
      },
    ]);
  });
});
