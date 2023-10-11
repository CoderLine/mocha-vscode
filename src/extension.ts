import * as path from 'path';
import * as vscode from 'vscode';
import { configFilePattern, showConfigErrorCommand } from './constants';
import { Controller } from './controller';
import { TestRunner } from './runner';
import { SourceMapStore } from './source-map-store';

const enum FolderSyncState {
  Idle,
  Syncing,
  ReSyncNeeded,
}

export async function activate(context: vscode.ExtensionContext) {
  const smStore = new SourceMapStore();
  const runner = new TestRunner(smStore);

  let ctrls: Controller[] = [];
  let resyncState: FolderSyncState = FolderSyncState.Idle;

  const syncWorkspaceFolders = async () => {
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
        );
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

          ctrls.push(new Controller(ctrl, folder, smStore, file, runner));
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

  const showConfigError = async (configUriStr: string) => {
    const configUri = vscode.Uri.parse(configUriStr);
    const ctrl = ctrls.find((c) => c.configFile.uri.toString() === configUri.toString());
    try {
      await ctrl?.configFile.read();
    } catch (e) {
      vscode.window.showErrorMessage(String(e), { modal: true });
      return;
    }

    vscode.window.showInformationMessage('No configuration error detected');
  };

  context.subscriptions.push(
    vscode.workspace.onDidChangeWorkspaceFolders(syncWorkspaceFolders),
    vscode.commands.registerCommand(showConfigErrorCommand, showConfigError),
    new vscode.Disposable(() => ctrls.forEach((c) => c.dispose())),
  );

  syncWorkspaceFolders();
}

export function deactivate() {}
