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

describe('with-hooks', () => {
  it('discovers tests', async () => {
    const c = await getController();

    expectTestTree(c, [
      [
        'hello.test.js',
        [
          ['with beforeAll hook', [['addition'], ['failing'], ['subtraction']]],
          ['with beforeEach hook', [['addition'], ['failing'], ['subtraction']]],
          [
            'with broken after hook (suite must be failed)',
            [['addition'], ['failing'], ['subtraction']],
          ],
          [
            'with broken afterEach hook (suite must be failed)',
            [['addition (success)'], ['failing (skipped)'], ['subtraction (skipped)']],
          ],
          [
            'with broken before hook (suite must be failed)',
            [['addition (skipped)'], ['failing (skipped)'], ['subtraction (skipped)']],
          ],
          [
            'with broken beforeEach hook (suite must be failed)',
            [['addition (skipped)'], ['failing (skipped)'], ['subtraction (skipped)']],
          ],
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
      'hello.test.js/with beforeAll hook/addition': ['enqueued', 'started', 'passed'],
      'hello.test.js/with beforeAll hook/subtraction': ['enqueued', 'started', 'passed'],
      'hello.test.js/with beforeAll hook/failing': ['enqueued', 'started', 'failed'],
      'hello.test.js/with beforeEach hook/addition': ['enqueued', 'started', 'passed'],
      'hello.test.js/with beforeEach hook/subtraction': ['enqueued', 'started', 'passed'],
      'hello.test.js/with beforeEach hook/failing': ['enqueued', 'started', 'failed'],
      'hello.test.js/with broken before hook (suite must be failed)/addition (skipped)': [
        'enqueued',
        'skipped',
      ],
      'hello.test.js/with broken before hook (suite must be failed)/subtraction (skipped)': [
        'enqueued',
        'skipped',
      ],
      'hello.test.js/with broken before hook (suite must be failed)/failing (skipped)': [
        'enqueued',
        'skipped',
      ],
      'hello.test.js/with broken beforeEach hook (suite must be failed)/addition (skipped)': [
        'enqueued',
        'started',
        'skipped',
      ],
      'hello.test.js/with broken beforeEach hook (suite must be failed)/subtraction (skipped)': [
        'enqueued',
        'skipped',
      ],
      'hello.test.js/with broken beforeEach hook (suite must be failed)/failing (skipped)': [
        'enqueued',
        'skipped',
      ],
      'hello.test.js/with broken after hook (suite must be failed)/addition': [
        'enqueued',
        'started',
        'passed',
      ],
      'hello.test.js/with broken after hook (suite must be failed)/subtraction': [
        'enqueued',
        'started',
        'passed',
      ],
      'hello.test.js/with broken after hook (suite must be failed)/failing': [
        'enqueued',
        'started',
        'failed',
      ],
      'hello.test.js/with broken afterEach hook (suite must be failed)/addition (success)': [
        'enqueued',
        'started',
        'passed',
      ],
      'hello.test.js/with broken afterEach hook (suite must be failed)/subtraction (skipped)': [
        'enqueued',
        'skipped',
      ],
      'hello.test.js/with broken afterEach hook (suite must be failed)/failing (skipped)': [
        'enqueued',
        'skipped',
      ],
      'hello.test.js/with broken before hook (suite must be failed)': ['failed'],
      'hello.test.js/with broken beforeEach hook (suite must be failed)': ['failed'],
      'hello.test.js/with broken after hook (suite must be failed)': ['failed'],
      'hello.test.js/with broken afterEach hook (suite must be failed)': ['failed'],
    });
  });
});
