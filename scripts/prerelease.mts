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

const gitHubContext = process.env.GITHUB_CONTEXT
  ? JSON.parse(process.env.GITHUB_CONTEXT)
  : undefined;

const dirname = fileURLToPath(new URL('.', import.meta.url));

const packageJsonPath = path.join(dirname, '..', 'package.json');
const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));

let isPrerelease = process.argv.includes('--pre-release');

let semVer = packageJson.version;

const build = `+${execSync('git rev-parse --short HEAD').toString().trim()}`;

if (gitHubContext) {
  const tag = gitHubContext.event.release.tag_name as string;
  semVer = tag + build;

  if (gitHubContext.event.release.prerelease) {
    isPrerelease = true;
  }

  if (packageJson.version != tag.slice(1).split('-')[0]) {
    console.error(
      `Git Tag '${tag}' does not match version in package.json '${packageJson.version}', please correct it!`,
    );
    process.exit(1);
  }
} else {
  const prereleaseTag = isPrerelease ? '-preview' : '';
  semVer = 'v' + packageJson.version + prereleaseTag + build;
}

packageJson['mocha-vscode'] = {
  version: semVer,
  date: new Date().toISOString(),
};

fs.writeFileSync(packageJsonPath, JSON.stringify(packageJson, null, 2).replaceAll('\r\n', '\n'));
