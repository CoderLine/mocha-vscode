/*---------------------------------------------------------
 * Copyright (C) OpenJS Foundation and contributors, https://openjsf.org
 * Copyright (C) Microsoft Corporation. All rights reserved.
 *--------------------------------------------------------*/

import { ConfigurationFile } from '../configurationFile';
import { extractWithEvaluation } from './evaluate';
import { extractWithAst } from './syntax';
import { ITestSymbols } from './types';

export * from './types';

export const extract = async (filePath: string, code: string, config: ConfigurationFile, symbols: ITestSymbols) => {
  if (symbols.extractWith === 'evaluation') {
    try {
      return await extractWithEvaluation(filePath, code, config, symbols);
    } catch (e) {
      console.warn('error evaluating, will fallback', e);
      // fall through
    }
  }

  return extractWithAst(filePath, code, config, symbols);
};
