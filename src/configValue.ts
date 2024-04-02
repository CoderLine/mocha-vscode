/**
 * Copyright (C) Daniel Kuschny (Danielku15) and contributors.
 * Copyright (C) Microsoft Corporation. All rights reserved.
 *
 * Use of this source code is governed by an MIT-style
 * license that can be found in the LICENSE file or at
 * https://opensource.org/licenses/MIT.
 */

import * as vscode from 'vscode';

const sectionName = 'extension-test-runner';

export class ConfigValue<T> {
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
    scope?: vscode.ConfigurationScope,
  ) {
    this.changeListener = vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration(this.key)) {
        this.setValue(
          vscode.workspace.getConfiguration(sectionName, scope).get(sectionKey) ?? defaultValue,
        );
      }
    });

    this.setValue(
      vscode.workspace.getConfiguration(sectionName, scope).get(sectionKey) ?? defaultValue,
    );
  }

  public dispose() {
    this.changeListener.dispose();
    this.changeEmitter.dispose();
  }

  private setValue(value: T) {
    this._value = value;
    this.changeEmitter.fire(this._value);
  }
}
