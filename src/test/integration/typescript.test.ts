/*---------------------------------------------------------
 * Copyright (C) OpenJS Foundation and contributors, https://openjsf.org
 * Copyright (C) Microsoft Corporation. All rights reserved.
 *--------------------------------------------------------*/

import { expect } from 'chai';
import * as vscode from 'vscode';
import { captureTestRun, expectTestTree, getController, integrationTestPrepare } from '../util';

describe('typescript', () => {
  const workspaceFolder = integrationTestPrepare('typescript');

  it('discovers tests', async () => {
    const c = await getController();

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
