/**
 * Copyright (C) Daniel Kuschny (Danielku15) and contributors.
 * Copyright (C) Microsoft Corporation. All rights reserved.
 *
 * Use of this source code is governed by an MIT-style
 * license that can be found in the LICENSE file or at
 * https://opensource.org/licenses/MIT.
 */

import { expect } from 'chai';
import { EvaluationTestDiscoverer } from '../../../discoverer/evaluate';
import { NodeKind } from '../../../discoverer/types';
import { TsConfigStore } from '../../../tsconfig-store';
import { source } from '../../util';
import { ExtensionSettings } from '../../../settings';

describe('evaluate', () => {
  function extractWithEvaluation(...lines: string[]) {
    const settings = new ExtensionSettings();

    try {
      const discoverer = new EvaluationTestDiscoverer(undefined, settings, new TsConfigStore());
      return discoverer.discover('test.js', source(...lines));
    } finally {
      settings.dispose();
    }
  }

  it('extracts basic suite', async () => {
    const src = await extractWithEvaluation(
      "suite('hello', () => {", //
      "  it('works', () => {});",
      '})'
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
            children: []
          }
        ]
      }
    ]);
  });

  it('can evaluate and extract a test table', async () => {
    const src = await extractWithEvaluation(
      "suite('hello', () => {", //
      "  for (const name of ['foo', 'bar', 'baz']) {",
      '    it(name, () => {});',
      '  }',
      '})'
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
            children: []
          },
          {
            name: 'bar',
            kind: NodeKind.Test,
            startLine: 2,
            startColumn: 4,
            endLine: 2,
            endColumn: Number.MAX_SAFE_INTEGER,
            children: []
          },
          {
            name: 'baz',
            kind: NodeKind.Test,
            startLine: 2,
            startColumn: 4,
            endLine: 2,
            endColumn: Number.MAX_SAFE_INTEGER,
            children: []
          }
        ]
      }
    ]);
  });
  it('handles errors appropriately', async () => {
    const src = await extractWithEvaluation(
      "suite('hello', () => {", //
      "  throw new Error('whoops');",
      '})'
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
        error: 'whoops'
      }
    ]);
  });
  it('works with skip/only', async () => {
    const src = await extractWithEvaluation(
      "suite('hello', () => {", //
      "  it.only('a', ()=>{});",
      "  it.skip('a', ()=>{});",
      '})'
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
            directive: 'only'
          },
          {
            name: 'a',
            kind: NodeKind.Test,
            startLine: 2,
            startColumn: 5,
            endLine: 2,
            endColumn: Number.MAX_SAFE_INTEGER,
            children: [],
            directive: 'skip'
          }
        ]
      }
    ]);
  });

  it('works with pending test', async () => {
    const src = await extractWithEvaluation(
      "suite('hello', () => {", //
      "  it('works');",
      '})'
    );
    expect(src).to.deep.equal([
      {
        name: 'hello',
        startLine: 0,
        kind: NodeKind.Suite,
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
            children: []
          }
        ]
      }
    ]);
  });

  it('works with pending suite', async () => {
    const src = await extractWithEvaluation("suite('hello')");
    expect(src).to.deep.equal([
      {
        name: 'hello',
        startLine: 0,
        kind: NodeKind.Suite,
        startColumn: 0,
        endColumn: Number.MAX_SAFE_INTEGER,
        endLine: 0,
        children: []
      }
    ]);
  });

  it('stubs out requires and placeholds correctly', async () => {
    const src = await extractWithEvaluation('require("some invalid module").doing().other.things()');
    expect(src).to.deep.equal([]);
  });

  it('runs esbuild-style modules', async () => {
    const src = await extractWithEvaluation("var foo = () => suite('hello', () => {}); foo();");
    expect(src).to.deep.equal([
      {
        name: 'hello',
        kind: 0,
        startLine: 0,
        startColumn: 16,
        endLine: 0,
        endColumn: Number.MAX_SAFE_INTEGER,
        children: []
      }
    ]);
  });
});
