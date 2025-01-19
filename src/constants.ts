/**
 * Copyright (C) Daniel Kuschny (Danielku15) and contributors.
 * Copyright (C) Microsoft Corporation. All rights reserved.
 *
 * Use of this source code is governed by an MIT-style
 * license that can be found in the LICENSE file or at
 * https://opensource.org/licenses/MIT.
 */

import path from 'path';
import type { IExtensionSettings } from './discoverer/types';

/** Pattern of files the CLI looks for */
export const configFilePatterns = ['**/.mocharc.{js,cjs,yaml,yml,json,jsonc}', '**/package.json'];

export const defaultTestSymbols: IExtensionSettings = {
  suite: ['describe', 'suite'],
  test: ['it', 'test'],
  hooks: ['before', 'after', 'beforeEach', 'afterEach'],
  extractWith: 'evaluation-cjs',
  extractTimeout: 10_000,
};

export const showConfigErrorCommand = 'mocha-vscode.showConfigError';
export const getControllersForTestCommand = 'mocha-vscode.getControllersForTest';

function equalsIgnoreCase(a: string, b: string) {
  return a.localeCompare(b, undefined, { sensitivity: 'accent' }) === 0;
}

export function isTypeScript(filePath: string) {
  const ext = path.extname(filePath);
  // TODO: configuration for this extension list?
  return (
    equalsIgnoreCase(ext, '.ts') ||
    equalsIgnoreCase(ext, '.mts') ||
    equalsIgnoreCase(ext, '.tsx') ||
    equalsIgnoreCase(ext, '.cts') ||
    equalsIgnoreCase(ext, '.jsx')
  );
}

export function isEsm(filePath: string, code: string): boolean {
  const ext = path.extname(filePath);
  // very basic detection
  return equalsIgnoreCase(ext, '.mjs') || code.includes('import ') || code.includes('export ');
}
