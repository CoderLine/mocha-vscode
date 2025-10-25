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
import { captureTestRun, expectTestTree, getController } from '../util';
import { defaultTestSymbols } from '../../settings';

describe('typescript-full', () => {
  async function getFullController() {
    const c = await getController(false);
    c.settings.extractSettings.setValue({
      ...defaultTestSymbols,
      extractWith: 'evaluation-cjs-full',
    });
    await c.scanFiles();
    return c;
  }

  it('discovers tests', async () => {
    const c = await getFullController();
    c.settings.extractSettings.setValue({
      ...defaultTestSymbols,
      extractWith: 'evaluation-cjs-full',
    });

    expectTestTree(c, [
      ['hello.test.ts', [['math', [['addition'], ['dynamic1'], ['dynamic2'], ['subtraction']]]]],
    ]);
  });

  it('runs tests', async () => {
    const c = await getFullController();
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
      'hello.test.ts/math/dynamic1': ['enqueued', 'started', 'passed'],
      'hello.test.ts/math/dynamic2': ['enqueued', 'started', 'passed'],
    });
  });

  it('debugs tests', async () => {
    const c = await getFullController();
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
      'hello.test.ts/math/dynamic1': ['enqueued', 'started', 'passed'],
      'hello.test.ts/math/dynamic2': ['enqueued', 'started', 'passed'],
    });
  });
});
