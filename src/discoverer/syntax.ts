/**
 * Copyright (C) Daniel Kuschny (Danielku15) and contributors.
 * Copyright (C) Microsoft Corporation. All rights reserved.
 *
 * Use of this source code is governed by an MIT-style
 * license that can be found in the LICENSE file or at
 * https://opensource.org/licenses/MIT.
 */

import { parse as esTreeParse, type TSESTreeOptions } from '@typescript-eslint/typescript-estree';
import type { Options as AcornOptions } from 'acorn';
import { parse as acornParse } from 'acorn-loose';
import * as evk from 'eslint-visitor-keys';
import type { Node } from 'estree';
import type { ConfigValue } from '../configValue';
import { isTypeScript } from '../constants';
import type { TsConfigStore } from '../tsconfig-store';
import { type IExtensionSettings, type IParsedNode, type ITestDiscoverer, NodeKind } from './types';

enum C {
  MemberExpression = 'MemberExpression',
  CallExpression = 'CallExpression',
  TemplateLiteral = 'TemplateLiteral',
  Property = 'Property',
  Literal = 'Literal',
  Identifier = 'Identifier',
}

export const acornOptions: AcornOptions = {
  ecmaVersion: 'latest',
  locations: true,
  allowReserved: true,
};

const esTreeOptions: TSESTreeOptions = {
  jsDocParsingMode: 'none',
};

const getStringish = (nameArg: Node | undefined): string | undefined => {
  if (nameArg?.type === C.Literal && typeof nameArg.value === 'string') {
    return nameArg.value;
  }
  if (nameArg?.type === C.TemplateLiteral && nameArg.quasis.length === 1) {
    return nameArg.quasis[0].value.cooked || nameArg.quasis[0].value.raw;
  }
};

const traverse = (
  node: Node,
  visitor: { enter: (node: Node) => void; leave: (node: Node) => void },
) => {
  if (!node) {
    return;
  }
  visitor.enter(node);

  const keys = evk.KEYS[node.type];
  if (keys) {
    for (const key of keys) {
      const child = (node as unknown as Record<string, Node | Node[]>)[key];
      if (Array.isArray(child)) {
        for (const c of child) {
          traverse(c, visitor);
        }
      } else if (child) {
        traverse(child, visitor);
      }
    }
  }

  visitor.leave(node);
};

export class SyntaxTestDiscoverer implements ITestDiscoverer {
  constructor(
    private settings: ConfigValue<IExtensionSettings>,
    private tsconfigStore: TsConfigStore,
  ) { }

  async discover(filePath: string, text: string) {
    const settings = this.settings;

    let ast: Node;

    if (isTypeScript(filePath)) {
      ast = esTreeParse(text, {
        project: this.tsconfigStore.getTsconfig(filePath)?.path,
        ...esTreeOptions,
      }) as Node;
    } else {
      ast = acornParse(text, acornOptions) as Node;
    }

    const interestingName = (name: string) => {
      if (settings.value.suite.includes(name)) {
        return NodeKind.Suite;
      }
      if (settings.value.test.includes(name)) {
        return NodeKind.Test;
      }
      return undefined;
    };

    const stack: { node: Node; r: IParsedNode }[] = [];
    stack.push({ node: undefined, r: { children: [] } } as any);

    traverse(ast, {
      enter(node) {
        if (node.type !== C.CallExpression || node.arguments.length === 0) {
          return;
        }

        let directive: string | undefined;
        let kind: NodeKind | undefined;
        if (node.callee.type === C.Identifier) {
          kind = interestingName(node.callee.name);
        } else if (
          node.callee.type === C.MemberExpression &&
          node.callee.object.type === C.Identifier &&
          node.callee.property.type === C.Identifier
        ) {
          kind = interestingName(node.callee.object.name);
          directive = node.callee.property.name;
        }

        if (kind === undefined) {
          return;
        }

        const name = getStringish(node.arguments[0]);
        if (name === undefined) {
          return;
        }

        const child: IParsedNode = {
          children: [],
          kind,
          startLine: node.loc!.start.line - 1,
          startColumn: node.loc!.start.column,
          endLine: node.loc!.end.line - 1,
          endColumn: node.loc!.end.column,
          name,
        };
        if (directive) {
          child.directive = directive;
        }
        stack[stack.length - 1].r.children.push(child);
        stack.push({ node, r: child });
      },
      leave(node) {
        if (stack[stack.length - 1].node === node) {
          stack.pop();
        }
      },
    });

    return stack[0].r.children;
  }
}
