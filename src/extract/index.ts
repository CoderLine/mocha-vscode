/*---------------------------------------------------------
 * Copyright (C) Microsoft Corporation. All rights reserved.
 *--------------------------------------------------------*/

import { extractWithEvaluation } from './evaluate';

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
}

export const enum NodeKind {
  Suite,
  Test,
}

export const extract = (code: string, symbols: ITestSymbols) => {
  if (symbols.extractWith === 'evaluation') {
    return extractWithEvaluation(code, symbols);
  } else {
    throw new Error('not implemented');
  }
};
