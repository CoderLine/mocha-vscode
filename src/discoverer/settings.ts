/**
 * Copyright (C) Daniel Kuschny (Danielku15) and contributors.
 * Copyright (C) Microsoft Corporation. All rights reserved.
 *
 * Use of this source code is governed by an MIT-style
 * license that can be found in the LICENSE file or at
 * https://opensource.org/licenses/MIT.
 */

import * as vscode from 'vscode';
import { TsConfigStore } from '../tsconfig-store';
import { EvaluationTestDiscoverer } from './evaluate';
import { SyntaxTestDiscoverer } from './syntax';
import { IExtensionSettings, IParsedNode, ITestDiscoverer } from './types';

export class SettingsBasedFallbackTestDiscoverer implements ITestDiscoverer {
  private _syntax: SyntaxTestDiscoverer;
  private _evaluation: EvaluationTestDiscoverer;

  constructor(
    private logChannel: vscode.LogOutputChannel,
    private settings: IExtensionSettings,
    tsconfigStore: TsConfigStore,
  ) {
    this._syntax = new SyntaxTestDiscoverer(settings, tsconfigStore);
    this._evaluation = new EvaluationTestDiscoverer(logChannel, settings, tsconfigStore);
  }

  async discover(filePath: string, code: string): Promise<IParsedNode[]> {
    if (this.settings.extractWith === 'evaluation') {
      try {
        return this._evaluation.discover(filePath, code);
      } catch (e) {
        this.logChannel.error('Error evaluating, will fallback to syntax', e);
      }
    }

    return this._syntax.discover(filePath, code);
  }
}
