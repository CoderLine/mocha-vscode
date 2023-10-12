import { defineConfig } from '@vscode/test-cli';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const dirname = fileURLToPath(new URL('.', import.meta.url));
const testCaseRunnerDir = path.join(dirname, 'out/test/testCases');

// @ts-check

export default defineConfig([
  {
    label: 'core',
    files: 'out/**/*.test.js',
    mocha: { ui: 'bdd' },
  },
  ...fs
    .readdirSync(testCaseRunnerDir)
    .filter((f) => f.endsWith('.js'))
    .map((file) => {
      const label = path.basename(file, '.js');
      return {
        label,
        files: path.join(testCaseRunnerDir, file),
        workspaceFolder: path.join(dirname, `testCases/${label}`),
        mocha: { ui: 'bdd', timeout: 60_000 },
      };
    }),
]);
