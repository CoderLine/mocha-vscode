/*---------------------------------------------------------
 * Copyright (C) Daniel Kuschny (Danielku15) and contributors.
 * Copyright (C) Microsoft Corporation. All rights reserved.
 *--------------------------------------------------------*/

import { extractWithEvaluation } from './evaluate';
import { extractWithAst } from './syntax';
import { ITestSymbols } from './types';
import * as vscode from 'vscode';

export * from './types';

export const extract = async (
  logChannel: vscode.LogOutputChannel,
  filePath: string,
  code: string,
  symbols: ITestSymbols,
) => {
  if (symbols.extractWith === 'evaluation') {
    try {
      return await extractWithEvaluation(logChannel, filePath, code, symbols);
    } catch (e) {
      console.warn('error evaluating, will fallback', e);
      // fall through
    }
  }

  return extractWithAst(filePath, code, symbols);
};
