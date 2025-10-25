/**
 * Copyright (C) Daniel Kuschny (Danielku15) and contributors.
 * Copyright (C) Microsoft Corporation. All rights reserved.
 *
 * Use of this source code is governed by an MIT-style
 * license that can be found in the LICENSE file or at
 * https://opensource.org/licenses/MIT.
 */

import * as timers from 'node:timers/promises';
import * as vscode from 'vscode';
import { ConsoleOuputChannel } from './consoleLogChannel';
import { getControllersForTestCommand, recreateControllersForTestCommand } from './constants';
import { initESBuild } from './esbuild';
import { TestRunner } from './runner';
import { SourceMapStore } from './source-map-store';
import { WorkspaceFolderWatcher } from './workspaceWatcher';
import { ExtensionSettings } from './settings';
import { DisposableStore } from './disposable';

enum FolderSyncState {
  Idle,
  Syncing,
  ReSyncNeeded,
}

let disposables = new DisposableStore();

export function activate(context: vscode.ExtensionContext) {
  disposables = new DisposableStore();

  let logChannel = vscode.window.createOutputChannel('Mocha Test Runner', { log: true });

  if (process.env.MOCHA_VSCODE_TEST) {
    logChannel = new ConsoleOuputChannel(logChannel);
  }
  disposables.add(logChannel);

  const packageJson = context.extension.packageJSON;
  const extensionInfo = context.extension.packageJSON['mocha-vscode'];
  logChannel.info(
    `Mocha Test Runner Started (id: ${context.extension.id}, version ${packageJson.version})`,
    extensionInfo,
  );

  const settings = disposables.add(new ExtensionSettings());

  const smStore = new SourceMapStore();
  const runner = new TestRunner(
    logChannel,
    smStore,
    settings
  );

  const watchers: Map<string /* workspace folder */, WorkspaceFolderWatcher> = new Map<
    string,
    WorkspaceFolderWatcher
  >();

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

    const folders = vscode.workspace.workspaceFolders ?? [];

    const remainingFolders = new Set<string>(watchers.keys());

    await Promise.all(
      folders.map(async (folder) => {
        const key = folder.uri.toString();

        // mark as existing
        remainingFolders.delete(key);

        if (!watchers.has(key)) {
          logChannel.debug('New workspace folder', folder);
          const newController = new WorkspaceFolderWatcher(logChannel, folder, runner, smStore, settings);
          await newController.init();
          watchers.set(key, newController);
        } else {
          logChannel.debug('Existing workspace folder', folder);
        }

        return;
      }),
    );

    for (const remaining of remainingFolders) {
      logChannel.debug('Removed workspace folder', remaining);
      const watcher = watchers.get(remaining)!;
      watcher.dispose();
      watchers.delete(remaining);
    }

    // cast is needed since TS incorrectly keeps resyncState narrowed to Syncing
    const prevState = resyncState as FolderSyncState;
    resyncState = FolderSyncState.Idle;
    if (prevState === FolderSyncState.ReSyncNeeded) {
      syncWorkspaceFolders();
    }
  };

  async function syncWorkspaceFoldersWithRetry() {
    // Workaround for vscode#179203 where findFiles doesn't work on startup.
    // This extension is only activated on workspaceContains, so we have pretty
    // high confidence that we should find something.
    for (let retries = 0; retries < 10; retries++) {
      await syncWorkspaceFolders();

      if (Array.from(watchers.values()).find((c) => c.controllers.size > 0)) {
        break;
      }

      await timers.setTimeout(1000);
    }
  }

  const initialSync = (async () => {
    await initESBuild(context, logChannel);
    await syncWorkspaceFoldersWithRetry();
  })();

  context.subscriptions.push(
    vscode.workspace.onDidChangeWorkspaceFolders(syncWorkspaceFolders),
    vscode.commands.registerCommand(getControllersForTestCommand, async () => {
      await initialSync;
      return Array.from(watchers.values()).flatMap((w) => Array.from(w.controllers.values()));
    }),
    vscode.commands.registerCommand(recreateControllersForTestCommand, async () => {
      logChannel.debug('Destroying all watchers and test controllers');
      for (const [, watcher] of watchers) {
        watcher.dispose();
      }
      watchers.clear();
      resyncState = FolderSyncState.Idle;

      logChannel.debug('Destroyed controllers, recreating');
      await syncWorkspaceFoldersWithRetry();
      return Array.from(watchers.values()).flatMap((w) => Array.from(w.controllers.values()));
    }),
    new vscode.Disposable(() => {
      for (const c of watchers.values()) {
        c.dispose();
      }
    }),
    logChannel,
  );
}

export function deactivate() { 
  disposables.dispose();
}
