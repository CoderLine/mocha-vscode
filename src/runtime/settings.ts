/**
 * Copyright (C) Daniel Kuschny (Danielku15) and contributors.
 *
 * Use of this source code is governed by an MIT-style
 * license that can be found in the LICENSE file or at
 * https://opensource.org/licenses/MIT.
 */

import fs from 'node:fs';
import { homedir, platform } from 'node:os';
import path from 'node:path';
import type { Disposable, LogOutputChannel, Uri } from 'vscode';
import which from 'which';
import { DisposableStore } from '../disposable';
import type { ExtensionSettings, TestRuntimeMode } from '../settings';
import { NodeLikeTestRuntime } from './nodelike';
import type { IResolvedConfiguration, ITestRuntime } from './types';

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
    const runtime = await this.detectRuntime();

    let nodeLaunchArgs: string[];
    switch (runtime) {
      case 'node':
        nodeLaunchArgs = ['node'];
        break;
      case 'nvm':
        // https://github.com/nvm-sh/nvm?tab=readme-ov-file#usage
        nodeLaunchArgs = ['nvm', 'run', '--silent'];
        break;
      case 'node-yarn':
        // https://yarnpkg.com/cli/node
        nodeLaunchArgs = ['yarn', 'node'];

        // yarn is a batch (CMD) file which cannot directly be launched
        // as executable via spawn() and quoting is a nightmare
        // so instead we spawn node with the yarn entry point
        if (platform() === 'win32') {
          const pathToYarn = await which('yarn', { nothrow: true });
          if (pathToYarn) {
            const pathToYarnEntry = path.resolve(path.dirname(pathToYarn), 'node_modules/corepack/dist/yarn.js');
            nodeLaunchArgs = [
              // equal to "yarn node"
              'node', pathToYarnEntry, 'node'
            ];
          }
        }

        break;
      case 'nvm-yarn':
        nodeLaunchArgs = [
          // 1. nvm exec to start yarn
          'nvm',
          'exec',
          '--silent',
          // 2. yarn node to start a nested node with the yarn hook registered
          'yarn',
          'node'
        ];
        break;
        case 'custom':
          nodeLaunchArgs = this.settings.customRuntime.value;
          break;
    }

    this._runtime = new NodeLikeTestRuntime(this.logChannel, this.configFileUri, this.settings, nodeLaunchArgs);
  }

  private async detectRuntime(): Promise<Exclude<TestRuntimeMode, 'auto'>> {
    const runtime = this.settings.runtime.value;
    if (runtime !== 'auto') {
      return runtime;
    }

    const pathToNvmRc = await this.resolveNvmRc();
    const useYarn = await this.shouldUseYarn();

    if (pathToNvmRc) {
      return useYarn ? 'nvm-yarn' : 'nvm';
    }
    return useYarn ? 'node-yarn' : 'node';
  }

  private async shouldUseYarn(): Promise<boolean> {
    // 1. check if package.json declares yarn
    const packageJson = await this.resolveFile('package.json');
    if (packageJson) {
      try {
        const contents = JSON.parse(await fs.promises.readFile(packageJson, 'utf-8'));
        if (contents?.packageManager?.startsWith('yarn')) {
          return true;
        }
      } catch {
        // ignore
      }

      // 2. check for "yarn.lock" beside package.json
      if (
        await fs.promises
          .access(path.join(path.dirname(packageJson), 'yarn.lock'))
          .then(() => true)
          .catch(() => false)
      ) {
        return true;
      }
    }

    // 3. check for "yarn.lock" beside config
    if (
      await fs.promises
        .access(path.join(path.dirname(this.configFileUri.fsPath), 'yarn.lock'))
        .then(() => true)
        .catch(() => false)
    ) {
      return true;
    }

    return false;
  }

  public static async isNvmInstalled() {
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
    if (!(await SettingsBasedTestRuntime.isNvmInstalled())) {
      return undefined;
    }

    return this.resolveFile('.nvmrc');
  }

  private async resolveFile(fileName: string): Promise<string | undefined> {
    try {
      let dir: string | undefined = path.dirname(this.configFileUri.fsPath);

      while (dir) {
        const filePath = path.join(dir, fileName);
        if (
          await fs.promises
            .access(filePath)
            .then(() => true)
            .catch(() => false)
        ) {
          this.logChannel.debug(`Found ${fileName} at ${filePath}`);
          return filePath;
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
