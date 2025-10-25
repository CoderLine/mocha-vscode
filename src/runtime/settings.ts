/**
 * Copyright (C) Daniel Kuschny (Danielku15) and contributors.
 *
 * Use of this source code is governed by an MIT-style
 * license that can be found in the LICENSE file or at
 * https://opensource.org/licenses/MIT.
 */

import fs from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';
import type { Disposable, LogOutputChannel, Uri } from 'vscode';
import { DisposableStore } from '../disposable';
import type { ExtensionSettings } from '../settings';
import type { IResolvedConfiguration, ITestRuntime } from './types';
import { NodeLikeTestRuntime } from './nodelike';

export class SettingsBasedTestRuntime implements ITestRuntime, Disposable {
  private readonly disposables = new DisposableStore();

  private _detectPromise: Promise<void>;
  private _runtime?: ITestRuntime;

  public constructor(
    private readonly logChannel: LogOutputChannel,
    private readonly configFileUri: Uri,
    private readonly settings: ExtensionSettings
  ) {
    this.disposables.add(
      settings.runtime.onDidChange(() => {
        this._detectPromise = this.detect();
      })
    );
    this._detectPromise = this.detect();
  }

  dispose() {
    this.disposables.dispose();
  }

  async detect() {
    const pathToNvmRc = await this.resolveNvmRc();
    if (pathToNvmRc) {
      this.logChannel.trace('Detected NVM, using NVM as mechansim to execute commands.');
      this._runtime = new NodeLikeTestRuntime(this.logChannel, this.configFileUri, this.settings, [
        'nvm',
        'run',
        '--silent'
      ]);
      return;
    }

    this._runtime = new NodeLikeTestRuntime(this.logChannel, this.configFileUri, this.settings, ['node']);
  }

  private async isNvmInstalled() {
    // https://github.com/nvm-sh/nvm/blob/179d45050be0a71fd57591b0ed8aedf9b177ba10/install.sh#L27
    const nvmDir = process.env.NVM_DIR || homedir();
    // https://github.com/nvm-sh/nvm/blob/179d45050be0a71fd57591b0ed8aedf9b177ba10/install.sh#L143
    try {
      await fs.promises.access(path.join(nvmDir, '.nvm', '.git'));
      return true;
    } catch {
      return false;
    }
  }

  async resolveNvmRc(): Promise<string | undefined> {
    // the .nvmrc file can be placed in any location up the directory tree, so we do the same
    // starting from the mocha config file
    // https://github.com/nvm-sh/nvm/blob/06413631029de32cd9af15b6b7f6ed77743cbd79/nvm.sh#L475-L491
    try {
      if (!(await this.isNvmInstalled())) {
        return undefined;
      }

      let dir: string | undefined = path.dirname(this.configFileUri.fsPath);

      while (dir) {
        const nvmrc = path.join(dir, '.nvmrc');
        if (
          await fs.promises
            .access(nvmrc)
            .then(() => true)
            .catch(() => false)
        ) {
          this.logChannel.debug(`Found .nvmrc at ${nvmrc}`);
          return nvmrc;
        }

        const parent = path.dirname(dir);
        if (parent === dir) {
          break;
        }
        dir = parent;
      }
    } catch (e) {
      this.logChannel.error(e as Error, 'Error while searching for nvmrc');
    }

    return undefined;
  }

  async resolveConfiguration(): Promise<IResolvedConfiguration> {
    await this._detectPromise;
    return await this._runtime!.resolveConfiguration();
  }

  async getMochaSpawnArgs(mochaArgs: string[]): Promise<string[]> {
    await this._detectPromise;
    return await this._runtime!.getMochaSpawnArgs(mochaArgs);
  }
}
