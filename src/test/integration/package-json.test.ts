/**
 * Copyright (C) Daniel Kuschny (Danielku15) and contributors.
 * Copyright (C) Microsoft Corporation. All rights reserved.
 *
 * Use of this source code is governed by an MIT-style
 * license that can be found in the LICENSE file or at
 * https://opensource.org/licenses/MIT.
 */

import { promises as fs } from 'fs';
import * as path from 'path';
import { setTimeout } from 'timers/promises';
import * as vscode from 'vscode';
import {
  captureTestRun,
  expectTestTree,
  getController,
  integrationTestPrepare,
  onceScanComplete,
} from '../util';

describe('package-json', () => {
  const workspaceFolder = integrationTestPrepare('package-json');

  it('discovers tests', async () => {
    const c = await getController();

    expectTestTree(c, [
      ['folder', [['nested.test.js', [['is nested']]]]],
      ['hello.test.js', [['math', [['addition'], ['failing'], ['subtraction']]]]],
    ]);
  });

  it('runs tests in a file', async () => {
    const c = await getController();
    const run = await captureTestRun(
      c,
      new vscode.TestRunRequest(
        [c.ctrl!.items.get('hello.test.js')!],
        undefined,
        c.profiles.find((p) => p.kind === vscode.TestRunProfileKind.Run),
      ),
    );

    run.expectStates({
      'hello.test.js/math/addition': ['enqueued', 'started', 'passed'],
      'hello.test.js/math/subtraction': ['enqueued', 'started', 'passed'],
      'hello.test.js/math/failing': ['enqueued', 'started', 'failed'],
    });
  });

  it('debugs tests in a file', async () => {
    const c = await getController();
    const run = await captureTestRun(
      c,
      new vscode.TestRunRequest(
        [c.ctrl!.items.get('hello.test.js')!],
        undefined,
        c.profiles.find((p) => p.kind === vscode.TestRunProfileKind.Debug),
      ),
    );

    run.expectStates({
      'hello.test.js/math/addition': ['enqueued', 'started', 'passed'],
      'hello.test.js/math/subtraction': ['enqueued', 'started', 'passed'],
      'hello.test.js/math/failing': ['enqueued', 'started', 'failed'],
    });
  });

  it('handles changes to package.json', async () => {
    const c = await getController();

    expectTestTree(c, [
      ['folder', [['nested.test.js', [['is nested']]]]],
      ['hello.test.js', [['math', [['addition'], ['failing'], ['subtraction']]]]],
    ]);

    const onChange = onceScanComplete(c);

    const configPath = path.join(workspaceFolder, 'package.json');
    const original = await fs.readFile(configPath, 'utf-8');
    let updated = original.replace('**/*.test.js', '*.test.js');

    // the vscode file watcher is set up async and does not always catch the change, keep changing the file
    let ok: boolean | void = false;
    while (!ok) {
      updated += '\n';
      await fs.writeFile(configPath, updated);
      ok = await Promise.race([onChange.then(() => true), setTimeout(1000)]);
    }

    expectTestTree(c, [
      ['hello.test.js', [['math', [['addition'], ['failing'], ['subtraction']]]]],
    ]);
  });
});
