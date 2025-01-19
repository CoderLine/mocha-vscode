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
import { EvaluationTestDiscoverer } from '../../../discoverer/evaluate';
import { NodeKind } from '../../../discoverer/types';
import { TsConfigStore } from '../../../tsconfig-store';
import { source } from '../../util';

describe('evaluate typescript', () => {
  function extractWithEvaluation(...lines: string[]) {
    const discoverer = new EvaluationTestDiscoverer(
      undefined,
      new ConfigValue('', defaultTestSymbols),
      new TsConfigStore(),
    );
    return discoverer.discover('test.ts', source(...lines));
  }

  it('extracts basic suite', async () => {
    const src = await extractWithEvaluation(
      "suite('hello', () => {", //
      "  it('works', () => {});",
      '})',
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

  it('extracts basic suite with import', async () => {
    const src = await extractWithEvaluation(
      "import a from './test';", //
      "suite('hello', () => {",
      "  it('works', () => { a() });",
      '})',
    );
    expect(src).to.deep.equal([
      {
        name: 'hello',
        kind: NodeKind.Suite,
        startLine: 1,
        startColumn: 0,
        endColumn: 1,
        endLine: 3,
        children: [
          {
            name: 'works',
            kind: NodeKind.Test,
            startLine: 2,
            startColumn: 2,
            endColumn: Number.MAX_SAFE_INTEGER,
            endLine: 2,
            children: [],
          },
        ],
      },
    ]);
  });

  it('extracts basic suite ts syntax', async () => {
    const src = await extractWithEvaluation(
      'function topLevel(a: number): string {', //
      '  return a.toString() as string;',
      '}',
      '',
      "suite('hello', () => {",
      '  function inDescribe(a: number): string {',
      '    return a.toString() as string;',
      '  }',
      "  it('works', () => {});",
      '})',
    );
    expect(src).to.deep.equal([
      {
        name: 'hello',
        kind: NodeKind.Suite,
        startLine: 4,
        startColumn: 0,
        endColumn: 1,
        endLine: 9,
        children: [
          {
            name: 'works',
            kind: NodeKind.Test,
            startLine: 8,
            startColumn: 2,
            endColumn: Number.MAX_SAFE_INTEGER,
            endLine: 8,
            children: [],
          },
        ],
      },
    ]);
  });

  it('extracts multiple suite', async () => {
    const src = await extractWithEvaluation(
      "suite('hello', () => {", //
      "  it('works', () => {});",
      '',
      '',
      "  it('works2', () => {});",
      '})',
      '',
      '  ',
      '// ',
      "suite('hello2', () => {",
      "  it('works', () => {});",
      '',
      '',
      "  it('works2', () => {});",
      '})',
    );
    expect(src).to.deep.equal([
      {
        name: 'hello',
        kind: NodeKind.Suite,
        startLine: 0,
        startColumn: 0,
        endColumn: 1,
        endLine: 5,
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
          {
            name: 'works2',
            kind: NodeKind.Test,
            startLine: 4,
            startColumn: 2,
            endColumn: Number.MAX_SAFE_INTEGER,
            endLine: 4,
            children: [],
          },
        ],
      },
      {
        name: 'hello2',
        kind: NodeKind.Suite,
        startLine: 9,
        startColumn: 0,
        endColumn: 1,
        endLine: 14,
        children: [
          {
            name: 'works',
            kind: NodeKind.Test,
            startLine: 10,
            startColumn: 2,
            endColumn: Number.MAX_SAFE_INTEGER,
            endLine: 10,
            children: [],
          },
          {
            name: 'works2',
            kind: NodeKind.Test,
            startLine: 13,
            startColumn: 2,
            endColumn: Number.MAX_SAFE_INTEGER,
            endLine: 13,
            children: [],
          },
        ],
      },
    ]);
  });

  it('works with pending test', async () => {
    const src = await extractWithEvaluation(
      'function topLevel(a: number): string {', //
      '  return a.toString() as string;',
      '}',
      '',
      "suite('hello', () => {", //
      "  it('works');",
      '})',
    );
    expect(src).to.deep.equal([
      {
        name: 'hello',
        kind: NodeKind.Suite,
        startLine: 4,
        startColumn: 0,
        endColumn: 1,
        endLine: 6,
        children: [
          {
            name: 'works',
            kind: NodeKind.Test,
            startLine: 5,
            startColumn: 2,
            endColumn: Number.MAX_SAFE_INTEGER,
            endLine: 5,
            children: [],
          },
        ],
      },
    ]);
  });
});
