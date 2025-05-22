/**
 * Copyright (C) Daniel Kuschny (Danielku15) and contributors.
 * Copyright (C) Microsoft Corporation. All rights reserved.
 *
 * Use of this source code is governed by an MIT-style
 * license that can be found in the LICENSE file or at
 * https://opensource.org/licenses/MIT.
 */

import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import { setTimeout } from 'node:timers/promises';
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

    // especially on MacOS we often get a wrong / early file change detected causing a scan
    // that's why we retry multiple times here.
    for (let retry = 0; retry < 3; retry++) {
      const configPath = path.join(workspaceFolder, 'package.json');
      const original = await fs.readFile(configPath, 'utf-8');
      let updated = original.replace('**/*.test.js', '*.test.js');

      // the vscode file watcher is set up async and does not always catch the change, keep changing the file
      // biome-ignore lint/suspicious/noConfusingVoidType: Needed on setTimeout
      let ok: boolean | void = false;
      while (!ok) {
        updated += '\n';
        const onChange = onceScanComplete(c);
        await fs.writeFile(configPath, updated);
        ok = await Promise.race([onChange.then(() => true), setTimeout(1000)]);
      }

      try {
        expectTestTree(c, [
          ['hello.test.js', [['math', [['addition'], ['failing'], ['subtraction']]]]],
        ]);
        return;
      } catch (e) {
        // ignore
      }
    }

    expectTestTree(c, [
      ['hello.test.js', [['math', [['addition'], ['failing'], ['subtraction']]]]],
    ]);
  });
});
