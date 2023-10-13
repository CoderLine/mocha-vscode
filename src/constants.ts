/*---------------------------------------------------------
 * Copyright (C) Microsoft Corporation. All rights reserved.
 *--------------------------------------------------------*/

import { ITestSymbols } from './extract';

/** Pattern of files the CLI looks for */
export const configFilePattern = '**/.vscode-test.{js,mjs,cjs}';
/** Package name of the VS Code CLI */
export const cliPackageName = '@vscode/test-cli';

export const defaultTestSymbols: ITestSymbols = {
  suite: ['describe', 'suite'],
  test: ['it', 'test'],
  extractWith: 'evaluation',
};

export const showConfigErrorCommand = 'extension-test-runner.showConfigError';
export const getControllersForTestCommand = 'extension-test-runner.get-controllers-for-test';
