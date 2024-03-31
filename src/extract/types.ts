/*---------------------------------------------------------
 * Copyright (C) OpenJS Foundation and contributors, https://openjsf.org
 * Copyright (C) Microsoft Corporation. All rights reserved.
 *--------------------------------------------------------*/

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

export interface ITestSymbols {
  suite: readonly string[];
  test: readonly string[];
  extractWith: 'evaluation' | 'syntax';
  extractTimeout: number;
}

export const enum NodeKind {
  Suite,
  Test,
}
