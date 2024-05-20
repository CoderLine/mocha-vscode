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
import { Controller } from '../../controller';
import {
  expectTestTree,
  getController,
  integrationTestPrepare,
  onceDisposed,
  tryGetController,
} from '../util';

describe('config-file-change', () => {
  const workspaceFolder = integrationTestPrepare('config-file-change');

  it('rename-flow', async () => {
    let c: Controller | undefined = await getController();

    // initial state
    await c.scanFiles();
    await expectTestTree(c, [
      ['folder', [['nested.test.js', [['is nested']]]]],
      ['hello.test.js', [['math', [['addition'], ['subtraction']]]]],
    ]);

    // rename mocha file
    await fs.rename(
      path.join(workspaceFolder, '.mocharc.js'),
      path.join(workspaceFolder, '.__mocharc.js'),
    );
    await onceDisposed(c);

    // controller should be gone
    expect(await tryGetController(false)).to.be.undefined;

    // rename back
    await fs.rename(
      path.join(workspaceFolder, '.__mocharc.js'),
      path.join(workspaceFolder, '.mocharc.js'),
    );

    // wait for controller
    for (let retry = 0; retry < 5; retry++) {
      c = await tryGetController(false);
      if (!c) {
        await setTimeout(1000);
      } else {
        break;
      }
    }

    // scan and test results
    expect(c).to.not.be.undefined;
    c!.scanFiles();
    await expectTestTree(c!, [
      ['folder', [['nested.test.js', [['is nested']]]]],
      ['hello.test.js', [['math', [['addition'], ['subtraction']]]]],
    ]);
  });

  it('delete-create-flow', async () => {
    let c: Controller | undefined = await getController();

    // initial state
    await c.scanFiles();
    await expectTestTree(c, [
      ['folder', [['nested.test.js', [['is nested']]]]],
      ['hello.test.js', [['math', [['addition'], ['subtraction']]]]],
    ]);

    // delete mocha file
    await fs.unlink(path.join(workspaceFolder, '.mocharc.js'));
    await onceDisposed(c);

    // controller should be gone
    expect(await tryGetController(false)).to.be.undefined;

    // create new file
    await fs.writeFile(path.join(workspaceFolder, '.mocharc.json'), `{ "spec": "*.test.js" }`);

    // wait for controller
    for (let retry = 0; retry < 5; retry++) {
      c = await tryGetController(false);
      if (!c) {
        await setTimeout(1000);
      } else {
        break;
      }
    }

    // scan and test results
    expect(c).to.not.be.undefined;
    c!.scanFiles();
    await expectTestTree(c!, [['hello.test.js', [['math', [['addition'], ['subtraction']]]]]]);
  });
});
