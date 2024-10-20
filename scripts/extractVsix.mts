/**
 * Copyright (C) Daniel Kuschny (Danielku15) and contributors.
 *
 * Use of this source code is governed by an MIT-style
 * license that can be found in the LICENSE file or at
 * https://opensource.org/licenses/MIT.
 */

import extract from 'extract-zip';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const dirname = fileURLToPath(new URL('.', import.meta.url));

const vsix = fs
  .readdirSync(path.join(dirname, '..'), {
    withFileTypes: true,
  })
  .filter((f) => f.name.startsWith('mocha-vscode') && f.name.endsWith('.vsix'));

if (vsix.length > 1) {
  console.error('Multiple VSIX files found, cannot decide which is the one for testing');
  process.exit(1);
}

const tempDir = process.env.TEST_TEMP ?? path.join(dirname, '..', 'tmp')
const extensionDir = path.join(tempDir, 'vsix');
await fs.promises.rm(extensionDir, { recursive: true, force: true });
await fs.promises.mkdir(extensionDir, { recursive: true });

await extract(path.join(vsix[0].parentPath, vsix[0].name), {
  dir: extensionDir,
});
