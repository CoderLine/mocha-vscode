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

describe('typescript-esm', () => {
  it('discovers tests', async () => {
    const c = await getController();

    expectTestTree(c, [['test', [['hello.spec.ts', [['import-meta', [['dirname']]]]]]]]);
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
        profiles.find(p => p.kind === vscode.TestRunProfileKind.Run)
      )
    );

    run.expectStates({
      'test/hello.spec.ts/import-meta/dirname': ['enqueued', 'started', 'passed']
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
        profiles.find(p => p.kind === vscode.TestRunProfileKind.Debug)
      )
    );

    run.expectStates({
      'test/hello.spec.ts/import-meta/dirname': ['enqueued', 'started', 'passed']
    });
  });
});
