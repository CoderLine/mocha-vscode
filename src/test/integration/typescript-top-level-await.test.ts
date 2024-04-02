/**
 * Copyright (C) Daniel Kuschny (Danielku15) and contributors.
 * Copyright (C) Microsoft Corporation. All rights reserved.
 *
 * Use of this source code is governed by an MIT-style
 * license that can be found in the LICENSE file or at
 * https://opensource.org/licenses/MIT.
 */

import { expectTestTree, getController } from '../util';

describe('typescript top level await', () => {
  it('discovers tests fails', async () => {
    const c = await getController();

    await expectTestTree(c, []);
  });
});
