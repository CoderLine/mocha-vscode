/**
 * Copyright (C) Daniel Kuschny (Danielku15) and contributors.
 * Copyright (C) Microsoft Corporation. All rights reserved.
 *
 * Use of this source code is governed by an MIT-style
 * license that can be found in the LICENSE file or at
 * https://opensource.org/licenses/MIT.
 */

import { TraceMap, originalPositionFor } from '@jridgewell/trace-mapping';
import type { Node } from 'acorn';
import { parse as acornParse } from 'acorn-loose';
import * as acornWalk from 'acorn-walk';
import * as errorParser from 'error-stack-parser';
import { CommonOptions, TsconfigRaw, transform as esbuildTransform } from 'esbuild';
import * as path from 'path';
import * as vm from 'vm';
import * as vscode from 'vscode';
import { ConfigValue } from '../configValue';
import { isEsm, isTypeScript } from '../constants';
import { TsConfigStore } from '../tsconfig-store';
import { acornOptions } from './syntax';
import { IExtensionSettings, IParsedNode, ITestDiscoverer, NodeKind } from './types';

/**
 * Note: the goal is not to sandbox test code (workspace trust is required
 * for this extension) but rather to avoid side-effects from evaluation which
 * are much more likely when other code is required.
 */
const replacedGlobals = new Set([
  // avoid side-effects:
  'require',
  'process',
  // avoid printing to the console from tests:
  'console',
]);

/**
 * Honestly kind of amazed this works. We can use a Proxy as our globalThis
 * in a VM context, and mock *every* global. We use this to return arbitrary
 * objects and track ones that are Mocha's globals.
 *
 * This is a nice, flexible alternative to the other alternatives: AST
 * transversal (which can miss test-table style tests, for example) or
 * require/import mocks (which don't guarentee a side-effect-free execution.)
 *
 * Since extension host tests are always common.js (at least for now) this
 * is also effective in stubbing require() so we know code is nicely isolated.
 */

export class EvaluationTestDiscoverer implements ITestDiscoverer {
  constructor(
    protected logChannel: vscode.LogOutputChannel | undefined,
    protected settings: ConfigValue<IExtensionSettings>,
    protected tsconfigStore: TsConfigStore,
  ) {}

  async discover(filePath: string, code: string) {
    const stack: IParsedNode[] = [{ children: [] } as Partial<IParsedNode> as IParsedNode];

    // A placeholder object that returns itself for all functions calls and method accesses.
    function placeholder(): unknown {
      return new Proxy(placeholder, {
        get: (obj, target) => {
          try {
            const desc = Object.getOwnPropertyDescriptor(obj, target);
            if (desc && !desc.writable && !desc.configurable) {
              return desc.value; // avoid invariant volation https://stackoverflow.com/q/75148897
            }
            return placeholder();
          } catch (e) {
            return placeholder();
          }
        },
        set: () => true,
        apply: () => {
          return placeholder();
        },
      });
    }

    function objectPlaceholder(originalObject: any): unknown {
      return new Proxy(objectPlaceholder, {
        get: (_, target) => {
          if (target === 'create') {
            return placeholder();
          } else {
            return originalObject[target];
          }
        },
        set: () => true,
      });
    }

    function makeTesterFunction(
      kind: NodeKind,
      sourceMap?: TraceMap | undefined,
      directive?: string,
    ) {
      const fn = (name: string, callback: () => void) => {
        if (typeof name !== 'string' || typeof callback !== 'function') {
          return placeholder();
        }

        const frame = errorParser.parse(new Error())[1];
        if (!frame || !frame.lineNumber) {
          return placeholder();
        }

        //
        // On error stack and source maps we are working on 1-based postitions
        let startLine = frame.lineNumber || 1;
        let startColumn = frame.columnNumber || 1;

        // approximate the length of the test case:
        const functionLines = String(callback).split('\n');
        let endLine = startLine + functionLines.length - 1;
        let endColumn = functionLines[functionLines.length - 1].length + 1;

        if (sourceMap) {
          try {
            const startMapped = originalPositionFor(sourceMap, {
              line: startLine,
              column: startColumn - 1,
            });
            if (startMapped.line !== null) {
              startLine = startMapped.line;
              startColumn = startMapped.column + 1; // columns are 0-based in trace-mapping lib
            }
            const endMapped = originalPositionFor(sourceMap, {
              line: endLine,
              column: endColumn - 1,
            });
            if (endMapped.line !== null) {
              endLine = endMapped.line;
              endColumn = endMapped.column + 1; // columns are 0-based in trace-mapping lib
            }
          } catch (e) {
            console.error('error mapping source', e);
          }
        }

        // 0-base index
        startLine--;
        endLine--;

        if (endLine === startLine) {
          endColumn = Number.MAX_SAFE_INTEGER; // assume it takes the entire line of a single-line test case
        } else {
          endColumn -= 1;
        }

        const node: IParsedNode = {
          name,
          kind,
          startLine: startLine,
          startColumn: startColumn - 1,
          endLine: endLine,
          endColumn: endColumn,
          children: [],
        };
        if (directive) {
          node.directive = directive;
        }
        stack[stack.length - 1].children.push(node);
        if (kind === NodeKind.Suite) {
          stack.push(node);
          try {
            return callback.call(placeholder());
          } catch (e) {
            node.error = e instanceof Error ? e.message : String(e);
          } finally {
            stack.pop();
          }
        }

        return placeholder();
      };
      if (!directive) {
        fn.skip = makeTesterFunction(kind, sourceMap, 'skip');
        fn.only = makeTesterFunction(kind, sourceMap, 'only');
      }

      return fn;
    }

    let sourceMap: TraceMap | undefined;
    [code, sourceMap] = await this.transpileCode(filePath, code);

    // currently these are the same, but they might be different in the future?
    const suiteFunction = makeTesterFunction(NodeKind.Suite, sourceMap);
    const testFunction = makeTesterFunction(NodeKind.Test, sourceMap);

    const symbols = this.settings;
    const contextObj = new Proxy(
      {
        __dirname: path.dirname(filePath),
        __filename: path.basename(filePath),
      } as any,
      {
        get(target, prop) {
          if (symbols.value.suite.includes(prop as string)) {
            return suiteFunction;
          } else if (symbols.value.test.includes(prop as string)) {
            return testFunction;
          } else if (symbols.value.hooks.includes(prop as string)) {
            return placeholder();
          } else if (prop in target) {
            return target[prop]; // top-level `var` defined get set on the contextObj
          } else if (prop in globalThis && !replacedGlobals.has(prop as string)) {
            // Bug #153: ESBuild will wrap require() calls into __toESM which breaks quite some things
            // we want to keep our Proxy placeholder object in all scenarios
            // Due to that we provide a special proxy object which will create again placeholder proxies
            // on Object.create
            // https://github.com/evanw/esbuild/blob/d34e79e2a998c21bb71d57b92b0017ca11756912/internal/runtime/runtime.go#L231-L242
            if (prop === 'Object') {
              return objectPlaceholder((globalThis as any)[prop]);
            }

            return (globalThis as any)[prop];
          } else {
            return placeholder();
          }
        },
      },
    );

    await this.evaluate(contextObj, filePath, code);

    return stack[0].children;
  }

  protected evaluate(contextObj: vm.Context, filePath: string, code: string) {
    vm.runInNewContext(code, contextObj, {
      timeout: this.settings.value.extractTimeout,
      filename: filePath,
    });
  }

  protected buildDynamicModules(code: string): Map<string, Set<string>> {
    // while it is possible to dynamically react on modules imported
    // we cannot dynamically access the imported items.
    // e.g. on an 'import { a, b, c} from 'module';
    // we get a dynamic callback for any imported module like 'module'
    // but we don't get any info about the imported items like {a, b, c}
    // Thats why we parse and walk the AST to collect all specifiers
    // imported for a module to create vm.SyntheticModule instances on-the-fly

    const parsed = acornParse(code, acornOptions) as Node;

    const modules = new Map<string, Set<string>>();

    acornWalk.recursive(
      parsed,
      {},
      {
        ImportDeclaration: (node) => {
          if (typeof node.source.value === 'string') {
            const module = node.source.value;
            let specifiers = modules.get(module);
            if (!specifiers) {
              specifiers = new Set<string>();
              modules.set(module, specifiers);
            }

            // for simplicity create a default and namespace for all
            // modules. this keeps us safe on dynamic imports
            specifiers.add('default');

            if (node.specifiers.length === 0) {
              // side effect import
            } else {
              for (const spec of node.specifiers) {
                switch (spec.type) {
                  case 'ImportSpecifier':
                    switch (spec.imported.type) {
                      case 'Identifier':
                        // import { ident } from 'module';
                        specifiers.add(spec.imported.name);
                        break;
                      case 'Literal':
                        // import { "string name" } from 'module';
                        if (typeof spec.imported.value === 'string') {
                          specifiers.add(spec.imported.value);
                        }
                        break;
                    }
                    break;
                  case 'ImportDefaultSpecifier':
                    // import default from 'module'
                    // import { default as alias } from 'module'
                    break;
                  case 'ImportNamespaceSpecifier':
                    // import * as name from 'module';
                    break;
                }
              }
            }
          }
        },
        // we don't handle dynamic import expressions here, they are exposed
        ImportExpression: undefined,
      },
    );

    return modules;
  }

  async transpileCode(filePath: string, code: string): Promise<[string, TraceMap | undefined]> {
    let sourceMap: TraceMap | undefined;
    const needsTranspile = isTypeScript(filePath) || isEsm(filePath, code);
    // transpile typescript or ESM via esbuild if needed
    if (needsTranspile) {
      const result = await esbuildTransform(code, {
        ...this.esbuildCommonOptions(filePath),
        sourcefile: filePath, // for auto-detection of the loader
        loader: 'default', // use the default loader
      });

      code = result.code;
      try {
        sourceMap = new TraceMap(result.map, filePath);
      } catch (e) {
        this.logChannel?.error('Error parsing source map of TypeScript output', e);
      }
    }

    return [code, sourceMap];
  }

  protected esbuildCommonOptions(filePath: string): CommonOptions {
    const tsconfig = this.tsconfigStore.getTsconfig(filePath);

    return {
      target: `node${process.versions.node.split('.')[0]}`, // target current runtime
      sourcemap: true, // need source map for correct test positions
      format: 'cjs', // vm.runInNewContext only supports CJS
      sourcesContent: false, // optimize source maps
      minifyWhitespace: false,
      minify: false,
      keepNames: true, // reduce CPU
      platform: 'node', // we will evaluate here in node
      tsconfigRaw: tsconfig?.config as TsconfigRaw,
    };
  }
}
