import { defineConfig } from '@vscode/test-cli';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const dirname = fileURLToPath(new URL('.', import.meta.url));
const integrationTestDir = path.join(dirname, 'out/test/integration');
const workspaceBaseDir = path.join(dirname, 'test-workspaces');

const vsCodeVersion = process.env.VSCODE_TEST_VERSION ?? 'stable';
const vsCodePlatform = process.env.VSCODE_TEST_PLATFORM ?? 'desktop';

let createCommonOptions = (label) => {
  if (process.env.GITHUB_ACTIONS) {
    return {
      platform: vsCodePlatform,
      version: vsCodeVersion,
      env: {
        MOCHA_COLORS: 'true',
      },
      mocha: {
        ui: 'bdd',

        reporter: path.join(dirname, '.vscode-ci-test-reporter.js'),
        reporterOption: {
          jsonReporterOption: {
            output: path.join(dirname, 'test-results', `${label}.json`),
          },
        },
        timeout: 60_000,
      },
    };
  } else {
    return {
      platform: vsCodePlatform,
      version: vsCodeVersion,

      mocha: {
        ui: 'bdd',
      },
    };
  }
};

const config = [
  {
    label: 'unit',
    files: 'out/test/unit/**/*.test.js',
    ...createCommonOptions('unit'),
  },
  ...fs
    .readdirSync(integrationTestDir)
    .filter((f) => f.endsWith('.test.js'))
    .map((file) => {
      const label = path.basename(file, '.test.js');
      return {
        label,
        files: path.join(integrationTestDir, file),
        workspaceFolder: path.join(workspaceBaseDir, label),
        ...createCommonOptions(label),
      };
    }),
];

if (process.env.VSCODE_CONFIG_LOG) {
  console.log(config);
}

export default defineConfig(config);
