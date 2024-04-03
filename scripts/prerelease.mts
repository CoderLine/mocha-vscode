/**
 * Copyright (C) Daniel Kuschny (Danielku15) and contributors.
 * Copyright (C) Microsoft Corporation. All rights reserved.
 *
 * Use of this source code is governed by an MIT-style
 * license that can be found in the LICENSE file or at
 * https://opensource.org/licenses/MIT.
 */

import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

console.log('Preparing for extension publish');

const dirname = fileURLToPath(new URL('.', import.meta.url));

const packageJsonPath = path.join(dirname, '..', 'package.json');
const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));

const isPrerelease = process.argv.includes('--pre-release');

const prereleaseTag = isPrerelease ? '-preview' : '';
const build = `+${execSync('git rev-parse --short HEAD').toString().trim()}`;
const semVer = packageJson.version + prereleaseTag + build;

packageJson['mocha-vscode'] = {
  version: semVer,
  date: new Date().toISOString(),
};

fs.writeFileSync(packageJsonPath, JSON.stringify(packageJson, null, 2).replaceAll('\r\n', '\n'));
