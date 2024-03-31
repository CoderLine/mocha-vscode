/*---------------------------------------------------------
 * Copyright (C) OpenJS Foundation and contributors, https://openjsf.org
 * Copyright (C) Microsoft Corporation. All rights reserved.
 *--------------------------------------------------------*/

import { expect } from 'chai';
import { defaultTestSymbols } from '../../../constants';
import { NodeKind } from '../../../extract';
import { extractWithEvaluation } from '../../../extract/evaluate';
import { source } from '../../util';

describe('evaluate typescript', () => {
  it('extracts basic suite', async () => {
    const src = await extractWithEvaluation(
      undefined,
      'test.ts',
      source(
        "suite('hello', () => {", //
        "  it('works', () => {});",
        '})',
      ),
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

  it('extracts basic suite ts syntax', async () => {
    const src = await extractWithEvaluation(
      undefined,
      'test.ts',
      source(
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
      ),
      defaultTestSymbols,
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
      undefined,
      'test.ts',
      source(
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
      ),
      defaultTestSymbols,
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
});
