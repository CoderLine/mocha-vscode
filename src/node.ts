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

let pathToNode: string | undefined = undefined;

export async function getPathToNode(logChannel: vscode.LogOutputChannel) {
  // We cannot use process.execPath as this points to code.exe which is an electron application
  // also with ELECTRON_RUN_AS_NODE this can lead to errors (e.g. with the --import option)
  // we prefer to use the system level node
  if (!pathToNode) {
    logChannel.debug('Resolving Node.js executable');
    pathToNode = await which('node', { nothrow: true });
    if (pathToNode) {
      logChannel.debug(`Found Node.js in PATH at '${pathToNode}'`);
    } else {
      pathToNode = process.execPath;
      logChannel.debug(`Node.js not found in PATH using '${pathToNode}' as fallback`);
    }
  }
  return pathToNode;
}
