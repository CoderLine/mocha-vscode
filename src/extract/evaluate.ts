import * as errorParser from 'error-stack-parser';
import * as vm from 'vm';
import { IParsedNode, ITestSymbols, NodeKind } from '.';

/**
 * Note: the goal is not to sandbox test code (workspace trust is required
 * for this extension) but rather to avoid side-effects from evaluation which
 * are much more likely when other code is required.
 */
const replacedGlobals = new Set(['require']);

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
export const extractWithEvaluation = (code: string, symbols: ITestSymbols) => {
  const stack: IParsedNode[] = [{ children: [] } as Partial<IParsedNode> as IParsedNode];

  // A placeholder object that returns itself for all functions calls and method accesses.
  const placeholder: unknown = new Proxy(() => placeholder, {
    get: () => placeholder,
  });

  function makeTesterFunction(kind: NodeKind, directive?: string) {
    const fn = (name: string, callback: () => void) => {
      if (typeof name !== 'string' || typeof callback !== 'function') {
        return placeholder;
      }

      const frame = errorParser.parse(new Error())[1];
      if (!frame || !frame.lineNumber) {
        return placeholder;
      }

      const node: IParsedNode = {
        name,
        kind,
        startLine: frame.lineNumber,
        startColumn: frame.columnNumber || 1,
        children: [],
      };
      if (directive) {
        node.directive = directive;
      }
      stack[stack.length - 1].children.push(node);
      stack.push(node);
      try {
        callback();
      } catch (e) {
        node.error = e instanceof Error ? e.message : String(e);
      } finally {
        stack.pop();
      }
    };
    if (!directive) {
      fn.skip = makeTesterFunction(kind, 'skip');
      fn.only = makeTesterFunction(kind, 'only');
    }

    return fn;
  }

  // currently these are the same, but they might be different in the future?
  const suiteFunction = makeTesterFunction(NodeKind.Suite);
  const testFunction = makeTesterFunction(NodeKind.Test);

  const contextObj = new Proxy(
    {},
    {
      get(_target, prop, _receiver) {
        if (symbols.suite.includes(prop as string)) {
          return suiteFunction;
        } else if (symbols.test.includes(prop as string)) {
          return testFunction;
        } else if (prop in globalThis && !replacedGlobals.has(prop as string)) {
          return (globalThis as any)[prop];
        } else {
          return placeholder;
        }
      },
    },
  );

  vm.runInNewContext(code, contextObj, {
    timeout: 1000,
  });

  return stack[0].children;
};
