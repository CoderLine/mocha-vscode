const { strictEqual } = require('node:assert');

describe('with beforeAll hook', () => {
  before(() => {
    console.log('Before hook executed once!');
  });
  
  it('addition', async () => {
    strictEqual(1 + 1, 2);
  });

  it('subtraction', async () => {
    strictEqual(1 - 1, 0);
  });
  it('failing', async () => {
    strictEqual(1 * 1, 0);
  });
});

describe('with beforeEach hook', () => {
  beforeEach(() => {
    console.log('BeforeEach hook executed every time!');
  });
  
  it('addition', async () => {
    strictEqual(1 + 1, 2);
  });

  it('subtraction', async () => {
    strictEqual(1 - 1, 0);
  });
  it('failing', async () => {
    strictEqual(1 * 1, 0);
  });
});

describe('with broken before hook (suite must be failed)', () => {
  before(() => {
    throw new Error('Before hook is broken!!!');
  });
  
  it('addition (skipped)', async () => {
    strictEqual(1 + 1, 2);
  });

  it('subtraction (skipped)', async () => {
    strictEqual(1 - 1, 0);
  });
  it('failing (skipped)', async () => {
    strictEqual(1 * 1, 0);
  });
});

describe('with broken beforeEach hook (suite must be failed)', () => {
  beforeEach(() => {
    throw new Error('BeforeEach hook is broken!!!');
  });
  
  it('addition (skipped)', async () => {
    strictEqual(1 + 1, 2);
  });

  it('subtraction (skipped)', async () => {
    strictEqual(1 - 1, 0);
  });
  it('failing (skipped)', async () => {
    strictEqual(1 * 1, 0);
  });
});

describe('with broken after hook (suite must be failed)', () => {
  after(() => {
    throw new Error('After hook is broken!!!');
  });
  
  it('addition', async () => {
    strictEqual(1 + 1, 2);
  });

  it('subtraction', async () => {
    strictEqual(1 - 1, 0);
  });
  it('failing', async () => {
    strictEqual(1 * 1, 0);
  });
});

describe('with broken afterEach hook (suite must be failed)', () => {
  afterEach(() => {
    throw new Error('After each hook is broken!!!');
  });
  
  it('addition (success)', async () => {
    strictEqual(1 + 1, 2);
  });

  it('subtraction (skipped)', async () => {
    strictEqual(1 - 1, 0);
  });
  it('failing (skipped)', async () => {
    strictEqual(1 * 1, 0);
  });
});
