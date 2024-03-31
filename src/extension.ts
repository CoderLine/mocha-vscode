/*---------------------------------------------------------
 * Copyright (C) OpenJS Foundation and contributors, https://openjsf.org
 * Copyright (C) Microsoft Corporation. All rights reserved.
 *--------------------------------------------------------*/

import * as path from 'path';
import * as timers from 'timers/promises';
import * as vscode from 'vscode';
import { ConfigValue } from './configValue';
import {
  configFilePattern,
  getControllersForTestCommand,
  showConfigErrorCommand,
} from './constants';
import { Controller } from './controller';
import { TestRunner } from './runner';
import { SourceMapStore } from './source-map-store';

const enum FolderSyncState {
  Idle,
  Syncing,
  ReSyncNeeded,
}

export function activate(context: vscode.ExtensionContext) {
  const logChannel = vscode.window.createOutputChannel('Mocha VS Code Extension', { log: true });

  const smStore = new SourceMapStore();
  const runner = new TestRunner(logChannel, smStore, new ConfigValue('debugOptions', {}));

  let ctrls: Controller[] = [];
  let resyncState: FolderSyncState = FolderSyncState.Idle;

  const syncWorkspaceFolders = async () => {
    logChannel.debug('Syncing workspace folders', resyncState);

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
          const rel = path.relative(folder.uri.fsPath, path.dirname(file.fsPath));
          const ctrl = vscode.tests.createTestController(
            file.toString(),
            rel
              ? folders.length > 1
                ? `Extension (${folder.name}: ${rel})`
                : `Extension (${rel})`
              : folder.name,
          );

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
