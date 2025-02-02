/**
 * Copyright (C) Daniel Kuschny (Danielku15) and contributors.
 * Copyright (C) Microsoft Corporation. All rights reserved.
 *
 * Use of this source code is governed by an MIT-style
 * license that can be found in the LICENSE file or at
 * https://opensource.org/licenses/MIT.
 */

import resolveModule from 'enhanced-resolve';
import * as fs from 'fs';
import { minimatch } from 'minimatch';
import * as path from 'path';
import * as vscode from 'vscode';
import { DisposableStore } from './disposable';
import { HumanError } from './errors';
import { getPathToNode, isNvmInstalled } from './node';

type OptionsModule = {
  loadOptions(): IResolvedConfiguration;
};

type ConfigModule = {
  findConfig(): string;
};

export type IResolvedConfiguration = Mocha.MochaOptions & {
  _: string[] | undefined;
  'node-option': string[] | undefined;
  ignore: string[] | undefined;
};

export class ConfigurationFile implements vscode.Disposable {
  private readonly ds = new DisposableStore();
  private readonly didDeleteEmitter = this.ds.add(new vscode.EventEmitter<void>());
  private readonly didChangeEmitter = this.ds.add(new vscode.EventEmitter<void>());
  private readonly activateEmitter = this.ds.add(new vscode.EventEmitter<void>());

  private _activateFired: boolean = false;
  private _resolver?: resolveModule.Resolver;
  private _optionsModule?: OptionsModule;
  private _configModule?: ConfigModule;
  private _pathToMocha?: string;
  private _pathToNvmRc?: string;

  /** Cached read promise, invalided on file change. */
  private readPromise?: Promise<ConfigurationList>;

  /** Fired when the file is deleted. */
  public readonly onDidDelete = this.didDeleteEmitter.event;

  /** Fired when the file changes. */
  public readonly onDidChange = this.didChangeEmitter.event;

  /**
   * Fired the config file becomes active for actually handling tests
   * (e.g. not fired on package.json without mocha section).
   */
  public readonly onActivate = this.activateEmitter.event;

  constructor(
    private readonly logChannel: vscode.LogOutputChannel,
    public readonly uri: vscode.Uri,
    public readonly wf: vscode.WorkspaceFolder,
  ) {
    const watcher = this.ds.add(vscode.workspace.createFileSystemWatcher(uri.fsPath));
    let changeDebounce: NodeJS.Timeout | undefined;
    this.ds.add(
      watcher.onDidChange(() => {
        if (changeDebounce) {
          clearTimeout(changeDebounce);
        }
        changeDebounce = setTimeout(() => {
          changeDebounce = undefined;
          this.readPromise = undefined;
          this.didChangeEmitter.fire();
          this.tryActivate();
        }, 300);
      }),
    );

    this.ds.add(
      watcher.onDidDelete(() => {
        this.readPromise = undefined;
        this.didDeleteEmitter.fire();
      }),
    );
  }

  public get isActive() {
    return this._activateFired;
  }

  public async tryActivate(): Promise<boolean> {
    if (this._activateFired) {
      return true;
    }

    const configFile = path.basename(this.uri.fsPath).toLowerCase();
    if (configFile === 'package.json') {
      try {
        const packageJson = JSON.parse(await fs.promises.readFile(this.uri.fsPath, 'utf-8'));
        if ('mocha' in packageJson && typeof packageJson.mocha !== 'undefined') {
          this.logChannel.trace('Found mocha section in package.config, skipping activation');
          this.activateEmitter.fire();
          this._activateFired = true;
          return true;
        } else {
          this.logChannel.trace('No mocha section in package.config, skipping activation');
        }
      } catch (e) {
        this.logChannel.warn(
          'Error while reading mocha options from package.config, skipping activation',
          e,
        );
      }
    } else {
      // for normal mocharc files directly activate
      this.activateEmitter.fire();
      this._activateFired = true;
      return true;
    }

    return false;
  }

  /**
   * Reads the config file from disk.
   * @throws {HumanError} if anything goes wrong
   */
  public read() {
    return (this.readPromise ??= this._read());
  }

  /**
   * Clears any cached config read.
   */
  public forget() {
    this.readPromise = undefined;
  }

  async getMochaSpawnArgs(customArgs: readonly string[]): Promise<string[]> {
    this._pathToMocha ??= await this._resolveLocalMochaBinPath();
    this._pathToNvmRc ??= await this._resolveNvmRc();

    let nodeSpawnArgs: string[];
    if (
      this._pathToNvmRc &&
      (await fs.promises
        .access(this._pathToNvmRc)
        .then(() => true)
        .catch(() => false))
    ) {
      nodeSpawnArgs = ['nvm', 'run'];
    } else {
      this._pathToNvmRc = undefined;
      nodeSpawnArgs = [await getPathToNode(this.logChannel)];
    }

    return [...nodeSpawnArgs, this._pathToMocha, '--config', this.uri.fsPath, ...customArgs];
  }

  private getResolver() {
    if (!this._resolver) {
      this.logChannel.debug('Creating new resolver for resolving Mocha');
      this._resolver ??= resolveModule.ResolverFactory.createResolver({
        fileSystem: new resolveModule.CachedInputFileSystem(fs, 4000),
        conditionNames: ['node', 'require', 'module'],
      });
    }
    return this._resolver;
  }

  public async getMochaNodeModulesPath(): Promise<string> {
    const mocha = await this._resolveLocalMochaPath();

    let current = path.dirname(mocha);
    let prev = current;
    do {
      prev = current;

      if (path.basename(current) === 'node_modules') {
        return current;
      }

      current = path.resolve(current, '..');
    } while (current !== prev);

    throw new HumanError(`Could not find node_modules above '${mocha}'`);
  }

  private async _resolveNvmRc(): Promise<string | undefined> {
    // the .nvmrc file can be placed in any location up the directory tree, so we do the same
    // starting from the mocha config file
    // https://github.com/nvm-sh/nvm/blob/06413631029de32cd9af15b6b7f6ed77743cbd79/nvm.sh#L475-L491
    try {
      if (!(await isNvmInstalled())) {
        return undefined;
      }

      let dir: string | undefined = path.dirname(this.uri.fsPath);

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

  private async _resolveLocalMochaBinPath(): Promise<string> {
    try {
      const packageJsonPath = await this._resolveLocalMochaPath('/package.json');
      const packageJson = JSON.parse(await fs.promises.readFile(packageJsonPath, 'utf-8'));
      let binPath = packageJson?.bin?.mocha;
      if (binPath) {
        binPath = path.join(path.dirname(packageJsonPath), binPath);
        await fs.promises.access(binPath);
        return binPath;
      }
    } catch (e) {
      // ignore
    }

    this.logChannel.info('Could not resolve mocha bin path from package.json, fallback to default');
    return await this._resolveLocalMochaPath('/bin/mocha.js');
  }

  private _resolveLocalMochaPath(suffix: string = ''): Promise<string> {
    return this._resolve(`mocha${suffix}`);
  }

  private _resolve(request: string): Promise<string> {
    return new Promise<string>((resolve, reject) => {
      const dir = path.dirname(this.uri.fsPath);
      this.logChannel.debug(`resolving '${request}' via ${dir}`);
      this.getResolver().resolve({}, dir, request, {}, (err, res) => {
        if (err) {
          this.logChannel.error(`resolving '${request}' failed with error ${err}`);
          reject(
            new HumanError(
              `Could not find mocha in working directory '${path.dirname(
                this.uri.fsPath,
              )}', please install mocha to run tests.`,
            ),
          );
        } else {
          this.logChannel.debug(`'${request}' resolved to '${res}'`);
          resolve(res as string);
        }
      });
    });
  }

  private async _read() {
    this._optionsModule ??= require(
      await this._resolveLocalMochaPath('/lib/cli/options'),
    ) as OptionsModule;
    this._configModule ??= require(
      await this._resolveLocalMochaPath('/lib/cli/config'),
    ) as ConfigModule;
    let config: IResolvedConfiguration;

    // need to change to the working dir for loading the config,
    // TODO[mocha]: allow specifying the cwd in loadOptions()
    const currentCwd = process.cwd();
    try {
      const configSearchPath = path.dirname(this.uri.fsPath);
      this.logChannel.debug(`Reading mocharc, changing working directory to ${configSearchPath}`);
      process.chdir(configSearchPath);

      // we need to ensure a reload for javascript files
      // as they are in the require cache https://github.com/mochajs/mocha/blob/e263c7a722b8c2fcbe83596836653896a9e0258b/lib/cli/config.js#L37
      const configFile = this._configModule.findConfig();
      try {
        const resolved = require.resolve(configFile);
        delete require.cache[resolved];
      } catch (e) {
        // ignore
      }

      config = this._optionsModule.loadOptions();
      this.logChannel.debug(`Loaded mocharc via Mocha`);
    } finally {
      this.logChannel.debug(`Reading mocharc, changing working directory back to ${currentCwd}`);
      process.chdir(currentCwd);
    }

    return new ConfigurationList(this.logChannel, this.uri, config, this.wf);
  }

  /**
   * Resolves the path to the package.json.
   */
  public resolvePackageJson() {
    return path.join(path.dirname(this.uri.fsPath), 'package.json');
  }

  /** @inheritdoc */
  public dispose() {
    this.ds.dispose();
  }
}

const toForwardSlashes = (p: string) => p.replace(/\\/g, '/');

export class ConfigurationList {
  private readonly patterns: (
    | { glob: false; value: string }
    | { glob: true; value: string; workspaceFolderRelativeGlob: string }
  )[];

  constructor(
    private readonly logChannel: vscode.LogOutputChannel,
    public readonly uri: vscode.Uri,
    public readonly value: IResolvedConfiguration,
    wf: vscode.WorkspaceFolder,
  ) {
    let positional = value._;
    if (!positional) {
      positional = ['./test/*.{js,cjs,mjs}'];
    }

    this.patterns = positional.map((f) => {
      if (path.isAbsolute(f)) {
        return { glob: false, value: path.normalize(f) };
      } else {
        const cfgDir = path.dirname(this.uri.fsPath);
        return {
          glob: true,
          value: toForwardSlashes(path.join(cfgDir, f)),
          workspaceFolderRelativeGlob: toForwardSlashes(
            path.join(path.relative(wf.uri.fsPath, cfgDir), f),
          ),
        };
      }
    });

    if (value.ignore) {
      this.patterns.push(
        ...value.ignore.map((f) => {
          if (path.isAbsolute(f)) {
            return { glob: false as const, value: '!' + path.normalize(f) };
          } else {
            const cfgDir = path.dirname(this.uri.fsPath);
            return {
              glob: true as const,
              value: '!' + toForwardSlashes(path.join(cfgDir, f)),
              workspaceFolderRelativeGlob: toForwardSlashes(
                path.join(path.relative(wf.uri.fsPath, cfgDir), f),
              ),
            };
          }
        }),
      );
    }

    this.logChannel.debug(`Loaded mocharc via '${uri.fsPath}', with patterns`, this.patterns);
  }

  /**
   * Returns a rough list of glob patterns and files that are included by the
   * test configurations.
   */
  public roughIncludedFiles() {
    const patterns = new Set<string>();
    const files = new Set<string>();
    for (const p of this.patterns) {
      if (p.value.startsWith('!')) {
        continue;
      }

      if (p.glob) {
        patterns.add(p.workspaceFolderRelativeGlob);
      } else {
        files.add(p.value);
      }
    }

    return { patterns: [...patterns], files: [...files] };
  }

  /** Gets the configs the given test file is included by, if any. */
  public includesTestFile(uri: vscode.Uri) {
    const file = toForwardSlashes(uri.fsPath);
    let matched = false;

    for (let { glob, value } of this.patterns.values()) {
      let negated = false;
      if (value.startsWith('!')) {
        negated = true;
        value = value.slice(1);
      }

      if (glob ? minimatch(file, value) : value === path.normalize(file)) {
        matched = !negated;
      }
    }

    return matched;
  }
}
