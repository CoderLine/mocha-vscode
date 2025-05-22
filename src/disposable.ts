/**
 * Copyright (C) Daniel Kuschny (Danielku15) and contributors.
 * Copyright (C) Microsoft Corporation. All rights reserved.
 *
 * Use of this source code is governed by an MIT-style
 * license that can be found in the LICENSE file or at
 * https://opensource.org/licenses/MIT.
 */

import type * as vscode from 'vscode';

export class DisposableStore {
  private disposables: vscode.Disposable[] | undefined = [];

  public add<T extends vscode.Disposable>(disposable: T): T {
    if (!this.disposables) {
      disposable.dispose();
    } else {
      this.disposables.push(disposable);
    }
    return disposable;
  }

  public remove(disposable: vscode.Disposable) {
    if (this.disposables) {
      this.disposables = this.disposables.filter((d) => d !== disposable);
    }
  }

  public dispose() {
    if (this.disposables) {
      for (const disposable of this.disposables) {
        disposable.dispose();
      }
      this.disposables = undefined;
    }
  }
}

export class MutableDisposable<T extends vscode.Disposable = vscode.Disposable> {
  private _value: T | undefined;

  public get value() {
    return this._value;
  }

  public set value(value: T | undefined) {
    if (this._value) {
      this._value.dispose();
    }
    this._value = value;
  }

  public clear() {
    this._value?.dispose();
    this._value = undefined;
  }

  public dispose() {
    if (this._value) {
      this._value.dispose();
    }
  }
}
