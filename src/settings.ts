/**
 * Copyright (C) Daniel Kuschny (Danielku15) and contributors.
 * Copyright (C) Microsoft Corporation. All rights reserved.
 *
 * Use of this source code is governed by an MIT-style
 * license that can be found in the LICENSE file or at
 * https://opensource.org/licenses/MIT.
 */

import type { Disposable } from 'vscode';
import { DisposableStore } from './disposable';
import * as vscode from 'vscode';

export interface IExtensionSettings {
  suite: readonly string[];
  test: readonly string[];
  hooks: readonly string[];
  extractWith: 'syntax' | 'evaluation-cjs' | 'evaluation-cjs-full';
  extractTimeout: number;
}

export const defaultTestSymbols: IExtensionSettings = {
  suite: ['describe', 'suite'],
  test: ['it', 'test'],
  hooks: ['before', 'after', 'beforeEach', 'afterEach'],
  extractWith: 'evaluation-cjs',
  extractTimeout: 10_000
};

export type TestRuntimeMode = 'auto' | 'node' | 'nvm' | 'node-yarn' | 'nvm-yarn';

export class ExtensionSettings implements Disposable {
  private readonly disposables = new DisposableStore();

  public readonly extractSettings = this.disposables.add(new ConfigValue('extractSettings', defaultTestSymbols));
  public readonly debugOptions = this.disposables.add(new ConfigValue<Record<string, any>>('debugOptions', {}));
  public readonly env = this.disposables.add(new ConfigValue<Record<string, string>>('env', {}));
  public readonly runtime = this.disposables.add(new ConfigValue<TestRuntimeMode>('runtime', 'auto'));

  public dispose() {
    this.disposables.dispose();
  }
}

const sectionName = 'mocha-vscode';

class ConfigValue<T> {
  private readonly changeEmitter = new vscode.EventEmitter<T>();
  private readonly changeListener: vscode.Disposable;
  private _value!: T;

  public readonly onDidChange = this.changeEmitter.event;

  public get value() {
    return this._value;
  }

  public get key() {
    return `${sectionName}.${this.sectionKey}`;
  }

  constructor(
    private readonly sectionKey: string,
    defaultValue: T,
    scope?: vscode.ConfigurationScope
  ) {
    this.changeListener = vscode.workspace.onDidChangeConfiguration(e => {
      if (e.affectsConfiguration(this.key)) {
        this.setValue(vscode.workspace.getConfiguration(sectionName, scope).get(sectionKey) ?? defaultValue);
      }
    });

    this.setValue(vscode.workspace.getConfiguration(sectionName, scope).get(sectionKey) ?? defaultValue);
  }

  public dispose() {
    this.changeListener.dispose();
    this.changeEmitter.dispose();
  }

  public setValue(value: T) {
    this._value = value;
    this.changeEmitter.fire(this._value);
  }
}
