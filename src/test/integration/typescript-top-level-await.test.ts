/**
 * Copyright (C) Daniel Kuschny (Danielku15) and contributors.
 * Copyright (C) Microsoft Corporation. All rights reserved.
 *
 * Use of this source code is governed by an MIT-style
 * license that can be found in the LICENSE file or at
 * https://opensource.org/licenses/MIT.
 */

import { expect } from 'chai';
import { buildTestTreeExpectation, getController } from '../util';

describe('typescript top level await', () => {
  it('discovers tests fails cjs', async () => {
    const c = await getController();

    const e = buildTestTreeExpectation(c);

    expect(e).to.have.length(1);
    expect(e[0][0]).to.equal('hello.test.ts');
    expect(e[0][1])
      .to.be.a('string')
      .and.to.include('Transform failed with')
      .and.to.include('ERROR: Top-level await is currently not supported with the "cjs" output format');
  });
});
