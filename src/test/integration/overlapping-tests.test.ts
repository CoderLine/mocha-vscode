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
import { TestState, captureTestRun, expectTestTree, findTestItem, getController } from '../util';

describe('overlapping tests', () => {
  it('discovers tests', async () => {
    const c = await getController();

    expectTestTree(c, [
      [
        'folder',
        [
          ['suite01-duplicate.test.js', [['suite01', [['test01']]]]],
          ['suite03.test.js', [['suite03', [['test01']]]]],
        ],
      ],
      [
        'suite01.test.js',
        [
          ['suite01', [['test01'], ['test02']]],
          ['suite01.1', [['suite01.1']]],
        ],
      ],
      [
        'suite02.test.js',
        [
          ['suite02', [['test01'], ['test02']]],
          ['suite02.1', [['test01'], ['test02']]],
        ],
      ],
    ]);
  });

  it('runs all tests', async () => {
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
      'suite01.test.js/suite01/test01': ['enqueued', 'started', 'passed'],
      'suite01.test.js/suite01/test02': ['enqueued', 'started', 'passed'],
      'suite01.test.js/suite01.1/suite01.1': ['enqueued', 'started', 'passed'],
      'suite02.test.js/suite02/test01': ['enqueued', 'started', 'passed'],
      'suite02.test.js/suite02/test02': ['enqueued', 'started', 'passed'],
      'suite02.test.js/suite02.1/test01': ['enqueued', 'started', 'passed'],
      'suite02.test.js/suite02.1/test02': ['enqueued', 'started', 'passed'],
      'folder/suite03.test.js/suite03/test01': ['enqueued', 'started', 'passed'],
      'folder/suite01-duplicate.test.js/suite01/test01': ['enqueued', 'started', 'passed'],
    });
  });

  const testCases: [string, string[], { [id: string]: TestState[] }][] = [
    [
      'runs only test of specific file',
      ['suite01.test.js/suite01/test01'],
      {
        'suite01.test.js/suite01/test01': ['enqueued', 'started', 'passed'],
      },
    ],
    [
      'runs only suite of specific file',
      ['suite01.test.js/suite01'],
      {
        'suite01.test.js/suite01/test01': ['enqueued', 'started', 'passed'],
        'suite01.test.js/suite01/test02': ['enqueued', 'started', 'passed'],
      },
    ],
    [
      'runs all suites in specific file',
      ['suite01.test.js'],
      {
        'suite01.test.js/suite01/test01': ['enqueued', 'started', 'passed'],
        'suite01.test.js/suite01/test02': ['enqueued', 'started', 'passed'],
        'suite01.test.js/suite01.1/suite01.1': ['enqueued', 'started', 'passed'],
      },
    ],
    [
      'runs multiple files',
      ['suite01.test.js', 'suite02.test.js'],
      {
        'suite01.test.js/suite01/test01': ['enqueued', 'started', 'passed'],
        'suite01.test.js/suite01/test02': ['enqueued', 'started', 'passed'],
        'suite01.test.js/suite01.1/suite01.1': ['enqueued', 'started', 'passed'],
        'suite02.test.js/suite02/test01': ['enqueued', 'started', 'passed'],
        'suite02.test.js/suite02/test02': ['enqueued', 'started', 'passed'],
        'suite02.test.js/suite02.1/test01': ['enqueued', 'started', 'passed'],
        'suite02.test.js/suite02.1/test02': ['enqueued', 'started', 'passed'],
      },
    ],
    [
      'runs mixed nodes',
      [
        'suite01.test.js/suite01',
        'suite02.test.js/suite02/test01',
        'suite02.test.js/suite02.1/test02',
      ],
      {
        'suite01.test.js/suite01/test01': ['enqueued', 'started', 'passed'],
        'suite01.test.js/suite01/test02': ['enqueued', 'started', 'passed'],
        'suite02.test.js/suite02/test01': ['enqueued', 'started', 'passed'],
        'suite02.test.js/suite02.1/test02': ['enqueued', 'started', 'passed'],
      },
    ],
    [
      'runs all in folder',
      ['folder'],
      {
        'folder/suite03.test.js/suite03/test01': ['enqueued', 'started', 'passed'],
        'folder/suite01-duplicate.test.js/suite01/test01': ['enqueued', 'started', 'passed'],
      },
    ],
    [
      'cannot differenciate overlapping suites',
      ['suite01.test.js/suite01/test02', 'folder/suite01-duplicate.test.js/suite01/test01'],
      {
        // these tests are actually expected
        'suite01.test.js/suite01/test02': ['enqueued', 'started', 'passed'],
        'folder/suite01-duplicate.test.js/suite01/test01': ['enqueued', 'started', 'passed'],

        // this test we cannot avoid to be executed due to name overlap, it's not really queued but still running
        'suite01.test.js/suite01/test01': ['started', 'passed'],
      },
    ],
  ];

  for (const [name, include, expected] of testCases) {
    it(name, async () => {
      const c = await getController();
      const profiles = c.profiles;
      expect(profiles).to.have.lengthOf(2);

      const testItems = include.map((i) => findTestItem(c.ctrl!.items, i)!);

      const run = await captureTestRun(
        c,
        new vscode.TestRunRequest(
          testItems,
          undefined,
          profiles.find((p) => p.kind === vscode.TestRunProfileKind.Run),
        ),
      );

      run.expectStates(expected);
    });
  }
});
