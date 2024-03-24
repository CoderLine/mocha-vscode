import { defineConfig } from '@vscode/test-cli';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const dirname = fileURLToPath(new URL('.', import.meta.url));
const integrationTestDir = path.join(dirname, 'out/test/integration');
const workspaceBaseDir = path.join(dirname, 'test-workspaces');


const vsCodeVersion = process.env.VSCODE_TEST_VERSION ?? 'stable';
const vsCodePlatform = process.env.VSCODE_TEST_PLATFORM ?? 'desktop';

export default defineConfig([
  {
    platform: vsCodePlatform,
    version: vsCodeVersion,
    label: 'unit',
    files: 'out/test/unit/**/*.test.js',
    mocha: { ui: 'bdd' },
  },
  ...fs
    .readdirSync(integrationTestDir)
    .filter((f) => f.endsWith('.test.js'))
    .map((file) => {
      const label = path.basename(file, '.test.js');
      return {
        platform: vsCodePlatform,
        version: vsCodeVersion,
        label,
        files: path.join(integrationTestDir, file),
        mocha: { ui: 'bdd', timeout: 60_000 },
        workspaceFolder: path.join(workspaceBaseDir, label),
      };
    }),
]);
