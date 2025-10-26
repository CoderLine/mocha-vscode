/**
 * Copyright (C) Daniel Kuschny (Danielku15) and contributors.
 * Copyright (C) Microsoft Corporation. All rights reserved.
 *
 * Use of this source code is governed by an MIT-style
 * license that can be found in the LICENSE file or at
 * https://opensource.org/licenses/MIT.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { minimatch } from 'minimatch';
import * as vscode from 'vscode';
import { DisposableStore } from './disposable';
import type { IResolvedConfiguration, ITestRuntime } from './runtime/types';

export class ConfigurationFile implements vscode.Disposable {
  private readonly ds = new DisposableStore();
  private readonly didDeleteEmitter = this.ds.add(new vscode.EventEmitter<void>());
  private readonly didChangeEmitter = this.ds.add(new vscode.EventEmitter<void>());
  private readonly activateEmitter = this.ds.add(new vscode.EventEmitter<void>());

  private _activateFired = false;

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
    private readonly runtime: ITestRuntime
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
      })
    );

    this.ds.add(
      watcher.onDidDelete(() => {
        this.readPromise = undefined;
        this.didDeleteEmitter.fire();
      })
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
          this.logChannel.trace('Found mocha section in package.config, activating');
          this.activateEmitter.fire();
          this._activateFired = true;
          return true;
        }
        this.logChannel.trace('No mocha section in package.config, skipping activation');
      } catch (e) {
        this.logChannel.warn('Error while reading mocha options from package.config, skipping activation', e);
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
    this.readPromise ??= this._read();
    return this.readPromise;
  }

  /**
   * Clears any cached config read.
   */
  public forget() {
    this.readPromise = undefined;
  }

  private async _read() {
    const config = await this.runtime.resolveConfiguration();
    return new ConfigurationList(this.logChannel, this.uri, config, this.wf);
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
    wf: vscode.WorkspaceFolder
  ) {
    let positional = value._;
    if (!positional) {
      positional = ['./test/*.{js,cjs,mjs}'];
    }

    this.patterns = positional.map(f => {
      if (path.isAbsolute(f)) {
        return { glob: false, value: path.normalize(f) };
      }
      const cfgDir = path.dirname(this.uri.fsPath);
      return {
        glob: true,
        value: toForwardSlashes(path.join(cfgDir, f)),
        workspaceFolderRelativeGlob: toForwardSlashes(path.join(path.relative(wf.uri.fsPath, cfgDir), f))
      };
    });

    if (value.ignore) {
      this.patterns.push(
        ...value.ignore.map(f => {
          if (path.isAbsolute(f)) {
            return { glob: false as const, value: `!${path.normalize(f)}` };
          }
          const cfgDir = path.dirname(this.uri.fsPath);
          return {
            glob: true as const,
            value: `!${toForwardSlashes(path.join(cfgDir, f))}`,
            workspaceFolderRelativeGlob: toForwardSlashes(path.join(path.relative(wf.uri.fsPath, cfgDir), f))
          };
        })
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
