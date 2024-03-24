/*---------------------------------------------------------
 * Copyright (C) OpenJS Foundation and contributors, https://openjsf.org
 * Copyright (C) Microsoft Corporation. All rights reserved.
 *--------------------------------------------------------*/

import { ChildProcessWithoutNullStreams, spawn } from 'child_process';
import resolveModule from 'enhanced-resolve';
import * as fs from 'fs';
import { minimatch } from 'minimatch';
import * as path from 'path';
import * as vscode from 'vscode';
import which from 'which';
import { DisposableStore } from './disposable';
import { HumanError } from './errors';

type OptionsModule = {
  loadOptions(): IResolvedConfiguration
};

type ConfigModule = {
  findConfig(): string
};

export type IResolvedConfiguration = Mocha.MochaOptions & { "_": string[] | undefined, "node-option": string[] | undefined }

export class ConfigurationFile implements vscode.Disposable {
  private readonly ds = new DisposableStore();
  private readonly didDeleteEmitter = this.ds.add(new vscode.EventEmitter<void>());
  private readonly didChangeEmitter = this.ds.add(new vscode.EventEmitter<void>());

  private _resolver?: resolveModule.Resolver;
  private _optionsModule?: OptionsModule;
  private _configModule?: ConfigModule;
  private _pathToNode?: string;
  private _pathToMocha?: string;

  /** Cached read promise, invalided on file change. */
  private readPromise?: Promise<ConfigurationList>;

  /** Fired when the file is deleted. */
  public readonly onDidDelete = this.didDeleteEmitter.event;

  /** Fired when the file changes. */
  public readonly onDidChange = this.didChangeEmitter.event;

  constructor(
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

  async getPathToNode() {
    // We cannot use process.execPath as this points to code.exe which is an electron application
    // also with ELECTRON_RUN_AS_NODE this can lead to errors (e.g. with the --import option)
    // we prefer to use the system level node
    this._pathToNode ??= (await which("node", { nothrow: true })) ?? process.execPath;
    return this._pathToNode;
  }

  async getMochaSpawnArgs(customArgs: readonly string[]): Promise<string[]> {
    // TODO: resolve from package.json? 
    this._pathToMocha ??= await this._resolveLocalMochaPath('/bin/mocha.js');

    return [await this.getPathToNode(), this._pathToMocha, '--config', this.uri.fsPath, ...customArgs];
  }

  public async spawnMocha(args: readonly string[]) {

    const spawnArgs = await this.getMochaSpawnArgs(args);

    return await new Promise<ChildProcessWithoutNullStreams>((resolve, reject) => {
      const p = spawn(spawnArgs[0], spawnArgs.slice(1), {
        cwd: path.dirname(this.uri.fsPath),
        env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
      });
      p.on('spawn', () => resolve(p));
      p.on('error', reject);
    });
  }

  private async _resolveLocalMochaPath(suffix?: string): Promise<string> {
    this._resolver ??= resolveModule.ResolverFactory.createResolver({
      fileSystem: new resolveModule.CachedInputFileSystem(fs, 4000),
      conditionNames: ['node', 'require', 'module'],
    });

    return new Promise<string>((resolve, reject) =>
      this._resolver!.resolve(
        {},
        path.dirname(this.uri.fsPath),
        'mocha' + (suffix ?? ""),
        {},
        (err, res) => {
          if (err) {
            reject(new HumanError(`Could not find mocha in working directory '${path.dirname(this.uri.fsPath)}', please install mocha to run tests.`));
          } else {
            resolve(res as string);
          }
        },
      ),
    );
  }

  private async _read() {
    this._optionsModule ??= require(await this._resolveLocalMochaPath('/lib/cli/options')) as OptionsModule;
    this._configModule ??= require(await this._resolveLocalMochaPath('/lib/cli/config')) as ConfigModule;
    let config: IResolvedConfiguration;

    // need to change to the working dir for loading the config, 
    // TODO[mocha]: allow specifying the cwd in loadOptions()
    const currentCwd = process.cwd();;
    try {
      process.chdir(path.dirname(this.uri.fsPath));

      // we need to ensure a reload for javascript files
      // as they are in the require cache https://github.com/mochajs/mocha/blob/e263c7a722b8c2fcbe83596836653896a9e0258b/lib/cli/config.js#L37
      const configFile = this._configModule.findConfig();
      try {
        const resolved = require.resolve(configFile);
        delete require.cache[resolved];
      }
      catch (e) {
        // ignore
      }

      config = this._optionsModule.loadOptions();
    }
    finally {
      process.chdir(currentCwd);
    }

    return new ConfigurationList(this.uri, config, this.wf);
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
    public readonly uri: vscode.Uri,
    public readonly value: IResolvedConfiguration,
    wf: vscode.WorkspaceFolder,
  ) {
    let positional = value._;
    if (!positional) {
      positional = ['./test/*.{js,cjs,mjs}'];
    }

    this.patterns = positional.map(f => {
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
