/**
 * Copyright (C) Daniel Kuschny (Danielku15) and contributors.
 * Copyright (C) Microsoft Corporation. All rights reserved.
 *
 * Use of this source code is governed by an MIT-style
 * license that can be found in the LICENSE file or at
 * https://opensource.org/licenses/MIT.
 */

import { type TsConfigResult, getTsconfig, parseTsconfig } from 'get-tsconfig';
import * as vscode from 'vscode';
import { DisposableStore } from './disposable';

export class TsConfigStore implements vscode.Disposable {
  private readonly ds = new DisposableStore();
  private _watcherCache: Map<string, { watcher: vscode.FileSystemWatcher; config: TsConfigResult }> = new Map();

  public getTsconfig(searchPath: string) {
    // use from cache if possible
    let config = this._watcherCache.get(searchPath);
    if (config) {
      return config.config;
    }

    // try to find config
    const tsconfig = getTsconfig(searchPath);
    if (tsconfig) {
      // if found start watching it
      config = {
        watcher: this.ds.add(vscode.workspace.createFileSystemWatcher(tsconfig.path)),
        config: tsconfig
      };
      this.ds.add(
        config.watcher.onDidChange(() => {
          config!.config.config = parseTsconfig(tsconfig.path);
        })
      );

      this._watcherCache.set(searchPath, config);
      this._watcherCache.set(config.config.path, config);
    }

    return config?.config;
  }

  dispose() {
    this.ds.dispose();
  }
}
