/**
 * Copyright (C) Daniel Kuschny (Danielku15) and contributors.
 * Copyright (C) Microsoft Corporation. All rights reserved.
 *
 * Use of this source code is governed by an MIT-style
 * license that can be found in the LICENSE file or at
 * https://opensource.org/licenses/MIT.
 */

import fs from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';
import type * as vscode from 'vscode';
import which from 'which';

async function getPathTo(logChannel: vscode.LogOutputChannel, bin: string, name: string) {
  logChannel.debug(`Resolving ${name} executable`);
  let pathToBin = await which(bin, { nothrow: true });
  if (pathToBin) {
    logChannel.debug(`Found ${name} in PATH at '${pathToBin}'`);
  } else {
    pathToBin = process.execPath;
    logChannel.debug(`${name} not found in PATH using '${pathToBin}' as fallback`);
  }
  return pathToBin;
}

let pathToNode: string | null = null;

export async function getPathToNode(logChannel: vscode.LogOutputChannel) {
  // We cannot use process.execPath as this points to code.exe which is an electron application
  // also with ELECTRON_RUN_AS_NODE this can lead to errors (e.g. with the --import option)
  // we prefer to use the system level node
  if (!pathToNode) {
    pathToNode = await getPathTo(logChannel, 'node', 'Node.js');
  }
  return pathToNode;
}

export async function isNvmInstalled() {
  // https://github.com/nvm-sh/nvm/blob/179d45050be0a71fd57591b0ed8aedf9b177ba10/install.sh#L27
  const nvmDir = process.env.NVM_DIR || homedir();
  // https://github.com/nvm-sh/nvm/blob/179d45050be0a71fd57591b0ed8aedf9b177ba10/install.sh#L143
  try {
    await fs.promises.access(path.join(nvmDir, '.nvm', '.git'));
    return true;
  } catch (e) {
    return false;
  }
}
