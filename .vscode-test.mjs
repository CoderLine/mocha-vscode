import { defineConfig } from '@vscode/test-cli';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';


const dirname = fileURLToPath(new URL('.', import.meta.url));
const integrationTestDir = path.join(dirname, 'out/test/integration');
const workspaceBaseDir = path.join(dirname, 'test-workspaces');

const vsCodeVersion = process.env.VSCODE_TEST_VERSION ?? 'stable';
const vsCodePlatform = process.env.VSCODE_TEST_PLATFORM ?? 'desktop';

let extensionDevelopmentPath = '';

const testMode = process.env.TEST_MODE ?? 'normal';

if (testMode === 'vsix') {
  const tempDir = process.env.TEST_TEMP ?? path.join(dirname, 'tmp')
  extensionDevelopmentPath = path.resolve(path.join(tempDir, 'vsix', 'extension'));
}

function createCommonOptions(label) {
  /**@type {import('@vscode/test-cli').TestConfiguration} */
  const options = {
    platform: vsCodePlatform,
    version: vsCodeVersion,
    env: {
      MOCHA_VSCODE_TEST: 'true',
    },
    mocha: {
      ui: 'bdd',
      timeout: 60_000,
    },
  };

  if (process.env.GITHUB_ACTIONS) {
    options.mocha.reporter = path.join(dirname, '.vscode-ci-test-reporter.js');
    options.mocha.reporterOption = {
      jsonReporterOption: {
        output: path.join(dirname, 'test-results', `${testMode}-${label}.json`),
      },
    };
    options.env.MOCHA_COLORS = 'true';
  }

  if (extensionDevelopmentPath) {
    options.extensionDevelopmentPath = extensionDevelopmentPath;
  }


  return options;
}

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
  const util = await import('util');
  console.log(util.inspect(config, { showHidden: false, depth: null, colors: true }));
}

export default defineConfig(config);
