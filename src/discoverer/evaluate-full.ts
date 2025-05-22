/**
 * Copyright (C) Daniel Kuschny (Danielku15) and contributors.
 * Copyright (C) Microsoft Corporation. All rights reserved.
 *
 * Use of this source code is governed by an MIT-style
 * license that can be found in the LICENSE file or at
 * https://opensource.org/licenses/MIT.
 */

import { TraceMap } from '@jridgewell/trace-mapping';
import { build as esbuildBuild } from 'esbuild';
import { createRequire } from 'node:module';
import type * as vm from 'node:vm';
import { isEsm, isTypeScript } from '../constants';
import { EvaluationTestDiscoverer } from './evaluate';

export class FullEvaluationTestDiscoverer extends EvaluationTestDiscoverer {

  protected evaluate(contextObj: vm.Context, filePath: string, code: string) {
    contextObj.require = createRequire(filePath);
    return super.evaluate(contextObj, filePath, code);
  }

  override async transpileCode(
    filePath: string,
    code: string,
  ): Promise<[string, TraceMap | undefined]> {
    let sourceMap: TraceMap | undefined;
    const needsTranspile = isTypeScript(filePath) || isEsm(filePath, code);

    if (needsTranspile) {
      const result = await esbuildBuild({
        ...this.esbuildCommonOptions(filePath),
        entryPoints: [filePath],
        bundle: true,
        sourcemap: 'external', // need source map for correct test positions
        write: false,
        outfile: 'tests.js',
      });

      const jsFile = result.outputFiles.find((f) => f.path.endsWith('.js'));
      const mapFile = result.outputFiles.find((f) => f.path.endsWith('.js.map'));

      if (jsFile && mapFile) {
        code = jsFile.text;
        try {
          sourceMap = new TraceMap(mapFile.text, filePath);
        } catch (e) {
          this.logChannel?.error('Error parsing source map of TypeScript output', e);
        }
      }
    }

    return [code, sourceMap];
  }

  protected buildDynamicModules(): Map<string, Set<string>> {
    // no dynamic modules, only real ones.
    return new Map<string, Set<string>>();
  }
}
