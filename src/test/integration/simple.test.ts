/**
 * Copyright (C) Daniel Kuschny (Danielku15) and contributors.
 * Copyright (C) Microsoft Corporation. All rights reserved.
 *
 * Use of this source code is governed by an MIT-style
 * license that can be found in the LICENSE file or at
 * https://opensource.org/licenses/MIT.
 */

import { expect } from 'chai';
import { promises as fs } from 'fs';
import * as path from 'path';
import { setTimeout } from 'timers/promises';
import * as vscode from 'vscode';
import {
  captureTestRun,
  expectTestTree,
  getController,
  integrationTestPrepare,
  onceChanged,
  onceScanComplete,
} from '../util';

describe('simple', () => {
  const workspaceFolder = integrationTestPrepare('simple');

  it('discovers tests', async () => {
    const c = await getController();

    await expectTestTree(c, [
      ['folder', [['nested.test.js', [['is nested']]]]],
      ['goodbye.test.js', [['math', [['division']]]]],
      ['hello.test.js', [['math', [['addition'], ['subtraction']]]]],
      [
        'skip.test.js',
        [
          ['skip-suite-1', [['addition'], ['subtraction']]],
          ['skip-suite-2', [['addition'], ['subtraction']]],
        ],
      ],
    ]);
  });

  it('handles file delete', async () => {
    const c = await getController();
    const onChange = onceChanged(c);

    await fs.rm(path.join(workspaceFolder, 'hello.test.js'));
    await onChange;

    await expectTestTree(c, [
      ['folder', [['nested.test.js', [['is nested']]]]],
      ['goodbye.test.js', [['math', [['division']]]]],
      [
        'skip.test.js',
        [
          ['skip-suite-1', [['addition'], ['subtraction']]],
          ['skip-suite-2', [['addition'], ['subtraction']]],
        ],
      ],
    ]);
  });

  it('cleans up folder if all child files are deleted', async () => {
    const c = await getController();
    const onChange = onceChanged(c);

    await fs.rm(path.join(workspaceFolder, 'folder/nested.test.js'));
    await onChange;

    await expectTestTree(c, [
      ['goodbye.test.js', [['math', [['division']]]]],
      ['hello.test.js', [['math', [['addition'], ['subtraction']]]]],
      [
        'skip.test.js',
        [
          ['skip-suite-1', [['addition'], ['subtraction']]],
          ['skip-suite-2', [['addition'], ['subtraction']]],
        ],
      ],
    ]);
  });

  it('handles file change', async () => {
    const c = await getController();
    const onChange = onceChanged(c);

    await fs.writeFile(
      path.join(workspaceFolder, 'hello.test.js'),
      `
        test("subtraction", () => {
          strictEqual(1 - 2, -1);
        });
      `,
    );
    await onChange;

    await expectTestTree(c, [
      ['folder', [['nested.test.js', [['is nested']]]]],
      ['goodbye.test.js', [['math', [['division']]]]],
      ['hello.test.js', [['subtraction']]],
      [
        'skip.test.js',
        [
          ['skip-suite-1', [['addition'], ['subtraction']]],
          ['skip-suite-2', [['addition'], ['subtraction']]],
        ],
      ],
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
      'goodbye.test.js/math/division': ['enqueued', 'started', 'passed'],
      'hello.test.js/math/addition': ['enqueued', 'started', 'passed'],
      'hello.test.js/math/subtraction': ['enqueued', 'started', 'passed'],
      'folder/nested.test.js/is nested': ['enqueued', 'started', 'passed'],
      'skip.test.js/skip-suite-1/addition': ['enqueued', 'skipped'],
      'skip.test.js/skip-suite-1/subtraction': ['enqueued', 'skipped'],
      'skip.test.js/skip-suite-2/addition': ['enqueued', 'skipped'],
      'skip.test.js/skip-suite-2/subtraction': ['enqueued', 'started', 'passed'],
    });
  });

  it('runs tests in directory', async () => {
    const c = await getController();
    const run = await captureTestRun(
      c,
      new vscode.TestRunRequest(
        [c.ctrl.items.get('folder')!],
        undefined,
        c.profiles.find((p) => p.kind === vscode.TestRunProfileKind.Run),
      ),
    );

    run.expectStates({
      'folder/nested.test.js/is nested': ['enqueued', 'started', 'passed'],
    });
  });

  it('runs tests in a file', async () => {
    const c = await getController();
    const run = await captureTestRun(
      c,
      new vscode.TestRunRequest(
        [c.ctrl.items.get('hello.test.js')!],
        undefined,
        c.profiles.find((p) => p.kind === vscode.TestRunProfileKind.Run),
      ),
    );

    run.expectStates({
      'hello.test.js/math/addition': ['enqueued', 'started', 'passed'],
      'hello.test.js/math/subtraction': ['enqueued', 'started', 'passed'],
    });
  });

  it('debugs tests in a file', async () => {
    const c = await getController();
    const run = await captureTestRun(
      c,
      new vscode.TestRunRequest(
        [c.ctrl.items.get('hello.test.js')!],
        undefined,
        c.profiles.find((p) => p.kind === vscode.TestRunProfileKind.Debug),
      ),
    );

    run.expectStates({
      'hello.test.js/math/addition': ['enqueued', 'started', 'passed'],
      'hello.test.js/math/subtraction': ['enqueued', 'started', 'passed'],
    });
  });

  it('runs subsets of tests', async () => {
    const c = await getController();
    const run = await captureTestRun(
      c,
      new vscode.TestRunRequest(
        [c.ctrl.items.get('hello.test.js')!.children.get('math')!.children.get('addition')!],
        undefined,
        c.profiles.find((p) => p.kind === vscode.TestRunProfileKind.Run),
      ),
    );

    run.expectStates({
      'hello.test.js/math/addition': ['enqueued', 'started', 'passed'],
    });
  });

  it('handles file and directory excludes', async () => {
    const c = await getController();
    const run = await captureTestRun(
      c,
      new vscode.TestRunRequest(
        undefined,
        [c.ctrl.items.get('hello.test.js')!, c.ctrl.items.get('folder')!],
        c.profiles.find((p) => p.kind === vscode.TestRunProfileKind.Run),
      ),
    );

    run.expectStates({
      'goodbye.test.js/math/division': ['enqueued', 'started', 'passed'],
      'skip.test.js/skip-suite-1/addition': ['enqueued', 'skipped'],
      'skip.test.js/skip-suite-1/subtraction': ['enqueued', 'skipped'],
      'skip.test.js/skip-suite-2/addition': ['enqueued', 'skipped'],
      'skip.test.js/skip-suite-2/subtraction': ['enqueued', 'started', 'passed'],
    });
  });

  it('handles changes to .mocharc.js', async () => {
    const c = await getController();
    const onChange = onceScanComplete(c);

    const configPath = path.join(workspaceFolder, '.mocharc.js');
    const original = await fs.readFile(configPath, 'utf-8');
    let updated = original.replace('**/*.test.js', '*.test.js');

    // the vscode file watcher is set up async and does not always catch the change, keep changing the file
    let ok: boolean | void = false;
    while (!ok) {
      updated += '\n//';
      await fs.writeFile(configPath, updated);
      ok = await Promise.race([onChange.then(() => true), setTimeout(500)]);
    }

    await expectTestTree(c, [
      ['goodbye.test.js', [['math', [['division']]]]],
      ['hello.test.js', [['math', [['addition'], ['subtraction']]]]],
      [
        'skip.test.js',
        [
          ['skip-suite-1', [['addition'], ['subtraction']]],
          ['skip-suite-2', [['addition'], ['subtraction']]],
        ],
      ],
    ]);
  });
});
