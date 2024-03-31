/*---------------------------------------------------------
 * Copyright (C) OpenJS Foundation and contributors, https://openjsf.org
 * Copyright (C) Microsoft Corporation. All rights reserved.
 *--------------------------------------------------------*/

import { TraceMap, originalPositionFor } from '@jridgewell/trace-mapping';
import * as errorParser from 'error-stack-parser';
import { transform as esbuildTransform } from 'esbuild';
import * as vm from 'vm';
import { IParsedNode, ITestSymbols, NodeKind } from '.';
import { isEsm, isTypeScript } from '../constants';
import * as vscode from 'vscode';

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

export async function extractWithEvaluation(
  logChannel: vscode.LogOutputChannel | undefined,
  filePath: string,
  code: string,
  symbols: ITestSymbols,
) {
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

  const stack: IParsedNode[] = [{ children: [] } as Partial<IParsedNode> as IParsedNode];

  // A placeholder object that returns itself for all functions calls and method accesses.
  const placeholder: () => unknown = () =>
    new Proxy(placeholder, {
      get: (obj, target) => {
        const desc = Object.getOwnPropertyDescriptor(obj, target);
        if (desc && !desc.writable && !desc.configurable) {
          return desc.value; // avoid invariant volation https://stackoverflow.com/q/75148897
        }
        return placeholder();
      },
      set: () => true,
    });

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

      let startLine = frame.lineNumber || 1;
      let startColumn = frame.columnNumber || 1;

      // approximate the length of the test case:
      let functionLines = String(callback).split('\n');
      let endLine = startLine + functionLines.length - 1;
      let endColumn = functionLines[functionLines.length - 1].length;

      if (sourceMap) {
        try {
          const startMapped = originalPositionFor(sourceMap, {
            line: startLine,
            column: startColumn,
          });
          if (startMapped.line !== null) {
            startLine = startMapped.line;
            startColumn = startMapped.column;
          }
          const endMapped = originalPositionFor(sourceMap, {
            line: endLine,
            column: endColumn,
          });
          if (endMapped.line !== null) {
            endLine = endMapped.line;
            endColumn = endMapped.column;
          }
        } catch (e) {
          console.error('error mapping source', e);
        }
      }

      if (endLine === startLine) {
        endColumn = Number.MAX_SAFE_INTEGER; // assume it takes the entire line of a single-line test case
      }

      const node: IParsedNode = {
        name,
        kind,
        startLine: startLine - 1,
        startColumn,
        endLine: endLine - 1,
        endColumn,
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
    };
    if (!directive) {
      fn.skip = makeTesterFunction(kind, sourceMap, 'skip');
      fn.only = makeTesterFunction(kind, sourceMap, 'only');
    }

    return fn;
  }

  let sourceMap: TraceMap | undefined;
  // transpile typescript or ESM via esbuild if needed
  if (isTypeScript(filePath) || isEsm(filePath, code)) {
    const result = await esbuildTransform(code, {
      target: `node${process.versions.node.split('.')[0]}`, // target current runtime
      sourcemap: true, // need source map for correct test positions
      format: 'cjs', // vm.runInNewContext only supports CJS
      sourcesContent: false, // optimize source maps
      minifyWhitespace: false,
      minify: false,
      keepNames: true, // reduce CPU
      sourcefile: filePath, // for auto-detection of the loader
      platform: 'node', // we will evaluate here in node
      loader: 'default', // use the default loader
    });

    code = result.code;
    try {
      sourceMap = new TraceMap(result.map, filePath);
    } catch (e) {
      logChannel?.error('Error parsing source map of TypeScript output', e);
    }
  }

  // currently these are the same, but they might be different in the future?
  const suiteFunction = makeTesterFunction(NodeKind.Suite, sourceMap);
  const testFunction = makeTesterFunction(NodeKind.Test, sourceMap);

  const contextObj = new Proxy({} as any, {
    get(target, prop, _receiver) {
      if (symbols.suite.includes(prop as string)) {
        return suiteFunction;
      } else if (symbols.test.includes(prop as string)) {
        return testFunction;
      } else if (prop in target) {
        return target[prop]; // top-level `var` defined get set on the contextObj
      } else if (prop in globalThis && !replacedGlobals.has(prop as string)) {
        return (globalThis as any)[prop];
      } else {
        return placeholder();
      }
    },
  });

  vm.runInNewContext(code, contextObj, {
    timeout: symbols.extractTimeout,
  });

  return stack[0].children;
}
