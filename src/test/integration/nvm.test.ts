/**
 * Copyright (C) Daniel Kuschny (Danielku15) and contributors.
 * Copyright (C) Microsoft Corporation. All rights reserved.
 *
 * Use of this source code is governed by an MIT-style
 * license that can be found in the LICENSE file or at
 * https://opensource.org/licenses/MIT.
 */

import { expect } from 'chai';
import fs from 'fs';
import os from 'os';
import path from 'path';
import * as vscode from 'vscode';
import { isNvmInstalled } from '../../node';
import { captureTestRun, expectTestTree, getController, integrationTestPrepare } from '../util';

describe('nvm', () => {
  const workingDir = integrationTestPrepare('nvm');

  it('discovers tests', async () => {
    const c = await getController();

    expectTestTree(c, [['nvm.test.js', [['nvm', [['ensure-version']]]]]]);
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
      'nvm.test.js/nvm/ensure-version': ['enqueued', 'started', 'passed'],
    });

    const expectedVersion = await fs.promises.readFile(path.join(workingDir, '.nvmrc'), 'utf-8');
    const actualVersion = await fs.promises.readFile(
      path.resolve(__dirname, '..', '..', '..', 'tmp', '.nvmrc-actual'),
      'utf-8',
    );

    // nvm is only available on MacOS and Linux
    // so we skip it on windows.
    // also if NVM on local development we skip this test (for GITHUB_ACTIONS we expect it to be there).
    const shouldRun =
      os.platform() === 'linux' && ((await isNvmInstalled()) || process.env.GITHUB_ACTIONS);
    console.log(`Expecting node ${expectedVersion}, ran in ${actualVersion}`);
    if (shouldRun) {
      expect(process.version).to.match(new RegExp(expectedVersion + '.*'));
    }
  });
});
