/*---------------------------------------------------------
 * Copyright (C) Microsoft Corporation. All rights reserved.
 *--------------------------------------------------------*/
import type { TestConfiguration } from '@vscode/test-cli';
import { spawn } from 'child_process';
import resolveModule from 'enhanced-resolve';
import * as fs from 'fs';
import { minimatch } from 'minimatch';
import * as path from 'path';
import * as vscode from 'vscode';
import { cliPackageName } from './constants';
import { DisposableStore } from './disposable';
import { CliPackageMissing, ConfigProcessReadError, HumanError } from './errors';

interface IResolvedConfiguration {
  files: string[];
  env: Record<string, string>;
  extensionTestsPath: string;
  config: TestConfiguration;
  path: string;
}

const resolver = resolveModule.ResolverFactory.createResolver({
  fileSystem: new resolveModule.CachedInputFileSystem(fs, 4000),
  conditionNames: ['node', 'require', 'module'],
});

export class ConfigurationFile implements vscode.Disposable {
  private readonly ds = new DisposableStore();
  private readonly didDeleteEmitter = this.ds.add(new vscode.EventEmitter<void>());
  private readonly didChangeEmitter = this.ds.add(new vscode.EventEmitter<void>());

  /** Cached read promise, invalided on file change. */
  private readPromise?: Promise<ConfigurationList>;

  /** Fired when the file is deleted. */
  public readonly onDidDelete = this.didDeleteEmitter.event;

  /** Fired when the file changes. */
  public readonly onDidChange = this.didChangeEmitter.event;

  constructor(
    public readonly uri: vscode.Uri,
    private readonly wf: vscode.WorkspaceFolder,
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

  private async _read() {
    const cliPath = await this.getCliBinPath();
    const configs = await new Promise<IResolvedConfiguration[]>((resolve, reject) => {
      const p = spawn(
        process.execPath,
        [cliPath, '--config', this.uri.fsPath, '--list-configuration'],
        { env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' } },
      );
      const output: Buffer[] = [];
      p.stdout.on('data', (chunk) => output.push(chunk));
      p.stderr.on('data', (chunk) => output.push(chunk));
      p.on('error', reject);
      p.on('close', (code) => {
        const joined = Buffer.concat(output).toString();
        if (code !== 0) {
          return reject(new ConfigProcessReadError(joined));
        }

        try {
          resolve(JSON.parse(joined));
        } catch {
          reject(new ConfigProcessReadError(`invalid JSON: ${joined}`));
        }
      });
    });

    return new ConfigurationList(this.uri, configs, this.wf);
  }

  /**
   * Resolves the path to the test runner CLI, a JavaScript file.
   * @throws {HumanError} if the module isn't found
   */
  private async getCliBinPath() {
    return new Promise<string>((resolve, reject) =>
      resolver.resolve({}, this.uri.fsPath, cliPackageName, {}, (err, res) => {
        if (err) {
          reject(new CliPackageMissing(err));
        } else {
          resolve(path.join(path.dirname(res as string), 'bin.mjs'));
        }
      }),
    );
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
  )[][];

  constructor(
    public readonly uri: vscode.Uri,
    public readonly value: IResolvedConfiguration[],
    wf: vscode.WorkspaceFolder,
  ) {
    this.patterns = value.map(({ config }) => {
      const files = typeof config.files === 'string' ? [config.files] : config.files;
      return files.map((f) => {
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
    });
  }

  /**
   * Returns a rough list of glob patterns and files that are included by the
   * test configurations.
   */
  public roughIncludedFiles() {
    const patterns = new Set<string>();
    const files = new Set<string>();
    for (const patternList of this.patterns) {
      for (const p of patternList) {
        if (p.value.startsWith('!')) {
          continue;
        }

        if (p.glob) {
          patterns.add(p.workspaceFolderRelativeGlob);
        } else {
          files.add(p.value);
        }
      }
    }

    return { patterns: [...patterns], files: [...files] };
  }

  /** Gets the config the given test file is included by, if any. */
  public includesTestFile(uri: vscode.Uri) {
    const file = toForwardSlashes(uri.fsPath);
    const patternGroup = this.patterns.findIndex((files) => {
      let matched = false;
      for (let { glob, value } of files) {
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
    });

    return patternGroup !== -1 ? this.patterns[patternGroup] : undefined;
  }
}
