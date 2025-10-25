/**
 * Copyright (C) Daniel Kuschny (Danielku15) and contributors.
 * Copyright (C) Microsoft Corporation. All rights reserved.
 *
 * Use of this source code is governed by an MIT-style
 * license that can be found in the LICENSE file or at
 * https://opensource.org/licenses/MIT.
 */

import type * as vscode from 'vscode';
import type { TsConfigStore } from '../tsconfig-store';
import { EvaluationTestDiscoverer } from './evaluate';
import { FullEvaluationTestDiscoverer } from './evaluate-full';
import { SyntaxTestDiscoverer } from './syntax';
import type { IParsedNode, ITestDiscoverer } from './types';
import type { ExtensionSettings } from '../settings';

export class SettingsBasedFallbackTestDiscoverer implements ITestDiscoverer {
  private _syntax: SyntaxTestDiscoverer;
  private _evaluation: EvaluationTestDiscoverer;
  private _fullEvaluation: FullEvaluationTestDiscoverer;

  constructor(
    private logChannel: vscode.LogOutputChannel,
    private settings: ExtensionSettings,
    tsconfigStore: TsConfigStore,
  ) {
    this._syntax = new SyntaxTestDiscoverer(settings, tsconfigStore);
    this._evaluation = new EvaluationTestDiscoverer(logChannel, settings, tsconfigStore);
    this._fullEvaluation = new FullEvaluationTestDiscoverer(logChannel, settings, tsconfigStore);
  }

  async discover(filePath: string, code: string): Promise<IParsedNode[]> {
    let discoverer: ITestDiscoverer;
    switch (this.settings.extractSettings.value.extractWith) {
      case 'syntax':
        discoverer = this._syntax;
        break;
      case 'evaluation-cjs':
        discoverer = this._evaluation;
        break;
      case 'evaluation-cjs-full':
        discoverer = this._fullEvaluation;
        break;
      default:
        discoverer = this._evaluation;
        break;
    }

    try {
      return discoverer.discover(filePath, code);
    } catch (e) {
      if (discoverer !== this._syntax) {
        this.logChannel.error(
          `Error discovering tests with ${this.settings.extractSettings.value.extractWith}, will fallback to syntax`,
          e,
        );
        return this._syntax.discover(filePath, code);
      }
      this.logChannel.error(`Error discovering tests with ${this.settings.extractSettings.value.extractWith}`, e);
      throw e;
    }
  }
}
