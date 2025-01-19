/**
 * Copyright (C) Daniel Kuschny (Danielku15) and contributors.
 * Copyright (C) Microsoft Corporation. All rights reserved.
 *
 * Use of this source code is governed by an MIT-style
 * license that can be found in the LICENSE file or at
 * https://opensource.org/licenses/MIT.
 */

import { expect } from 'chai';
import * as path from 'path';
import * as vscode from 'vscode';
import { captureTestRun, expectTestTree, getController } from '../util';

describe('typescript', () => {
  it('discovers tests', async () => {
    const c = await getController();

    expectTestTree(c, [
      ['hello.test.ts', [['math', [['addition'], ['failing'], ['subtraction']]]]],
    ]);
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
      'hello.test.ts/math/failing': ['enqueued', 'started', 'failed'],
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
      'hello.test.ts/math/failing': ['enqueued', 'started', 'failed'],
    });
  });

  it('correct failing test location', async () => {
    const c = await getController();
    const run = await captureTestRun(
      c,
      new vscode.TestRunRequest(
        [c.ctrl.items.get('hello.test.ts')!.children.get('math')!.children.get('failing')!],
        undefined,
        c.profiles.find((p) => p.kind === vscode.TestRunProfileKind.Run),
      ),
    );

    run.expectStates({
      'hello.test.ts/math/failing': ['enqueued', 'started', 'failed'],
    });

    const failed = run.states.find((s) => s.state === 'failed')!;

    expect(failed.message).to.not.be.undefined;
    expect(failed.message?.location).to.not.be.undefined;
    expect(failed.message?.location?.uri.toString()).to.include('hello.test.ts');
    expect(path.isAbsolute(failed.message!.location!.uri.fsPath)).to.be.true;
    expect(failed.message?.location?.range.start.line).to.equal(28);
    expect(failed.message?.location?.range.start.character).to.equal(4);
  });
});
