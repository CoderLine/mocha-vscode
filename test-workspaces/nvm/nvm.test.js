const { writeFileSync, mkdirSync } = require('node:fs');
const { join } = require('node:path');

describe('nvm', () => {
  it('ensure-version', () => {
    mkdirSync(process.env.TEST_TEMP, { recursive: true });
    writeFileSync(join(process.env.TEST_TEMP, '.nvmrc-actual'), process.version);
  });
});
