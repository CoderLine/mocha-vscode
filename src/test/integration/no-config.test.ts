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
import type { Controller } from '../../controller';
import { expectTestTree, integrationTestPrepare, tryGetController } from '../util';

describe('no-config', () => {
  const workspaceFolder = integrationTestPrepare('no-config');

  it('create-file-flow', async () => {
    let c: Controller | undefined = await tryGetController();
    expect(c).to.be.undefined;

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
    expectTestTree(c!, [['hello.test.js', [['math', [['addition'], ['subtraction']]]]]]);
  });
});
