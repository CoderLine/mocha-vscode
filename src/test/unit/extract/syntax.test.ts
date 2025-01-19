/**
 * Copyright (C) Daniel Kuschny (Danielku15) and contributors.
 * Copyright (C) Microsoft Corporation. All rights reserved.
 *
 * Use of this source code is governed by an MIT-style
 * license that can be found in the LICENSE file or at
 * https://opensource.org/licenses/MIT.
 */

import { expect } from 'chai';
import { ConfigValue } from '../../../configValue';
import { defaultTestSymbols } from '../../../constants';
import { SyntaxTestDiscoverer } from '../../../discoverer/syntax';
import { NodeKind } from '../../../discoverer/types';
import { TsConfigStore } from '../../../tsconfig-store';
import { source } from '../../util';

describe('syntax', () => {
  function extractWithAst(...lines: string[]) {
    const discoverer = new SyntaxTestDiscoverer(
      new ConfigValue('', defaultTestSymbols),
      new TsConfigStore(),
    );
    return discoverer.discover('test.js', source(...lines));
  }

  it('extracts basic suite', async () => {
    const src = await extractWithAst(
      "suite('hello', () => {", //
      "  it('works', () => {});",
      '})',
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

  it('works with skip/only', async () => {
    const src = await extractWithAst(
      "suite('hello', () => {", //
      "  it.only('a', ()=>{});",
      "  it.skip('a', ()=>{});",
      '})',
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

  it('works with pending test', async () => {
    const src = await extractWithAst(
      "suite('hello', () => {", //
      "  it('works');",
      '})',
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
            endColumn: 13,
            endLine: 1,
            children: [],
          },
        ],
      },
    ]);
  });

  it('works with pending suite', async () => {
    const src = await extractWithAst("suite('hello')");
    expect(src).to.deep.equal([
      {
        name: 'hello',
        startLine: 0,
        kind: NodeKind.Suite,
        startColumn: 0,
        endColumn: 14,
        endLine: 0,
        children: [],
      },
    ]);
  });

  it('can detect suite but not dynamic tests', async () => {
    const src = await extractWithAst(
      "suite('hello', () => {", //
      "  for (const name of ['foo', 'bar', 'baz']) {",
      '    it(name, () => {});',
      '  }',
      '})',
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

  it('stubs out requires and placeholds correctly', async () => {
    const src = await extractWithAst('require("some invalid module").doing().other.things()');
    expect(src).to.deep.equal([]);
  });
});
