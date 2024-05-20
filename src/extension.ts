/**
 * Copyright (C) Daniel Kuschny (Danielku15) and contributors.
 * Copyright (C) Microsoft Corporation. All rights reserved.
 *
 * Use of this source code is governed by an MIT-style
 * license that can be found in the LICENSE file or at
 * https://opensource.org/licenses/MIT.
 */

import { ChildProcessWithoutNullStreams, spawn } from 'child_process';
import path from 'path';
import split2 from 'split2';
import * as timers from 'timers/promises';
import * as vscode from 'vscode';
import { ConfigValue } from './configValue';
import { ConsoleOuputChannel } from './consoleLogChannel';
import { configFilePattern, getControllersForTestCommand } from './constants';
import { Controller } from './controller';
import { getPathToNode } from './node';
import { TestRunner } from './runner';
import { SourceMapStore } from './source-map-store';

const enum FolderSyncState {
  Idle,
  Syncing,
  ReSyncNeeded,
}

export function activate(context: vscode.ExtensionContext) {
  let logChannel = vscode.window.createOutputChannel('Mocha Test Runner', { log: true });

  if (process.env.MOCHA_VSCODE_TEST) {
    logChannel = new ConsoleOuputChannel(logChannel);
  }

  const packageJson = context.extension.packageJSON;
  const extensionInfo = context.extension.packageJSON['mocha-vscode'];
  logChannel.info(
    `Mocha Test Runner Started (id: ${context.extension.id}, version ${packageJson.version})`,
    extensionInfo,
  );

  const smStore = new SourceMapStore();
  const runner = new TestRunner(logChannel, smStore, new ConfigValue('debugOptions', {}));

  let ctrls: Controller[] = [];
  let resyncState: FolderSyncState = FolderSyncState.Idle;

  const syncWorkspaceFolders = async () => {
    logChannel.debug('Syncing workspace folders', resyncState);

    await initESBuild(context, logChannel);

    if (resyncState === FolderSyncState.Syncing) {
      resyncState = FolderSyncState.ReSyncNeeded;
    }
    if (resyncState !== FolderSyncState.Idle) {
      return;
    }

    resyncState = FolderSyncState.Syncing;
    ctrls.forEach((c) => c.dispose());
    ctrls = [];

    const folders = vscode.workspace.workspaceFolders ?? [];
    await Promise.all(
      folders.map(async (folder) => {
        const files = await vscode.workspace.findFiles(
          new vscode.RelativePattern(folder, configFilePattern),
          '**/node_modules/**',
        );

        logChannel.debug('Checking workspace folder for config files', folder);

        for (const file of files) {
          const ctrl = vscode.tests.createTestController(file.toString(), file.fsPath);

          ctrls.push(new Controller(logChannel, ctrl, folder, smStore, file, runner));
        }
      }),
    );

    // cast is needed since TS incorrectly keeps resyncState narrowed to Syncing
    const prevState = resyncState as FolderSyncState;
    resyncState = FolderSyncState.Idle;
    if (prevState === FolderSyncState.ReSyncNeeded) {
      syncWorkspaceFolders();
    }
  };

  const initialSync = (async () => {
    // Workaround for vscode#179203 where findFiles doesn't work on startup.
    // This extension is only activated on workspaceContains, so we have pretty
    // high confidence that we should find something.
    for (let retries = 0; retries < 10; retries++) {
      await syncWorkspaceFolders();
      if (ctrls.length > 0) {
        break;
      }

      await timers.setTimeout(1000);
    }
  })();

  context.subscriptions.push(
    vscode.workspace.onDidChangeWorkspaceFolders(syncWorkspaceFolders),
    vscode.commands.registerCommand(getControllersForTestCommand, () =>
      initialSync.then(() => ctrls),
    ),
    new vscode.Disposable(() => ctrls.forEach((c) => c.dispose())),
    logChannel,
  );
}

export function deactivate() {}

// ESBuild needs the platform specific binary for execution
// here we run the init script coming with ESBuild
async function initESBuild(context: vscode.ExtensionContext, logChannel: vscode.LogOutputChannel) {
  logChannel.debug('Installing ESBuild binary');

  const node = await getPathToNode(logChannel);
  const cli = await new Promise<ChildProcessWithoutNullStreams>((resolve, reject) => {
    const p = spawn(node, ['install.js'], {
      cwd: path.join(context.extensionPath, 'node_modules', 'esbuild'),
      env: {
        ...process.env,
        ELECTRON_RUN_AS_NODE: '1',
      },
      windowsHide: true,
    });
    p.on('spawn', () => resolve(p));
    p.on('error', reject);
  });

  cli.stderr.pipe(split2()).on('data', (l) => {
    logChannel.debug('[ESBuild-stderr]', l);
  });
  cli.stdout.pipe(split2()).on('data', (l) => {
    logChannel.debug('[ESBuild-stdout]', l);
  });

  await new Promise<void>((resolve, reject) => {
    cli.on('error', reject);
    cli.on('exit', (code) => {
      if (code === 0) {
        logChannel.debug(`Installing ESBuild binary exited with code ${code}`);
      } else {
        logChannel.error(`Installing ESBuild binary exited with code ${code}`);
      }
      resolve();
    });
  });
}
