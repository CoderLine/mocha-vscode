/**
 * Copyright (C) Daniel Kuschny (Danielku15) and contributors.
 * Copyright (C) Microsoft Corporation. All rights reserved.
 *
 * Use of this source code is governed by an MIT-style
 * license that can be found in the LICENSE file or at
 * https://opensource.org/licenses/MIT.
 */

import { expect } from 'chai';
import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import { setTimeout } from 'node:timers/promises';
import * as vscode from 'vscode';
import {
  captureTestRun,
  expectTestTree,
  getController,
  integrationTestPrepare,
  onceChanged,
  onceScanComplete
} from '../util';

describe('simple', () => {
  const workspaceFolder = integrationTestPrepare('simple');

  it('discovers tests', async () => {
    const c = await getController();

    expectTestTree(c, [
      ['folder', [['nested.test.js', [['is nested']]]]],
      ['goodbye.test.js', [['math', [['division']]]]],
      ['hello.test.js', [['math', [['addition'], ['failing'], ['subtraction']]]]],
      [
        'skip.test.js',
        [
          ['skip-suite-1', [['addition'], ['subtraction']]],
          ['skip-suite-2', [['addition'], ['subtraction']]]
        ]
      ],
      ['stacktrace.test.js', [['stacktrace', [['should parse error location correctly']]]]]
    ]);
  });

  it('handles file delete', async () => {
    const c = await getController();
    const onChange = onceChanged(c);

    await fs.rm(path.join(workspaceFolder, 'hello.test.js'));
    await onChange;

    expectTestTree(c, [
      ['folder', [['nested.test.js', [['is nested']]]]],
      ['goodbye.test.js', [['math', [['division']]]]],
      [
        'skip.test.js',
        [
          ['skip-suite-1', [['addition'], ['subtraction']]],
          ['skip-suite-2', [['addition'], ['subtraction']]]
        ]
      ],
      ['stacktrace.test.js', [['stacktrace', [['should parse error location correctly']]]]]
    ]);
  });

  it('cleans up folder if all child files are deleted', async () => {
    const c = await getController();
    const onChange = onceChanged(c);

    await fs.rm(path.join(workspaceFolder, 'folder/nested.test.js'));
    await onChange;

    expectTestTree(c, [
      ['goodbye.test.js', [['math', [['division']]]]],
      ['hello.test.js', [['math', [['addition'], ['failing'], ['subtraction']]]]],
      [
        'skip.test.js',
        [
          ['skip-suite-1', [['addition'], ['subtraction']]],
          ['skip-suite-2', [['addition'], ['subtraction']]]
        ]
      ],
      ['stacktrace.test.js', [['stacktrace', [['should parse error location correctly']]]]]
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
      `
    );
    await onChange;

    expectTestTree(c, [
      ['folder', [['nested.test.js', [['is nested']]]]],
      ['goodbye.test.js', [['math', [['division']]]]],
      ['hello.test.js', [['subtraction']]],
      [
        'skip.test.js',
        [
          ['skip-suite-1', [['addition'], ['subtraction']]],
          ['skip-suite-2', [['addition'], ['subtraction']]]
        ]
      ],

      ['stacktrace.test.js', [['stacktrace', [['should parse error location correctly']]]]]
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
        profiles.find(p => p.kind === vscode.TestRunProfileKind.Run)
      )
    );

    run.expectStates({
      'goodbye.test.js/math/division': ['enqueued', 'started', 'passed'],
      'hello.test.js/math/addition': ['enqueued', 'started', 'passed'],
      'hello.test.js/math/subtraction': ['enqueued', 'started', 'passed'],
      'hello.test.js/math/failing': ['enqueued', 'started', 'failed'],
      'folder/nested.test.js/is nested': ['enqueued', 'started', 'passed'],
      'skip.test.js/skip-suite-1/addition': ['enqueued', 'skipped'],
      'skip.test.js/skip-suite-1/subtraction': ['enqueued', 'skipped'],
      'skip.test.js/skip-suite-2/addition': ['enqueued', 'skipped'],
      'skip.test.js/skip-suite-2/subtraction': ['enqueued', 'started', 'passed'],
      'stacktrace.test.js/stacktrace/should parse error location correctly': ['enqueued', 'started', 'failed']
    });
  });

  it('runs tests in directory', async () => {
    const c = await getController();
    const run = await captureTestRun(
      c,
      new vscode.TestRunRequest(
        [c.ctrl!.items.get('folder')!],
        undefined,
        c.profiles.find(p => p.kind === vscode.TestRunProfileKind.Run)
      )
    );

    run.expectStates({
      'folder/nested.test.js/is nested': ['enqueued', 'started', 'passed']
    });
  });

  it('runs tests in a file', async () => {
    const c = await getController();
    const run = await captureTestRun(
      c,
      new vscode.TestRunRequest(
        [c.ctrl!.items.get('hello.test.js')!],
        undefined,
        c.profiles.find(p => p.kind === vscode.TestRunProfileKind.Run)
      )
    );

    run.expectStates({
      'hello.test.js/math/addition': ['enqueued', 'started', 'passed'],
      'hello.test.js/math/subtraction': ['enqueued', 'started', 'passed'],
      'hello.test.js/math/failing': ['enqueued', 'started', 'failed']
    });
  });

  it('debugs tests in a file', async () => {
    const c = await getController();
    const run = await captureTestRun(
      c,
      new vscode.TestRunRequest(
        [c.ctrl!.items.get('hello.test.js')!],
        undefined,
        c.profiles.find(p => p.kind === vscode.TestRunProfileKind.Debug)
      )
    );

    run.expectStates({
      'hello.test.js/math/addition': ['enqueued', 'started', 'passed'],
      'hello.test.js/math/subtraction': ['enqueued', 'started', 'passed'],
      'hello.test.js/math/failing': ['enqueued', 'started', 'failed']
    });
  });

  it('runs subsets of tests', async () => {
    const c = await getController();
    const run = await captureTestRun(
      c,
      new vscode.TestRunRequest(
        [c.ctrl!.items.get('hello.test.js')!.children.get('math')!.children.get('addition')!],
        undefined,
        c.profiles.find(p => p.kind === vscode.TestRunProfileKind.Run)
      )
    );

    run.expectStates({
      'hello.test.js/math/addition': ['enqueued', 'started', 'passed']
    });
  });

  it('correct failing test location', async () => {
    const c = await getController();
    const run = await captureTestRun(
      c,
      new vscode.TestRunRequest(
        [c.ctrl!.items.get('hello.test.js')!.children.get('math')!.children.get('failing')!],
        undefined,
        c.profiles.find(p => p.kind === vscode.TestRunProfileKind.Run)
      )
    );

    run.expectStates({
      'hello.test.js/math/failing': ['enqueued', 'started', 'failed']
    });

    const failed = run.states.find(s => s.state === 'failed')!;

    expect(failed.message).to.not.be.undefined;
    expect(failed.message?.location).to.not.be.undefined;
    expect(failed.message?.location?.uri.toString()).to.include('hello.test.js');
    expect(path.isAbsolute(failed.message!.location!.uri.fsPath)).to.be.true;
    expect(failed.message?.location?.range.start.line).to.equal(11);
    expect(failed.message?.location?.range.start.character).to.equal(4);
  });

  it('handles file and directory excludes', async () => {
    const c = await getController();
    const run = await captureTestRun(
      c,
      new vscode.TestRunRequest(
        undefined,
        [c.ctrl!.items.get('hello.test.js')!, c.ctrl!.items.get('folder')!],
        c.profiles.find(p => p.kind === vscode.TestRunProfileKind.Run)
      )
    );

    run.expectStates({
      'goodbye.test.js/math/division': ['enqueued', 'started', 'passed'],
      'skip.test.js/skip-suite-1/addition': ['enqueued', 'skipped'],
      'skip.test.js/skip-suite-1/subtraction': ['enqueued', 'skipped'],
      'skip.test.js/skip-suite-2/addition': ['enqueued', 'skipped'],
      'skip.test.js/skip-suite-2/subtraction': ['enqueued', 'started', 'passed'],
      'stacktrace.test.js/stacktrace/should parse error location correctly': ['enqueued', 'started', 'failed']
    });
  });

  it('handles changes to .mocharc.js', async () => {
    const c = await getController();
    const onChange = onceScanComplete(c);

    const configPath = path.join(workspaceFolder, '.mocharc.js');
    const original = await fs.readFile(configPath, 'utf-8');
    let updated = original.replace('**/*.test.js', '*.test.js');

    // the vscode file watcher is set up async and does not always catch the change, keep changing the file
    // biome-ignore lint/suspicious/noConfusingVoidType: needed for setTimeout
    let ok: boolean | void = false;
    while (!ok) {
      updated += '\n//';
      await fs.writeFile(configPath, updated);
      ok = await Promise.race([onChange.then(() => true), setTimeout(1000)]);
    }

    expectTestTree(c, [
      ['goodbye.test.js', [['math', [['division']]]]],
      ['hello.test.js', [['math', [['addition'], ['failing'], ['subtraction']]]]],
      [
        'skip.test.js',
        [
          ['skip-suite-1', [['addition'], ['subtraction']]],
          ['skip-suite-2', [['addition'], ['subtraction']]]
        ]
      ],
      ['stacktrace.test.js', [['stacktrace', [['should parse error location correctly']]]]]
    ]);
  });

  it('parses error stacktrace correctly', async () => {
    const c = await getController();
    const profiles = c.profiles;
    expect(profiles).to.have.lengthOf(2);

    const item = c.ctrl!.items.get('stacktrace.test.js')!;
    const run = await captureTestRun(
      c,
      new vscode.TestRunRequest(
        [item],
        undefined,
        profiles.find(p => p.kind === vscode.TestRunProfileKind.Run)
      )
    );

    run.expectStates({
      'stacktrace.test.js/stacktrace/should parse error location correctly': ['enqueued', 'started', 'failed']
    });

    const failed = run.states.find(s => s.state === 'failed');
    expect(failed!.message!.location!.range.start.line).to.equal(3);
    expect(failed!.message!.location!.range.start.character).to.equal(10);
    expect(failed!.message!.location!.range.end.line).to.equal(3);
    expect(failed!.message!.location!.range.end.character).to.equal(10);
    expect(failed!.message!.location!.uri.fsPath).to.equal(item.uri!.fsPath);
  });
});
