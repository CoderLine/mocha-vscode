/**
 * Copyright (C) Daniel Kuschny (Danielku15) and contributors.
 * Copyright (C) Microsoft Corporation. All rights reserved.
 *
 * Use of this source code is governed by an MIT-style
 * license that can be found in the LICENSE file or at
 * https://opensource.org/licenses/MIT.
 */

export interface IParsedNode {
  name: string;
  kind: NodeKind;
  startLine: number; // base 1
  startColumn: number; // base 1
  endLine?: number; // base 1
  endColumn?: number; // base 1
  directive?: 'skip' | 'only' | string;
  children: IParsedNode[];
  error?: string;
}

export interface IExtensionSettings {
  suite: readonly string[];
  test: readonly string[];
  hooks: readonly string[];
  extractWith: 'syntax' | 'evaluation-cjs' | 'evaluation-cjs-full';
  extractTimeout: number;
}

export enum NodeKind {
  Suite,
  Test,
}

export interface ITestDiscoverer {
  discover(filePath: string, code: string): Promise<IParsedNode[]>;
}
