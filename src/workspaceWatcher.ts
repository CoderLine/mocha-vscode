/**
 * Copyright (C) Daniel Kuschny (Danielku15) and contributors.
 * Copyright (C) Microsoft Corporation. All rights reserved.
 *
 * Use of this source code is governed by an MIT-style
 * license that can be found in the LICENSE file or at
 * https://opensource.org/licenses/MIT.
 */

import { minimatch } from 'minimatch';
import * as vscode from 'vscode';
import { configFilePatterns } from './constants';
import { Controller } from './controller';
import { DisposableStore } from './disposable';
import type { TestRunner } from './runner';
import type { SourceMapStore } from './source-map-store';
import type { ExtensionSettings } from './settings';

export class WorkspaceFolderWatcher {
  private readonly disposables = new DisposableStore();
  public readonly controllers: Map<string /*config file */, Controller> = new Map<string, Controller>();

  constructor(
    private logChannel: vscode.LogOutputChannel,
    private folder: vscode.WorkspaceFolder,
    private runner: TestRunner,
    private smStore: SourceMapStore,
    private settings: ExtensionSettings
  ) {}

  async init() {
    // we need to watch for *every* change due to https://github.com/microsoft/vscode/issues/60813
    const watcher = vscode.workspace.createFileSystemWatcher(new vscode.RelativePattern(this.folder, '**/*'));
    this.disposables.add(watcher);

    watcher.onDidCreate(uri => {
      for (const pattern of configFilePatterns) {
        if (minimatch(uri.fsPath.replace(/\\/g, '/'), pattern)) {
          this.addConfigFile(uri);
          return;
        }
      }
    });
    watcher.onDidDelete(uri => {
      this.removeConfigFile(uri);
    });

    this.logChannel.debug('Checking workspace folder for config files', this.folder);
    for (const configFilePattern of configFilePatterns) {
      const files = await vscode.workspace.findFiles(
        new vscode.RelativePattern(this.folder, configFilePattern),
        '**/node_modules/**'
      );

      for (const file of files) {
        this.addConfigFile(file);
      }
    }
  }

  removeConfigFile(file: vscode.Uri) {
    const key = file.toString();
    const controller = this.controllers.get(key);
    if (controller) {
      controller.dispose();
      this.controllers.delete(key);
      this.logChannel.debug(`Removed controller via config file ${key}`);
    }
  }

  addConfigFile(file: vscode.Uri) {
    this.logChannel.debug(`Added new controller via config file ${file}`);
    const controller = new Controller(this.logChannel, this.folder, this.smStore, file, this.runner, this.settings);
    this.controllers.set(file.toString(), controller);
    this.disposables.add(controller);
  }

  dispose() {
    this.disposables.dispose();
  }
}
