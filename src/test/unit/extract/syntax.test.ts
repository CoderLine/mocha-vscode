/*---------------------------------------------------------
 * Copyright (C) OpenJS Foundation and contributors, https://openjsf.org
 * Copyright (C) Microsoft Corporation. All rights reserved.
 *--------------------------------------------------------*/

import { expect } from 'chai';
import { defaultTestSymbols } from '../../../constants';
import { NodeKind } from '../../../extract';
import { extractWithAst } from '../../../extract/syntax';

describe('syntax', () => {
  it('extracts basic suite', () => {
    const src = extractWithAst(
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
        startLine: 0,
        kind: NodeKind.Suite,
        startColumn: 0,
        endColumn: 2,
        endLine: 2,
        children: [
          {
            name: 'works',
            kind: NodeKind.Test,
            startLine: 1,
            startColumn: 2,
            endColumn: 23,
            endLine: 1,
            children: [],
          },
        ],
      },
    ]);
  });

  it('works with skip/only', () => {
    const src = extractWithAst(
      'test.js',
      [
        "suite('hello', () => {",
        "  it.only('a', ()=>{});",
        "  it.skip('a', ()=>{});",
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
        endColumn: 2,
        endLine: 3,
        children: [
          {
            name: 'a',
            kind: NodeKind.Test,
            startLine: 1,
            startColumn: 2,
            endColumn: 22,
            endLine: 1,
            children: [],
            directive: 'only',
          },
          {
            name: 'a',
            kind: NodeKind.Test,
            startLine: 2,
            startColumn: 2,
            endColumn: 22,
            endLine: 2,
            children: [],
            directive: 'skip',
          },
        ],
      },
    ]);
  });

  it('can detect suite but not dynamic tests', () => {
    const src = extractWithAst(
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
        endColumn: 2,
        endLine: 4,
        children: [],
      },
    ]);
  });

  it('stubs out requires and placeholds correctly', () => {
    const src = extractWithAst(
      'test.js',
      `require("some invalid module").doing().other.things()`,
      defaultTestSymbols,
    );
    expect(src).to.deep.equal([]);
  });
});
