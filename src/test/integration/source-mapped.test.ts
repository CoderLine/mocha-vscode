/**
 * Copyright (C) Daniel Kuschny (Danielku15) and contributors.
 * Copyright (C) Microsoft Corporation. All rights reserved.
 *
 * Use of this source code is governed by an MIT-style
 * license that can be found in the LICENSE file or at
 * https://opensource.org/licenses/MIT.
 */

import { expect } from 'chai';
import * as vscode from 'vscode';
import { captureTestRun, expectTestTree, extractParsedNodes, getController } from '../util';
import { NodeKind } from '../../extract';

describe('source mapped', () => {
  it('discovers tests', async () => {
    const c = await getController();

    await expectTestTree(c, [['hello.test.ts', [['math', [['addition'], ['subtraction']]]]]]);
  });

  it('has correct test locations', async () => {
    const c = await getController();

    const src = extractParsedNodes(c.ctrl.items);
    expect(src).to.deep.equal([
      {
        name: 'hello.test.ts',
        kind: NodeKind.Suite,
        startLine: -1,
        startColumn: -1,
        endColumn: -1,
        endLine: -1,
        children: [
          {
            name: 'math',
            kind: NodeKind.Suite,
            startLine: 2,
            startColumn: 0,
            endColumn: 1,
            endLine: 10,
            children: [
              {
                name: 'addition',
                kind: NodeKind.Test,
                startLine: 3,
                startColumn: 2,
                endColumn: 3,
                endLine: 5,
                children: [],
              },
              {
                name: 'subtraction',
                kind: NodeKind.Test,
                startLine: 7,
                startColumn: 2,
                endColumn: 3,
                endLine: 9,
                children: [],
              },
            ],
          },
        ],
      },
    ]);

    await expectTestTree(c, [['hello.test.ts', [['math', [['addition'], ['subtraction']]]]]]);
  });

  it('runs tests', async () => {
    const c = await getController();
    const profiles = c.profiles;
    expect(profiles).to.have.lengthOf(2);

    const run = await captureTestRun(
      c,
      new vscode.TestRunRequest(
        undefined,
        undefined,
        profiles.find((p) => p.kind === vscode.TestRunProfileKind.Run),
      ),
    );

    run.expectStates({
      'hello.test.ts/math/addition': ['enqueued', 'started', 'passed'],
      'hello.test.ts/math/subtraction': ['enqueued', 'started', 'passed'],
    });
  });

  it('debugs tests', async () => {
    const c = await getController();
    const profiles = c.profiles;
    expect(profiles).to.have.lengthOf(2);

    const run = await captureTestRun(
      c,
      new vscode.TestRunRequest(
        undefined,
        undefined,
        profiles.find((p) => p.kind === vscode.TestRunProfileKind.Debug),
      ),
    );

    run.expectStates({
      'hello.test.ts/math/addition': ['enqueued', 'started', 'passed'],
      'hello.test.ts/math/subtraction': ['enqueued', 'started', 'passed'],
    });
  });
});
