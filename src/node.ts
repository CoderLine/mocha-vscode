/**
 * Copyright (C) Daniel Kuschny (Danielku15) and contributors.
 * Copyright (C) Microsoft Corporation. All rights reserved.
 *
 * Use of this source code is governed by an MIT-style
 * license that can be found in the LICENSE file or at
 * https://opensource.org/licenses/MIT.
 */

import * as vscode from 'vscode';
import which from 'which';

export async function getPathTo(logChannel: vscode.LogOutputChannel, bin: string, name: string) {
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
  // Check if the nodePath setting is defined
  const nodePath = vscode.workspace.getConfiguration('mocha-vscode').get<string>('nodePath');
  if (nodePath) {
    logChannel.debug(`Using nodePath from settings: '${nodePath}'`);
    return nodePath;
  }

  // We cannot use process.execPath as this points to code.exe which is an electron application
  // also with ELECTRON_RUN_AS_NODE this can lead to errors (e.g. with the --import option)
  // we prefer to use the system level node
  if (!pathToNode) {
    pathToNode = await getPathTo(logChannel, 'node', 'Node.js');
  }
  return pathToNode;
}

let pathToNpm: string | null = null;

export async function getPathToNpm(logChannel: vscode.LogOutputChannel) {
  if (!pathToNpm) {
    pathToNpm = await getPathTo(logChannel, 'npm', 'NPM');
  }
  return pathToNpm;
}
